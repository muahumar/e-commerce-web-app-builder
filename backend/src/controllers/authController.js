const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');

const ROUNDS = () => Number(process.env.BCRYPT_ROUNDS) || 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (u) => ({
  id: u._id,
  tenantId: u.tenantId || null,
  role: u.role,
  name: u.name,
  email: u.email,
  status: u.status,
});

function validateCredentials({ name, email, password }, needName = true) {
  if (needName && (!name || !String(name).trim())) return 'Name is required';
  if (!email || !EMAIL_RE.test(String(email))) return 'Valid email is required';
  if (!password || String(password).length < 8) return 'Password must be at least 8 characters';
  return null;
}

async function createUser({ tenantId, role, name, email, password, status = 'active', invitedBy }) {
  const passwordHash = await bcrypt.hash(String(password), ROUNDS());
  return User.create({ tenantId, role, name, email, passwordHash, status, invitedBy });
}

function handleDuplicate(err, res, next) {
  if (err && err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
  return next(err);
}

async function checkLogin(filter, password) {
  const email = filter.email;
  const user = await User.findOne({ ...filter, email: String(email).toLowerCase() }).select('+passwordHash');
  // always run a compare so response time doesn't reveal whether the account exists
  const ok = await bcrypt.compare(String(password || ''), user ? user.passwordHash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  return user && ok ? user : null;
}

/* ---------------- Super Admin (platform, tenantId = null) ---------------- */

// Bootstrap: first Super Admin needs SUPERADMIN_BOOTSTRAP_SECRET; afterwards only an existing Super Admin may add more.
exports.superadminRegister = async (req, res, next) => {
  try {
    const bad = validateCredentials(req.body);
    if (bad) return res.status(400).json({ error: bad });

    const exists = await User.exists({ tenantId: null, role: 'superadmin' });
    if (exists) {
      if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only a Super Admin can create another Super Admin' });
      }
    } else {
      const secret = process.env.SUPERADMIN_BOOTSTRAP_SECRET;
      if (!secret || req.headers['x-bootstrap-secret'] !== secret) {
        return res.status(403).json({ error: 'Invalid bootstrap secret' });
      }
    }
    const user = await createUser({ tenantId: null, role: 'superadmin', ...req.body });
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    handleDuplicate(err, res, next);
  }
};

exports.superadminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await checkLogin({ tenantId: null, role: 'superadmin', email }, password);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    next(err);
  }
};

/* ---------------- Tenant users (tenantId = req.tenantId) ---------------- */

// Public self-registration: customer, or vendor (only if the tenant enabled multi-vendor; starts pending).
exports.register = async (req, res, next) => {
  try {
    const role = req.body.role || 'customer';
    if (!['customer', 'vendor'].includes(role)) {
      return res.status(403).json({ error: 'This role cannot self-register' });
    }
    if (role === 'vendor' && !(req.tenant.features && req.tenant.features.multiVendor)) {
      return res.status(403).json({ error: 'Vendor sign-up is not enabled for this store' });
    }
    const bad = validateCredentials(req.body);
    if (bad) return res.status(400).json({ error: bad });

    const status = role === 'vendor' ? 'pending' : 'active';
    const user = await createUser({ tenantId: req.tenantId, role, status, ...pick(req.body) });
    if (status === 'pending') {
      return res.status(202).json({ user: publicUser(user), message: 'Awaiting approval by the store admin' });
    }
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    handleDuplicate(err, res, next);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await checkLogin({ tenantId: req.tenantId, email }, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Account awaiting approval' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account disabled' });
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    next(err);
  }
};

exports.me = (req, res) => res.json({ user: publicUser(req.user), impersonatedBy: req.impersonatedBy });

function pick({ name, email, password }) {
  return { name, email, password };
}

exports.createUser = createUser;
exports.publicUser = publicUser;
