const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'membro' CHECK (role IN ('membro','staff','moderador','admin')),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_tables (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id),
      table_name VARCHAR(100) NOT NULL,
      columns JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS table_rows (
      id SERIAL PRIMARY KEY,
      table_id INTEGER REFERENCES user_tables(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create default admin if not exists
  const bcrypt = require('bcryptjs');
  const existing = await query(`SELECT id FROM users WHERE username = 'admin'`);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('Admin@VGS2025', 10);
    await query(
      `INSERT INTO users (username, password, role) VALUES ($1, $2, $3)`,
      ['admin', hash, 'admin']
    );
    console.log('✅ Admin padrão criado: admin / Admin@VGS2025');
  }
}

module.exports = { query, initDB };
