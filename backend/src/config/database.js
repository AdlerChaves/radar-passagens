// src/config/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './data/radar.db';
const dbDir = path.dirname(dbPath);

// Garante que o diretório existe
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Ativa WAL mode para performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    -- Usuários do sistema
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      whatsapp TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Buscas/alertas configurados pelo usuário
    CREATE TABLE IF NOT EXISTS searches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      origin TEXT NOT NULL,           -- código IATA (ex: GRU) ou cidade
      destination TEXT NOT NULL,       -- código IATA ou "FLEXIBLE"
      destination_label TEXT,          -- nome amigável do destino
      travel_date TEXT,               -- YYYY-MM-DD ou NULL (flexível)
      date_flexibility INTEGER DEFAULT 3, -- ± dias de flexibilidade
      preference TEXT DEFAULT 'cheapest', -- cheapest | fastest | best_value
      is_discovery_mode INTEGER DEFAULT 0, -- modo "qualquer destino barato"
      max_price REAL,                 -- preço máximo aceitável
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_checked_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Histórico de preços encontrados
    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      search_id TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT DEFAULT 'BRL',
      airline TEXT,
      stops INTEGER DEFAULT 0,
      duration_minutes INTEGER,
      departure_datetime TEXT,
      arrival_datetime TEXT,
      deep_link TEXT,                 -- link para comprar
      source TEXT DEFAULT 'api',     -- api | mock
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (search_id) REFERENCES searches(id)
    );

    -- Alertas enviados
    CREATE TABLE IF NOT EXISTS alerts_sent (
      id TEXT PRIMARY KEY,
      search_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      price_history_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,       -- price_drop | historical_low | below_average
      trigger_value REAL,             -- % de queda ou diferença
      message TEXT NOT NULL,          -- mensagem gerada pela IA
      channel TEXT DEFAULT 'email',   -- email | whatsapp
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (search_id) REFERENCES searches(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (price_history_id) REFERENCES price_history(id)
    );

    -- Índices para performance
    CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);
    CREATE INDEX IF NOT EXISTS idx_searches_active ON searches(is_active);
    CREATE INDEX IF NOT EXISTS idx_price_history_search ON price_history(search_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_checked ON price_history(checked_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_search ON alerts_sent(search_id);
  `);

  console.log('✅ Banco de dados inicializado');
}

module.exports = { db, initializeDatabase };
