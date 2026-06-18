const { query } = require('./db');

async function logAction(user, action, details = '') {
  try {
    await query(
      'INSERT INTO activity_logs (user_id, username, action, details) VALUES ($1, $2, $3, $4)',
      [user.id, user.username, action, details]
    );
  } catch (e) {
    console.error('Log error:', e.message);
  }
}

module.exports = { logAction };
