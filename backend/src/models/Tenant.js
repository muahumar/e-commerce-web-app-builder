const mongoose = require('mongoose');

// The tenant registry itself: no tenantId (it IS the tenant).
const tenantSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, 'Invalid subdomain'],
    },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: { type: String, enum: ['active', 'suspended', 'trial_expired'], default: 'active', index: true },
    theme: { type: mongoose.Schema.Types.ObjectId, ref: 'Theme' },
    // Feature toggles (Client Admin may only enable what the plan allows)
    features: {
      discountBadge: { type: Boolean, default: false },
      multiVendor: { type: Boolean, default: false },
      reviews: { type: Boolean, default: true },
    },
    // Storefront customization (FR-CA-07)
    settings: {
      storeName: String,
      logo: String,
      banner: String,
      colorPalette: String,
      contactPhone: String,
      contactEmail: String,
      contactAddress: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
