import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css"; // Vamos criar este arquivo CSS separadamente

function App() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState([]);
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [playlistName, setPlaylistName] = useState("");
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // "success" ou "error"
  const [playlistImage, setPlaylistImage] = useState(null);
  const [playlistImagePreview, setPlaylistImagePreview] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const fileInputRef = useRef(null);

  // Verificar se há um sessionId na URL (após redirecionamento do login)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session");
    
    if (sessionId) {
      localStorage.setItem("spotify_session", sessionId);
      // Limpar a URL após capturar o sessionId
      window.history.replaceState({}, document.title, "/");
      fetchUserProfile();
    } else if (localStorage.getItem("spotify_session")) {
      fetchUserProfile();
    }
  }, []);

  // Configuração do axios com o sessionId
  const getAuthHeaders = () => {
    const sessionId = localStorage.getItem("spotify_session");
    return sessionId ? { session: sessionId } : {};
  };

  // Buscar perfil do usuário
  const fetchUserProfile = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get("http://localhost:3001/me", {
        headers: getAuthHeaders()
      });
      setUser(response.data);
      setIsLoading(false);
    } catch (error) {
      console.error("Erro ao buscar perfil:", error);
      showMessage("Erro ao buscar perfil. Por favor, faça login novamente.", "error");
      setIsLoading(false);
    }
  };

  // Exibir mensagem
  const showMessage = (text, type = "error") => {
    setMessage(text);
    setMessageType(type);
    // Auto-fechar mensagens de sucesso após 5 segundos
    if (type === "success") {
      setTimeout(() => {
        setMessage("");
      }, 5000);
    }
  };

  // Buscar músicas
  const searchTracks = async () => {
    if (!query.trim()) return;
    
    try {
      setIsSearching(true);
      const response = await axios.get("http://localhost:3001/search", {
        headers: getAuthHeaders(),
        params: { query }
      });
      setTracks(response.data);
      setIsSearching(false);
    } catch (error) {
      console.error("Erro ao buscar músicas:", error);
      showMessage("Erro ao buscar músicas. Verifique sua conexão ou faça login novamente.");
      setIsSearching(false);
    }
  };

  // Alternar seleção de música
  const toggleTrack = (track) => {
    setSelectedTracks((prev) =>
      prev.includes(track.uri) 
        ? prev.filter((t) => t !== track.uri) 
        : [...prev, track.uri]
    );
  };

  // Manipular seleção de imagem
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Verificar se é uma imagem JPEG
      if (file.type !== 'image/jpeg') {
        showMessage("Por favor, selecione apenas imagens JPEG.");
        return;
      }
      
      // Verificar o tamanho (máximo 256KB)
      if (file.size > 256 * 1024) {
        showMessage("A imagem deve ter no máximo 256KB.");
        return;
      }
      
      setPlaylistImage(file);
      
      // Criar preview da imagem
      const reader = new FileReader();
      reader.onloadend = () => {
        setPlaylistImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remover imagem selecionada
  const removeImage = () => {
    setPlaylistImage(null);
    setPlaylistImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Criar playlist
  const createPlaylist = async () => {
    if (!playlistName.trim()) {
      showMessage("Por favor, insira um nome para a playlist.");
      return;
    }

    if (selectedTracks.length === 0) {
      showMessage("Por favor, selecione pelo menos uma música.");
      return;
    }

    try {
      setIsLoading(true);
      
      // Criar a playlist
      const response = await axios.post(
        "http://localhost:3001/create-playlist",
        {
          name: playlistName,
          tracks: selectedTracks
        },
        {
          headers: getAuthHeaders()
        }
      );
      
      // Se tiver uma imagem, fazer upload
      if (playlistImage) {
        const formData = new FormData();
        formData.append('image', playlistImage);
        
        await axios.post(
          `http://localhost:3001/upload-playlist-image/${response.data.id}`,
          formData,
          {
            headers: {
              ...getAuthHeaders(),
              'Content-Type': 'multipart/form-data'
            }
          }
        );
      }
      
      showMessage(`Playlist "${playlistName}" criada com sucesso! 🎉`, "success");
      setPlaylistName("");
      setSelectedTracks([]);
      setPlaylistImage(null);
      setPlaylistImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Erro ao criar playlist:", error);
      showMessage("Erro ao criar playlist. Por favor, tente novamente.");
      setIsLoading(false);
    }
  };

  // Fazer logout
  const logout = () => {
    localStorage.removeItem("spotify_session");
    setUser(null);
    setTracks([]);
    setSelectedTracks([]);
    setPlaylistImage(null);
    setPlaylistImagePreview(null);
  };

  // Lidar com tecla Enter na busca
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      searchTracks();
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="#1DB954">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.65 14.65c-.2.2-.51.2-.71 0-1.79-1.79-4.59-2.34-7.65-1.42-.27.08-.54-.08-.62-.34-.08-.27.08-.54.34-.62 3.44-1.04 6.58-.42 8.64 1.64.2.2.2.51 0 .71zm1.23-2.75c-.25.25-.65.25-.9 0-2.05-2.05-5.18-2.65-7.6-1.45-.29.14-.63.02-.78-.27-.14-.29-.02-.63.27-.78 2.77-1.35 6.26-.69 8.61 1.66.25.25.25.65 0 .9zm.11-2.78c-.24.24-.64.24-.88 0-2.39-2.39-6.26-2.91-9.24-1.6-.35.15-.77-.01-.92-.36-.15-.35.01-.77.36-.92 3.42-1.49 7.77-.92 10.57 1.88.24.24.24.64 0 .88z"/>
          </svg>
          <h1>Spotify Playlist Creator</h1>
        </div>
        {user && (
          <div className="user-info">
            {user.images && user.images[0] && (
              <img 
                src={user.images[0].url} 
                alt={user.display_name} 
                className="user-avatar"
              />
            )}
            <span>{user.display_name}</span>
            <button onClick={logout} className="logout-button">
              Logout
            </button>
          </div>
        )}
      </header>

      {message && (
        <div className={`message ${messageType}`}>
          {message}
          <button 
            className="close-message"
            onClick={() => setMessage("")}
          >
            ✕
          </button>
        </div>
      )}

      {!user ? (
        <div className="login-container">
          <div className="login-card">
            <h2>Bem-vindo ao Spotify Playlist Creator</h2>
            <p>Crie playlists personalizadas para o seu Spotify de forma rápida e fácil.</p>
            <a href="http://localhost:3001/login" className="login-button">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.65 14.65c-.2.2-.51.2-.71 0-1.79-1.79-4.59-2.34-7.65-1.42-.27.08-.54-.08-.62-.34-.08-.27.08-.54.34-.62 3.44-1.04 6.58-.42 8.64 1.64.2.2.2.51 0 .71zm1.23-2.75c-.25.25-.65.25-.9 0-2.05-2.05-5.18-2.65-7.6-1.45-.29.14-.63.02-.78-.27-.14-.29-.02-.63.27-.78 2.77-1.35 6.26-.69 8.61 1.66.25.25.25.65 0 .9zm.11-2.78c-.24.24-.64.24-.88 0-2.39-2.39-6.26-2.91-9.24-1.6-.35.15-.77-.01-.92-.36-.15-.35.01-.77.36-.92 3.42-1.49 7.77-.92 10.57 1.88.24.24.24.64 0 .88z"/>
              </svg>
              Entrar com Spotify
            </a>
          </div>
        </div>
      ) : (
        <div className="main-content">
          <div className="search-section">
            <h2>Buscar Músicas</h2>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Busque por artista, música ou álbum..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="search-input"
              />
              <button 
                onClick={searchTracks}
                className="search-button"
                disabled={isSearching}
              >
                {isSearching ? (
                  <span className="loading-spinner"></span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="content-columns">
            <div className="search-results">
              <h2>Resultados da Busca</h2>
              {isSearching ? (
                <div className="loading-container">
                  <div className="loading-spinner large"></div>
                  <p>Buscando músicas...</p>
                </div>
              ) : tracks.length > 0 ? (
                <ul className="track-list">
                  {tracks.map((track) => (
                    <li 
                      key={track.id} 
                      className={`track-item ${selectedTracks.includes(track.uri) ? 'selected' : ''}`}
                      onClick={() => toggleTrack(track)}
                    >
                      <img 
                        src={track.album.images[1]?.url || track.album.images[0]?.url} 
                        alt={track.album.name} 
                        className="track-image"
                      />
                      <div className="track-info">
                        <h3 className="track-name">{track.name}</h3>
                        <p className="track-artist">{track.artists.map(a => a.name).join(", ")}</p>
                        <p className="track-album">{track.album.name}</p>
                      </div>
                      <div className="track-action">
                        {selectedTracks.includes(track.uri) ? (
                          <button className="remove-track-button">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                          </button>
                        ) : (
                          <button className="add-track-button">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : query ? (
                <div className="no-results">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="#ccc">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                  <p>Nenhum resultado encontrado para "{query}"</p>
                </div>
              ) : (
                <div className="search-prompt">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="#ccc">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                  <p>Busque por suas músicas favoritas</p>
                </div>
              )}
            </div>

            <div className="playlist-creator">
              <h2>Criar Playlist</h2>
              <div className="playlist-form">
                <div className="form-group">
                  <label htmlFor="playlist-name">Nome da Playlist</label>
                  <input
                    id="playlist-name"
                    type="text"
                    placeholder="Minha Playlist Incrível"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    className="playlist-name-input"
                  />
                </div>
                
                <div className="form-group">
                  <label>Imagem de Capa (JPEG, máx. 256KB)</label>
                  {playlistImagePreview ? (
                    <div className="image-preview-container">
                      <img 
                        src={playlistImagePreview} 
                        alt="Preview" 
                        className="image-preview"
                      />
                      <button 
                        onClick={removeImage}
                        className="remove-image-button"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="image-upload">
                      <label htmlFor="cover-image" className="image-upload-label">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                          <path d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z"/>
                        </svg>
                        Escolher Imagem
                      </label>
                      <input
                        id="cover-image"
                        type="file"
                        accept="image/jpeg"
                        onChange={handleImageChange}
                        ref={fileInputRef}
                        className="file-input"
                      />
                    </div>
                  )}
                </div>
                
                <div className="selected-tracks-section">
                  <div className="selected-tracks-header">
                    <h3>Músicas Selecionadas</h3>
                    <span className="track-count">{selectedTracks.length}</span>
                  </div>
                  
                  {selectedTracks.length > 0 ? (
                    <ul className="selected-tracks-list">
                      {tracks
                        .filter(track => selectedTracks.includes(track.uri))
                        .map(track => (
                          <li key={track.id} className="selected-track-item">
                            <img 
                              src={track.album.images[2]?.url} 
                              alt={track.album.name} 
                              className="selected-track-image"
                            />
                            <div className="selected-track-info">
                              <p className="selected-track-name">{track.name}</p>
                              <p className="selected-track-artist">{track.artists[0].name}</p>
                            </div>
                            <button 
                              onClick={() => toggleTrack(track)}
                              className="remove-selected-button"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                              </svg>
                            </button>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <div className="no-tracks-selected">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="#ccc">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6zm-2 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                      </svg>
                      <p>Nenhuma música selecionada</p>
                      <p className="hint">Busque e selecione músicas para adicionar à sua playlist</p>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={createPlaylist}
                  disabled={isLoading || selectedTracks.length === 0 || !playlistName.trim()}
                  className={`create-playlist-button ${isLoading || selectedTracks.length === 0 || !playlistName.trim() ? 'disabled' : ''}`}
                >
                  {isLoading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Criando...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                      </svg>
                      Criar Playlist
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>Desenvolvido por @mais4g -- visite o meu <a href="https://github.com/mais4g" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
      </footer>
    </div>
  );
}

export default App;
