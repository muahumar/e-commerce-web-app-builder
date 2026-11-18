const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const { Plan, Theme, Tenant, User, Category, Product, Order, Coupon, Review } = require('../models');
const { createUser, publicUser } = require('./authController');
const { saveImage } = require('../utils/storage');
const { sendMail } = require('../utils/mailer');

const FEATURES = ['discountBadge', 'multiVendor', 'reviews'];
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const validId = (id) => mongoose.isValidObjectId(id);
const pageOf = (q) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pick = (body = {}, keys) => Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const round = (n) => Math.round(n * 100) / 100;

// Mongoose validation / cast / duplicate-key errors -> 4xx instead of 500
function handleWrite(err, res, next, dupMsg = 'Already exists') {
  if (err.code === 11000) return bad(res, dupMsg, 409);
  if (err.name === 'ValidationError' || err.name === 'CastError') return bad(res, err.message);
  return next(err);
}

const getPlan = (req) => Plan.findById(req.tenant.plan).lean();

/* ============================ Overview ============================ */

exports.overview = wrap(async (req, res) => {
  const t = req.tenantId;
  const plan = await getPlan(req);
  const [products, lowStock, pendingOrders, pendingReviews, pendingVendors, admins, cashiers] = await Promise.all([
    Product.countDocuments({ tenantId: t }),
    Product.countDocuments({ tenantId: t, stock: { $lte: 5 } }),
    Order.countDocuments({ tenantId: t, status: 'pending' }),
    Review.countDocuments({ tenantId: t, approved: false }),
    User.countDocuments({ tenantId: t, role: 'vendor', status: 'pending' }),
    User.countDocuments({ tenantId: t, role: 'clientadmin', status: 'active' }),
    User.countDocuments({ tenantId: t, role: 'cashier', status: 'active' }),
  ]);
  res.json({
    store: { businessName: req.tenant.businessName, subdomain: req.tenant.subdomain, status: req.tenant.status },
    counts: { products, lowStock, pendingOrders, pendingReviews, pendingVendors, cashiers },
    limits: { plan: plan && plan.name, maxProducts: plan && plan.maxProducts, products, maxAdmins: plan && plan.maxAdmins, admins },
  });
});

/* ============================ Uploads ============================ */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single('image');
exports.uploadImage = wrap(async (req, res) => {
  if (!req.file) return bad(res, 'image file is required (field "image")');
  const p = await saveImage(req.tenantId, req.file);
  res.status(201).json({ path: p, url: `${req.protocol}://${req.get('host')}${p}` });
});

/* ============================ Categories (FR-CA-03) ============================ */

exports.listCategories = wrap(async (req, res) => {
  const items = await Category.find({ tenantId: req.tenantId }).sort({ order: 1, createdAt: 1 }).lean();
  const counts = await Product.aggregate([{ $match: { tenantId: req.tenantId } }, { $group: { _id: '$categoryId', n: { $sum: 1 } } }]);
  const byCat = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json({ items: items.map((c) => ({ ...c, productCount: byCat[String(c._id)] || 0 })) });
});

exports.createCategory = wrap(async (req, res, next) => {
  try {
    const last = await Category.findOne({ tenantId: req.tenantId }).sort({ order: -1 }).lean();
    const category = await Category.create({ tenantId: req.tenantId, name: req.body.name, order: last ? last.order + 1 : 0 });
    res.status(201).json({ category });
  } catch (err) {
    handleWrite(err, res, next, 'Category name already exists');
  }
});

exports.updateCategory = wrap(async (req, res, next) => {
  if (!validId(req.params.id)) return bad(res, 'Category not found', 404);
  try {
    const category = await Category.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, pick(req.body, ['name']), { new: true, runValidators: true });
    if (!category) return bad(res, 'Category not found', 404);
    res.json({ category });
  } catch (err) {
    handleWrite(err, res, next, 'Category name already exists');
  }
});

// body: { ids: [ ...categoryIds in the desired order ] }
exports.reorderCategories = wrap(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.every(validId)) return bad(res, 'ids must be an array of category ids');
  const owned = await Category.countDocuments({ tenantId: req.tenantId, _id: { $in: ids } });
  if (owned !== new Set(ids.map(String)).size) return bad(res, 'Unknown category id in list', 404);
  await Category.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id, tenantId: req.tenantId }, update: { order: i } } })));
  res.json({ items: await Category.find({ tenantId: req.tenantId }).sort({ order: 1 }).lean() });
});

