const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL não configurada. Adicione nas variáveis de ambiente do Vercel.');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

async function query(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'membro' CHECK (role IN ('membro','staff','moderador','admin')),
      created_at TIMESTAMP DEFAULT NOW(),
      last_seen TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()`);

  await query(`
    CREATE TABLE IF NOT EXISTS databases (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id),
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_tables (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id),
      database_id INTEGER REFERENCES databases(id) ON DELETE CASCADE,
      table_name VARCHAR(100) NOT NULL,
      columns JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS table_rows (
      id SERIAL PRIMARY KEY,
      table_id INTEGER REFERENCES user_tables(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(50),
      action VARCHAR(200) NOT NULL,
      details TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS support_chats (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username VARCHAR(50) NOT NULL,
      token VARCHAR(64) UNIQUE NOT NULL,
      subject VARCHAR(200) DEFAULT 'Recuperação de senha',
      status VARCHAR(20) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER REFERENCES support_chats(id) ON DELETE CASCADE,
      sender_id INTEGER,
      sender_name VARCHAR(50),
      sender_role VARCHAR(20),
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const bcrypt = require('bcryptjs');
  const existing = await query(`SELECT id FROM users WHERE username = 'admin'`);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('Admin@VGS2025', 10);
    await query(`INSERT INTO users (username, password, role) VALUES ($1, $2, $3)`, ['admin', hash, 'admin']);
  }

  dbInitialized = true;
}

module.exports = { query, initDB };
