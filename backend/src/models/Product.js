const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    images: [String],
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    description: String,
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // vendor, multi-vendor mode
    variants: [{ name: String, options: [String] }],
    published: { type: Boolean, default: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.plugin(tenantScope);
productSchema.index({ tenantId: 1, categoryId: 1 });
productSchema.index({ tenantId: 1, sellerId: 1 });
productSchema.index({ tenantId: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, name: 'text', description: 'text' });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
