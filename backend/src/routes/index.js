const router = require('express').Router();
const { resolveTenant, requireTenant } = require('../middleware/tenant');

router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Platform-level (Super Admin) routes: no tenant context. Added in Phase 4.
router.use('/superadmin', require('./superadmin'));

// Tenant-scoped routes: tenant resolved before anything else runs.
// Client Admin portal + storefront (Phases 5/6), reachable via
// /api/store/:slug/... , x-tenant header, or subdomain.
router.use('/store/:slug', resolveTenant, requireTenant, require('./tenant'));
router.use('/tenant', resolveTenant, requireTenant, require('./tenant'));

module.exports = router;
