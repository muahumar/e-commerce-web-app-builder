process.env.JWT_SECRET = 'test-secret';
process.env.SUPERADMIN_BOOTSTRAP_SECRET = 'boot';
process.env.BCRYPT_ROUNDS = '4';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const M = require('../src/models');

let mongod, sa, basic, pro, theme;
const api = () => request(app);
const S = (r) => r.set('Authorization', `Bearer ${sa}`);
const PW = 'password123';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(M).map((m) => m.init()));
  const r = await api().post('/api/superadmin/auth/register').set('x-bootstrap-secret', 'boot').send({ name: 'Root', email: 'root@p.com', password: PW });
  sa = r.body.token;
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('plans & themes (FR-SA-06/08/11)', () => {
  test('create plans with feature availability', async () => {
    const b = await S(api().post('/api/superadmin/plans')).send({ name: 'Basic', maxProducts: 10, maxAdmins: 2, priceMonthly: 5, commissionPercent: 10, allowedFeatures: { reviews: true } });
    expect(b.status).toBe(201);
    basic = b.body.plan;
    const p = await S(api().post('/api/superadmin/plans')).send({ name: 'Pro', maxProducts: 100, maxAdmins: 9, priceMonthly: 25, commissionPercent: 2, allowedFeatures: { multiVendor: true, discountBadge: true, reviews: true } });
    pro = p.body.plan;
    expect((await S(api().post('/api/superadmin/plans')).send({ name: 'Basic', maxProducts: 1, maxAdmins: 1, priceMonthly: 1 })).status).toBe(409);
    expect((await S(api().post('/api/superadmin/plans')).send({ name: 'Bad', maxProducts: -1, maxAdmins: 1, priceMonthly: 1 })).status).toBe(400);
  });

  test('theme pool CRUD', async () => {
    const t = await S(api().post('/api/superadmin/themes')).send({ name: 'Classic' });
    expect(t.status).toBe(201);
    theme = t.body.theme;
    expect((await S(api().patch(`/api/superadmin/themes/${theme._id}`)).send({ description: 'x' })).body.theme.description).toBe('x');
    expect((await S(api().get('/api/superadmin/themes'))).body.items).toHaveLength(1);
  });

  test('all portal endpoints require a Super Admin token', async () => {
    for (const path of ['plans', 'themes', 'tenants', 'analytics', 'audit-logs']) {
      expect((await api().get(`/api/superadmin/${path}`)).status).toBe(401);
    }
  });
});

