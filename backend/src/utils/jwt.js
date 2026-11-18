const jwt = require('jsonwebtoken');

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || (process.env.NODE_ENV === 'production' && s === 'change-me')) {
    throw new Error('JWT_SECRET is not configured');
  }
  return s;
}

/**
 * Payload: { sub: userId, role, tenantId (null for superadmin), imp?: actorId }
 * `imp` marks an impersonation token (Super Admin acting as Client Admin, FR-SA-10).
 */
function signToken(user, extra = {}, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  return jwt.sign(
    { sub: String(user._id), role: user.role, tenantId: user.tenantId ? String(user.tenantId) : null, ...extra },
    secret(),
    { expiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, secret());
}

module.exports = { signToken, verifyToken };