exports.deleteCategory = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Category not found', 404);
  const r = await Category.deleteOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!r.deletedCount) return bad(res, 'Category not found', 404);
  await Product.updateMany({ tenantId: req.tenantId, categoryId: req.params.id }, { $unset: { categoryId: 1 } });
  res.json({ deleted: true });
});

/* ============================ Products (FR-CA-02) ============================ */

const PRODUCT_FIELDS = ['name', 'price', 'stock', 'images', 'categoryId', 'description', 'variants', 'published'];

async function checkCategory(req, categoryId) {
  if (categoryId === null || categoryId === '') return true;
  return validId(categoryId) && !!(await Category.exists({ _id: categoryId, tenantId: req.tenantId }));
}

exports.listProducts = wrap(async (req, res) => {
  const { page, limit, skip } = pageOf(req.query);
  const filter = { tenantId: req.tenantId };
  if (req.query.q) filter.name = new RegExp(esc(req.query.q), 'i');
  if (req.query.categoryId && validId(req.query.categoryId)) filter.categoryId = req.query.categoryId;
  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});

exports.getProduct = wrap(async (req, res) => {
  const product = validId(req.params.id) && (await Product.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean());
  if (!product) return bad(res, 'Product not found', 404);
  res.json({ product });
});

exports.createProduct = wrap(async (req, res, next) => {
  const plan = await getPlan(req);
  const count = await Product.countDocuments({ tenantId: req.tenantId });
  if (plan && count >= plan.maxProducts) {
    return bad(res, `Plan limit reached (${plan.maxProducts} products). Ask the platform admin to upgrade your plan.`, 403);
  }
  const data = pick(req.body, PRODUCT_FIELDS);
  if (data.categoryId === '') delete data.categoryId;
  if (data.categoryId && !(await checkCategory(req, data.categoryId))) return bad(res, 'Category not found', 404);
  try {
    const product = await Product.create({ ...data, tenantId: req.tenantId }); // sellerId is never client-supplied here
    res.status(201).json({ product });
  } catch (err) {
    handleWrite(err, res, next);
  }
});

exports.updateProduct = wrap(async (req, res, next) => {
  const product = validId(req.params.id) && (await Product.findOne({ _id: req.params.id, tenantId: req.tenantId }));
  if (!product) return bad(res, 'Product not found', 404);
  const data = pick(req.body, PRODUCT_FIELDS);
  if (data.categoryId) {
    if (!(await checkCategory(req, data.categoryId))) return bad(res, 'Category not found', 404);
  } else if ('categoryId' in data) {
    product.categoryId = undefined;
    delete data.categoryId;
  }
  product.set(data);
  try {
    await product.save();
    res.json({ product });
  } catch (err) {
    handleWrite(err, res, next);
  }
});

exports.deleteProduct = wrap(async (req, res) => {
  const r = validId(req.params.id) && (await Product.deleteOne({ _id: req.params.id, tenantId: req.tenantId }));
  if (!r || !r.deletedCount) return bad(res, 'Product not found', 404);
  res.json({ deleted: true });
});

/* ============================ Orders (FR-CA-04) ============================ */

// delivered and cancelled are final
const NEXT_STATUS = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
const ORDER_STATUSES = Object.keys(NEXT_STATUS);

async function withCustomers(req, orders) {
  const ids = [...new Set(orders.map((o) => o.customerId && String(o.customerId)).filter(Boolean))];
  const users = ids.length ? await User.find({ tenantId: req.tenantId, _id: { $in: ids } }).select('name email').lean() : [];
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
  return orders.map((o) => ({
    ...o,
    customer: o.customerId ? byId[String(o.customerId)] || null : { name: 'Guest', email: o.guestEmail },
    allowedNext: NEXT_STATUS[o.status] || [],
  }));
}

exports.listOrders = wrap(async (req, res) => {
  const { page, limit, skip } = pageOf(req.query);
  const filter = { tenantId: req.tenantId };
  if (req.query.status) {
    if (!ORDER_STATUSES.includes(req.query.status)) return bad(res, 'Invalid status');
    filter.status = req.query.status;
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ items: await withCustomers(req, orders), total, page, limit });
});

