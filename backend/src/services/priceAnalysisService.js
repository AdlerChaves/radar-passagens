// src/services/priceAnalysisService.js
const { firestore } = require('../config/firestore');
const { v4: uuidv4 } = require('uuid');

const MIN_DROP_PERCENT = parseFloat(process.env.MIN_PRICE_DROP_PERCENT || 15);
const HISTORY_DAYS     = parseInt(process.env.PRICE_HISTORY_DAYS || 30);

// ─── Histórico ────────────────────────────────────────────────

async function getPriceHistory(searchId, days = HISTORY_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snap = await firestore
    .collection('price_history')
    .where('search_id', '==', searchId)
    .where('checked_at', '>=', cutoff.toISOString())
    .orderBy('checked_at', 'desc')
    .get();

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function savePriceHistory(searchId, priceData) {
  const id  = uuidv4();
  const now = new Date().toISOString();

  await firestore.collection('price_history').doc(id).set({
    search_id:          searchId,
    price:              priceData.price,
    currency:           priceData.currency || 'BRL',
    airline:            priceData.airline  || null,
    stops:              priceData.stops    ?? 0,
    duration_minutes:   priceData.duration_minutes   || null,
    departure_datetime: priceData.departure_datetime || null,
    arrival_datetime:   priceData.arrival_datetime   || null,
    deep_link:          priceData.deep_link          || null,
    source:             priceData.source             || 'api',
    checked_at:         now,
  });

  // Atualiza last_checked_at na busca
  await firestore.collection('searches').doc(searchId).update({
    last_checked_at: now,
  });

  return id;
}

// ─── Anti-spam ────────────────────────────────────────────────

async function hasRecentAlert(searchId, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const snap = await firestore
    .collection('alerts_sent')
    .where('search_id', '==', searchId)
    .where('sent_at', '>=', cutoff)
    .limit(1)
    .get();

  return !snap.empty;
}

// ─── Estatísticas ─────────────────────────────────────────────

function calculateStats(history) {
  if (!history.length) return null;

  const prices = history.map(h => h.price);
  const avg    = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min    = Math.min(...prices);
  const max    = Math.max(...prices);

  const sorted = [...prices].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  const stdDev = Math.sqrt(
    prices.reduce((sq, p) => sq + Math.pow(p - avg, 2), 0) / prices.length
  );

  const week    = history.filter(h => new Date(h.checked_at) > new Date(Date.now() - 7 * 86400000));
  const weekAvg = week.length ? week.reduce((a, h) => a + h.price, 0) / week.length : avg;
  const trend   = weekAvg < avg ? 'falling' : weekAvg > avg ? 'rising' : 'stable';

  return { avg, min, max, median, stdDev, trend, count: prices.length };
}

// ─── Detecção de oportunidade ─────────────────────────────────

async function analyzeOpportunity(currentPrice, searchId) {
  const history = await getPriceHistory(searchId);

  if (history.length < 3) {
    return { isOpportunity: false, reason: 'insufficient_history', stats: null };
  }

  const stats              = calculateStats(history);
  const { avg, min, median } = stats;
  const opportunities      = [];

  if (currentPrice <= min) {
    opportunities.push({
      type: 'historical_low', severity: 'high',
      dropPercent: ((avg - currentPrice) / avg) * 100,
      label: 'menor preço histórico',
    });
  }

  const dropFromAvg = ((avg - currentPrice) / avg) * 100;
  if (dropFromAvg >= MIN_DROP_PERCENT && currentPrice > min) {
    opportunities.push({
      type: 'below_average',
      severity: dropFromAvg >= 30 ? 'high' : 'medium',
      dropPercent: dropFromAvg,
      label: `${Math.round(dropFromAvg)}% abaixo da média`,
    });
  }

  if (currentPrice < median * 0.9) {
    opportunities.push({
      type: 'below_median', severity: 'low',
      dropPercent: ((median - currentPrice) / median) * 100,
      label: 'abaixo da mediana histórica',
    });
  }

  if (history.length > 0) {
    const lastPrice  = history[0].price;
    const recentDrop = ((lastPrice - currentPrice) / lastPrice) * 100;
    if (recentDrop >= MIN_DROP_PERCENT) {
      opportunities.push({
        type: 'price_drop',
        severity: recentDrop >= 25 ? 'high' : 'medium',
        dropPercent: recentDrop,
        previousPrice: lastPrice,
        label: `queda de ${Math.round(recentDrop)}% desde ontem`,
      });
    }
  }

  if (opportunities.length === 0) return { isOpportunity: false, stats };

  const best = opportunities.sort((a, b) => {
    const order = { high: 3, medium: 2, low: 1 };
    return order[b.severity] - order[a.severity];
  })[0];

  return { isOpportunity: true, opportunity: best, allOpportunities: opportunities, stats };
}

module.exports = { analyzeOpportunity, savePriceHistory, getPriceHistory, calculateStats, hasRecentAlert };
