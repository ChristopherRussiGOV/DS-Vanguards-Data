const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'ds-vanguards-secret-2025';

const ROLE_LEVELS = { membro: 1, staff: 2, moderador: 3, admin: 4 };

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '8h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function getTokenFromReq(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function requireAuth(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  return verifyToken(token);
}

function requireRole(user, minRole) {
  if (!user) return false;
  return (ROLE_LEVELS[user.role] || 0) >= (ROLE_LEVELS[minRole] || 99);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json(data);
}

module.exports = { signToken, verifyToken, requireAuth, requireRole, cors, json, ROLE_LEVELS };
