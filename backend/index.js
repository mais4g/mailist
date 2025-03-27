const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const querystring = require("querystring");
const multer = require("multer");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Configuração do multer para armazenar temporariamente as imagens
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 256 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== "image/jpeg") {
      return cb(new Error("Apenas imagens JPEG são permitidas"));
    }
    cb(null, true);
  },
});

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Usar um objeto para armazenar tokens por sessão (em produção, use Redis ou similar)
const tokens = {};

// Rota para autenticação com Spotify
app.get("/api/login", (req, res) => {
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
app.get("/api/callback", async (req, res) => {
  const code = req.query.code || null;

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

    const sessionId = Math.random().toString(36).substring(2, 15);
    tokens[sessionId] = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
    };

    res.redirect(`${FRONTEND_URL}/home?session=${sessionId}`);
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
app.get("/api/me", checkToken, async (req, res) => {
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
app.get("/api/search", checkToken, async (req, res) => {
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
app.post("/api/create-playlist", checkToken, async (req, res) => {
  const { name, tracks } = req.body;

  if (!name || !tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({
      error: "Dados inválidos. Forneça um nome e uma lista de URIs de faixas",
    });
  }

  try {
    const userResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${req.token}` },
    });

    const userId = userResponse.data.id;

    const playlistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name,
        public: true,
        description: "Playlist criada pelo meu aplicativo",
      },
      {
        headers: {
          Authorization: `Bearer ${req.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistResponse.data.id}/tracks`,
      {
        uris: tracks,
      },
      {
        headers: {
          Authorization: `Bearer ${req.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      message: "Playlist criada com sucesso!",
      id: playlistResponse.data.id,
      external_url: playlistResponse.data.external_urls.spotify,
    });
  } catch (error) {
    console.error("Erro ao criar playlist:", error.response?.data || error.message);
    res.status(500).json({
      error: "Falha ao criar playlist",
      details: error.response?.data?.error || error.message,
    });
  }
});

// Rota para fazer upload da imagem da playlist
app.post("/api/upload-playlist-image/:playlistId", checkToken, upload.single("image"), async (req, res) => {
  const { playlistId } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: "Nenhuma imagem fornecida" });
  }

  try {
    const base64Image = req.file.buffer.toString("base64");

    await axios.put(
      `https://api.spotify.com/v1/playlists/${playlistId}/images`,
      base64Image,
      {
        headers: {
          Authorization: `Bearer ${req.token}`,
          "Content-Type": "image/jpeg",
        },
      }
    );

    res.json({ message: "Imagem da playlist atualizada com sucesso!" });
  } catch (error) {
    console.error("Erro ao fazer upload da imagem:", error.response?.data || error.message);
    res.status(500).json({
      error: "Falha ao fazer upload da imagem da playlist",
      details: error.response?.data?.error || error.message,
    });
  }
});

// Iniciar o servidor localmente (apenas para testes)
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

// Exportar o app para Vercel
module.exports = app;
