// src/pages/Login.js
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle, authError, setAuthError } = useAuth();

  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(name, email, password);
      }
    } catch {
      // erro já está em authError via context
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setAuthError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      // erro já tratado no context
    }
    setLoading(false);
  }

  function switchMode() {
    setAuthError(null);
    setMode(m => m === 'login' ? 'register' : 'login');
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <span className="login-icon">✈️</span>
        <h1>Radar de Passagens</h1>
        <p className="login-sub">
          {mode === 'login'
            ? 'Entre na sua conta para acessar seus alertas'
            : 'Crie sua conta e comece a monitorar preços'}
        </p>

        {/* Botão Google */}
        <button
          className="btn-google"
          onClick={handleGoogle}
          disabled={loading}
          type="button"
        >
          <GoogleIcon />
          Continuar com Google
        </button>

        <div className="auth-divider">
          <span>ou</span>
        </div>

        {/* Formulário email/senha */}
        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder={mode === 'register' ? 'Criar senha (mín. 6 caracteres)' : 'Senha'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {authError && (
            <div className="auth-error">{authError}</div>
          )}

          <button type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading
              ? 'Aguarde...'
              : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'Não tem conta?' : 'Já tem conta?'}{' '}
          <button className="btn-link" onClick={switchMode} type="button">
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>

        <p className="login-hint">Gratuito · Alertas por email · Cancele quando quiser</p>
      </div>

      {/* Features */}
      <div className="features-grid">
        {[
          { icon: '🔍', title: 'Monitoramento 24/7',  desc: 'Verificamos preços a cada 6 horas' },
          { icon: '🤖', title: 'Alertas com IA',      desc: 'Mensagens que explicam por que o preço é bom' },
          { icon: '📊', title: 'Histórico de preços', desc: 'Veja se o preço é realmente uma oferta' },
          { icon: '🎯', title: 'Modo Descoberta',     desc: 'Receba promos de múltiplos destinos' },
        ].map(f => (
          <div className="feature-card" key={f.title}>
            <span className="feature-icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
