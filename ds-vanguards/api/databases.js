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

  if (req.method === 'GET') {
    try {
      const result = await query(`
        SELECT d.*, u.username as owner_name,
          (SELECT COUNT(*) FROM user_tables WHERE database_id = d.id) as table_count
        FROM databases d JOIN users u ON d.owner_id = u.id
        ORDER BY d.created_at DESC
      `);
      return json(res, 200, { databases: result.rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'POST') {
    if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissão. Requer Staff ou superior.' });
    const { name, description } = req.body || {};
    if (!name) return json(res, 400, { error: 'Nome obrigatório' });
    try {
      const exists = await query('SELECT id FROM databases WHERE name = $1', [name]);
      if (exists.rows.length > 0) return json(res, 409, { error: 'Database já existe' });
      const result = await query(
        'INSERT INTO databases (owner_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [caller.id, name, description || '']
      );
      await logAction(caller, 'Criou database', `Database: ${name}`);
      return json(res, 201, { database: result.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // PUT - edit database (name, description, owner)
  if (req.method === 'PUT') {
    if (!requireRole(caller, 'staff')) return json(res, 403, { error: 'Sem permissão.' });
    const { id, name, description, new_owner_username } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      const updates = []; const vals = []; let i = 1;
      if (name) { updates.push(`name = $${i++}`); vals.push(name); }
      if (description !== undefined) { updates.push(`description = $${i++}`); vals.push(description); }
      if (new_owner_username) {
        const ownerRes = await query('SELECT id FROM users WHERE username = $1', [new_owner_username]);
        if (!ownerRes.rows[0]) return json(res, 404, { error: `Usuário "${new_owner_username}" não encontrado` });
        updates.push(`owner_id = $${i++}`); vals.push(ownerRes.rows[0].id);
      }
      if (!updates.length) return json(res, 400, { error: 'Nada para atualizar' });
      vals.push(id);
      const result = await query(`UPDATE databases SET ${updates.join(',')} WHERE id = $${i} RETURNING *`, vals);
      await logAction(caller, 'Editou database', `ID: ${id}${name ? ' → ' + name : ''}${new_owner_username ? ', dono → ' + new_owner_username : ''}`);
      return json(res, 200, { database: result.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'DELETE') {
    if (!requireRole(caller, 'moderador')) return json(res, 403, { error: 'Sem permissão. Requer Moderador ou superior.' });
    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      const db = await query('SELECT name FROM databases WHERE id = $1', [id]);
      if (!db.rows[0]) return json(res, 404, { error: 'Database não encontrado' });
      await query('DELETE FROM table_rows WHERE table_id IN (SELECT id FROM user_tables WHERE database_id = $1)', [id]);
      await query('DELETE FROM user_tables WHERE database_id = $1', [id]);
      await query('DELETE FROM databases WHERE id = $1', [id]);
      await logAction(caller, 'Excluiu database', `Database: ${db.rows[0].name}`);
      return json(res, 200, { message: 'Database excluído' });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Método não permitido' });
};
