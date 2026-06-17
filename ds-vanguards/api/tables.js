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
    try {
      const result = await query(`
        SELECT t.*, u.username as owner_name
        FROM user_tables t JOIN users u ON t.owner_id = u.id
        ORDER BY t.created_at DESC
      `);
      return json(res, 200, { tables: result.rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'POST') {
    if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissão. Requer Staff ou superior.' });
    const { table_name, columns } = req.body || {};
    if (!table_name || !columns || !Array.isArray(columns) || columns.length === 0)
      return json(res, 400, { error: 'Nome e colunas são obrigatórios' });
    try {
      const exists = await query('SELECT id FROM user_tables WHERE table_name = $1', [table_name]);
      if (exists.rows.length > 0) return json(res, 409, { error: 'Tabela já existe' });
      const result = await query(
        'INSERT INTO user_tables (owner_id, table_name, columns) VALUES ($1, $2, $3) RETURNING *',
        [caller.id, table_name, JSON.stringify(columns)]
      );
      return json(res, 201, { table: result.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'DELETE') {
    if (!requireRole(caller, 'moderador')) return json(res, 403, { error: 'Sem permissão. Requer Moderador ou superior.' });
    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      await query('DELETE FROM user_tables WHERE id = $1', [id]);
      return json(res, 200, { message: 'Tabela excluída' });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Método não permitido' });
};
