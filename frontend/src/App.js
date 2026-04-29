// src/App.js
import { useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import CreateAlert from './pages/CreateAlert';
import AlertDetails from './pages/AlertDetails';
import Login from './pages/Login';
import { useState } from 'react';
import './App.css';

export default function App() {
  const { isAuthenticated, isLoading, dbUser, logout } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [selectedSearch, setSelectedSearch] = useState(null);

  function navigate(to, data = null) {
    setPage(to);
    if (data) setSelectedSearch(data);
  }

  // Aguarda o Firebase resolver a sessão antes de renderizar
  if (isLoading) {
    return (
      <div className="app">
        <div className="main">
          <div className="loading">Carregando...</div>
        </div>
      </div>
    );
  }

  // Não autenticado → tela de login
  if (!isAuthenticated) {
    return (
      <div className="app">
        <main className="main">
          <Login />
        </main>
      </div>
    );
  }

  // Autenticado → app completo
  return (
    <div className="app">
      <Header user={dbUser} onNavigate={navigate} currentPage={page} onLogout={logout} />
      <main className="main">
        {page === 'dashboard' && (
          <Dashboard user={dbUser} onNavigate={navigate} />
        )}
        {page === 'create' && (
          <CreateAlert user={dbUser} onNavigate={navigate} />
        )}
        {page === 'details' && selectedSearch && (
          <AlertDetails search={selectedSearch} onNavigate={navigate} />
        )}
      </main>
    </div>
  );
}

function Header({ user, onNavigate, currentPage, onLogout }) {
  return (
    <header className="header">
      <button className="logo" onClick={() => onNavigate('dashboard')}>
        <span className="logo-icon">✈</span>
        <span className="logo-text">
          <strong>Radar</strong> de Passagens
        </span>
      </button>

      <nav className="nav">
        <button
          className={`nav-btn ${currentPage === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          Meus Alertas
        </button>
        <button
          className="nav-btn primary"
          onClick={() => onNavigate('create')}
        >
          + Novo Alerta
        </button>
        <div className="user-menu">
          <span className="user-name">{user?.name?.split(' ')[0]}</span>
          <button className="btn-logout" onClick={onLogout} title="Sair">
            Sair
          </button>
        </div>
      </nav>
    </header>
  );
}
