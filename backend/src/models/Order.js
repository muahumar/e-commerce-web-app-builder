const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // for per-seller split (FR-SF-10)
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // absent for guest checkout
    guestEmail: { type: String, lowercase: true, trim: true },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    shippingAddress: { name: String, line1: String, city: String, postalCode: String, country: String, phone: String },
    subtotal: { type: Number, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    couponCode: String,
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    paymentId: String, // Stripe payment intent id; no card data stored
    source: { type: String, enum: ['online', 'pos'], default: 'online' },
  },
  { timestamps: true }
);

orderSchema.plugin(tenantScope);
orderSchema.index({ tenantId: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, customerId: 1 });
orderSchema.index({ tenantId: 1, status: 1 });
orderSchema.index({ tenantId: 1, 'items.sellerId': 1 });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
