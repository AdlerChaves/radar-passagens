// src/pages/CreateAlert.js
import { useState } from 'react';
import { api } from '../utils/api';
import AirportAutocomplete from '../components/AirportAutocomplete';

export default function CreateAlert({ user, onNavigate }) {
  const [mode, setMode] = useState('form'); // form | ai | discovery
  const [loading, setLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiResult, setAiResult] = useState(null);

  const [form, setForm] = useState({
    origin: null,       // { code, city, name, country }
    destination: null,  // { code, city, name, country }
    travelDate: '',
    dateFlexibility: 3,
    preference: 'cheapest',
    isDiscoveryMode: false,
    maxPrice: '',
  });

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleAiInterpret() {
    if (!aiInput.trim()) return;
    setLoading(true);
    try {
      const result = await api.interpretInput(aiInput);
      setAiResult(result);
      if (result.success) {
        setForm(prev => ({
          ...prev,
          origin: result.origin ? { code: result.origin, city: result.origin, name: result.origin, country: 'BR' } : prev.origin,
          destination: result.destination ? { code: result.destination, city: result.destination_label || result.destination, name: result.destination_label || result.destination, country: '' } : prev.destination,
          travelDate: result.travel_date || '',
          preference: result.preference || 'cheapest',
          isDiscoveryMode: result.is_discovery_mode || false,
        }));
        setMode('form');
      }
    } catch (err) {
      alert('Erro ao interpretar: ' + err.message);
    }
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) return alert('Faça login primeiro');
    if (!form.origin) return alert('Selecione a origem');
    if (!form.isDiscoveryMode && !form.destination) return alert('Selecione o destino');

    setLoading(true);
    try {
      await api.createSearch({
        userId: user.id,
        origin: form.origin.code,
        destination: form.isDiscoveryMode ? 'FLEXIBLE' : form.destination.code,
        destinationLabel: form.isDiscoveryMode ? 'Qualquer destino' : form.destination.city,
        travelDate: form.travelDate || null,
        dateFlexibility: parseInt(form.dateFlexibility),
        preference: form.preference,
        isDiscoveryMode: form.isDiscoveryMode,
        maxPrice: form.maxPrice ? parseFloat(form.maxPrice) : null,
      });
      onNavigate('dashboard');
    } catch (err) {
      alert('Erro ao criar alerta: ' + err.message);
    }
    setLoading(false);
  }

  return (
    <div className="create-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => onNavigate('dashboard')}>← Voltar</button>
        <h1>Criar novo alerta</h1>
      </div>

      <div className="mode-tabs">
        <button className={`mode-tab ${mode === 'form' ? 'active' : ''}`} onClick={() => setMode('form')}>
          📋 Formulário
        </button>
        <button className={`mode-tab ${mode === 'ai' ? 'active' : ''}`} onClick={() => setMode('ai')}>
          🤖 Diga com palavras
        </button>
        <button className={`mode-tab ${mode === 'discovery' ? 'active' : ''}`} onClick={() => setMode('discovery')}>
          🌍 Descoberta
        </button>
      </div>

      {mode === 'ai' && (
        <div className="ai-section">
          <div className="ai-card">
            <h3>O que você quer?</h3>
            <p className="ai-hint">Escreva naturalmente, como enviaria uma mensagem para um amigo.</p>
            <div className="ai-examples">
              <span>ex: "quero uma praia barata em julho saindo de SP"</span>
              <span>ex: "voo mais barato de GRU para Rio no feriado"</span>
              <span>ex: "me avise de qualquer promoção saindo de Curitiba"</span>
            </div>
            <textarea
              className="ai-input"
              placeholder="Descreva o que você quer..."
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              rows={3}
            />
            <button className="btn-primary" onClick={handleAiInterpret} disabled={loading || !aiInput}>
              {loading ? 'Interpretando...' : '✨ Interpretar e criar alerta'}
            </button>
            {aiResult && !aiResult.success && (
              <div className="ai-error">⚠️ {aiResult.message} — Use o formulário abaixo.</div>
            )}
          </div>
        </div>
      )}

      {mode === 'discovery' && (
        <div className="discovery-section">
          <div className="discovery-card">
            <h3>🌍 Modo Descoberta</h3>
            <p>Monitora automaticamente os destinos mais populares e te avisa quando aparecer uma promoção real — abaixo da média histórica.</p>
            <ul className="discovery-list">
              <li>✅ Verifica mais de 10 destinos automaticamente</li>
              <li>✅ Apenas alertas de preços realmente abaixo do normal</li>
              <li>✅ Ideal para quem tem flexibilidade de destino</li>
            </ul>
            <button
              className="btn-primary"
              onClick={() => { setField('isDiscoveryMode', true); setMode('form'); }}
            >
              Ativar modo descoberta →
            </button>
          </div>
        </div>
      )}

      {(mode === 'form' || aiResult?.success) && (
        <form className="alert-form" onSubmit={handleSubmit}>
          {form.isDiscoveryMode && (
            <div className="discovery-badge">
              🌍 Modo Descoberta ativo
              <button type="button" onClick={() => { setField('isDiscoveryMode', false); setField('destination', null); }}>
                ✕
              </button>
            </div>
          )}

          <div className="form-row">
            <AirportAutocomplete
              label="Origem"
              value={form.origin}
              onChange={airport => setField('origin', airport)}
              placeholder="Ex: São Paulo, GRU..."
              exclude={form.destination?.code}
            />

            {!form.isDiscoveryMode && (
              <AirportAutocomplete
                label="Destino"
                value={form.destination}
                onChange={airport => setField('destination', airport)}
                placeholder="Ex: Lisboa, Miami, CDG..."
                exclude={form.origin?.code}
              />
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Data da viagem (opcional)</label>
              <input
                type="date"
                value={form.travelDate}
                onChange={e => setField('travelDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <span className="form-hint">Deixe em branco para monitorar datas flexíveis</span>
            </div>

            {form.travelDate && (
              <div className="form-group">
                <label>Flexibilidade de data (± dias)</label>
                <select value={form.dateFlexibility} onChange={e => setField('dateFlexibility', e.target.value)}>
                  <option value={0}>Data exata</option>
                  <option value={3}>±3 dias</option>
                  <option value={7}>±7 dias</option>
                  <option value={14}>±14 dias</option>
                </select>
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Preferência</label>
              <div className="pref-options">
                {[
                  { value: 'cheapest', label: '💰 Mais barato', desc: 'Menor preço, independente do tempo' },
                  { value: 'fastest', label: '⚡ Mais rápido', desc: 'Menos escalas e menor duração' },
                  { value: 'best_value', label: '⭐ Melhor custo-benefício', desc: 'Equilíbrio entre preço e tempo' },
                ].map(opt => (
                  <label key={opt.value} className={`pref-option ${form.preference === opt.value ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="preference"
                      value={opt.value}
                      checked={form.preference === opt.value}
                      onChange={() => setField('preference', opt.value)}
                    />
                    <span className="pref-label">{opt.label}</span>
                    <span className="pref-desc">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Preço máximo (R$) — opcional</label>
            <input
              type="number"
              placeholder="Ex: 500"
              value={form.maxPrice}
              onChange={e => setField('maxPrice', e.target.value)}
              min={0}
            />
            <span className="form-hint">Só alertar abaixo deste valor</span>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={() => onNavigate('dashboard')}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Criando...' : '🔍 Criar alerta e monitorar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
