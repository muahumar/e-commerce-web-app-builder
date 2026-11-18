const router = require('express').Router({ mergeParams: true });
const a = require('../controllers/adminController');
const { guard } = require('../middleware/auth');

// Client Admin portal: token must be a Client Admin of THIS tenant (cashiers/vendors/customers get 403).
router.use(...guard.tenant('clientadmin'));

router.get('/ping', (req, res) => res.json({ ok: true, area: 'admin' }));
router.get('/overview', a.overview);

router.post('/uploads', a.uploadMiddleware, a.uploadImage);

// Categories
router.get('/categories', a.listCategories);
router.post('/categories', a.createCategory);
router.put('/categories/reorder', a.reorderCategories);
router.patch('/categories/:id', a.updateCategory);
router.delete('/categories/:id', a.deleteCategory);

// Products
router.get('/products', a.listProducts);
router.post('/products', a.createProduct);
router.get('/products/:id', a.getProduct);
router.patch('/products/:id', a.updateProduct);
router.delete('/products/:id', a.deleteProduct);

// Orders
router.get('/orders', a.listOrders);
router.get('/orders/:id', a.getOrder);
router.patch('/orders/:id/status', a.updateOrderStatus);

// Coupons
router.get('/coupons', a.listCoupons);
router.post('/coupons', a.createCoupon);
router.patch('/coupons/:id', a.updateCoupon);
router.delete('/coupons/:id', a.deleteCoupon);

// Reviews
router.get('/reviews', a.listReviews);
router.patch('/reviews/:id', a.moderateReview);

// Store settings + feature toggles
router.get('/settings', a.getSettings);
router.patch('/settings', a.updateSettings);
router.get('/features', a.getFeatures);
router.patch('/features', a.updateFeatures);

// Staff (sub-admins, cashiers) and vendors
router.get('/staff', a.listStaff);
router.post('/staff', a.createStaff);
router.patch('/staff/:id/status', a.setStaffStatus);
router.get('/vendors', a.listVendors);
router.patch('/vendors/:id/status', a.setVendorStatus);

// Reports
router.get('/reports', a.reports);

module.exports = router;
