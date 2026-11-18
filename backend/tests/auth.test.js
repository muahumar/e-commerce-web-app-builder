process.env.JWT_SECRET = 'test-secret';
process.env.SUPERADMIN_BOOTSTRAP_SECRET = 'boot';
process.env.BCRYPT_ROUNDS = '4';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const M = require('../src/models');
const { createUser } = require('../src/controllers/authController');

let mongod, A, B;
const PW = 'password123';
const api = () => request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (slug, email, password = PW) =>
  api().post(`/api/store/${slug}/auth/login`).send({ email, password });

let tok = {}; // tokens by label

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(M).map((m) => m.init()));

  const plan = await M.Plan.create({ name: 'Pro', maxProducts: 100, maxAdmins: 5, priceMonthly: 20 });
  A = await M.Tenant.create({ businessName: 'Alpha', subdomain: 'alpha', contactEmail: 'a@a.com', plan: plan._id, features: { multiVendor: true } });
  B = await M.Tenant.create({ businessName: 'Beta', subdomain: 'beta', contactEmail: 'b@b.com', plan: plan._id });
  await createUser({ tenantId: A._id, role: 'clientadmin', name: 'Admin A', email: 'admin@a.com', password: PW });
  await createUser({ tenantId: B._id, role: 'clientadmin', name: 'Admin B', email: 'admin@b.com', password: PW });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Super Admin auth', () => {
  test('first register needs bootstrap secret', async () => {
    const body = { name: 'Root', email: 'root@p.com', password: PW };
    expect((await api().post('/api/superadmin/auth/register').send(body)).status).toBe(403);
    const ok = await api().post('/api/superadmin/auth/register').set('x-bootstrap-secret', 'boot').send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe('superadmin');
    expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    tok.sa = ok.body.token;
  });

  test('after bootstrap, secret no longer works; only a Super Admin can add another', async () => {
    const body = { name: 'Root2', email: 'root2@p.com', password: PW };
    expect((await api().post('/api/superadmin/auth/register').set('x-bootstrap-secret', 'boot').send(body)).status).toBe(403);
    expect((await api().post('/api/superadmin/auth/register').set(auth(tok.sa)).send(body)).status).toBe(201);
  });

  test('login success / failure', async () => {
    const ok = await api().post('/api/superadmin/auth/login').send({ email: 'root@p.com', password: PW });
    expect(ok.status).toBe(200);
    expect((await api().post('/api/superadmin/auth/login').send({ email: 'root@p.com', password: 'wrongwrong' })).status).toBe(401);
    expect((await api().post('/api/superadmin/auth/login').send({ email: 'nobody@p.com', password: PW })).status).toBe(401);
  });

  test('superadmin routes: need superadmin token', async () => {
    expect((await api().get('/api/superadmin/ping')).status).toBe(401);
    expect((await api().get('/api/superadmin/ping').set(auth(tok.sa))).status).toBe(200);
  });

  test('superadmin portal is unreachable from a tenant context', async () => {
    expect((await api().get('/api/superadmin/ping').set(auth(tok.sa)).set('x-tenant', 'alpha')).status).toBe(404);
    expect((await api().post('/api/superadmin/auth/login').set('x-tenant', 'alpha').send({ email: 'root@p.com', password: PW })).status).toBe(404);
  });

  test('superadmin cannot log in through a store login', async () => {
    expect((await login('alpha', 'root@p.com')).status).toBe(401);
  });

  test("superadmin token is rejected on tenant routes (data isolation, FR-SA-09)", async () => {
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(tok.sa))).status).toBe(403);
    expect((await api().get('/api/store/alpha/auth/me').set(auth(tok.sa))).status).toBe(403);
  });
});

describe('tenant registration & login', () => {
  test('customer registers and logs in', async () => {
    const r = await api().post('/api/store/alpha/auth/register').send({ name: 'Cu', email: 'Shopper@X.com', password: PW });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('customer');
    expect(r.body.user.email).toBe('shopper@x.com');
    const l = await login('alpha', 'shopper@x.com');
    expect(l.status).toBe(200);
    tok.custA = l.body.token;
  });

  test('duplicate email in same tenant -> 409, same email in another tenant OK', async () => {
    expect((await api().post('/api/store/alpha/auth/register').send({ name: 'Cu', email: 'shopper@x.com', password: PW })).status).toBe(409);
    const r = await api().post('/api/store/beta/auth/register').send({ name: 'Cu', email: 'shopper@x.com', password: 'otherpass99' });
    expect(r.status).toBe(201);
    tok.custB = r.body.token;
  });

  test("credentials of tenant A do not work on tenant B", async () => {
    expect((await login('beta', 'shopper@x.com', PW)).status).toBe(401);
    expect((await login('beta', 'admin@a.com')).status).toBe(401);
  });

  test('validation', async () => {
    expect((await api().post('/api/store/alpha/auth/register').send({ name: 'x', email: 'bad', password: PW })).status).toBe(400);
    expect((await api().post('/api/store/alpha/auth/register').send({ name: 'x', email: 'ok@x.com', password: 'short' })).status).toBe(400);
  });

  test('privileged roles cannot self-register', async () => {
    for (const role of ['clientadmin', 'cashier', 'superadmin']) {
      const r = await api().post('/api/store/alpha/auth/register').send({ name: 'x', email: `${role}@x.com`, password: PW, role });
      expect(r.status).toBe(403);
    }
  });

  test('unknown tenant 404', async () => {
    expect((await login('ghost', 'a@a.com')).status).toBe(404);
  });
});

