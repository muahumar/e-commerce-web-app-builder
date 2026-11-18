const crypto = require('crypto');
const mongoose = require('mongoose');
const { Tenant, Plan, Theme, User, Category, Product, Order, Coupon, Review, Cart, AuditLog } = require('../models');
const { createUser, publicUser } = require('./authController');
const { signToken } = require('../utils/jwt');
const { sendMail } = require('../utils/mailer');

const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'superadmin', 'app', 'static']);
const STATUSES = ['active', 'suspended', 'trial_expired'];
const FEATURES = ['discountBadge', 'multiVendor', 'reviews'];
const TENANT_OWNED = [Cart, Review, Coupon, Order, Product, Category, User];

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const validId = (id) => mongoose.isValidObjectId(id);

/** Turn off any tenant feature the plan does not allow. */
function clampFeatures(features = {}, allowed = {}) {
  const out = {};
  FEATURES.forEach((f) => {
    out[f] = !!(allowed[f] && features[f]);
  });
  return out;
}

async function audit(req, tenantId, action, extra = {}) {
  return AuditLog.create({
    tenantId,
    actorId: req.user._id,
    actorRole: req.user.role,
    action,
    ...extra,
  });
}

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/* ------------------------------ Tenants ------------------------------ */

exports.createTenant = wrap(async (req, res) => {
  const { businessName, subdomain, contactEmail, plan: planId, theme: themeId, adminPassword, password } = req.body || {};
  const chosenPassword = adminPassword || password;
  if (!businessName || !subdomain || !contactEmail || !planId) {
    return bad(res, 'businessName, subdomain, contactEmail and plan are required');
  }
  if (chosenPassword !== undefined && chosenPassword !== '' && String(chosenPassword).length < 8) {
    return bad(res, 'Password must be at least 8 characters');
  }
  const sub = String(subdomain).toLowerCase().trim();
  if (RESERVED_SUBDOMAINS.has(sub)) return bad(res, 'Subdomain is reserved');
  if (!validId(planId)) return bad(res, 'Invalid plan');
  const plan = await Plan.findById(planId);
  if (!plan) return bad(res, 'Plan not found', 404);
  if (themeId) {
    if (!validId(themeId) || !(await Theme.findOne({ _id: themeId, active: true }))) return bad(res, 'Theme not found', 404);
  }
  if (await Tenant.exists({ subdomain: sub })) return bad(res, 'Subdomain already taken', 409);

  let tenant;
  try {
    tenant = await Tenant.create({
      businessName,
      subdomain: sub,
      contactEmail,
      plan: plan._id,
      theme: themeId || undefined,
      features: clampFeatures({ reviews: true }, plan.allowedFeatures),
      settings: { storeName: businessName },
    });
  } catch (err) {
    if (err.name === 'ValidationError') return bad(res, err.message);
    throw err;
  }

  // default Client Admin (FR-SA-03); roll back the tenant if it fails
  const tempPassword = chosenPassword ? String(chosenPassword) : crypto.randomBytes(9).toString('base64url');
  let admin;
  try {
    admin = await createUser({
      tenantId: tenant._id,
      role: 'clientadmin',
      name: `${businessName} Admin`,
      email: contactEmail,
      password: tempPassword,
      invitedBy: req.user._id,
    });
  } catch (err) {
    await Tenant.deleteOne({ _id: tenant._id });
    if (err.name === 'ValidationError') return bad(res, err.message);
    throw err;
  }

  const loginUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:3000'}/admin/${sub}/login`;
  await sendMail({
    to: contactEmail,
    subject: `Your ${businessName} store is ready`,
    text: `Log in at ${loginUrl}\nEmail: ${contactEmail}\nTemporary password: ${tempPassword}\nPlease change it after first login.`,
  });
  await audit(req, tenant._id, 'tenant.create', { meta: { subdomain: sub, plan: plan.name } });

  res.status(201).json({
    tenant,
    clientAdmin: publicUser(admin),
    loginUrl,
    // Only outside production so the demo works without SMTP; real systems only email it.
    ...(process.env.NODE_ENV === 'production' ? {} : { devOnly: { tempPassword } }),
  });
});

