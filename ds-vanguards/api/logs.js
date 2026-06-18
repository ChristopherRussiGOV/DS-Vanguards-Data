const { query, initDB } = require('../lib/db');
const { requireAuth, requireRole, cors, json } = require('../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { await initDB(); } catch (e) {
    return json(res, 500, { error: 'Erro ao conectar ao banco: ' + e.message });
  }

  const caller = requireAuth(req);
  if (!caller) return json(res, 401, { error: 'Não autorizado' });
  if (!requireRole(caller, 'moderador')) return json(res, 403, { error: 'Sem permissão' });

  if (req.method === 'GET') {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const result = await query(
        'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      return json(res, 200, { logs: result.rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Método não permitido' });
};
