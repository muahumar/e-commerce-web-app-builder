const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

const reviewSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
    approved: { type: Boolean, default: false }, // moderation (FR-CA-06)
  },
  { timestamps: true }
);

reviewSchema.plugin(tenantScope);
reviewSchema.index({ tenantId: 1, productId: 1, approved: 1 });
reviewSchema.index({ tenantId: 1, productId: 1, customerId: 1 }, { unique: true });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
