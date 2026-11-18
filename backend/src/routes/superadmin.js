const router = require('express').Router();
const c = require('../controllers/authController');
const sa = require('../controllers/superadminController');
const { authenticate, guard, noTenantContext } = require('../middleware/auth');

router.use(noTenantContext); // platform portal: unreachable from any tenant host/header (FR-SA-01)

/* --- auth (public; register is bootstrap-secret or Super Admin only) --- */
router.post('/auth/login', c.superadminLogin);
router.post(
  '/auth/register',
  (req, res, next) => (req.headers.authorization ? authenticate(req, res, next) : next()),
  c.superadminRegister
);

/* --- everything below requires a Super Admin token --- */
router.use(...guard.platform());

router.get('/auth/me', c.me);
router.get('/ping', (req, res) => res.json({ portal: 'superadmin' }));

// Tenants (FR-SA-02..05, 10)
router.get('/tenants', sa.listTenants);
router.post('/tenants', sa.createTenant);
router.get('/tenants/:id', sa.getTenant);
router.patch('/tenants/:id', sa.updateTenant);
router.patch('/tenants/:id/status', sa.setTenantStatus);
router.delete('/tenants/:id', sa.deleteTenant);
router.post('/tenants/:id/impersonate', sa.impersonate);

// Plans + feature availability (FR-SA-06, 11)
router.get('/plans', sa.listPlans);
router.post('/plans', sa.createPlan);
router.patch('/plans/:id', sa.updatePlan);
router.delete('/plans/:id', sa.deletePlan);

// Themes (FR-SA-08)
router.get('/themes', sa.listThemes);
router.post('/themes', sa.createTheme);
router.patch('/themes/:id', sa.updateTheme);
router.delete('/themes/:id', sa.deleteTheme);

// Analytics (FR-SA-07) and audit trail
router.get('/analytics', sa.analytics);
router.get('/audit-logs', sa.listAuditLogs);

module.exports = router;
