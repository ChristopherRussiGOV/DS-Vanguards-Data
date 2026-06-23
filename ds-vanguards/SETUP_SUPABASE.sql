-- Execute este arquivo no SQL Editor do Supabase antes de usar o painel

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW();

CREATE TABLE IF NOT EXISTS support_chats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username VARCHAR(50) NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,
  subject VARCHAR(200) DEFAULT 'Suporte',
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER REFERENCES support_chats(id) ON DELETE CASCADE,
  sender_id INTEGER,
  sender_name VARCHAR(50),
  sender_role VARCHAR(20),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
