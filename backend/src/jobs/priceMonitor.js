// src/jobs/priceMonitor.js
const cron       = require('node-cron');
const { firestore } = require('../config/firestore');
const { searchFlight }                                          = require('../services/flightService');
const { analyzeOpportunity, savePriceHistory, hasRecentAlert } = require('../services/priceAnalysisService');
const { generateAlertMessage }                                  = require('../services/aiService');
const { sendEmailAlert, recordAlertSent }                       = require('../services/notificationService');

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
    // Busca todas as buscas ativas no Firestore
    const snap = await firestore
      .collection('searches')
      .where('is_active', '==', true)
      .orderBy('last_checked_at', 'asc')
      .get();

    // Para cada busca, busca o usuário correspondente
    const searches = await Promise.all(
      snap.docs.map(async doc => {
        const search  = { id: doc.id, ...doc.data() };
        const userDoc = await firestore.collection('users').doc(search.user_id).get();
        const user    = userDoc.exists ? userDoc.data() : {};
        return { ...search, email: user.email, user_name: user.name };
      })
    );

    console.log(`📋 ${searches.length} busca(s) ativa(s) para verificar`);

    let errorsCount = 0;

    for (const search of searches) {
      try {
        await processSearch(search);
      } catch (err) {
        errorsCount++;
        console.error(`❌ Erro na busca ${search.id} (${search.origin}→${search.destination}):`, err.message);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Verificação concluída em ${elapsed}s | Erros: ${errorsCount}`);

  } catch (err) {
    console.error('❌ Erro crítico no job:', err);
  } finally {
    isRunning = false;
  }
}

async function processSearch(search) {
  const label = `${search.origin}→${search.destination}`;
  console.log(`  🔎 Verificando: ${label} (${search.preference})`);

  const priceData = await searchFlight(search);
  if (!priceData) {
    console.log(`  ⚠️  Sem resultado para ${label}`);
    return;
  }

  console.log(`  💰 Preço: R$ ${priceData.price} (${priceData.airline})`);

  const priceHistoryId = await savePriceHistory(search.id, priceData);
  const analysis       = await analyzeOpportunity(priceData.price, search.id);

  if (!analysis.isOpportunity) {
    console.log(`  ➡️  Não é oportunidade (${analysis.reason || 'preço normal'})`);
    return;
  }

  console.log(`  🎯 Oportunidade! Tipo: ${analysis.opportunity.type} | Severidade: ${analysis.opportunity.severity}`);

  const recentAlert = await hasRecentAlert(search.id);
  if (recentAlert) {
    console.log(`  ⏰ Alerta já enviado nas últimas 24h, pulando`);
    return;
  }

  const user    = { email: search.email, name: search.user_name };
  const message = await generateAlertMessage({ search, priceData, analysis });

  const emailResult = await sendEmailAlert({ user, search, priceData, analysis, message });

  if (emailResult.success) {
    await recordAlertSent({
      searchId:      search.id,
      userId:        search.user_id,
      priceHistoryId,
      alertType:     analysis.opportunity.type,
      triggerValue:  analysis.opportunity.dropPercent,
      message,
      channel:       'email',
    });
    console.log(`  📧 Alerta enviado para ${user.email}`);
  }
}

function startScheduler() {
  const schedule = process.env.CRON_SCHEDULE || '0 */6 * * *';
  console.log(`⏰ Scheduler iniciado: ${schedule}`);

  cron.schedule(schedule, runPriceCheck, { timezone: 'America/Sao_Paulo' });

  if (process.env.NODE_ENV !== 'production') {
    console.log('🚀 Primeira verificação em 10s (modo dev)...');
    setTimeout(runPriceCheck, 10000);
  }
}

module.exports = { startScheduler, runPriceCheck };
