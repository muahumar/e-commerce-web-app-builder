const crypto = require('crypto');
const mongoose = require('mongoose');
const { Theme, Category, Product, Order, Coupon, Review, Cart, User } = require('../models');
const { sendMail } = require('../utils/mailer');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const validId = (id) => mongoose.isValidObjectId(id);
const round = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === 'sk_test_...') return null;
  return require('stripe')(key);
}

/* ============================ Storefront Info & Catalog (FR-SF-02, 03, 11) ============================ */

exports.getStorefront = wrap(async (req, res) => {
  const [categories, theme] = await Promise.all([
    Category.find({ tenantId: req.tenantId }).sort({ order: 1, createdAt: 1 }).lean(),
    req.tenant.theme ? Theme.findById(req.tenant.theme).lean() : null,
  ]);
  res.json({
    store: {
      businessName: req.tenant.businessName,
      subdomain: req.tenant.subdomain,
      settings: req.tenant.settings || {},
      features: req.tenant.features || {},
      theme: theme ? { name: theme.name, colorPalettes: (theme.options && theme.options.colorPalettes) || [] } : null,
    },
    categories,
  });
});

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { ratingAvg: -1, ratingCount: -1 },
};

exports.listProducts = wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const filter = { tenantId: req.tenantId, published: true };

  if (req.query.q) {
    const rx = new RegExp(esc(req.query.q), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }
  if (req.query.categoryId && validId(req.query.categoryId)) filter.categoryId = req.query.categoryId;
  if (req.query.sellerId && validId(req.query.sellerId)) filter.sellerId = req.query.sellerId;

  const minP = req.query.minPrice !== undefined ? Number(req.query.minPrice) : null;
  const maxP = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : null;
  if ((minP !== null && !Number.isNaN(minP)) || (maxP !== null && !Number.isNaN(maxP))) {
    filter.price = {};
    if (minP !== null && !Number.isNaN(minP)) filter.price.$gte = minP;
    if (maxP !== null && !Number.isNaN(maxP)) filter.price.$lte = maxP;
  }

  const sort = SORTS[req.query.sort] || SORTS.newest;
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  // attach seller names when multi-vendor is enabled
  let sellers = {};
  if (req.tenant.features && req.tenant.features.multiVendor) {
    const sellerIds = [...new Set(items.map((p) => p.sellerId && String(p.sellerId)).filter(Boolean))];
    if (sellerIds.length) {
      const users = await User.find({ tenantId: req.tenantId, _id: { $in: sellerIds } }).select('name').lean();
      sellers = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
    }
  }

  res.json({
    items: items.map((p) => ({
      ...p,
      ...(p.sellerId && sellers[String(p.sellerId)] ? { sellerName: sellers[String(p.sellerId)] } : {}),
    })),
    total,
    page,
    limit,
  });
});

exports.getProduct = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Product not found', 404);
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId, published: true }).lean();
  if (!product) return bad(res, 'Product not found', 404);

  let sellerName = null;
  if (product.sellerId && req.tenant.features && req.tenant.features.multiVendor) {
    const seller = await User.findOne({ _id: product.sellerId, tenantId: req.tenantId }).select('name').lean();
    if (seller) sellerName = seller.name;
  }

  let reviews = [];
  if (!req.tenant.features || req.tenant.features.reviews !== false) {
    const rawReviews = await Review.find({ tenantId: req.tenantId, productId: product._id, approved: true })
      .sort({ createdAt: -1 })
      .lean();
    const custIds = [...new Set(rawReviews.map((r) => String(r.customerId)))];
    const users = custIds.length ? await User.find({ tenantId: req.tenantId, _id: { $in: custIds } }).select('name').lean() : [];
    const byId = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
    reviews = rawReviews.map((r) => ({ ...r, customerName: byId[String(r.customerId)] || 'Customer' }));
  }

  res.json({ product: { ...product, ...(sellerName ? { sellerName } : {}) }, reviews });
});

/* ============================ Persistent Cart (FR-SF-04) ============================ */

function cartOwnerFilter(req) {
  if (req.user) return { tenantId: req.tenantId, customerId: req.user._id };
  const guestToken = req.headers['x-guest-token'] && String(req.headers['x-guest-token']).trim();
  if (guestToken) return { tenantId: req.tenantId, guestToken };
  return null;
}

