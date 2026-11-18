process.env.JWT_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const M = require('../src/models');
const { createUser } = require('../src/controllers/authController');

let mongod, A, B, catShoes, catHats, p1, p2, pHidden, pBeta;
const PW = 'password123';
const T = {};
const api = () => request(app);
const sf = (method, p, slug = 'alpha') => api()[method](`/api/store/${slug}${p}`);
const auth = (tok, r) => r.set('Authorization', `Bearer ${tok}`);
const login = async (slug, email) => (await api().post(`/api/store/${slug}/auth/login`).send({ email, password: PW })).body.token;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(M).map((m) => m.init()));

  const plan = await M.Plan.create({ name: 'Pro', maxProducts: 50, maxAdmins: 5, priceMonthly: 20, allowedFeatures: { discountBadge: true, multiVendor: true, reviews: true } });
  A = await M.Tenant.create({
    businessName: 'Alpha Store',
    subdomain: 'alpha',
    contactEmail: 'a@a.com',
    plan: plan._id,
    features: { discountBadge: true, multiVendor: true, reviews: true },
    settings: { storeName: 'Alpha Shop' },
  });
  B = await M.Tenant.create({ businessName: 'Beta Store', subdomain: 'beta', contactEmail: 'b@b.com', plan: plan._id });

  await createUser({ tenantId: A._id, role: 'clientadmin', name: 'Admin A', email: 'admin@a.com', password: PW });
  const cust1 = await createUser({ tenantId: A._id, role: 'customer', name: 'Cust 1', email: 'c1@a.com', password: PW });
  const cust2 = await createUser({ tenantId: A._id, role: 'customer', name: 'Cust 2', email: 'c2@a.com', password: PW });
  await createUser({ tenantId: A._id, role: 'vendor', name: 'Vendor One', email: 'v1@a.com', password: PW, status: 'active' });
  await createUser({ tenantId: A._id, role: 'vendor', name: 'Vendor Two', email: 'v2@a.com', password: PW, status: 'active' });
  await createUser({ tenantId: B._id, role: 'customer', name: 'Cust B', email: 'cb@b.com', password: PW });

  T.adminA = await login('alpha', 'admin@a.com');
  T.c1 = await login('alpha', 'c1@a.com');
  T.c2 = await login('alpha', 'c2@a.com');
  T.v1 = await login('alpha', 'v1@a.com');
  T.v2 = await login('alpha', 'v2@a.com');
  T.cB = await login('beta', 'cb@b.com');
  T.cust1Id = cust1._id;
  T.cust2Id = cust2._id;

  catShoes = await M.Category.create({ tenantId: A._id, name: 'Shoes', order: 0 });
  catHats = await M.Category.create({ tenantId: A._id, name: 'Hats', order: 1 });
  p1 = await M.Product.create({ tenantId: A._id, name: 'Runner Shoe', price: 100, stock: 5, categoryId: catShoes._id, description: 'Fast shoe', published: true, ratingAvg: 4.5, ratingCount: 2 });
  p2 = await M.Product.create({ tenantId: A._id, name: 'Sun Hat', price: 25, stock: 10, categoryId: catHats._id, description: 'Beach hat', published: true, ratingAvg: 3.0, ratingCount: 1 });
  pHidden = await M.Product.create({ tenantId: A._id, name: 'Draft Item', price: 10, stock: 5, published: false });
  pBeta = await M.Product.create({ tenantId: B._id, name: 'Beta Only', price: 99, stock: 5, published: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('catalog & product detail (FR-SF-02, FR-SF-03)', () => {
  test('storefront metadata returns settings, features, and ordered categories', async () => {
    const r = await sf('get', '/storefront');
    expect(r.status).toBe(200);
    expect(r.body.store.settings.storeName).toBe('Alpha Shop');
    expect(r.body.store.features.multiVendor).toBe(true);
    expect(r.body.categories.map((c) => c.name)).toEqual(['Shoes', 'Hats']);
  });

  test('catalog excludes hidden and other-tenant products, supports search/filter/sort', async () => {
    const all = await sf('get', '/products');
    expect(all.status).toBe(200);
    expect(all.body.items.map((p) => p.name)).not.toContain('Draft Item');
    expect(all.body.items.map((p) => p.name)).not.toContain('Beta Only');

    expect((await sf('get', '/products?q=runner')).body.total).toBe(1);
    expect((await sf('get', `/products?categoryId=${catHats._id}`)).body.items[0].name).toBe('Sun Hat');
    expect((await sf('get', '/products?minPrice=50&maxPrice=120')).body.total).toBe(1);
    expect((await sf('get', '/products?sort=price_asc')).body.items[0].name).toBe('Sun Hat');
    expect((await sf('get', '/products?sort=price_desc')).body.items[0].name).toBe('Runner Shoe');
    expect((await sf('get', '/products?sort=rating')).body.items[0].name).toBe('Runner Shoe');
  });

  test('product detail hides unpublished/foreign products and returns approved reviews only', async () => {
    await M.Review.create({ tenantId: A._id, productId: p1._id, customerId: T.cust1Id, rating: 5, comment: 'Great!', approved: true });
    await M.Review.create({ tenantId: A._id, productId: p1._id, customerId: T.cust2Id, rating: 1, comment: 'Spam', approved: false });

    const r = await sf('get', `/products/${p1._id}`);
    expect(r.status).toBe(200);
    expect(r.body.reviews).toHaveLength(1);
    expect(r.body.reviews[0].comment).toBe('Great!');

    expect((await sf('get', `/products/${pHidden._id}`)).status).toBe(404);
    expect((await sf('get', `/products/${pBeta._id}`)).status).toBe(404);
  });
});

describe('persistent cart (FR-SF-04)', () => {
  const guest = 'guest-abc-123';

  test('guest cart: add, update, remove, stock validation', async () => {
    expect((await sf('get', '/cart')).status).toBe(400);

    const add = await sf('post', '/cart/items').set('x-guest-token', guest).send({ productId: p1._id, quantity: 2 });
    expect(add.status).toBe(200);
    expect(add.body.items[0].quantity).toBe(2);
    expect(add.body.subtotal).toBe(200);

    expect((await sf('post', '/cart/items').set('x-guest-token', guest).send({ productId: p1._id, quantity: 99 })).status).toBe(409);

    const upd = await sf('patch', `/cart/items/${p1._id}`).set('x-guest-token', guest).send({ quantity: 3 });
    expect(upd.body.subtotal).toBe(300);

    const rem = await sf('delete', `/cart/items/${p1._id}`).set('x-guest-token', guest);
    expect(rem.body.items).toHaveLength(0);
    expect(rem.body.subtotal).toBe(0);
  });

  test('customer cart is persisted per tenant', async () => {
    const r = await auth(T.c1, sf('post', '/cart/items')).send({ productId: p2._id, quantity: 2 });
    expect(r.status).toBe(200);
    expect(r.body.subtotal).toBe(50);

    const fetched = await auth(T.c1, sf('get', '/cart'));
    expect(fetched.body.items[0].name).toBe('Sun Hat');
    expect((await auth(T.c1, sf('delete', '/cart'))).body.items).toHaveLength(0);
  });
});

describe('coupons, checkout, order history & reviews (FR-SF-05..09)', () => {
  let couponSave10;
  beforeAll(async () => {
    couponSave10 = await M.Coupon.create({ tenantId: A._id, code: 'SAVE10', discountType: 'percent', value: 10, usageLimit: 2 });
    await M.Coupon.create({ tenantId: A._id, code: 'EXPIRED', discountType: 'flat', value: 5, expiryDate: new Date('2020-01-01') });
    await M.Coupon.create({ tenantId: B._id, code: 'BETAONLY', discountType: 'flat', value: 5 });
  });

  test('coupon validation', async () => {
    const ok = await sf('post', '/coupons/validate').send({ code: 'save10', subtotal: 100 });
    expect(ok.status).toBe(200);
    expect(ok.body.discountAmount).toBe(10);
    expect(ok.body.totalAmount).toBe(90);

    expect((await sf('post', '/coupons/validate').send({ code: 'EXPIRED', subtotal: 100 })).status).toBe(400);
    expect((await sf('post', '/coupons/validate').send({ code: 'BETAONLY', subtotal: 100 })).status).toBe(400);
  });

  test('customer checkout: intent -> confirm, decrements stock, increments coupon, clears cart', async () => {
    await auth(T.c1, sf('post', '/cart/items')).send({ productId: p1._id, quantity: 2 });
    const intent = await auth(T.c1, sf('post', '/checkout/intent')).send({ couponCode: 'SAVE10' });
    expect(intent.status).toBe(200);
    expect(intent.body.subtotal).toBe(200);
    expect(intent.body.discountAmount).toBe(20);
    expect(intent.body.totalAmount).toBe(180);

    const order = await auth(T.c1, sf('post', '/checkout/confirm')).send({
      paymentIntentId: intent.body.paymentIntentId,
      couponCode: 'SAVE10',
      shippingAddress: { name: 'Cust 1', line1: '1 Main St', city: 'NYC', postalCode: '10001' },
    });
    expect(order.status).toBe(201);
    expect(order.body.order.totalAmount).toBe(180);
    expect(order.body.order.couponCode).toBe('SAVE10');

    expect((await M.Product.findOne({ _id: p1._id, tenantId: A._id })).stock).toBe(3);
    expect((await M.Coupon.findOne({ _id: couponSave10._id, tenantId: A._id })).usedCount).toBe(1);
    expect((await auth(T.c1, sf('get', '/cart'))).body.items).toHaveLength(0);

    // Order history (FR-SF-08)
    const hist = await auth(T.c1, sf('get', '/orders'));
    expect(hist.status).toBe(200);
    expect(hist.body.items).toHaveLength(1);
    expect((await auth(T.c2, sf('get', '/orders'))).body.items).toHaveLength(0);
    expect((await auth(T.c2, sf('get', `/orders/${order.body.order._id}`))).status).toBe(404);
  });

  test('guest checkout works without login', async () => {
    const guest = 'guest-checkout-1';
    await sf('post', '/cart/items').set('x-guest-token', guest).send({ productId: p2._id, quantity: 1 });
    const intent = await sf('post', '/checkout/intent').set('x-guest-token', guest).send({});
    expect(intent.status).toBe(200);
    const conf = await sf('post', '/checkout/confirm').set('x-guest-token', guest).send({
      paymentIntentId: intent.body.paymentIntentId,
      guestEmail: 'guest@example.com',
      shippingAddress: { name: 'Guest', line1: '2 Oak Ave', city: 'LA' },
    });
    expect(conf.status).toBe(201);
    expect(conf.body.order.guestEmail).toBe('guest@example.com');
  });

  test('FR-SF-09: only purchasers can submit reviews; respects features.reviews toggle', async () => {
    // c2 never bought p2 -> 403
    expect((await auth(T.c2, sf('post', `/products/${p2._id}/reviews`)).send({ rating: 5, comment: 'Nice' })).status).toBe(403);
    // c1 bought p1 -> allowed (starts unapproved)
    const ok = await auth(T.c1, sf('post', `/products/${p2._id}/reviews`)).send({ rating: 5 });
    expect(ok.status).toBe(403); // c1 bought p1, not p2!
    const bought = await auth(T.c2, sf('post', `/products/${p1._id}/reviews`)).send({ rating: 4, comment: 'Good' });
    expect(bought.status).toBe(403);

    // Give c2 a purchase of p2, verify review succeeds with approved=false
    await auth(T.c2, sf('post', '/cart/items')).send({ productId: p2._id, quantity: 1 });
    const i = await auth(T.c2, sf('post', '/checkout/intent')).send({});
    await auth(T.c2, sf('post', '/checkout/confirm')).send({ paymentIntentId: i.body.paymentIntentId, shippingAddress: { name: 'C2', line1: 'x', city: 'y' } });

    const rev = await auth(T.c2, sf('post', `/products/${p2._id}/reviews`)).send({ rating: 4, comment: 'Solid hat' });
    expect(rev.status).toBe(201);
    expect(rev.body.review.approved).toBe(false);

    // Disable reviews feature toggle -> blocked
    await M.Tenant.updateOne({ _id: A._id }, { 'features.reviews': false });
    expect((await auth(T.c2, sf('post', `/products/${p2._id}/reviews`)).send({ rating: 5 })).status).toBe(403);
    await M.Tenant.updateOne({ _id: A._id }, { 'features.reviews': true });
  });
});

describe('multi-vendor listing & split orders (FR-SF-10)', () => {
  let vp1, vp2;
  test('vendors manage only their own products; storefront shows sellerName', async () => {
    vp1 = (await auth(T.v1, sf('post', '/vendor/products')).send({ name: 'V1 Lamp', price: 40, stock: 5 })).body.product;
    vp2 = (await auth(T.v2, sf('post', '/vendor/products')).send({ name: 'V2 Chair', price: 80, stock: 5 })).body.product;
    expect(vp1.name).toBe('V1 Lamp');

    // v1 cannot see or edit v2's product
    expect((await auth(T.v1, sf('get', '/vendor/products'))).body.items).toHaveLength(1);
    expect((await auth(T.v1, sf('patch', `/vendor/products/${vp2._id}`)).send({ price: 1 })).status).toBe(404);
    expect((await auth(T.v1, sf('delete', `/vendor/products/${vp2._id}`))).status).toBe(404);

    // Storefront product detail shows sellerName
    const det = await sf('get', `/products/${vp1._id}`);
    expect(det.status).toBe(200);
    expect(det.body.product.sellerName).toBe('Vendor One');
  });

  test('checkout with items from two vendors splits orders per seller', async () => {
    const guest = 'guest-mv-1';
    await sf('post', '/cart/items').set('x-guest-token', guest).send({ productId: vp1._id, quantity: 2 }); // 80
    await sf('post', '/cart/items').set('x-guest-token', guest).send({ productId: vp2._id, quantity: 1 }); // 80
    const i = await sf('post', '/checkout/intent').set('x-guest-token', guest).send({});
    await sf('post', '/checkout/confirm').set('x-guest-token', guest).send({
      paymentIntentId: i.body.paymentIntentId,
      guestEmail: 'mv@x.com',
      shippingAddress: { name: 'MV', line1: '99 Rd', city: 'SF' },
    });

    const o1 = await auth(T.v1, sf('get', '/vendor/orders'));
    expect(o1.status).toBe(200);
    expect(o1.body.items).toHaveLength(1);
    expect(o1.body.items[0].items.map((x) => x.name)).toEqual(['V1 Lamp']);
    expect(o1.body.items[0].vendorSubtotal).toBe(80);

    const o2 = await auth(T.v2, sf('get', '/vendor/orders'));
    expect(o2.body.items[0].items.map((x) => x.name)).toEqual(['V2 Chair']);
    expect(o2.body.items[0].vendorSubtotal).toBe(80);
  });
});
