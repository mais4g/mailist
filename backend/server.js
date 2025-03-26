const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const querystring = require("querystring");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let access_token = "";

// Rota para autenticação com Spotify
app.get("/login", (req, res) => {
    const scope = "playlist-modify-public";
    const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope,
    })}`;
    res.redirect(authUrl);
});

// Callback do Spotify
app.get("/callback", async (req, res) => {
    const code = req.query.code || null;

    const response = await axios.post("https://accounts.spotify.com/api/token",
        querystring.stringify({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        }), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    access_token = response.data.access_token;
    res.redirect(`${process.env.FRONTEND_URL}/home`);
});

// Rota para buscar músicas
app.get("/search", async (req, res) => {
    const { query } = req.query;
    const { data } = await axios.get(`https://api.spotify.com/v1/search`, {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { q: query, type: "track", limit: 5 },
    });
    res.json(data.tracks.items);
});

// Criar playlist
app.post("/create-playlist", async (req, res) => {
    const { userId, name, tracks } = req.body;
    const playlist = await axios.post(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        name,
        public: true,
    }, {
        headers: { Authorization: `Bearer ${access_token}` }
    });

    await axios.post(`https://api.spotify.com/v1/playlists/${playlist.data.id}/tracks`, {
        uris: tracks,
    }, {
        headers: { Authorization: `Bearer ${access_token}` }
    });

    res.json({ message: "Playlist criada!", id: playlist.data.id });
});

app.listen(3001, () => console.log("Servidor rodando na porta 3001"));
