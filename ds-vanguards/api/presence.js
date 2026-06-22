const { query, initDB } = require('../lib/db');
const { requireAuth, cors, json } = require('../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { await initDB(); } catch (e) {
    return json(res, 500, { error: e.message });
  }

  const caller = requireAuth(req);
  if (!caller) return json(res, 401, { error: 'Não autorizado' });

  // POST - heartbeat (update last_seen)
  if (req.method === 'POST') {
    try {
      await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [caller.id]);
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // GET - list online status for all users (online = last_seen < 2 minutes ago)
  if (req.method === 'GET') {
    try {
      const result = await query(`
        SELECT id, (last_seen > NOW() - INTERVAL '2 minutes') as online
        FROM users
      `);
      const map = {};
      result.rows.forEach(r => { map[r.id] = r.online; });
      return json(res, 200, { presence: map });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Método não permitido' });
};
