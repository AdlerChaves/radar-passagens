// src/pages/AlertDetails.js
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { api } from '../utils/api';


const AIRLINES = {
  LA: 'LATAM', G3: 'Gol', AD: 'Azul', AA: 'American', CM: 'Copa',
  DL: 'Delta', UA: 'United', TP: 'TAP', IB: 'Iberia', BA: 'British',
  AF: 'Air France', KL: 'KLM', LH: 'Lufthansa', EK: 'Emirates',
  QR: 'Qatar', TK: 'Turkish', AC: 'Air Canada', AR: 'Aerolíneas',
};
function airlineName(code) { return AIRLINES[code] || code || '—'; }

export default function AlertDetails({ search, onNavigate }) {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [search.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [histData, alertsData] = await Promise.all([
        api.getSearchHistory(search.id, 30),
        api.getAlerts(),
      ]);
      setHistory(histData.history || []);
      setStats(histData.stats);
      setAlerts((alertsData || []).filter(a => a.search_id === search.id));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  const chartData = [...history].reverse().map(h => ({
    date: new Date(h.checked_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
    price: h.price,
    airline: h.airline,
  }));

  const lastPrice = history[0]?.price;
  const isGoodDeal = stats && lastPrice && lastPrice < stats.avg * 0.85;

  return (
    <div className="details-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => onNavigate('dashboard')}>← Voltar</button>
        <div className="route-header">
          <h1>{search.origin} → {search.destination_label || search.destination}</h1>
          <span className={`status-pill ${search.is_active ? 'active' : 'paused'}`}>
            {search.is_active ? '● Monitorando' : '⏸ Pausado'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="loading">Carregando histórico...</div>
      ) : (
        <>
          {/* Stats cards */}
          {stats && (
            <div className="stats-cards">
              <div className="stat-card">
                <span className="stat-label">Preço atual</span>
                <span className={`stat-value ${isGoodDeal ? 'value-good' : ''}`}>
                  {lastPrice?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '—'}
                </span>
                {history[0]?.airline && (
                  <span style={{fontSize:'12px',color:'var(--blue)',background:'var(--blue-light)',padding:'2px 8px',borderRadius:'20px',fontWeight:600,marginTop:'4px',display:'inline-block'}}>
                    ✈ {airlineName(history[0].airline)}
                    {history[0].stops === 0 ? ' · Direto' : history[0].stops > 0 ? ` · ${history[0].stops} escala(s)` : ''}
                  </span>
                )}
                {isGoodDeal && <span className="good-deal-badge">🔥 Bom negócio!</span>}
              </div>
              <div className="stat-card">
                <span className="stat-label">Média histórica</span>
                <span className="stat-value">
                  {stats.avg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Mínimo histórico</span>
                <span className="stat-value value-low">
                  {stats.min.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Máximo histórico</span>
                <span className="stat-value">
                  {stats.max.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Tendência</span>
                <span className={`stat-value trend-${stats.trend}`}>
                  {stats.trend === 'falling' ? '📉 Caindo' :
                   stats.trend === 'rising' ? '📈 Subindo' : '➡️ Estável'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Verificações</span>
                <span className="stat-value">{stats.count}</span>
              </div>
            </div>
          )}

          {/* Chart */}
          {chartData.length > 1 ? (
            <div className="chart-section">
              <h2>Histórico de preços (30 dias)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickFormatter={v => `R$${v}`}
                    width={70}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      return (
                        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px',fontSize:13}}>
                          <p style={{fontWeight:600,marginBottom:4}}>{label}</p>
                          <p style={{color:'#3b82f6',fontWeight:700}}>{d.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                          {d.payload.airline && <p style={{color:'#64748b',marginTop:2}}>✈ {airlineName(d.payload.airline)}</p>}
                        </div>
                      );
                    }}
                  />
                  {stats && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      label={{ value: 'Média', fill: '#94a3b8', fontSize: 11 }}
                    />
                  )}
                  {stats && (
                    <ReferenceLine
                      y={stats.min}
                      stroke="#22c55e"
                      strokeDasharray="3 3"
                      label={{ value: 'Mínimo', fill: '#22c55e', fontSize: 11 }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#3b82f6' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="chart-hint">
                Linha azul = preço verificado · Linha cinza tracejada = média · Verde = mínimo histórico
              </p>
            </div>
          ) : (
            <div className="chart-placeholder">
              <p>📊 Histórico disponível após pelo menos 2 verificações.</p>
              <p>O scheduler roda a cada 6 horas automaticamente.</p>
            </div>
          )}

          {/* Alertas enviados */}
          {alerts.length > 0 && (
            <div className="sent-alerts">
              <h2>Alertas enviados para esta rota</h2>
              {alerts.map(alert => (
                <div key={alert.id} className="sent-alert-card">
                  <div className="sent-alert-header">
                    <span className="alert-type-badge">
                      {alert.alert_type === 'historical_low' ? '🏆 Mínimo histórico' :
                       alert.alert_type === 'below_average' ? '📉 Abaixo da média' :
                       alert.alert_type === 'price_drop' ? '⬇️ Queda de preço' : alert.alert_type}
                    </span>
                    <span className="alert-price">
                      {alert.price?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className="alert-date">
                      {new Date(alert.sent_at).toLocaleDateString('pt-BR', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="alert-message">{alert.message}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
