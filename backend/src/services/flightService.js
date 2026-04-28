// src/services/flightService.js
const axios = require('axios');

/**
 * Serviço de busca de voos
 * Provider: Travelpayouts / Aviasales Data API
 * Docs: https://travelpayouts.github.io/slate/
 *
 * Usa 3 endpoints:
 *  1. /v1/prices/cheap         → menor preço da semana para uma rota
 *  2. /v1/prices/cheap (sem destino) → modo descoberta
 *  3. Mock                     → fallback sem token configurado
 */

const TP_BASE = 'https://api.travelpayouts.com';
const TP_TOKEN = process.env.TRAVELPAYOUTS_TOKEN;

// Travelpayouts às vezes retorna código metropolitano em vez do IATA do aeroporto
// Ex: busca "GIG" mas a resposta vem com chave "RIO"
const METRO_ALIASES = {
  GIG: 'RIO', SDU: 'RIO',
  GRU: 'SAO', CGH: 'SAO', VCP: 'SAO',
  BSB: 'BSB', SSA: 'SSA', REC: 'REC',
  FOR: 'FOR', CWB: 'CWB', POA: 'POA',
  FLN: 'FLN', BEL: 'BEL', MAO: 'MAO', MIA: 'MIA',
};

// Busca os dados na resposta tentando o código IATA direto e o alias metropolitano
function findInResponse(responseData, iataCode) {
  return responseData[iataCode] || responseData[METRO_ALIASES[iataCode]] || null;
}

// ==========================================
// MOCK DATA (fallback sem token configurado)
// ==========================================

const MOCK_ROUTES = {
  'GRU-GIG': { base: 280, airlines: ['LA', 'G3', 'AD'], min: 150, max: 620 },
  'GRU-SSA': { base: 480, airlines: ['LA', 'G3'], min: 280, max: 890 },
  'GRU-REC': { base: 520, airlines: ['LA', 'AD'], min: 310, max: 950 },
  'GRU-FOR': { base: 560, airlines: ['LA', 'G3'], min: 340, max: 980 },
  'GRU-BSB': { base: 380, airlines: ['LA', 'G3', 'AD'], min: 210, max: 720 },
  'GRU-FLN': { base: 390, airlines: ['LA', 'AD'], min: 240, max: 740 },
  'GRU-POA': { base: 340, airlines: ['LA', 'G3'], min: 200, max: 680 },
  'GRU-CWB': { base: 290, airlines: ['LA', 'G3', 'AD'], min: 180, max: 590 },
  'GRU-MIA': { base: 2800, airlines: ['LA', 'AA', 'CM'], min: 1800, max: 5200 },
};

const DISCOVERY_DESTINATIONS = [
  { code: 'GIG', label: 'Rio de Janeiro' },
  { code: 'SSA', label: 'Salvador' },
  { code: 'REC', label: 'Recife' },
  { code: 'FOR', label: 'Fortaleza' },
  { code: 'BSB', label: 'Brasília' },
  { code: 'FLN', label: 'Florianópolis' },
  { code: 'POA', label: 'Porto Alegre' },
  { code: 'CWB', label: 'Curitiba' },
];

function generateMockPrice(origin, destination) {
  const key = `${origin}-${destination}`;
  const config = MOCK_ROUTES[key] || { base: 450, airlines: ['LA'], min: 250, max: 850 };

  const variance = (Math.random() - 0.5) * 0.4;
  const price = Math.round(config.base * (1 + variance));
  const clamped = Math.min(Math.max(price, config.min), config.max);
  const airline = config.airlines[Math.floor(Math.random() * config.airlines.length)];
  const stops = Math.random() > 0.6 ? 1 : 0;
  const duration = (stops ? 180 : 110) + Math.floor(Math.random() * 60);

  const dept = new Date();
  dept.setDate(dept.getDate() + 7 + Math.floor(Math.random() * 30));
  const arr = new Date(dept.getTime() + duration * 60000);

  return {
    price: clamped,
    currency: 'BRL',
    airline,
    stops,
    duration_minutes: duration,
    departure_datetime: dept.toISOString(),
    arrival_datetime: arr.toISOString(),
    deep_link: `https://www.aviasales.com/search/${origin}${String(dept.getMonth()+1).padStart(2,'0')}${String(dept.getDate()).padStart(2,'0')}${destination}1`,
    source: 'mock',
  };
}

// ==========================================
// TRAVELPAYOUTS — /v1/prices/cheap
// ==========================================

/**
 * Busca o menor preço disponível para uma rota.
 * O cache é atualizado com base nas buscas reais dos últimos 7 dias no Aviasales.
 * Docs: https://travelpayouts.github.io/slate/#the-cheapest-tickets
 */