exports.getOrder = wrap(async (req, res) => {
  const order = validId(req.params.id) && (await Order.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean());
  if (!order) return bad(res, 'Order not found', 404);
  res.json({ order: (await withCustomers(req, [order]))[0] });
});

exports.updateOrderStatus = wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!ORDER_STATUSES.includes(status)) return bad(res, `status must be one of ${ORDER_STATUSES.join(', ')}`);
  const order = validId(req.params.id) && (await Order.findOne({ _id: req.params.id, tenantId: req.tenantId }));
  if (!order) return bad(res, 'Order not found', 404);
  if (!NEXT_STATUS[order.status].includes(status)) {
    return bad(res, `Cannot change an order from ${order.status} to ${status}`, 409);
  }
  order.status = status;
  await order.save();
  res.json({ order: (await withCustomers(req, [order.toObject()]))[0] });
});

/* ============================ Coupons (FR-CA-05) ============================ */

const COUPON_FIELDS = ['code', 'discountType', 'value', 'expiryDate', 'usageLimit', 'active'];

function couponError(d) {
  if (d.discountType === 'percent' && d.value > 100) return 'Percentage discount cannot exceed 100';
  if (d.expiryDate && Number.isNaN(new Date(d.expiryDate).getTime())) return 'Invalid expiryDate';
  return null;
}

exports.listCoupons = wrap(async (req, res) => {
  res.json({ items: await Coupon.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).lean() });
});

exports.createCoupon = wrap(async (req, res, next) => {
  const data = pick(req.body, COUPON_FIELDS);
  const e = couponError(data);
  if (e) return bad(res, e);
  try {
    res.status(201).json({ coupon: await Coupon.create({ ...data, tenantId: req.tenantId }) });
  } catch (err) {
    handleWrite(err, res, next, 'Coupon code already exists');
  }
});

exports.updateCoupon = wrap(async (req, res, next) => {
  const coupon = validId(req.params.id) && (await Coupon.findOne({ _id: req.params.id, tenantId: req.tenantId }));
  if (!coupon) return bad(res, 'Coupon not found', 404);
  const data = pick(req.body, COUPON_FIELDS);
  const e = couponError({ discountType: coupon.discountType, value: coupon.value, ...data });
  if (e) return bad(res, e);
  coupon.set(data);
  try {
    await coupon.save();
    res.json({ coupon });
  } catch (err) {
    handleWrite(err, res, next, 'Coupon code already exists');
  }
});

exports.deleteCoupon = wrap(async (req, res) => {
  const r = validId(req.params.id) && (await Coupon.deleteOne({ _id: req.params.id, tenantId: req.tenantId }));
  if (!r || !r.deletedCount) return bad(res, 'Coupon not found', 404);
  res.json({ deleted: true });
});

/* ============================ Reviews (FR-CA-06) ============================ */

exports.listReviews = wrap(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (req.query.approved === 'true') filter.approved = true;
  if (req.query.approved === 'false') filter.approved = false;
  const reviews = await Review.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const [products, users] = await Promise.all([
    Product.find({ tenantId: req.tenantId, _id: { $in: reviews.map((r) => r.productId) } }).select('name').lean(),
    User.find({ tenantId: req.tenantId, _id: { $in: reviews.map((r) => r.customerId) } }).select('name').lean(),
  ]);
  const p = Object.fromEntries(products.map((x) => [String(x._id), x.name]));
  const u = Object.fromEntries(users.map((x) => [String(x._id), x.name]));
  res.json({ items: reviews.map((r) => ({ ...r, productName: p[String(r.productId)], customerName: u[String(r.customerId)] })) });
});

