// src/routes/index.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { runPriceCheck } = require('../jobs/priceMonitor');
const { searchFlight, searchDiscoveryFlights } = require('../services/flightService');
const { getPriceHistory, calculateStats } = require('../services/priceAnalysisService');
const { interpretUserInput } = require('../services/aiService');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

// Validação de código IATA (3 letras maiúsculas)
const IATA_REGEX = /^[A-Z]{3}$/;

// ==========================================
// USUÁRIOS
// ==========================================

// Cadastrar ou buscar usuário por email
router.post('/users', (req, res) => {
  const { name, email, whatsapp } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios' });
  }

  // Verifica se já existe
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, whatsapp) VALUES (?, ?, ?, ?)').run(id, name, email, whatsapp || null);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  res.json(user);
});

router.get('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(user);
});

// ==========================================
// BUSCAS / ALERTAS
// ==========================================

// Listar buscas do usuário
router.get('/searches', (req, res) => {
  const { userId } = req.query;

  const searches = db.prepare(`
    SELECT 
      s.*,
      (SELECT COUNT(*) FROM price_history WHERE search_id = s.id) as price_checks,
      (SELECT COUNT(*) FROM alerts_sent WHERE search_id = s.id) as alerts_count,
      (SELECT price FROM price_history WHERE search_id = s.id ORDER BY checked_at DESC LIMIT 1) as last_price,
      (SELECT airline FROM price_history WHERE search_id = s.id ORDER BY checked_at DESC LIMIT 1) as last_airline,
      (SELECT stops FROM price_history WHERE search_id = s.id ORDER BY checked_at DESC LIMIT 1) as last_stops,
      (SELECT MIN(price) FROM price_history WHERE search_id = s.id) as min_price
    FROM searches s
    ${userId ? 'WHERE s.user_id = ?' : ''}
    ORDER BY s.created_at DESC
  `).all(userId ? [userId] : []);

  res.json(searches);
});

// Criar busca
router.post('/searches', (req, res) => {
  const {
    userId, origin, destination, destinationLabel,
    travelDate, dateFlexibility, preference,
    isDiscoveryMode, maxPrice
  } = req.body;

  if (!userId || !origin || !destination) {
    return res.status(400).json({ error: 'userId, origin e destination são obrigatórios' });
  }

  // Valida códigos IATA
  if (!IATA_REGEX.test(origin.toUpperCase())) {
    return res.status(400).json({ error: 'origin deve ser um código IATA válido (ex: GRU, GIG)' });
  }
  if (destination !== 'FLEXIBLE' && !IATA_REGEX.test(destination.toUpperCase())) {
    return res.status(400).json({ error: 'destination deve ser um código IATA válido ou "FLEXIBLE"' });
  }

  // Verifica se usuário existe
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO searches (
      id, user_id, origin, destination, destination_label,
      travel_date, date_flexibility, preference, is_discovery_mode, max_price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, origin.toUpperCase(), destination.toUpperCase(),
    destinationLabel || destination, travelDate || null,
    dateFlexibility || 3, preference || 'cheapest',
    isDiscoveryMode ? 1 : 0, maxPrice || null
  );

  const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
  res.status(201).json(search);
});

// Ativar/pausar busca
router.patch('/searches/:id', (req, res) => {
  const { isActive } = req.body;
  db.prepare('UPDATE searches SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, req.params.id);
  const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(req.params.id);
  res.json(search);
});

// Deletar busca
router.delete('/searches/:id', (req, res) => {
  try {
    const userId = req.query.userId || req.body?.userId;
    const searchId = req.params.id;

    console.log(`[DELETE /searches] id=${searchId} userId=${userId}`);

    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

    // Verifica ownership antes de deletar
    const search = db.prepare('SELECT id, user_id FROM searches WHERE id = ?').get(searchId);

    console.log(`[DELETE /searches] busca encontrada:`, search);

    if (!search) return res.status(404).json({ error: 'Busca não encontrada' });
    if (search.user_id !== userId) return res.status(403).json({ error: 'Acesso negado: esta busca pertence a outro usuário' });

    // Deleta em cascata dentro de uma transação
    const deleteAll = db.transaction(() => {
      // Ordem importa: alerts_sent referencia price_history via FK
      db.prepare('DELETE FROM alerts_sent WHERE search_id = ?').run(searchId);
      db.prepare('DELETE FROM price_history WHERE search_id = ?').run(searchId);
      db.prepare('DELETE FROM searches WHERE id = ?').run(searchId);
    });

    deleteAll();
    console.log(`[DELETE /searches] busca ${searchId} removida com sucesso`);
    res.json({ success: true });

  } catch (err) {
    console.error('[DELETE /searches] Erro:', err);
    res.status(500).json({ error: 'Erro ao deletar busca', detail: err.message });
  }
});

// Histórico de preços de uma busca
router.get('/searches/:id/history', (req, res) => {
  const { days = 30 } = req.query;
  const history = getPriceHistory(req.params.id, parseInt(days));
  const stats = calculateStats(history);
  res.json({ history, stats });
});

// ==========================================
// ALERTAS ENVIADOS
// ==========================================

router.get('/alerts', (req, res) => {
  const { userId } = req.query;

  const alerts = db.prepare(`
    SELECT 
      a.*,
      s.origin, s.destination, s.destination_label,
      ph.price, ph.airline, ph.departure_datetime
    FROM alerts_sent a
    JOIN searches s ON s.id = a.search_id
    JOIN price_history ph ON ph.id = a.price_history_id
    ${userId ? 'WHERE a.user_id = ?' : ''}
    ORDER BY a.sent_at DESC
    LIMIT 50
  `).all(userId ? [userId] : []);

  res.json(alerts);
});

// ==========================================
// UTILITÁRIOS
// ==========================================

// Interpretar input vago com IA
router.post('/interpret', requireApiKey, async (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).json({ error: 'input é obrigatório' });
  const result = await interpretUserInput(input);
  res.json(result);
});

