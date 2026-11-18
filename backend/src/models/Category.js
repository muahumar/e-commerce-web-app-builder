const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 }, // display order on storefront (FR-CA-03)
  },
  { timestamps: true }
);

categorySchema.plugin(tenantScope);
categorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
