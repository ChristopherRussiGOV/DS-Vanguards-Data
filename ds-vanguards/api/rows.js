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

  if (req.method === 'GET') {
    const { table_id } = req.query;
    if (!table_id) return json(res, 400, { error: 'table_id obrigatório' });
    try {
      const tableResult = await query('SELECT * FROM user_tables WHERE id = $1', [table_id]);
      if (!tableResult.rows[0]) return json(res, 404, { error: 'Tabela não encontrada' });
      const rows = await query('SELECT * FROM table_rows WHERE table_id = $1 ORDER BY id', [table_id]);
      return json(res, 200, { table: tableResult.rows[0], rows: rows.rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'POST') {
    if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissão. Requer Staff ou superior.' });
    const { table_id, data } = req.body || {};
    if (!table_id || !data) return json(res, 400, { error: 'table_id e data obrigatórios' });
    try {
      const result = await query(
        'INSERT INTO table_rows (table_id, data) VALUES ($1, $2) RETURNING *',
        [table_id, JSON.stringify(data)]
      );
      return json(res, 201, { row: result.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'PUT') {
    if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissão. Requer Staff ou superior.' });
    const { id, data } = req.body || {};
    if (!id || !data) return json(res, 400, { error: 'id e data obrigatórios' });
    try {
      const result = await query(
        'UPDATE table_rows SET data = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [JSON.stringify(data), id]
      );
      return json(res, 200, { row: result.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'DELETE') {
    if (!requireRole(caller, 'moderador')) return json(res, 403, { error: 'Sem permissão. Requer Moderador ou superior.' });
    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      await query('DELETE FROM table_rows WHERE id = $1', [id]);
      return json(res, 200, { message: 'Linha excluída' });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Método não permitido' });
};
