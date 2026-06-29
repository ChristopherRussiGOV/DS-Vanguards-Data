const { query, initDB } = require('../lib/db');
const { requireAuth, requireRole, cors, json } = require('../lib/auth');
const { logAction } = require('../lib/logger');
const crypto = require('crypto');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { await initDB(); } catch (e) { return json(res, 500, { error: e.message }); }

  const { action } = req.query;

  // PUBLIC: create chat by username (no auth needed)
  if (req.method === 'POST' && action === 'create') {
    const { username, subject } = req.body || {};
    if (!subject) return json(res, 400, { error: 'Motivo obrigatorio' });
    try {
      let userId = null;
      let displayName = username || 'Anonimo';
      if (username) {
        const uRes = await query('SELECT id FROM users WHERE username = $1', [username]);
        if (uRes.rows[0]) userId = uRes.rows[0].id;
      }
      const token = crypto.randomBytes(24).toString('hex');
      const r = await query(
        'INSERT INTO support_chats (user_id, username, token, subject) VALUES ($1,$2,$3,$4) RETURNING *',
        [userId, displayName, token, subject]
      );
      return json(res, 201, { token: token, chat: r.rows[0] });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // PUBLIC: get chat by token
  if (req.method === 'GET' && action === 'join') {
    const { token } = req.query;
    if (!token) return json(res, 400, { error: 'Token obrigatorio' });
    try {
      const cRes = await query('SELECT * FROM support_chats WHERE token = $1', [token]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'Token invalido ou chat nao encontrado' });
      const msgs = await query('SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at ASC', [cRes.rows[0].id]);
      return json(res, 200, { chat: cRes.rows[0], messages: msgs.rows });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // PUBLIC: poll messages by token (for guest chat refresh)
  if (req.method === 'GET' && action === 'poll') {
    const { token } = req.query;
    if (!token) return json(res, 400, { error: 'Token obrigatorio' });
    try {
      const cRes = await query('SELECT * FROM support_chats WHERE token = $1', [token]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'Chat nao encontrado' });
      const msgs = await query('SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at ASC', [cRes.rows[0].id]);
      return json(res, 200, { chat: cRes.rows[0], messages: msgs.rows });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // PUBLIC: send message by token (guest)
  if (req.method === 'POST' && action === 'send_guest') {
    const { token, message } = req.body || {};
    if (!token || !message) return json(res, 400, { error: 'Dados obrigatorios' });
    try {
      const cRes = await query('SELECT * FROM support_chats WHERE token = $1', [token]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'Chat nao encontrado' });
      if (cRes.rows[0].status === 'closed') return json(res, 400, { error: 'Chat encerrado' });
      await query(
        'INSERT INTO chat_messages (chat_id, sender_id, sender_name, sender_role, message) VALUES ($1,$2,$3,$4,$5)',
        [cRes.rows[0].id, null, 'Sem_login', 'guest', message]
      );
      return json(res, 201, { ok: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // AUTH required below
  const caller = requireAuth(req);
  if (!caller) return json(res, 401, { error: 'Nao autorizado' });
  // role checked per action below

  // GET list
  if (req.method === 'GET' && action === 'list') {
    try {
      const r = await query("SELECT c.*, (SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) as msg_count FROM support_chats c ORDER BY c.created_at DESC");
      return json(res, 200, { chats: r.rows });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET messages by chat_id
  if (req.method === 'GET' && action === 'messages') {
    const { chat_id } = req.query;
    if (!chat_id) return json(res, 400, { error: 'chat_id obrigatorio' });
    try {
      const cRes = await query('SELECT * FROM support_chats WHERE id = $1', [chat_id]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'Chat nao encontrado' });
      const msgs = await query('SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY created_at ASC', [chat_id]);
      return json(res, 200, { chat: cRes.rows[0], messages: msgs.rows });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST send message (moderador+ by chat_id)
  if (req.method === 'POST' && action === 'send') {
    const { chat_id, message } = req.body || {};
    if (!message || !chat_id) return json(res, 400, { error: 'Dados obrigatorios' });
    try {
      const cRes = await query('SELECT * FROM support_chats WHERE id = $1', [chat_id]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'Chat nao encontrado' });
      if (cRes.rows[0].status === 'closed') return json(res, 400, { error: 'Chat encerrado' });
      await query(
        'INSERT INTO chat_messages (chat_id, sender_id, sender_name, sender_role, message) VALUES ($1,$2,$3,$4,$5)',
        [chat_id, caller.id, caller.username, caller.role, message]
      );
      await logAction(caller, 'Respondeu chat', 'Chat ID: ' + chat_id + ' para ' + cRes.rows[0].username);
      return json(res, 201, { ok: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST close
  if (req.method === 'POST' && action === 'close') {
    const { chat_id } = req.body || {};
    try {
      await query("UPDATE support_chats SET status = 'closed' WHERE id = $1", [chat_id]);
      await logAction(caller, 'Fechou chat', 'Chat ID: ' + chat_id);
      return json(res, 200, { ok: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // DELETE chat (admin only)
  if (req.method === 'DELETE') {
    if (!requireRole(caller, 'admin')) return json(res, 403, { error: 'Sem permissao. Requer Admin.' });
    const { chat_id } = req.body || {};
    try {
      await query('DELETE FROM chat_messages WHERE chat_id = $1', [chat_id]);
      await query('DELETE FROM support_chats WHERE id = $1', [chat_id]);
      await logAction(caller, 'Deletou chat', 'Chat ID: ' + chat_id);
      return json(res, 200, { ok: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST delete chat (admin only)
  if (req.method === 'POST' && action === 'delete') {
    if (!requireRole(caller, 'admin')) return json(res, 403, { error: 'Sem permissao' });
    const { chat_id } = req.body || {};
    if (!chat_id) return json(res, 400, { error: 'chat_id obrigatorio' });
    try {
      await query('DELETE FROM chat_messages WHERE chat_id = $1', [chat_id]);
      await query('DELETE FROM support_chats WHERE id = $1', [chat_id]);
      await logAction(caller, 'Excluiu chat', 'Chat ID: ' + chat_id);
      return json(res, 200, { ok: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  return json(res, 404, { error: 'Acao nao encontrada' });
};