// Busca manual de preço (para testar)
router.post('/search-now', requireApiKey, async (req, res) => {
  const { origin, destination, travelDate } = req.body;
  const result = await searchFlight({ origin, destination, travel_date: travelDate });
  res.json(result);
});

// Busca de descoberta
router.get('/discovery', async (req, res) => {
  const { origin = 'GRU', limit = 5 } = req.query;
  const results = await searchDiscoveryFlights(origin);
  res.json(results.slice(0, parseInt(limit)));
});

// Trigger manual do job (admin/dev)
router.post('/trigger-check', requireApiKey, async (req, res) => {
  res.json({ message: 'Verificação iniciada em background' });
  runPriceCheck().catch(console.error);
});

// Health check
router.get('/health', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const searchCount = db.prepare('SELECT COUNT(*) as c FROM searches WHERE is_active = 1').get().c;
  const alertCount = db.prepare('SELECT COUNT(*) as c FROM alerts_sent').get().c;
  res.json({
    status: 'ok',
    stats: { users: userCount, activeSearches: searchCount, alertsSent: alertCount },
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// AUTOCOMPLETE DE AEROPORTOS
// ==========================================

// Proxy para API de aeroportos (mantém a API key segura no backend)
router.get('/airports/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);

  // Tenta AirLabs primeiro (requer API key gratuita)
  const airlabsKey = process.env.AIRLABS_API_KEY;
  if (airlabsKey) {
    try {
      const axios = require('axios');
      const response = await axios.get('https://airlabs.co/api/v9/suggest', {
        params: { q: q.trim(), api_key: airlabsKey },
        timeout: 3000,
      });
      const data = response.data.response || {};
      const airports = [
        ...(data.airports || []),
        ...(data.cities_by_airports || []),
      ]
        .filter(a => a.iata_code && a.name)
        .slice(0, 8)
        .map(a => ({
          code: a.iata_code,
          name: a.name,
          city: a.city || a.name,
          country: a.country_code || '',
        }));
      return res.json(airports);
    } catch (err) {
      console.warn('[airports/search] AirLabs falhou, usando fallback:', err.message);
    }
  }

  // Fallback: busca na lista local estendida
  const query = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matches = AIRPORTS_DB
    .filter(a => {
      const haystack = (a.code + ' ' + a.city + ' ' + a.country)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return haystack.includes(query);
    })
    .slice(0, 8);
  res.json(matches);
});

// Base local de aeroportos (fallback quando não há API key)
const AIRPORTS_DB = [
  // Brasil
  { code: 'GRU', city: 'São Paulo — Guarulhos', name: 'Aeroporto Internacional de Guarulhos', country: 'BR' },
  { code: 'CGH', city: 'São Paulo — Congonhas', name: 'Aeroporto de Congonhas', country: 'BR' },
  { code: 'VCP', city: 'Campinas — Viracopos', name: 'Aeroporto Internacional de Viracopos', country: 'BR' },
  { code: 'GIG', city: 'Rio de Janeiro — Galeão', name: 'Aeroporto Internacional do Galeão', country: 'BR' },
  { code: 'SDU', city: 'Rio de Janeiro — Santos Dumont', name: 'Aeroporto Santos Dumont', country: 'BR' },
  { code: 'BSB', city: 'Brasília', name: 'Aeroporto Internacional de Brasília', country: 'BR' },
  { code: 'SSA', city: 'Salvador', name: 'Aeroporto Internacional de Salvador', country: 'BR' },
  { code: 'REC', city: 'Recife', name: 'Aeroporto Internacional do Recife', country: 'BR' },
  { code: 'FOR', city: 'Fortaleza', name: 'Aeroporto Internacional Pinto Martins', country: 'BR' },
  { code: 'CWB', city: 'Curitiba', name: 'Aeroporto Internacional Afonso Pena', country: 'BR' },
  { code: 'POA', city: 'Porto Alegre', name: 'Aeroporto Internacional Salgado Filho', country: 'BR' },
  { code: 'FLN', city: 'Florianópolis', name: 'Aeroporto Internacional Hercílio Luz', country: 'BR' },
  { code: 'BEL', city: 'Belém', name: 'Aeroporto Internacional Val-de-Cans', country: 'BR' },
  { code: 'MAO', city: 'Manaus', name: 'Aeroporto Internacional Eduardo Gomes', country: 'BR' },
  { code: 'NAT', city: 'Natal', name: 'Aeroporto Internacional Governador Aluízio Alves', country: 'BR' },
  { code: 'MCZ', city: 'Maceió', name: 'Aeroporto Internacional Zumbi dos Palmares', country: 'BR' },
  { code: 'AJU', city: 'Aracaju', name: 'Aeroporto Internacional de Aracaju', country: 'BR' },
  { code: 'THE', city: 'Teresina', name: 'Aeroporto Internacional Senador Petrônio Portella', country: 'BR' },
  { code: 'SLZ', city: 'São Luís', name: 'Aeroporto Internacional Marechal Cunha Machado', country: 'BR' },
  { code: 'CGB', city: 'Cuiabá', name: 'Aeroporto Internacional Marechal Rondon', country: 'BR' },
  { code: 'CGR', city: 'Campo Grande', name: 'Aeroporto Internacional de Campo Grande', country: 'BR' },
  { code: 'GYN', city: 'Goiânia', name: 'Aeroporto Internacional de Goiânia', country: 'BR' },
  { code: 'VIX', city: 'Vitória', name: 'Aeroporto de Vitória', country: 'BR' },
  { code: 'PMW', city: 'Palmas', name: 'Aeroporto de Palmas', country: 'BR' },
  { code: 'PVH', city: 'Porto Velho', name: 'Aeroporto Internacional Governador Jorge Teixeira', country: 'BR' },
  { code: 'BVB', city: 'Boa Vista', name: 'Aeroporto Internacional Atlas Brasil Cantanhede', country: 'BR' },
  { code: 'MCP', city: 'Macapá', name: 'Aeroporto Internacional de Macapá', country: 'BR' },
  { code: 'RBR', city: 'Rio Branco', name: 'Aeroporto Internacional Plácido de Castro', country: 'BR' },
  { code: 'IOS', city: 'Ilhéus', name: 'Aeroporto de Ilhéus', country: 'BR' },
  { code: 'BPS', city: 'Porto Seguro', name: 'Aeroporto de Porto Seguro', country: 'BR' },
  { code: 'CFB', city: 'Cabo Frio', name: 'Aeroporto Internacional de Cabo Frio', country: 'BR' },
  { code: 'LEC', city: 'Lençóis — Chapada Diamantina', name: 'Aeroporto Horácio de Matos', country: 'BR' },
  { code: 'NVT', city: 'Navegantes', name: 'Aeroporto Internacional Ministro Victor Konder', country: 'BR' },
  { code: 'JPA', city: 'João Pessoa', name: 'Aeroporto Internacional Presidente Castro Pinto', country: 'BR' },
  { code: 'BDC', city: 'Barra do Corda', name: 'Aeroporto de Barra do Corda', country: 'BR' },
  { code: 'GNM', city: 'Guanambi', name: 'Aeroporto de Guanambi', country: 'BR' },
  // América do Norte
  { code: 'MIA', city: 'Miami', name: 'Miami International Airport', country: 'US' },
  { code: 'JFK', city: 'Nova York — JFK', name: 'John F. Kennedy International Airport', country: 'US' },
  { code: 'EWR', city: 'Nova York — Newark', name: 'Newark Liberty International Airport', country: 'US' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International Airport', country: 'US' },
  { code: 'ORD', city: 'Chicago — O\'Hare', name: 'O\'Hare International Airport', country: 'US' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando International Airport', country: 'US' },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid International Airport', country: 'US' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson Atlanta International Airport', country: 'US' },
  { code: 'BOS', city: 'Boston', name: 'Logan International Airport', country: 'US' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International Airport', country: 'US' },
  { code: 'YYZ', city: 'Toronto', name: 'Toronto Pearson International Airport', country: 'CA' },
  { code: 'YUL', city: 'Montreal', name: 'Montreal-Trudeau International Airport', country: 'CA' },
  { code: 'MEX', city: 'Cidade do México', name: 'Aeropuerto Internacional Benito Juárez', country: 'MX' },
  { code: 'CUN', city: 'Cancún', name: 'Aeropuerto Internacional de Cancún', country: 'MX' },
  // América do Sul
  { code: 'EZE', city: 'Buenos Aires — Ezeiza', name: 'Aeropuerto Internacional Ministro Pistarini', country: 'AR' },
  { code: 'AEP', city: 'Buenos Aires — Aeroparque', name: 'Aeroparque Jorge Newbery', country: 'AR' },
  { code: 'SCL', city: 'Santiago', name: 'Aeropuerto Internacional Arturo Merino Benítez', country: 'CL' },
  { code: 'LIM', city: 'Lima', name: 'Aeropuerto Internacional Jorge Chávez', country: 'PE' },
  { code: 'BOG', city: 'Bogotá', name: 'Aeropuerto Internacional El Dorado', country: 'CO' },
  { code: 'UIO', city: 'Quito', name: 'Aeropuerto Internacional Mariscal Sucre', country: 'EC' },
  { code: 'GYE', city: 'Guayaquil', name: 'Aeropuerto Internacional José Joaquín de Olmedo', country: 'EC' },
  { code: 'MVD', city: 'Montevidéu', name: 'Aeropuerto Internacional de Carrasco', country: 'UY' },
  { code: 'ASU', city: 'Assunção', name: 'Aeropuerto Internacional Silvio Pettirossi', country: 'PY' },
  { code: 'VVI', city: 'Santa Cruz de la Sierra', name: 'Aeropuerto Internacional Viru Viru', country: 'BO' },
  { code: 'CCS', city: 'Caracas', name: 'Aeropuerto Internacional Simón Bolívar', country: 'VE' },
  { code: 'PTY', city: 'Cidade do Panamá', name: 'Aeropuerto Internacional de Tocumen', country: 'PA' },
  // Europa
  { code: 'LIS', city: 'Lisboa', name: 'Aeroporto Internacional Humberto Delgado', country: 'PT' },
  { code: 'OPO', city: 'Porto', name: 'Aeroporto Francisco Sá Carneiro', country: 'PT' },
  { code: 'MAD', city: 'Madri', name: 'Aeropuerto Internacional Adolfo Suárez', country: 'ES' },
  { code: 'BCN', city: 'Barcelona', name: 'Aeropuerto Internacional El Prat', country: 'ES' },
  { code: 'CDG', city: 'Paris — Charles de Gaulle', name: 'Aéroport Charles de Gaulle', country: 'FR' },
  { code: 'LHR', city: 'Londres — Heathrow', name: 'London Heathrow Airport', country: 'GB' },
  { code: 'FCO', city: 'Roma — Fiumicino', name: 'Aeroporto di Roma-Fiumicino', country: 'IT' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'DE' },
  { code: 'AMS', city: 'Amsterdã', name: 'Amsterdam Airport Schiphol', country: 'NL' },
  { code: 'ZRH', city: 'Zurique', name: 'Zurich Airport', country: 'CH' },
  { code: 'VIE', city: 'Viena', name: 'Vienna International Airport', country: 'AT' },
  { code: 'ATH', city: 'Atenas', name: 'Athens International Airport', country: 'GR' },
  { code: 'CPH', city: 'Copenhague', name: 'Copenhagen Airport', country: 'DK' },
  { code: 'ARN', city: 'Estocolmo', name: 'Stockholm Arlanda Airport', country: 'SE' },
  // Resto do mundo
  { code: 'DXB', city: 'Dubai', name: 'Dubai International Airport', country: 'AE' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International Airport', country: 'QA' },
  { code: 'NRT', city: 'Tóquio — Narita', name: 'Narita International Airport', country: 'JP' },
  { code: 'HND', city: 'Tóquio — Haneda', name: 'Tokyo Haneda Airport', country: 'JP' },
  { code: 'PEK', city: 'Pequim', name: 'Beijing Capital International Airport', country: 'CN' },
  { code: 'PVG', city: 'Xangai', name: 'Shanghai Pudong International Airport', country: 'CN' },
  { code: 'BKK', city: 'Bangcoc', name: 'Suvarnabhumi Airport', country: 'TH' },
  { code: 'SYD', city: 'Sydney', name: 'Sydney Kingsford Smith Airport', country: 'AU' },
  { code: 'JNB', city: 'Joanesburgo', name: 'O.R. Tambo International Airport', country: 'ZA' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo International Airport', country: 'EG' },
  { code: 'CMN', city: 'Casablanca', name: 'Mohammed V International Airport', country: 'MA' },
  { code: 'SIN', city: 'Singapura', name: 'Singapore Changi Airport', country: 'SG' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International Airport', country: 'HK' },
  { code: 'ICN', city: 'Seul', name: 'Incheon International Airport', country: 'KR' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj International Airport', country: 'IN' },
  { code: 'DEL', city: 'Nova Delhi', name: 'Indira Gandhi International Airport', country: 'IN' },
];


module.exports = router;
