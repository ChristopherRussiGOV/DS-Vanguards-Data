const { query, initDB } = require('../lib/db');
const { requireAuth, requireRole, cors, json } = require('../lib/auth');
const { logAction } = require('../lib/logger');

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS group_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    sender_name VARCHAR(50) NOT NULL,
    sender_role VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    reply_to_id INTEGER,
    reply_to_name VARCHAR(50),
    reply_to_text TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(() => {});
  // Add reply columns if missing (existing installs)
  await query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER`).catch(() => {});
  await query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_name VARCHAR(50)`).catch(() => {});
  await query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_text TEXT`).catch(() => {});
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { await initDB(); } catch (e) { return json(res, 500, { error: e.message }); }

  const caller = requireAuth(req);
  if (!caller) return json(res, 401, { error: 'Nao autorizado' });
  if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissao. Requer Staff ou superior.' });

  await ensureTable();

  // GET - fetch messages
  if (req.method === 'GET') {
    try {
      const r = await query('SELECT * FROM group_messages ORDER BY created_at DESC LIMIT 100');
      return json(res, 200, { messages: r.rows.reverse() });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST - send message or clear
  if (req.method === 'POST') {
    const { message, reply_to_id, reply_to_name, reply_to_text, clear } = req.body || {};

    // CLEAR command - only moderador+
    if (clear) {
      if (!requireRole(caller, 'moderador')) return json(res, 403, { error: 'Sem permissao. /clear requer Moderador+.' });
      try {
        let deleted = 0;
        if (clear === 'all') {
          const r = await query('DELETE FROM group_messages RETURNING id');
          deleted = r.rowCount;
          await logAction(caller, 'Limpou chat Chat-VGS', 'Todas as mensagens');
        } else if (/^\d+$/.test(clear)) {
          // Last N messages
          const n = Math.min(parseInt(clear), 1000);
          const ids = await query('SELECT id FROM group_messages ORDER BY created_at DESC LIMIT $1', [n]);
          if (ids.rows.length > 0) {
            const idList = ids.rows.map(r => r.id);
            const r = await query('DELETE FROM group_messages WHERE id = ANY($1)', [idList]);
            deleted = r.rowCount;
          }
          await logAction(caller, 'Limpou chat Chat-VGS', 'Ultimas ' + n + ' mensagens');
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(clear)) {
          // Specific date DD/MM/YYYY
          const parts = clear.split('/');
          const dateStr = parts[2] + '-' + parts[1] + '-' + parts[0];
          const r = await query(
            "DELETE FROM group_messages WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = $1 RETURNING id",
            [dateStr]
          );
          deleted = r.rowCount;
          await logAction(caller, 'Limpou chat Chat-VGS', 'Data: ' + clear);
        } else {
          return json(res, 400, { error: 'Formato invalido. Use: all, N, ou DD/MM/AAAA' });
        }
        return json(res, 200, { ok: true, deleted });
      } catch(e) { return json(res, 500, { error: e.message }); }
    }

    // Normal message
    if (!message || !message.trim()) return json(res, 400, { error: 'Mensagem vazia' });
    try {
      const r = await query(
        'INSERT INTO group_messages (sender_id, sender_name, sender_role, message, reply_to_id, reply_to_name, reply_to_text) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [caller.id, caller.username, caller.role, message.trim(),
         reply_to_id || null, reply_to_name || null, reply_to_text || null]
      );
      return json(res, 201, { message: r.rows[0] });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Metodo nao permitido' });
};
