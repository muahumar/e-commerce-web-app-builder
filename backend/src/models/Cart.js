const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

// Persistent cart (FR-SF-04). Owned by a logged-in customer or an anonymous guest session.
const cartSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    guestToken: { type: String },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, min: 1 },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

cartSchema.plugin(tenantScope);
cartSchema.index({ tenantId: 1, customerId: 1 }, { unique: true, partialFilterExpression: { customerId: { $type: 'objectId' } } });
cartSchema.index({ tenantId: 1, guestToken: 1 }, { unique: true, partialFilterExpression: { guestToken: { $type: 'string' } } });

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
