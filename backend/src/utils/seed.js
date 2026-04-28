// src/utils/seed.js
require('dotenv').config();
const { db, initializeDatabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

initializeDatabase();

console.log('🌱 Populando banco com dados de exemplo...\n');

// Usuário demo
const userId = uuidv4();
db.prepare(`
  INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)
`).run(userId, 'João Silva', 'demo@radarpassagens.com.br');
console.log(`✅ Usuário criado: ${userId}`);

// Buscas
const searches = [
  { origin: 'GRU', destination: 'GIG', label: 'Rio de Janeiro', preference: 'cheapest' },
  { origin: 'GRU', destination: 'SSA', label: 'Salvador', preference: 'best_value' },
  { origin: 'GRU', destination: 'FLN', label: 'Florianópolis', preference: 'cheapest' },
];

for (const s of searches) {
  const searchId = uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO searches (id, user_id, origin, destination, destination_label, preference)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(searchId, userId, s.origin, s.destination, s.label, s.preference);
  console.log(`✅ Busca criada: ${s.origin}→${s.destination}`);

  // Histórico de preços simulado (últimos 30 dias)
  const basePrices = { GIG: 320, SSA: 480, FLN: 390 };
  const base = basePrices[s.destination] || 400;

  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const variance = (Math.random() - 0.5) * 0.35;
    const price = Math.round(base * (1 + variance));

    db.prepare(`
      INSERT INTO price_history (id, search_id, price, airline, stops, checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), searchId, price, ['LATAM', 'Gol', 'Azul'][Math.floor(Math.random() * 3)], Math.random() > 0.6 ? 1 : 0, date.toISOString());
  }
  console.log(`  📈 30 dias de histórico criados para ${s.destination}`);
}

console.log('\n✅ Seed concluído! Usuário demo: demo@radarpassagens.com.br');
process.exit(0);