async function hydrateCart(req, cart) {
  if (!cart || !cart.items.length) return { items: [], subtotal: 0 };
  const ids = cart.items.map((i) => i.productId);
  const products = await Product.find({ tenantId: req.tenantId, _id: { $in: ids }, published: true }).lean();
  const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));

  const items = [];
  let subtotal = 0;
  for (const item of cart.items) {
    const p = byId[String(item.productId)];
    if (!p) continue;
    const qty = Math.min(item.quantity, Math.max(0, p.stock));
    if (qty <= 0) continue;
    const lineTotal = round(p.price * qty);
    subtotal += lineTotal;
    items.push({
      productId: p._id,
      name: p.name,
      price: p.price,
      stock: p.stock,
      image: (p.images && p.images[0]) || null,
      sellerId: p.sellerId || null,
      quantity: qty,
      lineTotal,
    });
  }
  return { items, subtotal: round(subtotal) };
}

exports.getCart = wrap(async (req, res) => {
  const filter = cartOwnerFilter(req);
  if (!filter) return bad(res, 'Provide an Authorization token or x-guest-token header');
  const cart = await Cart.findOne(filter).lean();
  res.json(await hydrateCart(req, cart));
});

exports.addToCart = wrap(async (req, res) => {
  const filter = cartOwnerFilter(req);
  if (!filter) return bad(res, 'Provide an Authorization token or x-guest-token header');
  const { productId, quantity = 1 } = req.body || {};
  const qty = parseInt(quantity, 10);
  if (!validId(productId) || !Number.isInteger(qty) || qty < 1) return bad(res, 'Valid productId and positive quantity required');

  const product = await Product.findOne({ _id: productId, tenantId: req.tenantId, published: true }).lean();
  if (!product) return bad(res, 'Product not found', 404);
  if (product.stock < 1) return bad(res, 'Product is out of stock', 409);

  let cart = await Cart.findOne(filter);
  if (!cart) cart = new Cart({ ...filter, items: [] });

  const existing = cart.items.find((i) => String(i.productId) === String(product._id));
  const nextQty = (existing ? existing.quantity : 0) + qty;
  if (nextQty > product.stock) return bad(res, `Only ${product.stock} left in stock`, 409);

  if (existing) existing.quantity = nextQty;
  else cart.items.push({ productId: product._id, quantity: nextQty });
  await cart.save();
  res.json(await hydrateCart(req, cart));
});

exports.updateCartItem = wrap(async (req, res) => {
  const filter = cartOwnerFilter(req);
  if (!filter) return bad(res, 'Provide an Authorization token or x-guest-token header');
  const { productId } = req.params;
  const qty = parseInt((req.body || {}).quantity, 10);
  if (!validId(productId) || Number.isNaN(qty) || qty < 0) return bad(res, 'Valid productId and non-negative quantity required');

  const cart = await Cart.findOne(filter);
  if (!cart) return res.json({ items: [], subtotal: 0 });

  if (qty === 0) {
    cart.items = cart.items.filter((i) => String(i.productId) !== String(productId));
  } else {
    const product = await Product.findOne({ _id: productId, tenantId: req.tenantId, published: true }).lean();
    if (!product) return bad(res, 'Product not found', 404);
    if (qty > product.stock) return bad(res, `Only ${product.stock} left in stock`, 409);
    const existing = cart.items.find((i) => String(i.productId) === String(productId));
    if (existing) existing.quantity = qty;
    else cart.items.push({ productId, quantity: qty });
  }
  await cart.save();
  res.json(await hydrateCart(req, cart));
});

exports.removeCartItem = wrap(async (req, res) => {
  const filter = cartOwnerFilter(req);
  if (!filter) return bad(res, 'Provide an Authorization token or x-guest-token header');
  const cart = await Cart.findOne(filter);
  if (!cart) return res.json({ items: [], subtotal: 0 });
  cart.items = cart.items.filter((i) => String(i.productId) !== String(req.params.productId));
  await cart.save();
  res.json(await hydrateCart(req, cart));
});