exports.listTenants = wrap(async (req, res) => {
  const { status, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (status) {
    if (!STATUSES.includes(status)) return bad(res, 'Invalid status');
    filter.status = status;
  }
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ businessName: rx }, { subdomain: rx }, { contactEmail: rx }];
  }
  const [items, total] = await Promise.all([
    Tenant.find(filter).populate('plan', 'name').populate('theme', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Tenant.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});

exports.getTenant = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  const tenant = await Tenant.findById(req.params.id).populate('plan').populate('theme', 'name');
  if (!tenant) return bad(res, 'Tenant not found', 404);
  res.json({ tenant });
});

exports.updateTenant = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) return bad(res, 'Tenant not found', 404);

  const { businessName, contactEmail, plan: planId, theme: themeId } = req.body || {};
  if (businessName) tenant.businessName = businessName;
  if (contactEmail) tenant.contactEmail = contactEmail;
  if (themeId) {
    if (!validId(themeId) || !(await Theme.findOne({ _id: themeId, active: true }))) return bad(res, 'Theme not found', 404);
    tenant.theme = themeId;
  }
  if (planId) {
    if (!validId(planId)) return bad(res, 'Invalid plan');
    const plan = await Plan.findById(planId);
    if (!plan) return bad(res, 'Plan not found', 404);
    tenant.plan = plan._id;
    tenant.features = clampFeatures(tenant.features, plan.allowedFeatures);
  }
  try {
    await tenant.save();
  } catch (err) {
    if (err.name === 'ValidationError') return bad(res, err.message);
    throw err;
  }
  await audit(req, tenant._id, 'tenant.update', { meta: Object.keys(req.body || {}) });
  res.json({ tenant });
});

exports.setTenantStatus = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return bad(res, `status must be one of ${STATUSES.join(', ')}`);
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!tenant) return bad(res, 'Tenant not found', 404);
  await audit(req, tenant._id, 'tenant.status', { meta: { status } });
  res.json({ tenant });
});

exports.deleteTenant = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) return bad(res, 'Tenant not found', 404);
  // account removal wipes the tenant's own data; Super Admin never reads it (FR-SA-09)
  for (const Model of TENANT_OWNED) await Model.deleteMany({ tenantId: tenant._id });
  await Tenant.deleteOne({ _id: tenant._id });
  await audit(req, tenant._id, 'tenant.delete', { meta: { businessName: tenant.businessName, subdomain: tenant.subdomain } });
  res.json({ deleted: true });
});

// FR-SA-10: act as the tenant's Client Admin - short-lived token, always audited.
exports.impersonate = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) return bad(res, 'Tenant not found', 404);
  const target = await User.findOne({ tenantId: tenant._id, role: 'clientadmin', status: 'active' }).sort({ createdAt: 1 });
  if (!target) return bad(res, 'Tenant has no active Client Admin', 409);

  const token = signToken(target, { imp: String(req.user._id) }, '30m');
  await audit(req, tenant._id, 'impersonate.start', { targetUserId: target._id, meta: { reason: req.body && req.body.reason } });
  res.json({ token, expiresIn: '30m', subdomain: tenant.subdomain, user: publicUser(target) });
});

exports.listAuditLogs = wrap(async (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const filter = {};
  if (req.query.tenantId) {
    if (!validId(req.query.tenantId)) return bad(res, 'Invalid tenantId');
    filter.tenantId = req.query.tenantId;
  }
  const items = await AuditLog.find(filter).setOptions({ skipTenantScope: !filter.tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ items });
});

/* ------------------------------ Plans ------------------------------ */

const PLAN_FIELDS = ['name', 'maxProducts', 'maxAdmins', 'priceMonthly', 'commissionPercent', 'allowedFeatures'];
const pickPlan = (body = {}) => Object.fromEntries(PLAN_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

exports.listPlans = wrap(async (req, res) => {
  const plans = await Plan.find().sort({ priceMonthly: 1 }).lean();
  const counts = await Tenant.aggregate([{ $group: { _id: '$plan', n: { $sum: 1 } } }]);
  const byPlan = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json({ items: plans.map((p) => ({ ...p, tenantCount: byPlan[String(p._id)] || 0 })) });
});

exports.createPlan = wrap(async (req, res) => {
  try {
    res.status(201).json({ plan: await Plan.create(pickPlan(req.body)) });
  } catch (err) {
    if (err.code === 11000) return bad(res, 'Plan name already exists', 409);
    if (err.name === 'ValidationError') return bad(res, err.message);
    throw err;
  }
});

exports.updatePlan = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  const plan = await Plan.findById(req.params.id);
  if (!plan) return bad(res, 'Plan not found', 404);
  const data = pickPlan(req.body);
  if (data.allowedFeatures) data.allowedFeatures = { ...plan.toObject().allowedFeatures, ...data.allowedFeatures };
  plan.set(data);
  try {
    await plan.save();
  } catch (err) {
    if (err.code === 11000) return bad(res, 'Plan name already exists', 409);
    if (err.name === 'ValidationError') return bad(res, err.message);
    throw err;
  }
  // features removed from the plan are switched off for every tenant on it (FR-SA-11)
  const off = FEATURES.filter((f) => !plan.allowedFeatures[f]);
  if (off.length) {
    await Tenant.updateMany({ plan: plan._id }, { $set: Object.fromEntries(off.map((f) => [`features.${f}`, false])) });
  }
  res.json({ plan });
});

