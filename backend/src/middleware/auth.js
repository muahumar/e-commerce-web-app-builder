const User = require('../models/User');
const { verifyToken } = require('../utils/jwt');
const { slugFromHost } = require('./tenant');

/**
 * authenticate: verifies the Bearer JWT and re-loads the user from the DB (scoped by the
 * token's tenantId) so removed/rejected users and deleted accounts are cut off immediately.
 */
async function authenticate(req, res, next) {
  try {
    const m = (req.headers.authorization || '').match(/^Bearer (.+)$/i);
    if (!m) return res.status(401).json({ error: 'Authentication required' });

    let payload;
    try {
      payload = verifyToken(m[1]);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await User.findOne({ _id: payload.sub, tenantId: payload.tenantId || null });
    if (!user || user.status !== 'active' || user.role !== payload.role) {
      return res.status(401).json({ error: 'Account unavailable' });
    }
    req.user = user;
    req.impersonatedBy = payload.imp || null;
    next();
  } catch (err) {
    next(err);
  }
}

/** Tenant routes: the token's tenant MUST be the tenant resolved from the URL/host/header. */
function sameTenant(req, res, next) {
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant not specified' });
  if (!req.user.tenantId || String(req.user.tenantId) !== String(req.tenantId)) {
    return res.status(403).json({ error: 'Token not valid for this store' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role' });
    next();
  };
}

/** Super Admin portal must not be reachable from a tenant host / tenant header (FR-SA-01). */
function noTenantContext(req, res, next) {
  if (req.headers['x-tenant'] || slugFromHost(req.headers.host)) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

const guard = {
  /** Protected tenant route: valid token + same tenant + one of `roles`. */
  tenant: (...roles) => [authenticate, sameTenant, requireRole(...roles)],
  /** Protected platform route: Super Admin only, no tenant context. */
  platform: () => [noTenantContext, authenticate, requireRole('superadmin')],
};

module.exports = { authenticate, sameTenant, requireRole, noTenantContext, guard };
