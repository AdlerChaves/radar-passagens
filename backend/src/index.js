// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');
const routes = require('./routes');
const { startScheduler } = require('./jobs/priceMonitor');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging simples
app.use((req, res, next) => {
  if (req.path !== '/api/health') {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

// Rotas
app.use('/api', routes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor', detail: err.message });
});

// Inicialização
async function start() {
  try {
    // 1. Inicializa banco
    initializeDatabase();

    // 2. Inicia servidor
    await new Promise((resolve, reject) => {
      app.listen(PORT, (err) => {
        if (err) return reject(err);
        console.log(`\n🚀 Radar de Passagens API rodando em http://localhost:${PORT}`);
        console.log(`📊 Health: http://localhost:${PORT}/api/health`);
        console.log(`🌐 Modo: ${process.env.USE_MOCK_API === 'true' ? 'MOCK (sem API real)' : 'API REAL'}`);
        resolve();
      });
    });

    // 3. Inicia scheduler
    startScheduler();

  } catch (err) {
    console.error('❌ Falha ao iniciar:', err);
    process.exit(1);
  }
}

start();