exports.clearCart = wrap(async (req, res) => {
  const filter = cartOwnerFilter(req);
  if (!filter) return bad(res, 'Provide an Authorization token or x-guest-token header');
  await Cart.deleteOne(filter);
  res.json({ items: [], subtotal: 0 });
});

/* ============================ Coupons & Checkout (FR-SF-05, 06, 07) ============================ */

async function evaluateCoupon(tenantId, code, subtotal) {
  const normalized = String(code || '').toUpperCase().trim();
  if (!normalized) return { error: 'Coupon code is required' };
  const coupon = await Coupon.findOne({ tenantId, code: normalized, active: true });
  if (!coupon) return { error: 'Invalid coupon code' };
  if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) return { error: 'Coupon has expired' };
  if (coupon.usageLimit !== undefined && coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { error: 'Coupon usage limit reached' };
  }
  const rawDiscount = coupon.discountType === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
  const discountAmount = round(Math.min(subtotal, Math.max(0, rawDiscount)));
  const totalAmount = round(Math.max(0, subtotal - discountAmount));
  return { coupon, discountAmount, totalAmount };
}

exports.validateCoupon = wrap(async (req, res) => {
  const { code } = req.body || {};
  let subtotal = Number((req.body || {}).subtotal);
  if (Number.isNaN(subtotal) || subtotal <= 0) {
    const filter = cartOwnerFilter(req);
    const cart = filter ? await Cart.findOne(filter).lean() : null;
    subtotal = (await hydrateCart(req, cart)).subtotal;
  }
  const r = await evaluateCoupon(req.tenantId, code, subtotal);
  if (r.error) return bad(res, r.error);
  res.json({
    valid: true,
    code: r.coupon.code,
    discountType: r.coupon.discountType,
    value: r.coupon.value,
    discountAmount: r.discountAmount,
    totalAmount: r.totalAmount,
  });
});

async function computeCheckout(req, couponCode) {
  const filter = cartOwnerFilter(req);
  if (!filter) return { error: 'Provide an Authorization token or x-guest-token header', status: 400 };
  const cart = await Cart.findOne(filter).lean();
  const hydrated = await hydrateCart(req, cart);
  if (!hydrated.items.length) return { error: 'Your cart is empty', status: 400 };

  let discountAmount = 0;
  let totalAmount = hydrated.subtotal;
  let coupon = null;
  if (couponCode) {
    const c = await evaluateCoupon(req.tenantId, couponCode, hydrated.subtotal);
    if (c.error) return { error: c.error, status: 400 };
    coupon = c.coupon;
    discountAmount = c.discountAmount;
    totalAmount = c.totalAmount;
  }
  return { filter, hydrated, coupon, discountAmount, totalAmount };
}

exports.createCheckoutIntent = wrap(async (req, res) => {
  const { couponCode } = req.body || {};
  const calc = await computeCheckout(req, couponCode);
  if (calc.error) return bad(res, calc.error, calc.status);

  const stripe = getStripe();
  const amountCents = Math.max(50, Math.round(calc.totalAmount * 100)); // Stripe minimum is 50 cents
  if (stripe && calc.totalAmount > 0) {
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { tenantId: String(req.tenantId), subdomain: req.tenant.subdomain },
    });
    return res.json({
      stripeMode: 'stripe',
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      subtotal: calc.hydrated.subtotal,
      discountAmount: calc.discountAmount,
      totalAmount: calc.totalAmount,
    });
  }

  // Test-mode fallback when STRIPE_SECRET_KEY is not configured
  const paymentIntentId = `pi_test_${crypto.randomBytes(12).toString('hex')}`;
  res.json({
    stripeMode: 'test_stub',
    paymentIntentId,
    clientSecret: `${paymentIntentId}_secret_test`,
    subtotal: calc.hydrated.subtotal,
    discountAmount: calc.discountAmount,
    totalAmount: calc.totalAmount,
  });
});

