// src/App.js
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import CreateAlert from './pages/CreateAlert';
import AlertDetails from './pages/AlertDetails';
import './App.css';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('radar_user');
    if (!saved) return null;
    try {
      const data = JSON.parse(saved);
      // Expira após 7 dias
      const age = Date.now() - (data._savedAt || 0);
      if (age > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('radar_user');
        return null;
      }
      return data;
    } catch {
      return null;
    }
  });

  function navigate(to, data = null) {
    setPage(to);
    if (data) setSelectedSearch(data);
  }

  function handleUserSet(u) {
    const payload = { ...u, _savedAt: Date.now() };
    setUser(payload);
    localStorage.setItem('radar_user', JSON.stringify(payload));
  }

  return (
    <div className="app">
      <Header user={user} onNavigate={navigate} currentPage={page} />
      <main className="main">
        {page === 'dashboard' && (
          <Dashboard user={user} onSetUser={handleUserSet} onNavigate={navigate} />
        )}
        {page === 'create' && (
          <CreateAlert user={user} onNavigate={navigate} />
        )}
        {page === 'details' && selectedSearch && (
          <AlertDetails search={selectedSearch} onNavigate={navigate} />
        )}
      </main>
    </div>
  );
}

function Header({ user, onNavigate, currentPage }) {
  return (
    <header className="header">
      <button className="logo" onClick={() => onNavigate('dashboard')}>
        <span className="logo-icon">✈</span>
        <span className="logo-text">
          <strong>Radar</strong> de Passagens
        </span>
      </button>

      <nav className="nav">
        {user && (
          <>
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
          </>
        )}
      </nav>
    </header>
  );
}
