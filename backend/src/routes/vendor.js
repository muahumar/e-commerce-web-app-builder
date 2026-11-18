const router = require('express').Router({ mergeParams: true });
const v = require('../controllers/vendorController');
const { guard } = require('../middleware/auth');

router.use(...guard.tenant('vendor'));

router.get('/ping', (req, res) => res.json({ ok: true, area: 'vendor' }));

router.use(v.requireMultiVendor);
router.get('/products', v.listProducts);
router.post('/products', v.createProduct);
router.patch('/products/:id', v.updateProduct);
router.delete('/products/:id', v.deleteProduct);
router.get('/orders', v.listOrders);

module.exports = router;
