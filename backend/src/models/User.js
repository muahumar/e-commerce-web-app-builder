const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

const ROLES = ['superadmin', 'clientadmin', 'cashier', 'vendor', 'customer'];

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ROLES, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // vendors start 'pending' until approved by Client Admin (FR-CA-13); others 'active'
    status: { type: String, enum: ['active', 'pending', 'rejected', 'removed'], default: 'active' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// tenantId required for every role except superadmin (null). Super Admin queries use
// { tenantId: null } explicitly.
userSchema.plugin(tenantScope, { optionalWhen: (doc) => doc.role === 'superadmin', allowNull: true });

userSchema.pre('validate', function () {
  if (this.role === 'superadmin' && this.tenantId) this.invalidate('tenantId', 'Super Admin must not belong to a tenant');
});

// Email unique per tenant; superadmins all share tenantId=null so they are globally unique.
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
