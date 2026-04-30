// src/routes/index.js
const express    = require('express');
const { v4: uuidv4 } = require('uuid');
const { firestore }  = require('../config/firestore');
const { runPriceCheck }                          = require('../jobs/priceMonitor');
const { searchFlight, searchDiscoveryFlights }   = require('../services/flightService');
const { getPriceHistory, calculateStats }         = require('../services/priceAnalysisService');
const { interpretUserInput }                      = require('../services/aiService');
const { requireFirebaseAuth }                     = require('../middleware/firebaseAuth');

const router = express.Router();
const IATA_REGEX = /^[A-Z]{3}$/;

// ─────────────────────────────────────────────────────────────
// AUTH — sincroniza usuário Firebase com o Firestore
// ─────────────────────────────────────────────────────────────

router.post('/auth/sync', requireFirebaseAuth, async (req, res) => {
  try {
    const { name, email } = req.body;
    const firebaseUid     = req.firebaseUid;

    if (!email) return res.status(400).json({ error: 'Email obrigatório' });

    // Usa o UID do Firebase como ID do documento — simples e sem colisão
    const userRef = firestore.collection('users').doc(firebaseUid);
    const userDoc = await userRef.get();

    let user;
    if (!userDoc.exists) {
      user = {
        id:           firebaseUid,
        firebase_uid: firebaseUid,
        name:         name || email.split('@')[0],
        email,
        whatsapp:     null,
        created_at:   new Date().toISOString(),
      };
      await userRef.set(user);
    } else {
      user = { id: firebaseUid, ...userDoc.data() };
    }

    res.json(user);
  } catch (err) {
    console.error('/auth/sync erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// USUÁRIOS
// ─────────────────────────────────────────────────────────────

router.get('/users/:id', async (req, res) => {
  try {
    const doc = await firestore.collection('users').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// BUSCAS
// ─────────────────────────────────────────────────────────────

// Listar buscas do usuário — com agregados de histórico
router.get('/searches', async (req, res) => {
  try {
    const { userId } = req.query;

    let query = firestore.collection('searches').orderBy('created_at', 'desc');
    if (userId) query = query.where('user_id', '==', userId);

    const snap     = await query.get();
    const searches = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Enriquece cada busca com dados do histórico de preços
    const enriched = await Promise.all(searches.map(async search => {
      const histSnap = await firestore
        .collection('price_history')
        .where('search_id', '==', search.id)
        .orderBy('checked_at', 'desc')
        .limit(30)
        .get();

      const history = histSnap.docs.map(d => d.data());

      const last      = history[0] || null;
      const prices    = history.map(h => h.price);
      const min_price = prices.length ? Math.min(...prices) : null;

      const alertSnap = await firestore
        .collection('alerts_sent')
        .where('search_id', '==', search.id)
        .get();

      return {
        ...search,
        price_checks:  history.length,
        alerts_count:  alertSnap.size,
        last_price:    last?.price    || null,
        last_airline:  last?.airline  || null,
        last_stops:    last?.stops    ?? null,
        min_price,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('/searches GET erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Criar busca
router.post('/searches', async (req, res) => {
  try {
    const {
      userId, origin, destination, destinationLabel,
      travelDate, dateFlexibility, preference,
      isDiscoveryMode, maxPrice,
    } = req.body;

    if (!userId || !origin || !destination)
      return res.status(400).json({ error: 'userId, origin e destination são obrigatórios' });

    if (!IATA_REGEX.test(origin.toUpperCase()))
      return res.status(400).json({ error: 'origin deve ser um código IATA válido (ex: GRU)' });

    if (destination !== 'FLEXIBLE' && !IATA_REGEX.test(destination.toUpperCase()))
      return res.status(400).json({ error: 'destination deve ser um código IATA válido ou "FLEXIBLE"' });

    // Verifica se usuário existe
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado' });

    const id     = uuidv4();
    const search = {
      id,
      user_id:           userId,
      origin:            origin.toUpperCase(),
      destination:       destination.toUpperCase(),
      destination_label: destinationLabel || destination,
      travel_date:       travelDate       || null,
      date_flexibility:  dateFlexibility  || 3,
      preference:        preference       || 'cheapest',
      is_discovery_mode: !!isDiscoveryMode,
      max_price:         maxPrice         || null,
      is_active:         true,
      created_at:        new Date().toISOString(),
      last_checked_at:   null,
    };

    await firestore.collection('searches').doc(id).set(search);
    res.status(201).json(search);
  } catch (err) {
    console.error('/searches POST erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ativar/pausar busca
router.patch('/searches/:id', async (req, res) => {
  try {
    const { isActive } = req.body;
    const ref = firestore.collection('searches').doc(req.params.id);
    await ref.update({ is_active: !!isActive });
    const doc = await ref.get();
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar busca (com cascata manual)
router.delete('/searches/:id', async (req, res) => {
  try {
    const { userId } = req.query;
    const searchId   = req.params.id;

    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

    const searchDoc = await firestore.collection('searches').doc(searchId).get();
    if (!searchDoc.exists) return res.status(404).json({ error: 'Busca não encontrada' });
    if (searchDoc.data().user_id !== userId) return res.status(403).json({ error: 'Acesso negado' });

    // Deleta histórico de preços
    const histSnap = await firestore.collection('price_history').where('search_id', '==', searchId).get();
    const alertSnap = await firestore.collection('alerts_sent').where('search_id', '==', searchId).get();

    const batch = firestore.batch();
    histSnap.docs.forEach(d  => batch.delete(d.ref));
    alertSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(firestore.collection('searches').doc(searchId));
    await batch.commit();

    res.json({ success: true });
  } catch (err) {
    console.error('/searches DELETE erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Histórico de preços de uma busca
router.get('/searches/:id/history', async (req, res) => {
  try {
    const days    = parseInt(req.query.days || 30);
    const history = await getPriceHistory(req.params.id, days);
    const stats   = calculateStats(history);
    res.json({ history, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ALERTAS ENVIADOS
// ─────────────────────────────────────────────────────────────

router.get('/alerts', async (req, res) => {
  try {
    const { userId } = req.query;

    let query = firestore.collection('alerts_sent').orderBy('sent_at', 'desc').limit(50);
    if (userId) query = firestore.collection('alerts_sent').where('user_id', '==', userId).orderBy('sent_at', 'desc').limit(50);

    const snap = await query.get();

    // Enriquece com dados da busca e do preço
    const alerts = await Promise.all(snap.docs.map(async d => {
      const alert     = { id: d.id, ...d.data() };
      const searchDoc = await firestore.collection('searches').doc(alert.search_id).get();
      const priceDoc  = await firestore.collection('price_history').doc(alert.price_history_id).get();
      const search    = searchDoc.exists ? searchDoc.data() : {};
      const price     = priceDoc.exists  ? priceDoc.data()  : {};
      return {
        ...alert,
        origin:             search.origin,
        destination:        search.destination,
        destination_label:  search.destination_label,
        price:              price.price,
        airline:            price.airline,
        departure_datetime: price.departure_datetime,
      };
    }));

    res.json(alerts);
  } catch (err) {
    console.error('/alerts GET erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────

router.post('/interpret', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'input é obrigatório' });
    const result = await interpretUserInput(input);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/search-now', async (req, res) => {
  try {
    const { origin, destination, travelDate } = req.body;
    const result = await searchFlight({ origin, destination, travel_date: travelDate });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/discovery', async (req, res) => {
  try {
    const { origin = 'GRU', limit = 5 } = req.query;
    const results = await searchDiscoveryFlights(origin);
    res.json(results.slice(0, parseInt(limit)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trigger-check', async (req, res) => {
  res.json({ message: 'Verificação iniciada em background' });
  runPriceCheck().catch(console.error);
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const [usersSnap, searchesSnap, alertsSnap] = await Promise.all([
      firestore.collection('users').count().get(),
      firestore.collection('searches').where('is_active', '==', true).count().get(),
      firestore.collection('alerts_sent').count().get(),
    ]);
    res.json({
      status: 'ok',
      db: 'firestore',
      stats: {
        users:         usersSnap.data().count,
        activeSearches: searchesSnap.data().count,
        alertsSent:    alertsSnap.data().count,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
