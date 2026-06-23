const { query, initDB } = require('../lib/db');
const { requireAuth, requireRole, cors, json } = require('../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { await initDB(); } catch (e) { return json(res, 500, { error: e.message }); }

  const caller = requireAuth(req);
  if (!caller) return json(res, 401, { error: 'Nao autorizado' });
  if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissao. Requer Staff ou superior.' });

  // Ensure group_messages table exists
  await query(`CREATE TABLE IF NOT EXISTS group_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    sender_name VARCHAR(50) NOT NULL,
    sender_role VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(() => {});

  // GET - fetch messages (last 100)
  if (req.method === 'GET') {
    try {
      const r = await query('SELECT * FROM group_messages ORDER BY created_at DESC LIMIT 100');
      return json(res, 200, { messages: r.rows.reverse() });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST - send message
  if (req.method === 'POST') {
    const { message } = req.body || {};
    if (!message || !message.trim()) return json(res, 400, { error: 'Mensagem vazia' });
    try {
      const r = await query(
        'INSERT INTO group_messages (sender_id, sender_name, sender_role, message) VALUES ($1,$2,$3,$4) RETURNING *',
        [caller.id, caller.username, caller.role, message.trim()]
      );
      return json(res, 201, { message: r.rows[0] });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Metodo nao permitido' });
};
