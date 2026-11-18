process.env.JWT_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.NODE_ENV = 'test';

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const M = require('../src/models');
const { createUser } = require('../src/controllers/authController');
const { UPLOAD_ROOT } = require('../src/utils/storage');

let mongod, A, B, plan, theme;
const PW = 'password123';
const T = {}; // tokens
const api = () => request(app);
const as = (token, r) => r.set('Authorization', `Bearer ${token}`);
const a = (method, p) => as(T.adminA, api()[method](`/api/store/alpha/admin${p}`));
const b = (method, p) => as(T.adminB, api()[method](`/api/store/beta/admin${p}`));
const login = async (slug, email) => (await api().post(`/api/store/${slug}/auth/login`).send({ email, password: PW })).body.token;
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(M).map((m) => m.init()));

  theme = await M.Theme.create({ name: 'Classic', options: { colorPalettes: [{ name: 'Ocean', primary: '#00f' }, { name: 'Forest', primary: '#0f0' }] } });
  plan = await M.Plan.create({ name: 'Basic', maxProducts: 3, maxAdmins: 2, priceMonthly: 5, allowedFeatures: { reviews: true, discountBadge: true, multiVendor: false } });
  A = await M.Tenant.create({ businessName: 'Alpha', subdomain: 'alpha', contactEmail: 'a@a.com', plan: plan._id, theme: theme._id });
  B = await M.Tenant.create({ businessName: 'Beta', subdomain: 'beta', contactEmail: 'b@b.com', plan: plan._id });
  await createUser({ tenantId: A._id, role: 'clientadmin', name: 'Admin A', email: 'admin@a.com', password: PW });
  await createUser({ tenantId: B._id, role: 'clientadmin', name: 'Admin B', email: 'admin@b.com', password: PW });
  await createUser({ tenantId: A._id, role: 'customer', name: 'Cust A', email: 'cust@a.com', password: PW });
  T.adminA = await login('alpha', 'admin@a.com');
  T.adminB = await login('beta', 'admin@b.com');
  T.custA = await login('alpha', 'cust@a.com');
});

afterAll(async () => {
  await fs.rm(path.join(UPLOAD_ROOT, String(A._id)), { recursive: true, force: true });
  await mongoose.disconnect();
  await mongod.stop();
});

describe('access control for the Client Admin portal', () => {
  const paths = ['/overview', '/categories', '/products', '/orders', '/coupons', '/reviews', '/settings', '/features', '/staff', '/vendors', '/reports'];

  test('no token -> 401; customer -> 403; other tenant admin -> 403', async () => {
    for (const p of paths) {
      expect((await api().get(`/api/store/alpha/admin${p}`)).status).toBe(401);
      expect((await as(T.custA, api().get(`/api/store/alpha/admin${p}`))).status).toBe(403);
      expect((await as(T.adminB, api().get(`/api/store/alpha/admin${p}`))).status).toBe(403);
      expect((await a('get', p)).status).toBe(200);
    }
  });
});

describe('categories (FR-CA-03)', () => {
  let ids;
  test('create, reject duplicate, reorder', async () => {
    const mk = (name) => a('post', '/categories').send({ name });
    const [c1, c2, c3] = [await mk('Shoes'), await mk('Hats'), await mk('Bags')];
    expect(c1.status).toBe(201);
    ids = [c1.body.category._id, c2.body.category._id, c3.body.category._id];
    expect((await mk('shoes')).status).toBe(201); // different case is a different name
    expect((await mk('Shoes')).status).toBe(409);
    expect((await a('post', '/categories').send({})).status).toBe(400);

    const r = await a('put', '/categories/reorder').send({ ids: [ids[2], ids[0], ids[1]] });
    expect(r.status).toBe(200);
    expect((await a('get', '/categories')).body.items.slice(0, 3).map((c) => c.name)).toEqual(['Bags', 'Shoes', 'Hats']);
  });

  test('reorder rejects foreign / malformed ids', async () => {
    const other = (await b('post', '/categories').send({ name: 'Other' })).body.category._id;
    expect((await a('put', '/categories/reorder').send({ ids: [ids[0], other] })).status).toBe(404);
    expect((await a('put', '/categories/reorder').send({ ids: ['x'] })).status).toBe(400);
    expect((await a('patch', `/categories/${other}`).send({ name: 'Hacked' })).status).toBe(404);
    expect((await a('delete', `/categories/${other}`)).status).toBe(404);
    expect((await b('get', '/categories')).body.items[0].name).toBe('Other');
  });

  test('deleting a category un-assigns its products', async () => {
    const p = await a('post', '/products').send({ name: 'Cap', price: 5, categoryId: ids[1] });
    expect(p.body.product.categoryId).toBe(ids[1]);
    expect((await a('delete', `/categories/${ids[1]}`)).status).toBe(200);
    expect((await a('get', `/products/${p.body.product._id}`)).body.product.categoryId).toBeUndefined();
    await a('delete', `/products/${p.body.product._id}`);
  });
});

