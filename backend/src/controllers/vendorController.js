const mongoose = require('mongoose');
const { Plan, Product, Order, Category } = require('../models');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const validId = (id) => mongoose.isValidObjectId(id);
const pick = (body = {}, keys) => Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const round = (n) => Math.round(n * 100) / 100;

const PRODUCT_FIELDS = ['name', 'price', 'stock', 'images', 'categoryId', 'description', 'variants', 'published'];

exports.requireMultiVendor = (req, res, next) => {
  if (!req.tenant.features || !req.tenant.features.multiVendor) {
    return res.status(403).json({ error: 'Multi-vendor mode is disabled for this store' });
  }
  next();
};

exports.listProducts = wrap(async (req, res) => {
  const items = await Product.find({ tenantId: req.tenantId, sellerId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

exports.createProduct = wrap(async (req, res, next) => {
  const plan = await Plan.findById(req.tenant.plan).lean();
  const count = await Product.countDocuments({ tenantId: req.tenantId });
  if (plan && count >= plan.maxProducts) {
    return bad(res, `Store plan limit reached (${plan.maxProducts} products)`, 403);
  }
  const data = pick(req.body, PRODUCT_FIELDS);
  if (data.categoryId) {
    if (!validId(data.categoryId) || !(await Category.exists({ _id: data.categoryId, tenantId: req.tenantId }))) {
      return bad(res, 'Category not found', 404);
    }
  } else {
    delete data.categoryId;
  }
  try {
    const product = await Product.create({ ...data, tenantId: req.tenantId, sellerId: req.user._id });
    res.status(201).json({ product });
  } catch (err) {
    if (err.name === 'ValidationError' || err.name === 'CastError') return bad(res, err.message);
    next(err);
  }
});

exports.updateProduct = wrap(async (req, res, next) => {
  if (!validId(req.params.id)) return bad(res, 'Product not found', 404);
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId, sellerId: req.user._id });
  if (!product) return bad(res, 'Product not found', 404);
  const data = pick(req.body, PRODUCT_FIELDS);
  if (data.categoryId) {
    if (!validId(data.categoryId) || !(await Category.exists({ _id: data.categoryId, tenantId: req.tenantId }))) {
      return bad(res, 'Category not found', 404);
    }
  } else if ('categoryId' in data) {
    product.categoryId = undefined;
    delete data.categoryId;
  }
  product.set(data);
  try {
    await product.save();
    res.json({ product });
  } catch (err) {
    if (err.name === 'ValidationError' || err.name === 'CastError') return bad(res, err.message);
    next(err);
  }
});

exports.deleteProduct = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Product not found', 404);
  const r = await Product.deleteOne({ _id: req.params.id, tenantId: req.tenantId, sellerId: req.user._id });
  if (!r.deletedCount) return bad(res, 'Product not found', 404);
  res.json({ deleted: true });
});

// FR-SF-10: orders split by seller — each vendor sees only their own items in each order
exports.listOrders = wrap(async (req, res) => {
  const orders = await Order.find({ tenantId: req.tenantId, 'items.sellerId': req.user._id })
    .sort({ createdAt: -1 })
    .lean();
  const items = orders.map((o) => {
    const myItems = o.items.filter((i) => i.sellerId && String(i.sellerId) === String(req.user._id));
    const vendorSubtotal = round(myItems.reduce((s, i) => s + i.price * i.quantity, 0));
    return {
      _id: o._id,
      status: o.status,
      createdAt: o.createdAt,
      shippingAddress: o.shippingAddress,
      items: myItems,
      vendorSubtotal,
    };
  });
  res.json({ items });
});
