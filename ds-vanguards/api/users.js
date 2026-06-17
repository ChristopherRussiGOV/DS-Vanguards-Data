const bcrypt = require('bcryptjs');
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
  if (!requireRole(caller, 'admin')) return json(res, 403, { error: 'Sem permissão' });

  if (req.method === 'GET') {
    try {
      const result = await query('SELECT id, username, role, created_at FROM users ORDER BY id');
      return json(res, 200, { users: result.rows });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'PUT') {
    const { id, role, password, username } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      const target = await query('SELECT * FROM users WHERE id = $1', [id]);
      if (!target.rows[0]) return json(res, 404, { error: 'Usuário não encontrado' });
      if (target.rows[0].username === 'admin' && username && username !== 'admin')
        return json(res, 403, { error: 'Não é possível renomear o admin fixo' });

      if (role) await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
      if (password) {
        if (password.length < 6) return json(res, 400, { error: 'Senha muito curta' });
        const hash = await bcrypt.hash(password, 10);
        await query('UPDATE users SET password = $1 WHERE id = $2', [hash, id]);
      }
      if (username) {
        const ex = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]);
        if (ex.rows.length > 0) return json(res, 409, { error: 'Nome já em uso' });
        await query('UPDATE users SET username = $1 WHERE id = $2', [username, id]);
      }
      const updated = await query('SELECT id, username, role, created_at FROM users WHERE id = $1', [id]);
      return json(res, 200, { user: updated.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return json(res, 400, { error: 'ID obrigatório' });
    try {
      const target = await query('SELECT username FROM users WHERE id = $1', [id]);
      if (!target.rows[0]) return json(res, 404, { error: 'Usuário não encontrado' });
      if (target.rows[0].username === 'admin') return json(res, 403, { error: 'Não é possível excluir o admin fixo' });
      await query('DELETE FROM users WHERE id = $1', [id]);
      return json(res, 200, { message: 'Usuário excluído' });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 405, { error: 'Método não permitido' });
};
