// src/services/priceAnalysisService.js
const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Serviço de análise de preços
 * Detecta oportunidades com base no histórico
 */

const MIN_DROP_PERCENT = parseFloat(process.env.MIN_PRICE_DROP_PERCENT || 15);
const HISTORY_DAYS = parseInt(process.env.PRICE_HISTORY_DAYS || 30);

/**
 * Busca histórico de preços para uma busca
 */
function getPriceHistory(searchId, days = HISTORY_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return db.prepare(`
    SELECT price, checked_at, airline, stops, duration_minutes, deep_link
    FROM price_history
    WHERE search_id = ?
      AND checked_at >= ?
    ORDER BY checked_at DESC
  `).all(searchId, cutoff.toISOString());
}

/**
 * Calcula estatísticas do histórico
 */
function calculateStats(history) {
  if (!history.length) return null;

  const prices = history.map(h => h.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Mediana
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  // Desvio padrão
  const stdDev = Math.sqrt(
    prices.reduce((sq, p) => sq + Math.pow(p - avg, 2), 0) / prices.length
  );

  // Tendência (últimos 7 dias vs anteriores)
  const week = history.filter(h => {
    const d = new Date(h.checked_at);
    return d > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });
  const weekAvg = week.length
    ? week.reduce((a, h) => a + h.price, 0) / week.length
    : avg;
  const trend = weekAvg < avg ? 'falling' : weekAvg > avg ? 'rising' : 'stable';

  return { avg, min, max, median, stdDev, trend, count: prices.length };
}

/**
 * Analisa se o preço atual é uma oportunidade
 * Retorna: null | { type, severity, details }
 */
function analyzeOpportunity(currentPrice, searchId) {
  const history = getPriceHistory(searchId);

  // Sem histórico suficiente — salva e volta depois
  if (history.length < 3) {
    return {
      isOpportunity: false,
      reason: 'insufficient_history',
      stats: null,
    };
  }

  const stats = calculateStats(history);
  const { avg, min, median } = stats;

  const opportunities = [];

  // 1. Menor preço histórico
  if (currentPrice <= min) {
    opportunities.push({
      type: 'historical_low',
      severity: 'high',
      dropPercent: ((avg - currentPrice) / avg) * 100,
      label: 'menor preço histórico',
    });
  }

  // 2. Queda significativa em relação à média
  const dropFromAvg = ((avg - currentPrice) / avg) * 100;
  if (dropFromAvg >= MIN_DROP_PERCENT && currentPrice > min) {
    opportunities.push({
      type: 'below_average',
      severity: dropFromAvg >= 30 ? 'high' : 'medium',
      dropPercent: dropFromAvg,
      label: `${Math.round(dropFromAvg)}% abaixo da média`,
    });
  }

  // 3. Abaixo da mediana (mais estável que média)
  if (currentPrice < median * 0.9) {
    opportunities.push({
      type: 'below_median',
      severity: 'low',
      dropPercent: ((median - currentPrice) / median) * 100,
      label: 'abaixo da mediana histórica',
    });
  }

  // 4. Queda em relação ao preço anterior
  if (history.length > 0) {
    const lastPrice = history[0].price;
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

  if (opportunities.length === 0) {
    return { isOpportunity: false, stats };
  }

  // Prioriza a oportunidade mais significativa
  const best = opportunities.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  })[0];

  return {
    isOpportunity: true,
    opportunity: best,
    allOpportunities: opportunities,
    stats,
  };
}

/**
 * Salva preço no histórico
 */
function savePriceHistory(searchId, priceData) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO price_history (
      id, search_id, price, currency, airline, stops,
      duration_minutes, departure_datetime, arrival_datetime, deep_link, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, searchId, priceData.price, priceData.currency || 'BRL',
    priceData.airline, priceData.stops, priceData.duration_minutes,
    priceData.departure_datetime, priceData.arrival_datetime,
    priceData.deep_link, priceData.source || 'api'
  );

  // Atualiza last_checked_at da busca
  db.prepare(`
    UPDATE searches SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(searchId);

  return id;
}

/**
 * Verifica se já enviou alerta recente (evita spam)
 */
function hasRecentAlert(searchId, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM alerts_sent
    WHERE search_id = ? AND sent_at >= ?
  `).get(searchId, cutoff.toISOString());

  return result.count > 0;
}

module.exports = {
  analyzeOpportunity,
  savePriceHistory,
  getPriceHistory,
  calculateStats,
  hasRecentAlert,
};
