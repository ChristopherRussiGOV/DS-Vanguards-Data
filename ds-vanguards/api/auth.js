const bcrypt = require('bcryptjs');
const { query, initDB } = require('../lib/db');
const { signToken, requireAuth, requireRole, cors, json } = require('../lib/auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  await initDB();

  const { action } = req.query;

  // POST /api/auth?action=login
  if (req.method === 'POST' && action === 'login') {
    const { username, password } = req.body;
    if (!username || !password) return json(res, 400, { error: 'Campos obrigatórios' });

    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return json(res, 401, { error: 'Usuário ou senha inválidos' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return json(res, 401, { error: 'Usuário ou senha inválidos' });

    const token = signToken(user);
    return json(res, 200, { token, user: { id: user.id, username: user.username, role: user.role } });
  }

  // POST /api/auth?action=register
  if (req.method === 'POST' && action === 'register') {
    const { username, password } = req.body;
    if (!username || !password) return json(res, 400, { error: 'Campos obrigatórios' });
    if (username.length < 3) return json(res, 400, { error: 'Usuário deve ter ao menos 3 caracteres' });
    if (password.length < 6) return json(res, 400, { error: 'Senha deve ter ao menos 6 caracteres' });

    const exists = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) return json(res, 409, { error: 'Usuário já existe' });

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hash, 'membro']
    );
    const user = result.rows[0];
    const token = signToken(user);
    return json(res, 201, { token, user });
  }

  // GET /api/auth?action=me
  if (req.method === 'GET' && action === 'me') {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error: 'Não autorizado' });
    const result = await query('SELECT id, username, role, created_at FROM users WHERE id = $1', [user.id]);
    return json(res, 200, { user: result.rows[0] });
  }

  return json(res, 404, { error: 'Rota não encontrada' });
};
