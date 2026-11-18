const mongoose = require('mongoose');
const tenantScope = require('./plugins/tenantScope');

// Audit trail, e.g. Super Admin impersonation (FR-SA-10). tenantId = the tenant affected.
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true }, // e.g. 'impersonate.start'
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.plugin(tenantScope);
auditLogSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