exports.confirmCheckout = wrap(async (req, res) => {
  const { shippingAddress, guestEmail, couponCode, paymentIntentId } = req.body || {};
  if (!shippingAddress || !shippingAddress.name || !shippingAddress.line1 || !shippingAddress.city) {
    return bad(res, 'shippingAddress (name, line1, city) is required');
  }
  if (!req.user && (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(guestEmail)))) {
    return bad(res, 'Valid guestEmail is required for guest checkout');
  }
  if (!paymentIntentId) return bad(res, 'paymentIntentId is required');

  const calc = await computeCheckout(req, couponCode);
  if (calc.error) return bad(res, calc.error, calc.status);

  const stripe = getStripe();
  if (stripe && calc.totalAmount > 0 && !String(paymentIntentId).startsWith('pi_test_')) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return bad(res, `Payment not completed (status: ${intent.status})`, 402);
    }
  }

  // Atomically decrement stock for each item
  const decremented = [];
  for (const item of calc.hydrated.items) {
    const updated = await Product.findOneAndUpdate(
      { _id: item.productId, tenantId: req.tenantId, published: true, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true }
    );
    if (!updated) {
      // Roll back previously decremented items
      for (const prev of decremented) {
        await Product.updateOne({ _id: prev.productId, tenantId: req.tenantId }, { $inc: { stock: prev.quantity } });
      }
      return bad(res, `Insufficient stock for ${item.name}`, 409);
    }
    decremented.push(item);
  }

  if (calc.coupon) {
    await Coupon.updateOne({ _id: calc.coupon._id, tenantId: req.tenantId }, { $inc: { usedCount: 1 } });
  }

  const order = await Order.create({
    tenantId: req.tenantId,
    customerId: req.user ? req.user._id : undefined,
    guestEmail: req.user ? undefined : String(guestEmail).toLowerCase().trim(),
    items: calc.hydrated.items.map((i) => ({
      productId: i.productId,
      sellerId: i.sellerId || undefined,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
    shippingAddress,
    subtotal: calc.hydrated.subtotal,
    discountAmount: calc.discountAmount,
    couponCode: calc.coupon ? calc.coupon.code : undefined,
    totalAmount: calc.totalAmount,
    status: 'pending',
    paymentId: paymentIntentId,
    source: 'online',
  });

  await Cart.deleteOne(calc.filter);

  const recipient = req.user ? req.user.email : order.guestEmail;
  await sendMail({
    to: recipient,
    subject: `Order confirmed — ${req.tenant.businessName} (#${String(order._id).slice(-6)})`,
    text: `Thank you for your order!\nTotal: $${order.totalAmount.toFixed(2)}\nItems:\n${order.items.map((i) => `- ${i.quantity}x ${i.name} ($${i.price})`).join('\n')}`,
  });

  res.status(201).json({ order });
});

/* ============================ Customer Order History & Reviews (FR-SF-08, 09) ============================ */

exports.listMyOrders = wrap(async (req, res) => {
  const items = await Order.find({ tenantId: req.tenantId, customerId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

exports.getMyOrder = wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Order not found', 404);
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenantId, customerId: req.user._id }).lean();
  if (!order) return bad(res, 'Order not found', 404);
  res.json({ order });
});

exports.submitReview = wrap(async (req, res) => {
  if (req.tenant.features && req.tenant.features.reviews === false) {
    return bad(res, 'Reviews are disabled for this store', 403);
  }
  const { id } = req.params;
  if (!validId(id)) return bad(res, 'Product not found', 404);
  const product = await Product.findOne({ _id: id, tenantId: req.tenantId, published: true }).lean();
  if (!product) return bad(res, 'Product not found', 404);

  const rating = Number((req.body || {}).rating);
  const comment = (req.body || {}).comment;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return bad(res, 'rating must be an integer 1..5');

  // FR-SF-09: only customers who purchased the product (non-cancelled order) can review
  const purchased = await Order.exists({
    tenantId: req.tenantId,
    customerId: req.user._id,
    status: { $ne: 'cancelled' },
    'items.productId': product._id,
  });
  if (!purchased) return bad(res, 'You can only review products you have purchased', 403);

  try {
    const review = await Review.create({
      tenantId: req.tenantId,
      productId: product._id,
      customerId: req.user._id,
      rating,
      comment,
      approved: false, // awaits Client Admin moderation
    });
    res.status(201).json({ review });
  } catch (err) {
    if (err.code === 11000) return bad(res, 'You have already reviewed this product', 409);
    throw err;
  }
});
