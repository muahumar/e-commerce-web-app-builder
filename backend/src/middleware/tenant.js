/**
 * Tenant-resolution middleware (STUB - Phase 1).
 *
 * Extracts a tenant slug from, in order of priority:
 *   1. `x-tenant` request header
 *   2. path segment: /api/store/:slug/...
 *   3. subdomain of the Host header: slug.PLATFORM_DOMAIN (or slug.localhost)
 *
 * It looks up the Tenant, rejects unknown (404) / non-active (403) tenants, and sets
 * `req.tenant` and `req.tenantId` before any tenant-scoped query runs.
 */
const Tenant = require('../models/Tenant');

const RESERVED = new Set(['www', 'api', 'admin']);

function slugFromHost(host = '') {
  const hostname = host.split(':')[0].toLowerCase();
  const domain = (process.env.PLATFORM_DOMAIN || 'platform.com').toLowerCase();
  let sub = null;
  if (hostname.endsWith(`.${domain}`)) sub = hostname.slice(0, -(domain.length + 1));
  else if (hostname.endsWith('.localhost')) sub = hostname.slice(0, -'.localhost'.length);
  return sub && !sub.includes('.') && !RESERVED.has(sub) ? sub : null;
}

function slugFromPath(path = '') {
  const m = path.match(/^\/api\/store\/([a-z0-9-]+)(?:\/|$)/i);
  return m ? m[1].toLowerCase() : null;
}

async function resolveTenant(req, res, next) {
  try {
    const slug =
      (req.headers['x-tenant'] && String(req.headers['x-tenant']).toLowerCase()) ||
      slugFromPath(req.originalUrl.split('?')[0]) ||
      slugFromHost(req.headers.host);

    req.tenantSlug = slug || null;
    req.tenant = null;
    req.tenantId = null;
    if (!slug) return next(); // requireTenant rejects if the route needs one

    const tenant = await Tenant.findOne({ subdomain: slug }).lean();
    if (!tenant) return res.status(404).json({ error: 'Store not found' });
    if (tenant.status !== 'active') {
      return res.status(403).json({ error: `Store is ${tenant.status.replace('_', ' ')}` });
    }
    req.tenant = tenant;
    req.tenantId = tenant._id;
    next();
  } catch (err) {
    next(err);
  }
}

/** Guard for routes that require a tenant context. */
function requireTenant(req, res, next) {
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant not specified' });
  next();
}

module.exports = { resolveTenant, requireTenant, slugFromHost, slugFromPath };
