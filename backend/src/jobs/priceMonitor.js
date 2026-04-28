// src/jobs/priceMonitor.js
const cron = require('node-cron');
const { db } = require('../config/database');
const { searchFlight } = require('../services/flightService');
const { analyzeOpportunity, savePriceHistory, hasRecentAlert } = require('../services/priceAnalysisService');
const { generateAlertMessage } = require('../services/aiService');
const { sendEmailAlert, recordAlertSent } = require('../services/notificationService');

/**
 * Job principal de monitoramento de preços
 * Roda periodicamente e verifica todas as buscas ativas
 */

let isRunning = false;

async function runPriceCheck() {
  if (isRunning) {
    console.log('⏭️  Job já está rodando, pulando...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log(`\n🔍 Iniciando verificação de preços — ${new Date().toLocaleString('pt-BR')}`);

  try {
    // Busca todas as pesquisas ativas
    const searches = db.prepare(`
      SELECT s.*, u.email, u.name as user_name, u.id as user_id
      FROM searches s
      JOIN users u ON u.id = s.user_id
      WHERE s.is_active = 1
      ORDER BY s.last_checked_at ASC NULLS FIRST
    `).all();

    console.log(`📋 ${searches.length} busca(s) ativa(s) para verificar`);

    let alertsSent = 0;
    let errorsCount = 0;

    for (const search of searches) {
      try {
        const sent = await processSearch(search);
        if (sent) alertsSent++;
      } catch (err) {
        errorsCount++;
        console.error(`❌ Erro na busca ${search.id} (${search.origin}→${search.destination}):`, err.message);
      }

      // Rate limiting: espera 1s entre cada busca
      await new Promise(r => setTimeout(r, 1000));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Verificação concluída em ${elapsed}s | Alertas enviados: ${alertsSent} | Erros: ${errorsCount}`);

  } catch (err) {
    console.error('❌ Erro crítico no job:', err);
  } finally {
    isRunning = false;
  }
}

async function processSearch(search) {
  const label = `${search.origin}→${search.destination}`;
  console.log(`  🔎 Verificando: ${label} (${search.preference})`);

  // 1. Busca preço atual
  const priceData = await searchFlight(search);
  if (!priceData) {
    console.log(`  ⚠️  Sem resultado para ${label}`);
    return false;
  }

  console.log(`  💰 Preço: R$ ${priceData.price} (${priceData.airline})`);

  // 2. Salva no histórico
  const priceHistoryId = savePriceHistory(search.id, priceData);

  // 3. Analisa oportunidade
  const analysis = analyzeOpportunity(priceData.price, search.id);

  if (!analysis.isOpportunity) {
    console.log(`  ➡️  Não é oportunidade (${analysis.reason || 'preço normal'})`);
    return false;
  }

  console.log(`  🎯 Oportunidade! Tipo: ${analysis.opportunity.type} | Severidade: ${analysis.opportunity.severity}`);

  // 4. Evita spam (max 1 alerta/24h por busca)
  if (hasRecentAlert(search.id)) {
    console.log(`  ⏰ Alerta já enviado nas últimas 24h, pulando`);
    return false;
  }

  // 5. Gera mensagem com IA
  const user = { email: search.email, name: search.user_name };
  const message = await generateAlertMessage({ search, priceData, analysis });

  // 6. Envia notificação
  const emailResult = await sendEmailAlert({ user, search, priceData, analysis, message });

  if (emailResult.success) {
    // 7. Registra o alerta
    recordAlertSent({
      searchId: search.id,
      userId: search.user_id,
      priceHistoryId,
      alertType: analysis.opportunity.type,
      triggerValue: analysis.opportunity.dropPercent,
      message,
      channel: 'email',
    });

    console.log(`  📧 Alerta enviado para ${user.email}`);
    return true;
  }

  return false;
}

/**
 * Inicializa o scheduler
 */
function startScheduler() {
  const schedule = process.env.CRON_SCHEDULE || '0 */6 * * *';

  console.log(`⏰ Scheduler iniciado: ${schedule}`);
  console.log(`   Próxima execução estimada: a cada 6 horas`);

  cron.schedule(schedule, runPriceCheck, {
    timezone: 'America/Sao_Paulo',
  });

  // Executa uma verificação inicial após 10 segundos (dev)
  if (process.env.NODE_ENV !== 'production') {
    console.log('🚀 Primeira verificação em 10s (modo dev)...');
    setTimeout(runPriceCheck, 10000);
  }
}

module.exports = { startScheduler, runPriceCheck };