describe('products (FR-CA-02)', () => {
  let p1, bProduct;
  test('CRUD with images, variants, category', async () => {
    const cat = (await a('get', '/categories')).body.items[0]._id;
    const r = await a('post', '/products').send({
      name: 'Sneaker', price: 49.5, stock: 10, images: ['/uploads/x.png'], categoryId: cat, description: 'Nice',
      variants: [{ name: 'Size', options: ['41', '42'] }],
      sellerId: String(oid()), tenantId: String(B._id), // must be ignored
    });
    expect(r.status).toBe(201);
    p1 = r.body.product;
    expect(String(p1.tenantId)).toBe(String(A._id));
    expect(p1.sellerId).toBeUndefined();
    expect(p1.variants[0].options).toEqual(['41', '42']);

    const u = await a('patch', `/products/${p1._id}`).send({ price: 59, stock: 3 });
    expect(u.body.product.price).toBe(59);
    expect((await a('get', '/products?q=sneak')).body.total).toBe(1);
  });

  test('validation', async () => {
    expect((await a('post', '/products').send({ name: 'Bad', price: -1 })).status).toBe(400);
    expect((await a('post', '/products').send({ price: 1 })).status).toBe(400);
    expect((await a('patch', `/products/${p1._id}`).send({ price: 'abc' })).status).toBe(400);
    expect((await a('post', '/products').send({ name: 'X', price: 1, categoryId: String(oid()) })).status).toBe(404);
  });

  test("category from another tenant is rejected", async () => {
    const other = (await b('get', '/categories')).body.items[0]._id;
    expect((await a('post', '/products').send({ name: 'X', price: 1, categoryId: other })).status).toBe(404);
  });

  test('plan limit (maxProducts=3) is enforced', async () => {
    expect((await a('post', '/products').send({ name: 'P2', price: 1 })).status).toBe(201);
    expect((await a('post', '/products').send({ name: 'P3', price: 1 })).status).toBe(201);
    const over = await a('post', '/products').send({ name: 'P4', price: 1 });
    expect(over.status).toBe(403);
    expect(over.body.error).toMatch(/limit/i);
  });

  test("tenants cannot see or touch each other's products", async () => {
    bProduct = (await b('post', '/products').send({ name: 'Beta Item', price: 9 })).body.product;
    expect((await a('get', '/products')).body.items.map((p) => p.name)).not.toContain('Beta Item');
    expect((await a('get', `/products/${bProduct._id}`)).status).toBe(404);
    expect((await a('patch', `/products/${bProduct._id}`).send({ price: 1 })).status).toBe(404);
    expect((await a('delete', `/products/${bProduct._id}`)).status).toBe(404);
    expect((await b('get', `/products/${bProduct._id}`)).body.product.price).toBe(9);
  });

  test('delete', async () => {
    const list = (await a('get', '/products')).body.items;
    expect((await a('delete', `/products/${list[0]._id}`)).status).toBe(200);
    expect((await a('get', '/products')).body.total).toBe(2);
    expect((await a('delete', `/products/${list[0]._id}`)).status).toBe(404);
  });

  test('image upload: stored under the tenant folder; rejects non-images', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const ok = await a('post', '/uploads').attach('image', png, { filename: 'x.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect(ok.body.path).toMatch(new RegExp(`^/uploads/${A._id}/[a-f0-9]+\\.png$`));
    expect((await api().get(ok.body.path)).status).toBe(200);
    expect((await a('post', '/uploads').attach('image', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' })).status).toBe(400);
    expect((await a('post', '/uploads')).status).toBe(400);
  });
});

describe('orders (FR-CA-04)', () => {
  let o1, bOrder;
  beforeAll(async () => {
    const cust = await M.User.findOne({ tenantId: A._id, role: 'customer' });
    const mk = (tenantId, totalAmount) => M.Order.create({ tenantId, customerId: tenantId === A._id ? cust._id : undefined, guestEmail: 'g@x.com', totalAmount, items: [{ productId: oid(), name: 'Thing', price: totalAmount, quantity: 1 }] });
    o1 = await mk(A._id, 30);
    bOrder = await mk(B._id, 70);
  });

  test('list shows own orders only, with customer + allowed transitions', async () => {
    const r = await a('get', '/orders');
    expect(r.body.total).toBe(1);
    expect(r.body.items[0].customer.name).toBe('Cust A');
    expect(r.body.items[0].allowedNext).toEqual(['processing', 'cancelled']);
    expect((await a('get', '/orders?status=bogus')).status).toBe(400);
    expect((await a('get', '/orders?status=shipped')).body.total).toBe(0);
  });

  test('status workflow and invalid transitions', async () => {
    const set = (status, id = o1._id) => a('patch', `/orders/${id}/status`).send({ status });
    expect((await set('delivered')).status).toBe(409); // cannot skip steps
    expect((await set('processing')).body.order.status).toBe('processing');
    expect((await set('shipped')).body.order.status).toBe('shipped');
    expect((await set('delivered')).body.order.status).toBe('delivered');
    expect((await set('cancelled')).status).toBe(409); // final
    expect((await set('nonsense')).status).toBe(400);
  });

  test("cannot read or change another tenant's order", async () => {
    expect((await a('get', `/orders/${bOrder._id}`)).status).toBe(404);
    expect((await a('patch', `/orders/${bOrder._id}/status`).send({ status: 'processing' })).status).toBe(404);
    expect((await M.Order.findOne({ _id: bOrder._id, tenantId: B._id })).status).toBe('pending');
  });
});

describe('coupons (FR-CA-05)', () => {
  let c1;
  test('create (code normalised), validate, duplicate, per-tenant uniqueness', async () => {
    const r = await a('post', '/coupons').send({ code: 'save10', discountType: 'percent', value: 10, usageLimit: 5, expiryDate: '2030-01-01' });
    expect(r.status).toBe(201);
    c1 = r.body.coupon;
    expect(c1.code).toBe('SAVE10');
    expect((await a('post', '/coupons').send({ code: 'SAVE10', discountType: 'flat', value: 1 })).status).toBe(409);
    expect((await b('post', '/coupons').send({ code: 'SAVE10', discountType: 'flat', value: 1 })).status).toBe(201);
    expect((await a('post', '/coupons').send({ code: 'BIG', discountType: 'percent', value: 150 })).status).toBe(400);
    expect((await a('post', '/coupons').send({ code: 'D', discountType: 'percent', value: 5, expiryDate: 'garbage' })).status).toBe(400);
    expect((await a('post', '/coupons').send({ code: 'T', discountType: 'weird', value: 5 })).status).toBe(400);
  });

  test('update, list is tenant-scoped, delete', async () => {
    expect((await a('patch', `/coupons/${c1._id}`).send({ value: 20, active: false })).body.coupon).toEqual(expect.objectContaining({ value: 20, active: false }));
    expect((await a('patch', `/coupons/${c1._id}`).send({ value: 500 })).status).toBe(400);
    const bId = (await b('get', '/coupons')).body.items[0]._id;
    expect((await a('patch', `/coupons/${bId}`).send({ value: 1 })).status).toBe(404);
    expect((await a('delete', `/coupons/${bId}`)).status).toBe(404);
    expect((await a('get', '/coupons')).body.items).toHaveLength(1);
    expect((await a('delete', `/coupons/${c1._id}`)).status).toBe(200);
  });
});

describe('reviews moderation (FR-CA-06)', () => {
  let prod, r1, r2, bReview;
  beforeAll(async () => {
    prod = await M.Product.create({ tenantId: A._id, name: 'Reviewed', price: 1 });
    const cust = await M.User.findOne({ tenantId: A._id, role: 'customer' });
    const c2 = await createUser({ tenantId: A._id, role: 'customer', name: 'C2', email: 'c2@a.com', password: PW });
    r1 = await M.Review.create({ tenantId: A._id, productId: prod._id, customerId: cust._id, rating: 5, comment: 'great' });
    r2 = await M.Review.create({ tenantId: A._id, productId: prod._id, customerId: c2._id, rating: 2, comment: 'meh' });
    const bp = await M.Product.create({ tenantId: B._id, name: 'BP', price: 1 });
    bReview = await M.Review.create({ tenantId: B._id, productId: bp._id, customerId: oid(), rating: 1 });
  });

  test('pending list, approve/hide recomputes product rating from approved reviews only', async () => {
    const list = await a('get', '/reviews?approved=false');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items[0].productName).toBe('Reviewed');
    await a('patch', `/reviews/${r1._id}`).send({ approved: true });
    let p = await M.Product.findOne({ _id: prod._id, tenantId: A._id });
    expect([p.ratingAvg, p.ratingCount]).toEqual([5, 1]);
    await a('patch', `/reviews/${r2._id}`).send({ approved: true });
    p = await M.Product.findOne({ _id: prod._id, tenantId: A._id });
    expect([p.ratingAvg, p.ratingCount]).toEqual([3.5, 2]);
    await a('patch', `/reviews/${r1._id}`).send({ approved: false }); // hide
    p = await M.Product.findOne({ _id: prod._id, tenantId: A._id });
    expect([p.ratingAvg, p.ratingCount]).toEqual([2, 1]);
    expect((await a('patch', `/reviews/${r1._id}`).send({ approved: 'yes' })).status).toBe(400);
  });

  test("cannot moderate or see another tenant's reviews", async () => {
    expect((await a('patch', `/reviews/${bReview._id}`).send({ approved: true })).status).toBe(404);
    expect((await M.Review.findOne({ _id: bReview._id, tenantId: B._id })).approved).toBe(false);
    expect((await a('get', '/reviews')).body.items.every((r) => String(r.tenantId) === String(A._id))).toBe(true);
  });
});

describe('store settings & feature toggles (FR-CA-07, FR-CA-11)', () => {
  test('update branding; palette must belong to assigned theme', async () => {
    const r = await a('patch', '/settings').send({ storeName: 'Alpha Store', logo: '/uploads/l.png', colorPalette: 'Ocean', contactPhone: '123', contactEmail: 'hi@alpha.com', contactAddress: '1 Road', evil: 'x' });
    expect(r.body.settings).toEqual(expect.objectContaining({ storeName: 'Alpha Store', colorPalette: 'Ocean', contactPhone: '123' }));
    expect(r.body.settings.evil).toBeUndefined();
    expect((await a('patch', '/settings').send({ colorPalette: 'Neon' })).status).toBe(400);
    const g = await a('get', '/settings');
    expect(g.body.theme.colorPalettes.map((p) => p.name)).toEqual(['Ocean', 'Forest']);
  });

  test('can only enable features the plan allows; can always disable', async () => {
    const mv = await a('patch', '/features').send({ features: { multiVendor: true } });
    expect(mv.status).toBe(403);
    expect((await a('patch', '/features').send({ features: { discountBadge: true } })).body.features.discountBadge).toBe(true);
    expect((await a('patch', '/features').send({ features: { discountBadge: false, reviews: false } })).body.features).toEqual(expect.objectContaining({ discountBadge: false, reviews: false }));
    expect((await a('patch', '/features').send({ features: { hacker: true } })).status).toBe(400);
    expect((await a('patch', '/features').send({ features: { reviews: 'yes' } })).status).toBe(400);
    const g = await a('get', '/features');
    expect(g.body.allowed).toEqual(expect.objectContaining({ multiVendor: false, discountBadge: true }));
    // Beta unaffected
    expect((await b('get', '/features')).body.features.discountBadge).toBe(false);
  });
});

describe('staff: sub-admins and cashiers (FR-CA-08, FR-CA-12)', () => {
  let cashier, sub;
  test('invite cashier without password: temp password emailed, cashier can log in but not use admin', async () => {
    const r = await a('post', '/staff').send({ name: 'Cash', email: 'cash@a.com', role: 'cashier' });
    expect(r.status).toBe(201);
    cashier = r.body.user;
    const login1 = await api().post('/api/store/alpha/auth/login').send({ email: 'cash@a.com', password: r.body.devOnly.tempPassword });
    expect(login1.status).toBe(200);
    T.cashA = login1.body.token;
    expect((await api().get('/api/store/alpha/pos/ping').set('Authorization', `Bearer ${T.cashA}`)).status).toBe(200);
    for (const p of ['/products', '/settings', '/orders', '/staff', '/coupons']) {
      expect((await as(T.cashA, api().get(`/api/store/alpha/admin${p}`))).status).toBe(403);
    }
    expect((await as(T.cashA, api().post('/api/store/alpha/admin/products').send({ name: 'x', price: 1 }))).status).toBe(403);
  });

  test('validation', async () => {
    expect((await a('post', '/staff').send({ name: 'x', email: 'bad', role: 'cashier' })).status).toBe(400);
    expect((await a('post', '/staff').send({ name: 'x', email: 'ok@a.com', role: 'vendor' })).status).toBe(400);
    expect((await a('post', '/staff').send({ name: 'x', email: 'cash@a.com', role: 'cashier' })).status).toBe(409);
    expect((await a('post', '/staff').send({ name: 'x', email: 'o@a.com', role: 'cashier', password: 'short' })).status).toBe(400);
  });

  test('sub-admin limited by plan maxAdmins (2)', async () => {
    const r = await a('post', '/staff').send({ name: 'Sub', email: 'sub@a.com', role: 'clientadmin', password: PW });
    expect(r.status).toBe(201);
    sub = r.body.user;
    const over = await a('post', '/staff').send({ name: 'Third', email: 'third@a.com', role: 'clientadmin', password: PW });
    expect(over.status).toBe(403);
    expect((await a('post', '/staff').send({ name: 'C2', email: 'c2cash@a.com', role: 'cashier', password: PW })).status).toBe(201); // cashiers don't count
    const o = await a('get', '/overview');
    expect(o.body.limits).toEqual(expect.objectContaining({ maxAdmins: 2, admins: 2 }));
  });

  test('staff list only shows this tenant; removal revokes access; safeguards', async () => {
    const list = (await a('get', '/staff')).body.items;
    expect(list.every((u) => String(u.tenantId) === String(A._id))).toBe(true);
    expect(list.map((u) => u.email)).not.toContain('admin@b.com');

    expect((await a('patch', `/staff/${cashier.id}/status`).send({ status: 'removed' })).body.user.status).toBe('removed');
    expect((await as(T.cashA, api().get('/api/store/alpha/pos/ping'))).status).toBe(401);
    expect((await a('patch', `/staff/${cashier.id}/status`).send({ status: 'active' })).body.user.status).toBe('active');

    const me = list.find((u) => u.email === 'admin@a.com');
    expect((await a('patch', `/staff/${me.id}/status`).send({ status: 'removed' })).status).toBe(409); // self
    // remove sub, then try to reactivate: allowed (slot free); remove original via sub token is last-admin-protected only when alone
    expect((await a('patch', `/staff/${sub.id}/status`).send({ status: 'removed' })).body.user.status).toBe('removed');
    const bAdmin = (await b('get', '/staff')).body.items[0];
    expect((await a('patch', `/staff/${bAdmin.id}/status`).send({ status: 'removed' })).status).toBe(404); // other tenant
    expect((await b('patch', `/staff/${bAdmin.id}/status`).send({ status: 'removed' })).status).toBe(409); // self / last admin
  });
});

describe('vendors (FR-CA-13)', () => {
  let v1, v2;
  test('approval requires multi-vendor mode; approve / reject / remove', async () => {
    await M.Plan.updateOne({ _id: plan._id }, { 'allowedFeatures.multiVendor': true });
    expect((await a('patch', '/features').send({ features: { multiVendor: true } })).body.features.multiVendor).toBe(true);

    v1 = (await api().post('/api/store/alpha/auth/register').send({ name: 'V1', email: 'v1@a.com', password: PW, role: 'vendor' })).body.user;
    v2 = (await api().post('/api/store/alpha/auth/register').send({ name: 'V2', email: 'v2@a.com', password: PW, role: 'vendor' })).body.user;
    const list = await a('get', '/vendors?status=pending');
    expect(list.body.items).toHaveLength(2);
    expect(list.body.multiVendorEnabled).toBe(true);

    expect((await a('patch', `/vendors/${v1.id}/status`).send({ status: 'active' })).body.vendor.status).toBe('active');
    expect((await api().post('/api/store/alpha/auth/login').send({ email: 'v1@a.com', password: PW })).status).toBe(200);
    expect((await a('patch', `/vendors/${v2.id}/status`).send({ status: 'rejected' })).body.vendor.status).toBe('rejected');
    expect((await api().post('/api/store/alpha/auth/login').send({ email: 'v2@a.com', password: PW })).status).toBe(403);
    expect((await a('patch', `/vendors/${v1.id}/status`).send({ status: 'pending' })).status).toBe(400);
  });

  test("removing a vendor cuts access immediately and unpublishes their products", async () => {
    const tok = await login('alpha', 'v1@a.com');
    const prod = await M.Product.create({ tenantId: A._id, name: 'VP', price: 1, sellerId: v1.id });
    expect((await a('get', '/vendors?status=active')).body.items[0].productCount).toBe(1);
    await a('patch', `/vendors/${v1.id}/status`).send({ status: 'removed' });
    expect((await as(tok, api().get('/api/store/alpha/vendor/ping'))).status).toBe(401);
    expect((await M.Product.findOne({ _id: prod._id, tenantId: A._id })).published).toBe(false);
  });

  test('other tenant cannot manage this tenant\'s vendors; cannot approve when feature off', async () => {
    expect((await b('patch', `/vendors/${v1.id}/status`).send({ status: 'active' })).status).toBe(404);
    await a('patch', '/features').send({ features: { multiVendor: false } });
    expect((await a('patch', `/vendors/${v2.id}/status`).send({ status: 'active' })).status).toBe(409);
  });
});

describe('sales reports (FR-CA-09)', () => {
  beforeAll(async () => {
    await M.Order.deleteMany({ tenantId: A._id });
    await M.Order.deleteMany({ tenantId: B._id });
    const pA = oid();
    const pB = oid();
    const mk = (tenantId, createdAt, status, items) =>
      M.Order.create({ tenantId, createdAt, status, items, totalAmount: items.reduce((s, i) => s + i.price * i.quantity, 0) });
    const it = (id, name, price, quantity) => ({ productId: id, name, price, quantity });
    await mk(A._id, new Date('2026-03-01T10:00:00Z'), 'delivered', [it(pA, 'Alpha Tee', 10, 3)]); // 30
    await mk(A._id, new Date('2026-03-01T15:00:00Z'), 'pending', [it(pA, 'Alpha Tee', 10, 1), it(oid(), 'Mug', 5, 2)]); // 20
    await mk(A._id, new Date('2026-03-05T10:00:00Z'), 'cancelled', [it(pA, 'Alpha Tee', 10, 100)]); // excluded
    await mk(A._id, new Date('2026-04-01T10:00:00Z'), 'shipped', [it(pA, 'Alpha Tee', 10, 1)]); // 10, outside range below
    await mk(B._id, new Date('2026-03-01T10:00:00Z'), 'delivered', [it(pB, 'Beta Thing', 999, 1)]);
  });

  test('revenue, order count, top products, daily series for a date range', async () => {
    const r = await a('get', '/reports?from=2026-03-01&to=2026-03-31');
    expect(r.status).toBe(200);
    expect(r.body.revenue).toBe(50);
    expect(r.body.orderCount).toBe(2);
    expect(r.body.averageOrderValue).toBe(25);
    expect(r.body.daily).toEqual([{ date: '2026-03-01', revenue: 50, orders: 2 }]);
    expect(r.body.topProducts[0]).toEqual(expect.objectContaining({ name: 'Alpha Tee', unitsSold: 4, revenue: 40 }));
    expect(r.body.topProducts.map((p) => p.name)).not.toContain('Beta Thing');
  });

  test('range filtering is inclusive of the "to" date and excludes outside orders', async () => {
    expect((await a('get', '/reports?from=2026-03-01&to=2026-03-01')).body.orderCount).toBe(2);
    expect((await a('get', '/reports?from=2026-03-02&to=2026-03-31')).body.orderCount).toBe(0);
    expect((await a('get', '/reports?from=2026-01-01&to=2026-12-31')).body.revenue).toBe(60);
  });

  test('other tenant sees only its own numbers; bad dates rejected', async () => {
    expect((await b('get', '/reports?from=2026-01-01&to=2026-12-31')).body.revenue).toBe(999);
    expect((await a('get', '/reports?from=nope')).status).toBe(400);
    expect((await a('get', '/reports?from=2026-05-01&to=2026-01-01')).status).toBe(400);
  });
});