// keeps the product's displayed rating in sync with approved reviews only
async function refreshRating(tenantId, productId) {
  const [agg] = await Review.aggregate([
    { $match: { tenantId, productId, approved: true } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  await Product.updateOne({ _id: productId, tenantId }, { ratingAvg: agg ? round(agg.avg) : 0, ratingCount: agg ? agg.n : 0 });
}

exports.moderateReview = wrap(async (req, res) => {
  if (typeof (req.body || {}).approved !== 'boolean') return bad(res, 'approved (boolean) is required');
  const review = validId(req.params.id) && (await Review.findOne({ _id: req.params.id, tenantId: req.tenantId }));
  if (!review) return bad(res, 'Review not found', 404);
  review.approved = req.body.approved;
  await review.save();
  await refreshRating(req.tenantId, review.productId);
  res.json({ review });
});

/* ============================ Store settings (FR-CA-07) & features (FR-CA-11) ============================ */

exports.getSettings = wrap(async (req, res) => {
  const t = await Tenant.findById(req.tenantId).lean();
  const theme = t.theme ? await Theme.findById(t.theme).lean() : null;
  res.json({
    businessName: t.businessName,
    subdomain: t.subdomain,
    settings: t.settings || {},
    theme: theme && { name: theme.name, colorPalettes: (theme.options && theme.options.colorPalettes) || [] },
  });
});

const SETTING_FIELDS = ['storeName', 'logo', 'banner', 'colorPalette', 'contactPhone', 'contactEmail', 'contactAddress'];

exports.updateSettings = wrap(async (req, res) => {
  const data = pick(req.body, SETTING_FIELDS);
  if (data.colorPalette) {
    const theme = req.tenant.theme ? await Theme.findById(req.tenant.theme).lean() : null;
    const palettes = (theme && theme.options && theme.options.colorPalettes) || [];
    if (palettes.length && !palettes.some((p) => p.name === data.colorPalette)) {
      return bad(res, 'colorPalette must be one of the assigned theme\'s options');
    }
  }
  const set = Object.fromEntries(Object.entries(data).map(([k, v]) => [`settings.${k}`, v]));
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $set: set }, { new: true, runValidators: true }).lean();
  res.json({ settings: t.settings });
});

exports.getFeatures = wrap(async (req, res) => {
  const plan = await getPlan(req);
  const t = await Tenant.findById(req.tenantId).lean();
  res.json({ features: t.features, allowed: plan ? plan.allowedFeatures : {} });
});

exports.updateFeatures = wrap(async (req, res) => {
  const incoming = (req.body || {}).features;
  if (!incoming || typeof incoming !== 'object') return bad(res, 'features object is required');
  const plan = await getPlan(req);
  const allowed = (plan && plan.allowedFeatures) || {};
  const set = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (!FEATURES.includes(k) || typeof v !== 'boolean') return bad(res, `Invalid feature: ${k}`);
    if (v && !allowed[k]) return bad(res, `Your plan does not include "${k}"`, 403);
    set[`features.${k}`] = v;
  }
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $set: set }, { new: true }).lean();
  res.json({ features: t.features, allowed });
});

/* ============================ Staff: sub-admins + cashiers (FR-CA-08, 12) ============================ */

async function adminSlotsLeft(req) {
  const plan = await getPlan(req);
  const used = await User.countDocuments({ tenantId: req.tenantId, role: 'clientadmin', status: 'active' });
  return { plan, used, ok: !plan || used < plan.maxAdmins };
}

exports.listStaff = wrap(async (req, res) => {
  const users = await User.find({ tenantId: req.tenantId, role: { $in: ['clientadmin', 'cashier'] } }).sort({ createdAt: 1 }).lean();
  res.json({ items: users.map(publicUser) });
});

