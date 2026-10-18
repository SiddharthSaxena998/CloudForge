/**
 * Short-lived cache of the current user record (role, status, limit overrides).
 * The JWT only proves who someone WAS when they logged in; a blocked user or a demoted admin
 * must lose access at once, so every request checks the database (cached for a few seconds).
 */
const User = require('../models/User');

const TTL_MS = 10 * 1000;
const cache = new Map(); // userId -> { at, user }

async function getUser(id) {
  const key = String(id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;

  const user = await User.findById(key).select('name email role status limitOverrides').lean();
  if (user) cache.set(key, { at: Date.now(), user });
  else cache.delete(key);
  return user;
}

/** Call after an admin changes a user so the change applies immediately. */
function invalidateUser(id) {
  cache.delete(String(id));
}

module.exports = { getUser, invalidateUser };
