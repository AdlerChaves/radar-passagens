// src/routes/index.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { runPriceCheck } = require('../jobs/priceMonitor');
const { searchFlight, searchDiscoveryFlights } = require('../services/flightService');
const { getPriceHistory, calculateStats } = require('../services/priceAnalysisService');
const { interpretUserInput } = require('../services/aiService');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();

// ==========================================
// AUTH — sincroniza usuário Firebase com o banco local
// ==========================================

// Chamado pelo frontend logo após o login/registro no Firebase
// Cria o usuário no banco se não existir, ou retorna o existente
router.post('/auth/sync', requireFirebaseAuth, (req, res) => {
  const { name, email } = req.body;
  const firebaseUid = req.firebaseUid;

  if (!email) return res.status(400).json({ error: 'Email obrigatório' });

  // Tenta buscar por firebase_uid primeiro, depois por email (migração)
  let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid)
          || db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    // Novo usuário
    const id = uuidv4();
    db.prepare(`
      INSERT INTO users (id, firebase_uid, name, email)
      VALUES (?, ?, ?, ?)
    `).run(id, firebaseUid, name || email.split('@')[0], email);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else if (!user.firebase_uid) {
    // Usuário existente sem firebase_uid — atualiza (migração de contas antigas)
    db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').run(firebaseUid, user.id);
    user = { ...user, firebase_uid: firebaseUid };
  }

  res.json(user);
});

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
  db.prepare('DELETE FROM price_history WHERE search_id = ?').run(req.params.id);
  db.prepare('DELETE FROM alerts_sent WHERE search_id = ?').run(req.params.id);
  db.prepare('DELETE FROM searches WHERE id = ?').run(req.params.id);
  res.json({ success: true });
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
router.post('/interpret', async (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).json({ error: 'input é obrigatório' });
  const result = await interpretUserInput(input);
  res.json(result);
});

// Busca manual de preço (para testar)
router.post('/search-now', async (req, res) => {
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
router.post('/trigger-check', async (req, res) => {
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

module.exports = router;