async function fetchCheapestPrice(origin, destination, travelDate) {
  const params = {
    origin,
    destination,
    currency: 'brl',
    token: TP_TOKEN,
  };

  // Filtra por mês se o usuário especificou data (YYYY-MM-DD → YYYY-MM)
  if (travelDate) {
    params.depart_date = travelDate.slice(0, 7);
  }

  const { data } = await axios.get(`${TP_BASE}/v1/prices/cheap`, {
    params,
    timeout: 8000,
  });

  if (!data.success || !data.data) return null;

  // A API pode retornar o código IATA direto ("GIG") ou o metropolitano ("RIO")
  // findInResponse tenta os dois
  console.log(`    📡 Travelpayouts chaves retornadas:`, Object.keys(data.data));
  const destData = findInResponse(data.data, destination);
  if (!destData) {
    console.log(`    ⚠️  Destino ${destination} não encontrado nas chaves:`, Object.keys(data.data));
    return null;
  }

  // Ordena pelo preço e pega o mais barato
  const entries = Object.entries(destData).sort((a, b) => a[1].price - b[1].price);
  if (!entries.length) return null;

  const [stopsKey, flight] = entries[0];
  const stops = parseInt(stopsKey) || 0;
  const estimatedDuration = stops === 0 ? 110 : 180;

  const dept = flight.departure_at ? new Date(flight.departure_at) : null;
  const arr = dept ? new Date(dept.getTime() + estimatedDuration * 60000) : null;

  const mm = dept ? String(dept.getMonth() + 1).padStart(2, '0') : '';
  const dd = dept ? String(dept.getDate()).padStart(2, '0') : '';

  return {
    price: parseFloat(flight.price) || 0,
    currency: 'BRL',
    airline: flight.airline || '??',
    stops,
    duration_minutes: estimatedDuration,
    departure_datetime: dept ? dept.toISOString() : null,
    arrival_datetime: arr ? arr.toISOString() : null,
    deep_link: `https://www.aviasales.com/search/${origin}${mm}${dd}${destination}1`,
    source: 'travelpayouts',
  };
}

// ==========================================
// TRAVELPAYOUTS — modo descoberta
// ==========================================

/**
 * Sem destination → API retorna os melhores preços para todos os destinos disponíveis.
 * Docs: https://travelpayouts.github.io/slate/#the-cheapest-tickets
 */
async function fetchDiscoveryPrices(origin) {
  const { data } = await axios.get(`${TP_BASE}/v1/prices/cheap`, {
    params: { origin, currency: 'brl', token: TP_TOKEN },
    timeout: 10000,
  });

  if (!data.success || !data.data) return [];

  const results = [];

  for (const [destCode, flights] of Object.entries(data.data)) {
    const entries = Object.entries(flights).sort((a, b) => a[1].price - b[1].price);
    if (!entries.length) continue;

    const [stopsKey, flight] = entries[0];
    const stops = parseInt(stopsKey) || 0;
    const estimatedDuration = stops === 0 ? 110 : 180;
    const dept = flight.departure_at ? new Date(flight.departure_at) : null;
    const arr = dept ? new Date(dept.getTime() + estimatedDuration * 60000) : null;
    const known = DISCOVERY_DESTINATIONS.find(d => d.code === destCode);
    const mm = dept ? String(dept.getMonth() + 1).padStart(2, '0') : '';
    const dd = dept ? String(dept.getDate()).padStart(2, '0') : '';

    results.push({
      destination: destCode,
      destination_label: known?.label || destCode,
      price: parseFloat(flight.price) || 0,
      currency: 'BRL',
      airline: flight.airline || '??',
      stops,
      duration_minutes: estimatedDuration,
      departure_datetime: dept ? dept.toISOString() : null,
      arrival_datetime: arr ? arr.toISOString() : null,
      deep_link: `https://www.aviasales.com/search/${origin}${mm}${dd}${destCode}1`,
      source: 'travelpayouts',
    });
  }

  return results.sort((a, b) => a.price - b.price);
}

// ==========================================
// INTERFACE PÚBLICA (não muda — compatível com o resto do projeto)
// ==========================================

async function searchFlight(search) {
  const useMock = process.env.USE_MOCK_API === 'true' || !TP_TOKEN;

  if (useMock) {
    await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
    return generateMockPrice(search.origin, search.destination);
  }

  try {
    return await fetchCheapestPrice(search.origin, search.destination, search.travel_date);
  } catch (err) {
    console.error(`Travelpayouts erro (${search.origin}→${search.destination}):`, err.message);
    return generateMockPrice(search.origin, search.destination);
  }
}

async function searchDiscoveryFlights(origin) {
  const useMock = process.env.USE_MOCK_API === 'true' || !TP_TOKEN;

  if (useMock) {
    await new Promise(r => setTimeout(r, 300));
    return DISCOVERY_DESTINATIONS
      .filter(d => d.code !== origin)
      .map(d => ({ ...generateMockPrice(origin, d.code), destination: d.code, destination_label: d.label }))
      .sort((a, b) => a.price - b.price);
  }

  try {
    return await fetchDiscoveryPrices(origin);
  } catch (err) {
    console.error('Travelpayouts discovery erro:', err.message);
    return [];
  }
}

module.exports = { searchFlight, searchDiscoveryFlights };
