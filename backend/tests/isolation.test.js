const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const M = require('../src/models');
const { resolveTenant } = require('../src/middleware/tenant');

let mongod;
let A; // tenant A
let B; // tenant B

const SCOPED = ['User', 'Category', 'Product', 'Order', 'Coupon', 'Review', 'Cart', 'AuditLog'];

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(M).map((m) => m.init()));

  const plan = await M.Plan.create({ name: 'Basic', maxProducts: 10, maxAdmins: 2, priceMonthly: 5 });
  A = await M.Tenant.create({ businessName: 'Alpha', subdomain: 'alpha', contactEmail: 'a@a.com', plan: plan._id });
  B = await M.Tenant.create({ businessName: 'Beta', subdomain: 'beta', contactEmail: 'b@b.com', plan: plan._id });

  // Seed IDENTICAL-looking data in both tenants (same emails, category names, coupon codes)
  for (const [t, n, price] of [[A, 'A', 10], [B, 'B', 100]]) {
    const tenantId = t._id;
    const cust = await M.User.create({ tenantId, role: 'customer', name: `cust-${n}`, email: 'shopper@x.com', passwordHash: 'h' });
    const cat = await M.Category.create({ tenantId, name: 'Shoes' });
    const prod = await M.Product.create({ tenantId, name: `Shoe-${n}`, price, stock: 5, categoryId: cat._id });
    await M.Product.create({ tenantId, name: `Boot-${n}`, price, stock: 5, categoryId: cat._id });
    await M.Order.create({
      tenantId,
      customerId: cust._id,
      items: [{ productId: prod._id, name: prod.name, price, quantity: 2 }],
      totalAmount: price * 2,
    });
    await M.Coupon.create({ tenantId, code: 'SAVE10', discountType: 'percent', value: 10 });
    await M.Review.create({ tenantId, productId: prod._id, customerId: cust._id, rating: 5 });
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('data isolation between tenants', () => {
  test.each(['Category', 'Product', 'Order', 'Coupon', 'Review', 'User'])('%s: find() only returns own tenant rows', async (name) => {
    const a = await M[name].find({ tenantId: A._id });
    const b = await M[name].find({ tenantId: B._id });
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    a.forEach((d) => expect(String(d.tenantId)).toBe(String(A._id)));
    b.forEach((d) => expect(String(d.tenantId)).toBe(String(B._id)));
    const ids = new Set(a.map((d) => String(d._id)));
    b.forEach((d) => expect(ids.has(String(d._id))).toBe(false));
  });

  test("tenant A cannot fetch tenant B's document by its id", async () => {
    const bProduct = await M.Product.findOne({ tenantId: B._id });
    expect(await M.Product.findOne({ _id: bProduct._id, tenantId: A._id })).toBeNull();
    expect(await M.Product.countDocuments({ _id: bProduct._id, tenantId: A._id })).toBe(0);
  });

  test("tenant A cannot update or delete tenant B's documents", async () => {
    const bProduct = await M.Product.findOne({ tenantId: B._id });
    const upd = await M.Product.updateOne({ _id: bProduct._id, tenantId: A._id }, { price: 1 });
    expect(upd.matchedCount).toBe(0);
    const del = await M.Product.deleteMany({ _id: bProduct._id, tenantId: A._id });
    expect(del.deletedCount).toBe(0);
    const still = await M.Product.findOne({ _id: bProduct._id, tenantId: B._id });
    expect(still.price).toBe(100);
  });

  test('scoped aggregate only sums own tenant revenue', async () => {
    const run = (t) =>
      M.Order.aggregate([{ $match: { tenantId: t._id } }, { $group: { _id: null, revenue: { $sum: '$totalAmount' } } }]);
    expect((await run(A))[0].revenue).toBe(20);
    expect((await run(B))[0].revenue).toBe(200);
  });

  test('same email / category name / coupon code may exist in different tenants', async () => {
    expect(await M.User.countDocuments({ tenantId: A._id, email: 'shopper@x.com' })).toBe(1);
    expect(await M.User.countDocuments({ tenantId: B._id, email: 'shopper@x.com' })).toBe(1);
  });

  test('duplicates are still rejected inside one tenant', async () => {
    await expect(
      M.Coupon.create({ tenantId: A._id, code: 'save10', discountType: 'flat', value: 1 })
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('unscoped queries are blocked (cannot leak by mistake)', () => {
  test('find() / findOne() / findById() with no tenantId throw', async () => {
    await expect(M.Product.find()).rejects.toThrow(/Unscoped find/);
    await expect(M.Product.find({ name: 'Shoe-A' })).rejects.toThrow(/Unscoped find/);
    await expect(M.Product.findOne({ name: 'Shoe-B' })).rejects.toThrow(/Unscoped findOne/);
    const p = await M.Product.findOne({ tenantId: A._id });
    await expect(M.Product.findById(p._id)).rejects.toThrow(/Unscoped findOne/);
  });

  test('operator tricks and undefined tenantId are rejected', async () => {
    await expect(M.Product.find({ tenantId: { $ne: A._id } })).rejects.toThrow(/Unscoped/);
    await expect(M.Product.find({ tenantId: { $exists: true } })).rejects.toThrow(/Unscoped/);
    await expect(M.Product.find({ tenantId: undefined })).rejects.toThrow(/Unscoped/);
    await expect(M.Product.find({ tenantId: null })).rejects.toThrow(/Unscoped/);
  });

  test('unscoped update / delete / count / aggregate throw', async () => {
    await expect(M.Order.updateMany({}, { status: 'cancelled' })).rejects.toThrow(/Unscoped/);
    await expect(M.Order.deleteMany({})).rejects.toThrow(/Unscoped/);
    await expect(M.Order.countDocuments({})).rejects.toThrow(/Unscoped/);
    await expect(M.Order.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }])).rejects.toThrow(/Unscoped aggregate/);
    expect(await M.Order.countDocuments({ tenantId: A._id })).toBe(1); // nothing was touched
  });

  test('platform code can explicitly opt out (Super Admin aggregates)', async () => {
    const all = await M.Order.find().setOptions({ skipTenantScope: true });
    expect(all).toHaveLength(2);
    const [r] = await M.Order.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]).option({ skipTenantScope: true });
    expect(r.n).toBe(2);
  });

  test('byTenant() query helper scopes a query', async () => {
    const rows = await M.Product.find().byTenant(B._id);
    expect(rows).toHaveLength(2);
  });
});

describe('schema rules', () => {
  test.each(SCOPED.filter((n) => n !== 'User'))('%s requires tenantId', async (name) => {
    const err = new M[name]({}).validateSync();
    expect(err.errors.tenantId).toBeDefined();
  });

  test('tenantId is indexed on every tenant-owned collection', () => {
    SCOPED.forEach((name) => {
      const indexed = M[name].schema.indexes().some(([f]) => 'tenantId' in f) || M[name].schema.path('tenantId').options.index;
      expect(indexed).toBeTruthy();
    });
  });

  test('Tenants and Plans have no tenantId', () => {
    expect(M.Tenant.schema.path('tenantId')).toBeUndefined();
    expect(M.Plan.schema.path('tenantId')).toBeUndefined();
  });

  test('User: non-superadmin needs tenantId; superadmin has null and is globally unique', async () => {
    expect(new M.User({ role: 'customer', name: 'x', email: 'x@x.com', passwordHash: 'h' }).validateSync().errors.tenantId).toBeDefined();
    await M.User.create({ tenantId: null, role: 'superadmin', name: 'Root', email: 'root@p.com', passwordHash: 'h' });
    await expect(
      M.User.create({ tenantId: null, role: 'superadmin', name: 'Root2', email: 'root@p.com', passwordHash: 'h' })
    ).rejects.toThrow(/duplicate key/);
    await expect(
      new M.User({ tenantId: A._id, role: 'superadmin', name: 'x', email: 'y@y.com', passwordHash: 'h' }).validate()
    ).rejects.toThrow(/Super Admin must not belong/);
    const root = await M.User.findOne({ tenantId: null, role: 'superadmin' });
    expect(root.email).toBe('root@p.com');
  });

  test('all five roles are accepted', () => {
    ['superadmin', 'clientadmin', 'cashier', 'vendor', 'customer'].forEach((role) => {
      const err = new M.User({ tenantId: A._id, role, name: 'n', email: 'e@e.com', passwordHash: 'h' }).validateSync();
      expect(err && err.errors.role).toBeUndefined();
    });
  });
});

describe('tenant-resolution middleware', () => {
  const run = async (headers, url = '/api/tenant/ping') => {
    const req = { headers, originalUrl: url };
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    let nexted = false;
    await resolveTenant(req, res, () => { nexted = true; });
    return { req, res, nexted };
  };

  test('active tenant sets req.tenantId', async () => {
    const { req, nexted } = await run({ 'x-tenant': 'alpha' });
    expect(nexted).toBe(true);
    expect(String(req.tenantId)).toBe(String(A._id));
  });

  test('path segment resolves tenant', async () => {
    const { req } = await run({}, '/api/store/beta/products');
    expect(String(req.tenantId)).toBe(String(B._id));
  });

  test('unknown tenant -> 404, suspended -> 403', async () => {
    expect((await run({ 'x-tenant': 'nope' })).res.statusCode).toBe(404);
    await M.Tenant.updateOne({ _id: B._id }, { status: 'suspended' });
    const r = await run({ 'x-tenant': 'beta' });
    expect(r.res.statusCode).toBe(403);
    expect(r.nexted).toBe(false);
    await M.Tenant.updateOne({ _id: B._id }, { status: 'active' });
  });
});
