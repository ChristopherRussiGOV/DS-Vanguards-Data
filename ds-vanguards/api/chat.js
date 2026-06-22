const { query, initDB } = require('../lib/db');
const { requireAuth, requireRole, cors, json } = require('../lib/auth');
const { logAction } = require('../lib/logger');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { await initDB(); } catch (e) { return json(res, 500, { error: e.message }); }

  const { action } = req.query;

  // PUBLIC: create chat by username (no auth, for password recovery)
  if (req.method === 'POST' && action === 'create') {
    const { username, subject } = req.body || {};
    if (!username) return json(res, 400, { error: 'Username obrigatorio' });
    try {
      const uRes = await query('SELECT id FROM users WHERE username = $1', [username]);
      if (!uRes.rows[0]) return json(res, 404, { error: 'Usuario nao encontrado' });
      const userId = uRes.rows[0].id;
      const exist = await query("SELECT token FROM support_chats WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1", [userId]);
      if (exist.rows[0]) return json(res, 200, { token: exist.rows[0].token, existing: true });
      const token = crypto.randomBytes(24).toString('hex');
      await query('INSERT INTO support_chats (user_id, username, token, subject) VALUES ($1,$2,$3,$4)', [userId, username, token, subject || 'Recuperacao de senha']);
      return json(res, 201, { token });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // PUBLIC: join by token
  if (req.method === 'GET' && action === 'join') {
    const { token } = req.query;
    if (!token) return json(res, 400, { error: 'Token obrigatorio' });
    try {
      const cRes = await query('SELECT * FROM support_chats WHERE token = $1', [token]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'Token invalido' });
      const msgs = await query('SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at ASC', [cRes.rows[0].id]);
      return json(res, 200, { chat: cRes.rows[0], messages: msgs.rows });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // AUTH required below
  const caller = requireAuth(req);
  if (!caller) return json(res, 401, { error: 'Nao autorizado' });

  // GET list (admin only)
  if (req.method === 'GET' && action === 'list') {
    if (!requireRole(caller, 'admin')) return json(res, 403, { error: 'Sem permissao' });
    try {
      const r = await query("SELECT c.*, (SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) as msg_count FROM support_chats c ORDER BY c.created_at DESC");
      return json(res, 200, { chats: r.rows });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET messages by chat_id or by logged user
  if (req.method === 'GET' && action === 'messages') {
    const { chat_id, by_user } = req.query;
    try {
      let chat;
      if (by_user) {
        const r = await query("SELECT * FROM support_chats WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1", [caller.id]);
        if (!r.rows[0]) return json(res, 404, { error: 'Nenhum chat aberto' });
        chat = r.rows[0];
      } else {
        const r = await query('SELECT * FROM support_chats WHERE id = $1', [chat_id]);
        if (!r.rows[0]) return json(res, 404, { error: 'Chat nao encontrado' });
        chat = r.rows[0];
        if (!requireRole(caller, 'admin') && chat.user_id !== caller.id)
          return json(res, 403, { error: 'Sem permissao' });
      }
      const msgs = await query('SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at ASC', [chat.id]);
      return json(res, 200, { chat, messages: msgs.rows });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST create_auth - create chat as logged user
  if (req.method === 'POST' && action === 'create_auth') {
    const { subject } = req.body || {};
    try {
      const exist = await query("SELECT id FROM support_chats WHERE user_id = $1 AND status = 'open' LIMIT 1", [caller.id]);
      if (exist.rows[0]) return json(res, 200, { chat_id: exist.rows[0].id });
      const token = crypto.randomBytes(24).toString('hex');
      const r = await query('INSERT INTO support_chats (user_id, username, token, subject) VALUES ($1,$2,$3,$4) RETURNING id', [caller.id, caller.username, token, subject || 'Suporte']);
      return json(res, 201, { chat_id: r.rows[0].id });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST send message
  if (req.method === 'POST' && action === 'send') {
    const { chat_id, message } = req.body || {};
    if (!message || !chat_id) return json(res, 400, { error: 'Dados obrigatorios' });
    try {
      const cRes = await query('SELECT * FROM support_chats WHERE id = $1', [chat_id]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'Chat nao encontrado' });
      const chat = cRes.rows[0];
      if (chat.status === 'closed') return json(res, 400, { error: 'Chat encerrado' });
      if (!requireRole(caller, 'admin') && chat.user_id !== caller.id)
        return json(res, 403, { error: 'Sem permissao' });
      await query('INSERT INTO chat_messages (chat_id, sender_id, sender_name, sender_role, message) VALUES ($1,$2,$3,$4,$5)',
        [chat_id, caller.id, caller.username, caller.role, message]);
      if (requireRole(caller, 'admin'))
        await logAction(caller, 'Respondeu chat', 'Chat ID: ' + chat_id + ' para ' + chat.username);
      return json(res, 201, { ok: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST close chat
  if (req.method === 'POST' && action === 'close') {
    if (!requireRole(caller, 'admin')) return json(res, 403, { error: 'Sem permissao' });
    const { chat_id } = req.body || {};
    try {
      await query("UPDATE support_chats SET status = 'closed' WHERE id = $1", [chat_id]);
      await logAction(caller, 'Fechou chat', 'Chat ID: ' + chat_id);
      return json(res, 200, { ok: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 404, { error: 'Acao nao encontrada' });
};
