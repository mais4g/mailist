import { useState } from "react";
import axios from "axios";

function App() {
    const [query, setQuery] = useState("");
    const [tracks, setTracks] = useState([]);
    const [selectedTracks, setSelectedTracks] = useState([]);
    const [playlistName, setPlaylistName] = useState("");

    const searchTracks = async () => {
        const response = await axios.get("http://localhost:3001/search", {
            params: { query },
        });
        setTracks(response.data);
    };

    const toggleTrack = (track) => {
        setSelectedTracks((prev) =>
            prev.includes(track.uri) ? prev.filter((t) => t !== track.uri) : [...prev, track.uri]
        );
    };

    const createPlaylist = async () => {
        const user = await axios.get("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        await axios.post("http://localhost:3001/create-playlist", {
            userId: user.data.id,
            name: playlistName,
            tracks: selectedTracks,
        });

        alert("Playlist criada!");
    };

    return (
        <div style={{ padding: "20px", maxWidth: "600px", margin: "auto" }}>
            <h2>🎵 Criador de Playlists</h2>
            <a href="http://localhost:3001/login">
                <button>Login com Spotify</button>
            </a>
            <br /><br />
            <input
                type="text"
                placeholder="Pesquisar música..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={searchTracks}>Buscar</button>
            <ul>
                {tracks.map((track) => (
                    <li key={track.id}>
                        <input
                            type="checkbox"
                            checked={selectedTracks.includes(track.uri)}
                            onChange={() => toggleTrack(track)}
                        />
                        {track.name} - {track.artists[0].name}
                    </li>
                ))}
            </ul>
            <input
                type="text"
                placeholder="Nome da Playlist"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
            />
            <button onClick={createPlaylist}>Criar Playlist</button>
        </div>
    );
}

export default App;
