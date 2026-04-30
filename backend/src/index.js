// src/index.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const routes  = require('./routes');
const { startScheduler } = require('./jobs/priceMonitor');

const app  = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use((req, res, next) => {
  if (req.path !== '/api/health') console.log(`${req.method} ${req.path}`);
  next();
});

// Rotas
app.use('/api', routes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno', detail: err.message });
});

async function start() {
  try {
    // Valida que as variáveis do Firebase estão presentes
    const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
    const missing  = required.filter(k => !process.env[k]);
    if (missing.length) {
      throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
    }

    // Testa a conexão com o Firestore
    const { firestore } = require('./config/firestore');
    await firestore.collection('_health').doc('ping').set({ ts: new Date().toISOString() });
    console.log('✅ Firestore conectado');

    app.listen(PORT, () => {
      console.log(`\n🚀 Radar de Passagens API em http://localhost:${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/api/health`);
      console.log(`🌐 Modo: ${process.env.USE_MOCK_API === 'true' ? 'MOCK' : 'API REAL'}`);
    });

    startScheduler();
  } catch (err) {
    console.error('❌ Falha ao iniciar:', err.message);
    process.exit(1);
  }
}

start();
