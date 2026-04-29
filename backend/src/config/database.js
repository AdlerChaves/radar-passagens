// src/config/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './data/radar.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // 1. Cria as tabelas (só SQL aqui dentro)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firebase_uid TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      whatsapp TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS searches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      destination_label TEXT,
      travel_date TEXT,
      date_flexibility INTEGER DEFAULT 3,
      preference TEXT DEFAULT 'cheapest',
      is_discovery_mode INTEGER DEFAULT 0,
      max_price REAL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_checked_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

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
      deep_link TEXT,
      source TEXT DEFAULT 'api',
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (search_id) REFERENCES searches(id)
    );

    CREATE TABLE IF NOT EXISTS alerts_sent (
      id TEXT PRIMARY KEY,
      search_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      price_history_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      trigger_value REAL,
      message TEXT NOT NULL,
      channel TEXT DEFAULT 'email',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (search_id) REFERENCES searches(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (price_history_id) REFERENCES price_history(id)
    );

    CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);
    CREATE INDEX IF NOT EXISTS idx_searches_active ON searches(is_active);
    CREATE INDEX IF NOT EXISTS idx_price_history_search ON price_history(search_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_checked ON price_history(checked_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_search ON alerts_sent(search_id);
  `);

  // 2. Migration segura — JavaScript fora do db.exec()
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('firebase_uid')) {
    db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)');
    console.log('✅ Migration: coluna firebase_uid adicionada');
  }

  console.log('✅ Banco de dados inicializado');
}

module.exports = { db, initializeDatabase };
