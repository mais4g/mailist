import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";

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
      const response = await axios.get("/api/me", {
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
      const response = await axios.get("/api/search", {
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
        "/api/create-playlist",
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
          `/api/upload-playlist-image/${response.data.id}`,
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
            <a href="/api/login" className="login-button">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.65 14.65c-.2.2-.51.2-.71 0-1.79-1.79-4.59-2.34-7.65-1.42-.27.08-.54-.08-.62-.34-.08-.27.08-.54.34-.62 3.44-1.04 6.58-.42 8.64 1.64.2.2.2.51 0 .71zm1.23-2.75c-.25.25-.65.25-.9 0-2.05-2.05-5.18-2.65-7.6-1.45-.29.14-.63.02-.78-.27-.14-.29-.02-.63.27-.78 2.77-1.35 6.26-.69 8.61 1.66.25.25.25.65 0 .9zm.11-2.78c-.24.24-.64.24-.88 0-2.39-2.39-6.26-2.91-9.24-1.6-.35.15-.77-.01-.92-.36-.15-.35.01-.77.36-.92 3.42-1.49 7.77-.92 10.57 1.88.24.24.24.64 0 .88z"/>
              </svg>
              Entrar com Spotify
            </a>
          </div>
        </div>
      ) : (
        <div className="main-content">
          {/* Conteúdo principal */}
        </div>
      )}

      <footer className="app-footer">
        <p>Desenvolvido por @mais4g -- visite o meu <a href="https://github.com/mais4g" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
      </footer>
    </div>
  );
}

export default App;
