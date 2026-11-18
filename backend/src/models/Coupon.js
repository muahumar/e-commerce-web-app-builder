const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    expiryDate: Date,
    usageLimit: { type: Number, min: 0 }, // undefined = unlimited
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.plugin(tenantScope);
couponSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