describe('role + tenant guards', () => {
  beforeAll(async () => {
    tok.adminA = (await login('alpha', 'admin@a.com')).body.token;
    tok.adminB = (await login('beta', 'admin@b.com')).body.token;
  });

  test('no token / garbage token -> 401', async () => {
    expect((await api().get('/api/store/alpha/admin/ping')).status).toBe(401);
    expect((await api().get('/api/store/alpha/admin/ping').set(auth('garbage'))).status).toBe(401);
  });

  test('tampered and expired tokens -> 401', async () => {
    const forged = jwt.sign({ sub: String(A._id), role: 'clientadmin', tenantId: String(A._id) }, 'wrong-secret');
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(forged))).status).toBe(401);
    const adminA = await M.User.findOne({ tenantId: A._id, email: 'admin@a.com' });
    const expired = jwt.sign({ sub: String(adminA._id), role: 'clientadmin', tenantId: String(A._id) }, 'test-secret', { expiresIn: -10 });
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(expired))).status).toBe(401);
  });

  test('role guard: customer cannot reach admin, admin can', async () => {
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(tok.custA))).status).toBe(403);
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(tok.adminA))).status).toBe(200);
    expect((await api().get('/api/store/alpha/customer/ping').set(auth(tok.custA))).status).toBe(200);
    expect((await api().get('/api/store/alpha/customer/ping').set(auth(tok.adminA))).status).toBe(403);
  });

  test("tenant guard: a valid token for tenant A is rejected on tenant B (and vice versa)", async () => {
    expect((await api().get('/api/store/beta/admin/ping').set(auth(tok.adminA))).status).toBe(403);
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(tok.adminB))).status).toBe(403);
    expect((await api().get('/api/store/beta/auth/me').set(auth(tok.custA))).status).toBe(403);
    // also via header-based tenant resolution
    expect((await api().get('/api/tenant/admin/ping').set('x-tenant', 'beta').set(auth(tok.adminA))).status).toBe(403);
    expect((await api().get('/api/tenant/admin/ping').set('x-tenant', 'alpha').set(auth(tok.adminA))).status).toBe(200);
  });

  test('/auth/me returns the caller only', async () => {
    const r = await api().get('/api/store/alpha/auth/me').set(auth(tok.custA));
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe('shopper@x.com');
  });

  test('Client Admin creates a cashier; cashier gets POS but not admin; cashier/customer cannot create staff', async () => {
    const c = await api().post('/api/store/alpha/auth/staff').set(auth(tok.adminA)).send({ name: 'Cash', email: 'cash@a.com', password: PW, role: 'cashier' });
    expect(c.status).toBe(201);
    tok.cashA = (await login('alpha', 'cash@a.com')).body.token;
    expect((await api().get('/api/store/alpha/pos/ping').set(auth(tok.cashA))).status).toBe(200);
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(tok.cashA))).status).toBe(403);
    const body = { name: 'X', email: 'x2@a.com', password: PW, role: 'cashier' };
    expect((await api().post('/api/store/alpha/auth/staff').set(auth(tok.cashA)).send(body)).status).toBe(403);
    expect((await api().post('/api/store/alpha/auth/staff').set(auth(tok.custA)).send(body)).status).toBe(403);
    expect((await api().post('/api/store/alpha/auth/staff').set(auth(tok.adminA)).send({ ...body, role: 'superadmin' })).status).toBe(400);
  });

  test('vendor: blocked when multiVendor off; pending until approved when on', async () => {
    const off = await api().post('/api/store/beta/auth/register').send({ name: 'V', email: 'v@b.com', password: PW, role: 'vendor' });
    expect(off.status).toBe(403);

    const reg = await api().post('/api/store/alpha/auth/register').send({ name: 'V', email: 'v@a.com', password: PW, role: 'vendor' });
    expect(reg.status).toBe(202);
    expect(reg.body.token).toBeUndefined();
    expect((await login('alpha', 'v@a.com')).status).toBe(403);

    await M.User.updateOne({ tenantId: A._id, email: 'v@a.com' }, { status: 'active' });
    const l = await login('alpha', 'v@a.com');
    expect(l.status).toBe(200);
    expect((await api().get('/api/store/alpha/vendor/ping').set(auth(l.body.token))).status).toBe(200);
    expect((await api().get('/api/store/alpha/admin/ping').set(auth(l.body.token))).status).toBe(403);
  });

  test('removed user token stops working immediately', async () => {
    await M.User.updateOne({ tenantId: A._id, email: 'cash@a.com' }, { status: 'removed' });
    expect((await api().get('/api/store/alpha/pos/ping').set(auth(tok.cashA))).status).toBe(401);
    expect((await login('alpha', 'cash@a.com')).status).toBe(403);
  });

  test('suspended tenant: store login and existing tokens are blocked (FR-SA-05)', async () => {
    await M.Tenant.updateOne({ _id: B._id }, { status: 'suspended' });
    expect((await login('beta', 'admin@b.com')).status).toBe(403);
    expect((await api().get('/api/store/beta/admin/ping').set(auth(tok.adminB))).status).toBe(403);
    await M.Tenant.updateOne({ _id: B._id }, { status: 'active' });
    expect((await api().get('/api/store/beta/admin/ping').set(auth(tok.adminB))).status).toBe(200);
  });
});