exports.deletePlan = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  if (await Tenant.exists({ plan: req.params.id })) return bad(res, 'Plan is in use by tenants', 409);
  const r = await Plan.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return bad(res, 'Plan not found', 404);
  res.json({ deleted: true });
});

/* ------------------------------ Themes ------------------------------ */

const THEME_FIELDS = ['name', 'description', 'previewImage', 'options', 'active'];
const pickTheme = (body = {}) => Object.fromEntries(THEME_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

exports.listThemes = wrap(async (req, res) => {
  res.json({ items: await Theme.find().sort({ name: 1 }) });
});

exports.createTheme = wrap(async (req, res) => {
  try {
    res.status(201).json({ theme: await Theme.create(pickTheme(req.body)) });
  } catch (err) {
    if (err.code === 11000) return bad(res, 'Theme name already exists', 409);
    if (err.name === 'ValidationError') return bad(res, err.message);
    throw err;
  }
});

exports.updateTheme = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  try {
    const theme = await Theme.findByIdAndUpdate(req.params.id, pickTheme(req.body), { new: true, runValidators: true });
    if (!theme) return bad(res, 'Theme not found', 404);
    res.json({ theme });
  } catch (err) {
    if (err.code === 11000) return bad(res, 'Theme name already exists', 409);
    if (err.name === 'ValidationError') return bad(res, err.message);
    throw err;
  }
});

exports.deleteTheme = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid id', 404);
  if (await Tenant.exists({ theme: req.params.id })) return bad(res, 'Theme is in use by tenants; deactivate it instead', 409);
  const r = await Theme.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return bad(res, 'Theme not found', 404);
  res.json({ deleted: true });
});

/* ------------------------------ Analytics ------------------------------ */

// FR-SA-07 / FR-SA-09: aggregates only (counts and sums) - never individual products/customers/orders.
exports.analytics = wrap(async (req, res) => {
  const platformScope = { skipTenantScope: true };
  const [tenants, statusRows, orderRows, productRows] = await Promise.all([
    Tenant.find().populate('plan', 'name commissionPercent').lean(),
    Tenant.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Order.aggregate([
      {
        $group: {
          _id: '$tenantId',
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, '$totalAmount'] } },
        },
      },
    ]).option(platformScope),
    Product.aggregate([{ $group: { _id: '$tenantId', products: { $sum: 1 } } }]).option(platformScope),
  ]);

  const orders = Object.fromEntries(orderRows.map((r) => [String(r._id), r]));
  const products = Object.fromEntries(productRows.map((r) => [String(r._id), r.products]));
  const round = (n) => Math.round(n * 100) / 100;

  const perTenant = tenants.map((t) => {
    const o = orders[String(t._id)] || { orders: 0, revenue: 0 };
    const pct = (t.plan && t.plan.commissionPercent) || 0;
    return {
      tenantId: t._id,
      businessName: t.businessName,
      subdomain: t.subdomain,
      status: t.status,
      plan: t.plan ? t.plan.name : null,
      products: products[String(t._id)] || 0,
      orders: o.orders,
      revenue: round(o.revenue),
      commission: round((o.revenue * pct) / 100),
    };
  });

  const totals = perTenant.reduce(
    (a, t) => ({ orders: a.orders + t.orders, revenue: a.revenue + t.revenue, commission: a.commission + t.commission }),
    { orders: 0, revenue: 0, commission: 0 }
  );
  res.json({
    totalTenants: tenants.length,
    tenantsByStatus: Object.fromEntries(statusRows.map((s) => [s._id, s.n])),
    totalOrders: totals.orders,
    totalRevenue: round(totals.revenue),
    totalCommission: round(totals.commission),
    perTenant,
  });
});