describe('tenants (FR-SA-02..05, 09, 10)', () => {
  let t1, adminPw;

  test('create tenant -> default Client Admin who can log in', async () => {
    const r = await S(api().post('/api/superadmin/tenants')).send({ businessName: 'Acme Shop', subdomain: 'Acme', contactEmail: 'owner@acme.com', plan: String(pro._id), theme: String(theme._id) });
    expect(r.status).toBe(201);
    t1 = r.body.tenant;
    adminPw = r.body.devOnly.tempPassword;
    expect(t1.subdomain).toBe('acme');
    expect(t1.features.reviews).toBe(true);
    expect(r.body.clientAdmin.role).toBe('clientadmin');
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash/);
    const l = await api().post('/api/store/acme/auth/login').send({ email: 'owner@acme.com', password: adminPw });
    expect(l.status).toBe(200);
    expect(l.body.user.role).toBe('clientadmin');
  });

  test('validation: duplicate/reserved subdomain, bad plan, missing fields', async () => {
    const base = { businessName: 'X', contactEmail: 'x@x.com', plan: String(basic._id) };
    expect((await S(api().post('/api/superadmin/tenants')).send({ ...base, subdomain: 'acme' })).status).toBe(409);
    expect((await S(api().post('/api/superadmin/tenants')).send({ ...base, subdomain: 'admin' })).status).toBe(400);
    expect((await S(api().post('/api/superadmin/tenants')).send({ ...base, subdomain: 'ok1', plan: 'nope' })).status).toBe(400);
    expect((await S(api().post('/api/superadmin/tenants')).send({ businessName: 'X' })).status).toBe(400);
    expect((await S(api().post('/api/superadmin/tenants')).send({ ...base, subdomain: 'bad_sub!' })).status).toBe(400);
    expect(await M.Tenant.countDocuments({ subdomain: { $in: ['ok1', 'bad_sub!'] } })).toBe(0); // nothing half-created
  });

  test('list with status / plan / date and filters', async () => {
    const b = await S(api().post('/api/superadmin/tenants')).send({ businessName: 'Beta Co', subdomain: 'betaco', contactEmail: 'o@beta.com', plan: String(basic._id) });
    expect(b.status).toBe(201);
    const all = await S(api().get('/api/superadmin/tenants'));
    expect(all.body.total).toBe(2);
    expect(all.body.items[0]).toEqual(expect.objectContaining({ status: 'active', createdAt: expect.any(String) }));
    expect(all.body.items[0].plan.name).toBeDefined();
    expect((await S(api().get('/api/superadmin/tenants?q=acme'))).body.total).toBe(1);
    expect((await S(api().get('/api/superadmin/tenants?status=suspended'))).body.total).toBe(0);
  });

  test('suspend disables storefront + admin login; reactivate restores (FR-SA-05)', async () => {
    const s = await S(api().patch(`/api/superadmin/tenants/${t1._id}/status`)).send({ status: 'suspended' });
    expect(s.body.tenant.status).toBe('suspended');
    expect((await api().post('/api/store/acme/auth/login').send({ email: 'owner@acme.com', password: adminPw })).status).toBe(403);
    expect((await api().get('/api/store/acme/ping')).status).toBe(403);
    await S(api().patch(`/api/superadmin/tenants/${t1._id}/status`)).send({ status: 'active' });
    expect((await api().get('/api/store/acme/ping')).status).toBe(200);
    expect((await S(api().patch(`/api/superadmin/tenants/${t1._id}/status`)).send({ status: 'weird' })).status).toBe(400);
  });

  test('plan change clamps features the new plan does not allow (FR-SA-11)', async () => {
    await M.Tenant.updateOne({ _id: t1._id }, { 'features.multiVendor': true, 'features.discountBadge': true });
    const r = await S(api().patch(`/api/superadmin/tenants/${t1._id}`)).send({ plan: String(basic._id) });
    expect(r.body.tenant.features).toEqual(expect.objectContaining({ multiVendor: false, discountBadge: false, reviews: true }));
  });

  test('editing a plan switches off removed features on its tenants', async () => {
    await S(api().patch(`/api/superadmin/tenants/${t1._id}`)).send({ plan: String(pro._id) });
    await M.Tenant.updateOne({ _id: t1._id }, { 'features.multiVendor': true });
    await S(api().patch(`/api/superadmin/plans/${pro._id}`)).send({ allowedFeatures: { multiVendor: false } });
    const t = await M.Tenant.findById(t1._id);
    expect(t.features.multiVendor).toBe(false);
  });

  test('plan / theme in use cannot be deleted', async () => {
    expect((await S(api().delete(`/api/superadmin/plans/${pro._id}`))).status).toBe(409);
    expect((await S(api().delete(`/api/superadmin/themes/${theme._id}`))).status).toBe(409);
  });

  test('impersonation: audited, short-lived token acts as the Client Admin only (FR-SA-10)', async () => {
    const r = await S(api().post(`/api/superadmin/tenants/${t1._id}/impersonate`)).send({ reason: 'support ticket' });
    expect(r.status).toBe(200);
    const me = await api().get('/api/store/acme/auth/me').set('Authorization', `Bearer ${r.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('clientadmin');
    expect(me.body.impersonatedBy).toBeTruthy();
    expect((await api().get('/api/store/acme/admin/ping').set('Authorization', `Bearer ${r.body.token}`)).status).toBe(200);
    expect((await api().get('/api/store/betaco/admin/ping').set('Authorization', `Bearer ${r.body.token}`)).status).toBe(403);
    expect((await api().get('/api/superadmin/ping').set('Authorization', `Bearer ${r.body.token}`)).status).toBe(403);

    const logs = await S(api().get(`/api/superadmin/audit-logs?tenantId=${t1._id}`));
    const entry = logs.body.items.find((l) => l.action === 'impersonate.start');
    expect(entry).toBeDefined();
    expect(entry.meta.reason).toBe('support ticket');
    expect(String(entry.targetUserId)).toBe(String(r.body.user.id));
  });

  test('FR-SA-09: no endpoint exposes tenant products/customers/orders to Super Admin', async () => {
    for (const p of ['products', 'users', 'customers', 'orders', 'tenants/' + t1._id + '/products']) {
      expect((await S(api().get(`/api/superadmin/${p}`))).status).toBe(404);
    }
    expect((await S(api().get('/api/store/acme/admin/ping'))).status).toBe(403);
  });

  test('delete tenant removes the tenant and its data, keeps audit trail', async () => {
    const b = await M.Tenant.findOne({ subdomain: 'betaco' });
    await M.Product.create({ tenantId: b._id, name: 'P', price: 1 });
    expect((await S(api().delete(`/api/superadmin/tenants/${b._id}`))).body.deleted).toBe(true);
    expect(await M.Tenant.findById(b._id)).toBeNull();
    expect(await M.Product.countDocuments({ tenantId: b._id })).toBe(0);
    expect(await M.User.countDocuments({ tenantId: b._id })).toBe(0);
    expect((await api().get('/api/store/betaco/ping')).status).toBe(404);
    const logs = await S(api().get(`/api/superadmin/audit-logs?tenantId=${b._id}`));
    expect(logs.body.items.map((l) => l.action)).toContain('tenant.delete');
  });
});

describe('analytics (FR-SA-07)', () => {
  test('platform totals, per-tenant usage and commission; aggregates only', async () => {
    const t = await M.Tenant.findOne({ subdomain: 'acme' }).populate('plan');
    const mk = (status, totalAmount) => M.Order.create({ tenantId: t._id, status, totalAmount, items: [{ productId: new mongoose.Types.ObjectId(), name: 'x', price: totalAmount, quantity: 1 }] });
    await mk('delivered', 100);
    await mk('pending', 50);
    await mk('cancelled', 999);
    await M.Product.create({ tenantId: t._id, name: 'P1', price: 1 });

    const r = await S(api().get('/api/superadmin/analytics'));
    expect(r.status).toBe(200);
    expect(r.body.totalTenants).toBe(1);
    expect(r.body.tenantsByStatus.active).toBe(1);
    expect(r.body.totalOrders).toBe(3);
    expect(r.body.totalRevenue).toBe(150); // cancelled excluded
    const row = r.body.perTenant[0];
    expect(row).toEqual(expect.objectContaining({ subdomain: 'acme', orders: 3, revenue: 150, products: 1 }));
    expect(row.commission).toBeCloseTo((150 * t.plan.commissionPercent) / 100, 2);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|email/);
  });
});
