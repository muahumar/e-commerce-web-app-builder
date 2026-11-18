const router = require('express').Router({ mergeParams: true });
const c = require('../controllers/authController');
const sf = require('../controllers/storefrontController');
const { authenticate, sameTenant, guard } = require('../middleware/auth');

// Optional auth: lets cart/checkout work for both logged-in customers and guests
const optionalCustomer = (req, res, next) => {
  if (!req.headers.authorization) return next();
  authenticate(req, res, (err) => {
    if (err) return next(err);
    sameTenant(req, res, next);
  });
};

// Public
router.get('/ping', (req, res) => res.json({ portal: 'tenant', tenantSlug: req.tenantSlug }));
router.post('/auth/register', c.register);
router.post('/auth/login', c.login);

// Storefront catalog & info (public)
router.get('/storefront', sf.getStorefront);
router.get('/products', sf.listProducts);
router.get('/products/:id', sf.getProduct);

// Cart & Checkout (logged-in customer or guest via x-guest-token)
router.get('/cart', optionalCustomer, sf.getCart);
router.post('/cart/items', optionalCustomer, sf.addToCart);
router.patch('/cart/items/:productId', optionalCustomer, sf.updateCartItem);
router.delete('/cart/items/:productId', optionalCustomer, sf.removeCartItem);
router.delete('/cart', optionalCustomer, sf.clearCart);
router.post('/coupons/validate', optionalCustomer, sf.validateCoupon);
router.post('/checkout/intent', optionalCustomer, sf.createCheckoutIntent);
router.post('/checkout/confirm', optionalCustomer, sf.confirmCheckout);

// Authenticated customer routes
router.get('/auth/me', ...guard.tenant('clientadmin', 'cashier', 'vendor', 'customer'), c.me);
router.get('/orders', ...guard.tenant('customer'), sf.listMyOrders);
router.get('/orders/:id', ...guard.tenant('customer'), sf.getMyOrder);
router.post('/products/:id/reviews', ...guard.tenant('customer'), sf.submitReview);

// Client Admin portal (Phase 5)
router.post('/auth/staff', ...guard.tenant('clientadmin'), require('../controllers/adminController').createStaff);
router.use('/admin', require('./admin'));

// Vendor portal (Phase 6 multi-vendor)
router.use('/vendor', require('./vendor'));

// Placeholders / POS
router.get('/pos/ping', ...guard.tenant('clientadmin', 'cashier'), (req, res) => res.json({ ok: true, area: 'pos' }));
router.get('/customer/ping', ...guard.tenant('customer'), (req, res) => res.json({ ok: true, area: 'customer' }));

module.exports = router;
