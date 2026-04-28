// src/pages/Dashboard.js
import { useState, useEffect } from 'react';
import { api } from '../utils/api';

const AIRLINES = {
  LA: 'LATAM', JJ: 'LATAM', G3: 'Gol', AD: 'Azul',
  AA: 'American', CM: 'Copa', DL: 'Delta', UA: 'United',
  TP: 'TAP', IB: 'Iberia', BA: 'British', AF: 'Air France',
  KL: 'KLM', LH: 'Lufthansa', EK: 'Emirates', QR: 'Qatar',
  TK: 'Turkish', AC: 'Air Canada', AR: 'Aerolíneas',
};

function airlineName(code) {
  if (!code) return null;
  return AIRLINES[code] || code;
}

// ============================================================
// DASHBOARD
// ============================================================

export default function Dashboard({ user, onSetUser, onNavigate }) {
  const [searches, setSearches] = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginName, setLoginName]   = useState('');

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        api.getSearches(user.id),
        api.getAlerts(user.id),
      ]);
      setSearches(s);
      setAlerts(a);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!loginEmail || !loginName) return;
    try {
      const u = await api.createUser({ name: loginName, email: loginEmail });
      onSetUser(u);
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  }

  async function toggleSearch(id, isActive) {
    await api.updateSearch(id, { isActive: !isActive });
    loadData();
  }

  async function deleteSearch(id, userId) {
    if (!window.confirm('Remover este alerta?')) return;
    try {
      await fetch(`/api/searches/${id}?userId=${userId}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert('Erro ao remover: ' + err.message);
    }
  }

  async function triggerCheck() {
    try {
      await api.triggerCheck();
      alert('Verificação iniciada! Os logs aparecem no terminal do backend.');
      setTimeout(loadData, 4000);
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  }

  // ---- Tela de login ----
  if (!user) {
    return (
      <div className="login-container">
        <div className="login-card">
          <span className="login-icon">✈️</span>
          <h1>Radar de Passagens</h1>
          <p className="login-sub">
            Monitore preços e receba alertas quando surgir uma promoção real.
          </p>
          <form className="login-form" onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Seu nome"
              value={loginName}
              onChange={e => setLoginName(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="Seu email"
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary btn-full">
              Começar a monitorar
            </button>
          </form>
          <p className="login-hint">Gratuito · Alertas por email · Cancele quando quiser</p>
        </div>

        <div className="features-grid">
          {[
            { icon: '🔍', title: 'Monitoramento 24/7',    desc: 'Verificamos preços a cada 6 horas automaticamente' },
            { icon: '🤖', title: 'Alertas com IA',        desc: 'Mensagens inteligentes que explicam por que o preço é bom' },
            { icon: '📊', title: 'Histórico de preços',   desc: 'Veja se o preço atual é realmente uma boa oferta' },
            { icon: '🎯', title: 'Modo Descoberta',       desc: 'Monitore múltiplos destinos e receba as melhores promos' },
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

  // ---- Dashboard principal ----
  const totalChecks = searches.reduce((a, s) => a + (s.price_checks || 0), 0);

  return (
    <div className="dashboard">

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{searches.filter(s => s.is_active).length}</span>
          <span className="stat-label">alertas ativos</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totalChecks}</span>
          <span className="stat-label">verificações feitas</span>
        </div>
        <div className="stat">
          <span className="stat-value">{alerts.length}</span>
          <span className="stat-label">alertas enviados</span>
        </div>
        <div className="stat-actions">
          <button className="btn-outline btn-sm" onClick={triggerCheck}>
            🔄 Verificar agora
          </button>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="loading">Carregando alertas...</div>
      ) : searches.length === 0 ? (
        <EmptyState onNavigate={onNavigate} />
      ) : (
        <div className="searches-grid">
          {searches.map(search => (
            <SearchCard
              key={search.id}
              search={search}
              alerts={alerts.filter(a => a.search_id === search.id)}
              onToggle={() => toggleSearch(search.id, search.is_active)}
              onDelete={() => deleteSearch(search.id, user.id)}
              onDetails={() => onNavigate('details', search)}
            />
          ))}
          <button className="add-card" onClick={() => onNavigate('create')}>
            <span>+</span>
            <p>Novo alerta</p>
          </button>
        </div>
      )}

      {/* Alertas recentes */}
      {alerts.length > 0 && (
        <div className="alerts-section">
          <h2>Alertas Enviados</h2>
          <div className="alerts-list">
            {alerts.slice(0, 5).map(alert => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SEARCH CARD
// ============================================================

function SearchCard({ search, alerts, onToggle, onDelete, onDetails }) {
  const lastPrice = search.last_price;
  const minPrice  = search.min_price;
  const isLow     = lastPrice && minPrice && lastPrice <= minPrice * 1.05;
  const hasAlerts = alerts.length > 0;

  const prefLabel = {
    cheapest:   '💰 Mais barato',
    fastest:    '⚡ Mais rápido',
    best_value: '⭐ Melhor custo',
  }[search.preference] || search.preference;

  return (
    <div className={`search-card ${!search.is_active ? 'paused' : ''}`}>

      {/* Header: rota + controles */}
      <div className="card-header">
        <div className="route">
          <span className="code">{search.origin}</span>
          <span className="arrow">→</span>
          <span className="code">{search.destination}</span>
        </div>
        <div className="card-controls">
          <button
            className={`toggle ${search.is_active ? 'active' : ''}`}
            onClick={onToggle}
            title={search.is_active ? 'Pausar monitoramento' : 'Retomar monitoramento'}
          >
            {search.is_active ? '⏸' : '▶'}
          </button>
          <button className="delete-btn" onClick={onDelete} title="Remover alerta">
            ✕
          </button>
        </div>
      </div>

      {/* Cidade destino */}
      <div className="destination-label">{search.destination_label}</div>

      {/* Preço + companhia */}
      {lastPrice ? (
        <div className="price-section">
          <div className={`current-price ${isLow ? 'price-low' : ''}`}>
            {lastPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>

          <div className="airline-row">
            {search.last_airline && (
              <span className="airline-tag">✈ {airlineName(search.last_airline)}</span>
            )}
            {search.last_stops === 0 && (
              <span className="stops-tag">Direto</span>
            )}
            {search.last_stops > 0 && (
              <span className="stops-tag stops-indirect">
                {search.last_stops} escala{search.last_stops > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {isLow && <span className="price-badge">🔥 Mínimo histórico!</span>}
          {minPrice && !isLow && (
            <div className="min-price">
              Mín histórico: {minPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          )}
        </div>
      ) : (
        <div className="price-section">
          <div className="min-price">Aguardando primeira verificação...</div>
        </div>
      )}

      {/* Tags */}
      <div className="card-meta">
        <span className="meta-tag">{prefLabel}</span>
        {search.travel_date && (
          <span className="meta-tag">
            📅 {new Date(search.travel_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
          </span>
        )}
        {!!search.is_discovery_mode && (
          <span className="meta-tag discovery">🌍 Descoberta</span>
        )}
      </div>

      {/* Footer */}
      <div className="card-footer">
        <span className="checks-count">{search.price_checks || 0} verificações</span>
        {hasAlerts && (
          <span className="alerts-badge">
            {alerts.length} alerta{alerts.length > 1 ? 's' : ''}
          </span>
        )}
        <button className="btn-link" style={{ marginLeft: 'auto' }} onClick={onDetails}>
          Ver histórico →
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ALERT ITEM (lista recente)
// ============================================================

const TYPE_LABELS = {
  historical_low: '🏆 Mínimo histórico',
  below_average:  '📉 Abaixo da média',
  price_drop:     '⬇️ Queda de preço',
  below_median:   '💡 Abaixo da mediana',
};

function AlertItem({ alert }) {
  const price = alert.price?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sentAt = new Date(alert.sent_at).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="alert-item">
      <div className="alert-route">
        {alert.origin} → {alert.destination_label || alert.destination}
      </div>
      <div className="alert-price">
        {price}
        {alert.airline && (
          <span className="alert-airline"> · {airlineName(alert.airline)}</span>
        )}
      </div>
      <div className="alert-type">
        {TYPE_LABELS[alert.alert_type] || alert.alert_type}
      </div>
      <div className="alert-date">{sentAt}</div>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({ onNavigate }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">🔍</span>
      <h2>Nenhum alerta configurado ainda</h2>
      <p>Configure seu primeiro alerta e comece a monitorar preços de passagens aéreas.</p>
      <button className="btn-primary" onClick={() => onNavigate('create')}>
        Criar meu primeiro alerta
      </button>
    </div>
  );
}
