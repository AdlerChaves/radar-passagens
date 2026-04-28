// src/components/AirportAutocomplete.js
import { useState, useEffect, useRef, useCallback } from 'react';

const FLAG = { BR:'🇧🇷', US:'🇺🇸', PT:'🇵🇹', ES:'🇪🇸', FR:'🇫🇷', GB:'🇬🇧', IT:'🇮🇹',
  DE:'🇩🇪', AR:'🇦🇷', CL:'🇨🇱', CO:'🇨🇴', PE:'🇵🇪', UY:'🇺🇾', MX:'🇲🇽', CA:'🇨🇦',
  AE:'🇦🇪', JP:'🇯🇵', AU:'🇦🇺', CN:'🇨🇳', IN:'🇮🇳', NL:'🇳🇱', CH:'🇨🇭', AT:'🇦🇹',
  GR:'🇬🇷', DK:'🇩🇰', SE:'🇸🇪', QA:'🇶🇦', SG:'🇸🇬', HK:'🇭🇰', KR:'🇰🇷', TH:'🇹🇭',
  ZA:'🇿🇦', EG:'🇪🇬', MA:'🇲🇦', PA:'🇵🇦', EC:'🇪🇨', PY:'🇵🇾', BO:'🇧🇴', VE:'🇻🇪' };

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

export default function AirportAutocomplete({ value, label, onChange, placeholder, exclude }) {
  const [query, setQuery] = useState(value?.city ? `${value.city} (${value.code})` : '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef();
  const containerRef = useRef();

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (value?.code && value?.city) setQuery(`${value.city} (${value.code})`);
  }, [value?.code]);

  const search = useCallback(
    debounce(async (q) => {
      if (q.trim().length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const res = await fetch(`/api/airports/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(exclude ? data.filter(a => a.code !== exclude) : data);
        setHighlighted(0);
        setOpen(true);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 280),
    [exclude]
  );

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    if (!val) { onChange(null); setResults([]); setOpen(false); return; }
    search(val);
  }

  function select(airport) {
    setQuery(`${airport.city} (${airport.code})`);
    onChange(airport);
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e) {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); select(results[highlighted]); }
    if (e.key === 'Escape')    { setOpen(false); }
  }

  return (
    <div className="airport-autocomplete" ref={containerRef}>
      <label className="ac-label">{label}</label>
      <div className={`ac-input-wrap ${open && results.length ? 'open' : ''}`}>
        <span className="ac-icon">✈️</span>
        <input
          ref={inputRef}
          className="ac-input"
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder || 'Cidade ou código IATA...'}
          autoComplete="off"
        />
        {loading && <span className="ac-spinner" />}
        {value?.code && !loading && <span className="ac-badge">{value.code}</span>}
      </div>

      {open && results.length > 0 && (
        <ul className="ac-dropdown">
          {results.map((airport, i) => (
            <li
              key={airport.code + i}
              className={`ac-item ${i === highlighted ? 'highlighted' : ''}`}
              onMouseDown={() => select(airport)}
              onMouseEnter={() => setHighlighted(i)}
            >
              <span className="ac-flag">{FLAG[airport.country] || '🌍'}</span>
              <div className="ac-info">
                <span className="ac-city">{airport.city}</span>
                <span className="ac-name">{airport.name}</span>
              </div>
              <span className="ac-code">{airport.code}</span>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div className="ac-empty">Nenhum aeroporto encontrado para "{query}"</div>
      )}
    </div>
  );
}
