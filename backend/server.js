const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const querystring = require("querystring");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Configuração do multer para armazenar temporariamente as imagens
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 256 * 1024 }, // Limite de 256KB (limite do Spotify)
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'image/jpeg') {
      return cb(new Error('Apenas imagens JPEG são permitidas'));
    }
    cb(null, true);
  }
});

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Usar um objeto para armazenar tokens por sessão (em produção, use Redis ou similar)
const tokens = {};

// Rota para autenticação com Spotify
app.get("/login", (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  const scope = "playlist-modify-public user-read-private ugc-image-upload";
  
  const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope,
    state,
  })}`;
  
  res.redirect(authUrl);
});

// Callback do Spotify
app.get("/callback", async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (!code) {
    return res.status(400).json({ error: "Código de autorização não fornecido" });
  }

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    // Armazenar token com um identificador único (em produção, use cookies ou JWT)
    const sessionId = Math.random().toString(36).substring(2, 15);
    tokens[sessionId] = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
    };

    // Redirecionar para o frontend com o sessionId
    res.redirect(
      `${process.env.FRONTEND_URL}/home?session=${sessionId}`
    );
  } catch (error) {
    console.error("Erro ao obter token:", error.response?.data || error.message);
    res.status(500).json({ error: "Falha na autenticação" });
  }
});

// Middleware para verificar token
const checkToken = async (req, res, next) => {
  const sessionId = req.headers.session || req.query.session;
  
  if (!sessionId || !tokens[sessionId]) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  const tokenData = tokens[sessionId];
  
  // Verificar se o token expirou e renovar se necessário
  if (Date.now() > tokenData.expires_at) {
    try {
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        querystring.stringify({
          grant_type: "refresh_token",
          refresh_token: tokenData.refresh_token,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      tokenData.access_token = response.data.access_token;
      tokenData.expires_at = Date.now() + response.data.expires_in * 1000;
      
      if (response.data.refresh_token) {
        tokenData.refresh_token = response.data.refresh_token;
      }
    } catch (error) {
      console.error("Erro ao renovar token:", error.response?.data || error.message);
      return res.status(401).json({ error: "Falha ao renovar autenticação" });
    }
  }

  req.token = tokenData.access_token;
  next();
};

// Rota para obter informações do usuário atual
app.get("/me", checkToken, async (req, res) => {
  try {
    const { data } = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${req.token}` },
    });
    res.json(data);
  } catch (error) {
    console.error("Erro ao obter perfil:", error.response?.data || error.message);
    res.status(500).json({ error: "Falha ao obter informações do usuário" });
  }
});

// Rota para buscar músicas
app.get("/search", checkToken, async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: "Termo de busca não fornecido" });
  }
  
  try {
    const { data } = await axios.get(`https://api.spotify.com/v1/search`, {
      headers: { Authorization: `Bearer ${req.token}` },
      params: { q: query, type: "track", limit: 5 },
    });
    res.json(data.tracks.items);
  } catch (error) {
    console.error("Erro na busca:", error.response?.data || error.message);
    res.status(500).json({ error: "Falha ao buscar músicas" });
  }
});

// Criar playlist
app.post("/create-playlist", checkToken, async (req, res) => {
  const { name, tracks } = req.body;
  
  if (!name || !tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ 
      error: "Dados inválidos. Forneça um nome e uma lista de URIs de faixas" 
    });
  }

  try {
    // Obter ID do usuário atual
    const userResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${req.token}` },
    });
    
    const userId = userResponse.data.id;
    
    // Criar a playlist
    const playlistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name,
        public: true,
        description: "Playlist criada pelo meu aplicativo"
      },
      {
        headers: { 
          Authorization: `Bearer ${req.token}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Adicionar faixas à playlist
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistResponse.data.id}/tracks`,
      {
        uris: tracks,
      },
      {
        headers: { 
          Authorization: `Bearer ${req.token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ 
      message: "Playlist criada com sucesso!", 
      id: playlistResponse.data.id,
      external_url: playlistResponse.data.external_urls.spotify
    });
  } catch (error) {
    console.error("Erro ao criar playlist:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Falha ao criar playlist",
      details: error.response?.data?.error || error.message
    });
  }
});

// Rota para fazer upload da imagem da playlist
app.post("/upload-playlist-image/:playlistId", checkToken, upload.single('image'), async (req, res) => {
  const { playlistId } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: "Nenhuma imagem fornecida" });
  }

  try {
    // Ler o arquivo de imagem
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    // Enviar a imagem para o Spotify
    await axios.put(
      `https://api.spotify.com/v1/playlists/${playlistId}/images`,
      base64Image,
      {
        headers: { 
          Authorization: `Bearer ${req.token}`,
          "Content-Type": "image/jpeg"
        }
      }
    );

    // Remover o arquivo temporário
    fs.unlinkSync(req.file.path);

    res.json({ message: "Imagem da playlist atualizada com sucesso!" });
  } catch (error) {
    console.error("Erro ao fazer upload da imagem:", error.response?.data || error.message);
    
    // Remover o arquivo temporário em caso de erro
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: "Falha ao fazer upload da imagem da playlist",
      details: error.response?.data?.error || error.message
    });
  }
});

app.listen(3001, () => console.log("Servidor rodando na porta 3001"));