exports.createStaff = wrap(async (req, res, next) => {
  const { role, name, email } = req.body || {};
  if (!['clientadmin', 'cashier'].includes(role)) return bad(res, 'role must be clientadmin or cashier');
  if (!name || !email) return bad(res, 'name and email are required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return bad(res, 'Valid email is required');
  if (role === 'clientadmin') {
    const s = await adminSlotsLeft(req);
    if (!s.ok) return bad(res, `Plan limit reached (${s.plan.maxAdmins} admins)`, 403);
  }
  // invite flow: no password supplied -> generate one and email it
  const generated = !req.body.password;
  const password = req.body.password || crypto.randomBytes(9).toString('base64url');
  if (String(password).length < 8) return bad(res, 'Password must be at least 8 characters');
  try {
    const user = await createUser({ tenantId: req.tenantId, role, name, email, password, invitedBy: req.user._id });
    if (generated) {
      await sendMail({
        to: user.email,
        subject: `You were added to ${req.tenant.businessName}`,
        text: `Log in at ${process.env.FRONTEND_ORIGIN || 'http://localhost:3000'}/admin/${req.tenant.subdomain}/login\nEmail: ${user.email}\nTemporary password: ${password}`,
      });
    }
    res.status(201).json({ user: publicUser(user), ...(generated && process.env.NODE_ENV !== 'production' ? { devOnly: { tempPassword: password } } : {}) });
  } catch (err) {
    handleWrite(err, res, next, 'Email already registered');
  }
});

exports.setStaffStatus = wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'removed'].includes(status)) return bad(res, 'status must be active or removed');
  const user = validId(req.params.id) && (await User.findOne({ _id: req.params.id, tenantId: req.tenantId, role: { $in: ['clientadmin', 'cashier'] } }));
  if (!user) return bad(res, 'Staff member not found', 404);

  if (status === 'removed' && user.role === 'clientadmin') {
    if (String(user._id) === String(req.user._id)) return bad(res, 'You cannot remove your own account', 409);
    const others = await User.countDocuments({ tenantId: req.tenantId, role: 'clientadmin', status: 'active', _id: { $ne: user._id } });
    if (!others) return bad(res, 'A store needs at least one active admin', 409);
  }
  if (status === 'active' && user.role === 'clientadmin' && user.status !== 'active') {
    const s = await adminSlotsLeft(req);
    if (!s.ok) return bad(res, `Plan limit reached (${s.plan.maxAdmins} admins)`, 403);
  }
  user.status = status;
  await user.save();
  res.json({ user: publicUser(user) });
});

/* ============================ Vendors (FR-CA-13) ============================ */

exports.listVendors = wrap(async (req, res) => {
  const filter = { tenantId: req.tenantId, role: 'vendor' };
  if (req.query.status) filter.status = req.query.status;
  const vendors = await User.find(filter).sort({ createdAt: -1 }).lean();
  const counts = await Product.aggregate([{ $match: { tenantId: req.tenantId, sellerId: { $in: vendors.map((v) => v._id) } } }, { $group: { _id: '$sellerId', n: { $sum: 1 } } }]);
  const byV = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json({
    multiVendorEnabled: !!req.tenant.features.multiVendor,
    items: vendors.map((v) => ({ ...publicUser(v), productCount: byV[String(v._id)] || 0, createdAt: v.createdAt })),
  });
});

exports.setVendorStatus = wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'rejected', 'removed'].includes(status)) return bad(res, 'status must be active, rejected or removed');
  const vendor = validId(req.params.id) && (await User.findOne({ _id: req.params.id, tenantId: req.tenantId, role: 'vendor' }));
  if (!vendor) return bad(res, 'Vendor not found', 404);
  if (status === 'active' && !req.tenant.features.multiVendor) {
    return bad(res, 'Enable multi-vendor mode before approving vendors', 409);
  }
  vendor.status = status;
  await vendor.save();
  // revoked vendors' listings leave the storefront (their login already stops working)
  if (status !== 'active') await Product.updateMany({ tenantId: req.tenantId, sellerId: vendor._id }, { published: false });
  res.json({ vendor: publicUser(vendor) });
});

/* ============================ Sales reports (FR-CA-09) ============================ */

exports.reports = wrap(async (req, res) => {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return bad(res, 'Invalid from/to date');
  if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) to.setUTCHours(23, 59, 59, 999); // date-only "to" is inclusive
  if (from > to) return bad(res, 'from must be before to');

  const [r] = await Order.aggregate([
    { $match: { tenantId: req.tenantId, status: { $ne: 'cancelled' }, createdAt: { $gte: from, $lte: to } } },
    {
      $facet: {
        totals: [{ $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } }],
        daily: [
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        topProducts: [
          { $unwind: '$items' },
          { $group: { _id: '$items.productId', name: { $first: '$items.name' }, unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
          { $sort: { unitsSold: -1, revenue: -1 } },
          { $limit: 5 },
        ],
      },
    },
  ]);
  const totals = r.totals[0] || { revenue: 0, orders: 0 };
  res.json({
    from,
    to,
    revenue: round(totals.revenue),
    orderCount: totals.orders,
    averageOrderValue: totals.orders ? round(totals.revenue / totals.orders) : 0,
    daily: r.daily.map((d) => ({ date: d._id, revenue: round(d.revenue), orders: d.orders })),
    topProducts: r.topProducts.map((p) => ({ productId: p._id, name: p.name, unitsSold: p.unitsSold, revenue: round(p.revenue) })),
  });
});
