const { query, initDB } = require('../lib/db');
const { requireAuth, requireRole, cors, json } = require('../lib/auth');
const { logAction } = require('../lib/logger');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { await initDB(); } catch (e) {
    return json(res, 500, { error: 'Erro ao conectar ao banco: ' + e.message });
  }

  const caller = requireAuth(req);
  if (!caller) return json(res, 401, { error: 'Não autorizado' });

  // GET /api/tables?database_id=X
  if (req.method === 'GET') {
    try {
      const { database_id } = req.query;
      let result;
      if (database_id) {
        result = await query(
          'SELECT t.*, u.username as owner_name FROM user_tables t JOIN users u ON t.owner_id = u.id WHERE t.database_id = $1 ORDER BY t.created_at DESC',
          [database_id]
        );
      } else {
        result = await query(
          'SELECT t.*, u.username as owner_name FROM user_tables t JOIN users u ON t.owner_id = u.id ORDER BY t.created_at DESC'
        );
      }
      return json(res, 200, { tables: result.rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // POST - create table
  if (req.method === 'POST') {
    if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissão. Requer Staff ou superior.' });
    const { table_name, columns, database_id } = req.body || {};
    if (!table_name || !columns || !Array.isArray(columns) || columns.length === 0)
      return json(res, 400, { error: 'Nome e colunas são obrigatórios' });
    if (!database_id)
      return json(res, 400, { error: 'database_id obrigatório' });
    try {
      const exists = await query('SELECT id FROM user_tables WHERE table_name = $1 AND database_id = $2', [table_name, database_id]);
      if (exists.rows.length > 0) return json(res, 409, { error: 'Tabela já existe neste database' });
      const result = await query(
        'INSERT INTO user_tables (owner_id, database_id, table_name, columns) VALUES ($1, $2, $3, $4) RETURNING *',
        [caller.id, database_id, table_name, JSON.stringify(columns)]
      );
      await logAction(caller, 'Criou tabela', `Tabela: ${table_name}`);
      return json(res, 201, { table: result.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // PUT - update table columns
  if (req.method === 'PUT') {
    if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissão. Requer Staff ou superior.' });
    const { id, columns, table_name } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      const updates = [];
      const vals = [];
      let i = 1;
      if (columns) { updates.push(`columns = $${i++}`); vals.push(JSON.stringify(columns)); }
      if (table_name) { updates.push(`table_name = $${i++}`); vals.push(table_name); }
      if (updates.length === 0) return json(res, 400, { error: 'Nada para atualizar' });
      vals.push(id);
      const result = await query(
        `UPDATE user_tables SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      await logAction(caller, 'Editou estrutura de tabela', `Tabela ID: ${id}`);
      return json(res, 200, { table: result.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!requireRole(caller, 'moderador')) return json(res, 403, { error: 'Sem permissão. Requer Moderador ou superior.' });
    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      const tbl = await query('SELECT table_name FROM user_tables WHERE id = $1', [id]);
      if (!tbl.rows[0]) return json(res, 404, { error: 'Tabela não encontrada' });
      await query('DELETE FROM user_tables WHERE id = $1', [id]);
      await logAction(caller, 'Excluiu tabela', `Tabela: ${tbl.rows[0].table_name}`);
      return json(res, 200, { message: 'Tabela excluída' });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Método não permitido' });
};
