const { Notification } = require('../models');

/**
 * Insert an in-app notification. Never throws into a request — a failed
 * notification must not roll back the action that triggered it.
 */
async function notify(userId, { type, title, body, linkUrl, targetType, targetId, priority = 'normal' }) {
  if (!userId) return null;
  try {
    return await Notification.create({ userId, type, title, body, linkUrl, targetType, targetId, priority });
  } catch (err) {
    console.error('notify() failed:', err.message);
    return null;
  }
}

module.exports = { notify };
