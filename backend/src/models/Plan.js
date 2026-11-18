const mongoose = require('mongoose');

// Platform-level (no tenantId). Defines limits and which features a plan allows (FR-SA-06, FR-SA-11).
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    maxProducts: { type: Number, required: true, min: 0 },
    maxAdmins: { type: Number, required: true, min: 1 },
    priceMonthly: { type: Number, required: true, min: 0 },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    allowedFeatures: {
      discountBadge: { type: Boolean, default: false },
      multiVendor: { type: Boolean, default: false },
      reviews: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Plan || mongoose.model('Plan', planSchema);
