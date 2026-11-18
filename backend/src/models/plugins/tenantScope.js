/**
 * tenantScope plugin - enforces shared-schema multi-tenancy at the model layer.
 *
 * 1. Adds an indexed `tenantId` (ref Tenant). Required unless `optionalWhen` says otherwise
 *    (Users: Super Admin has tenantId = null).
 * 2. Installs query/aggregate guards: any read/update/delete whose filter does not
 *    explicitly pin `tenantId` to a concrete value (ObjectId/string, or null where allowed)
 *    THROWS before reaching MongoDB. This makes an unscoped query a loud bug instead of
 *    a silent cross-tenant data leak.
 * 3. Super Admin / platform code can opt out per query with `.setOptions({ skipTenantScope: true })`
 *    (aggregates: `.option({ skipTenantScope: true })`).
 *
 * Usage:  Product.find({ tenantId, ... })   or   Product.find().byTenant(tenantId)
 */
const mongoose = require('mongoose');

const GUARDED_QUERY_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];

function isConcreteTenantValue(v, allowNull) {
  if (v === null) return allowNull;
  if (v === undefined) return false;
  if (v instanceof mongoose.Types.ObjectId) return true;
  if (typeof v === 'string') return mongoose.isValidObjectId(v);
  return false; // operators like { $ne / $in / $exists } are rejected
}

function tenantScope(schema, options = {}) {
  const { optionalWhen = null, allowNull = false } = options;

  const def = {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true,
    required: optionalWhen
      ? function () {
          return !optionalWhen(this);
        }
      : true,
  };
  if (optionalWhen) def.default = null; // only nullable schemas default to null
  schema.add({ tenantId: def });

  schema.query.byTenant = function (tenantId) {
    return this.where({ tenantId });
  };

  GUARDED_QUERY_OPS.forEach((op) => {
    schema.pre(op, function guard() {
      if (this.getOptions().skipTenantScope) return;
      const filter = this.getFilter() || {};
      if (!isConcreteTenantValue(filter.tenantId, allowNull)) {
        throw new Error(
          `[tenantScope] Unscoped ${op} on ${this.model.modelName}: filter must include a concrete tenantId`
        );
      }
    });
  });

  schema.pre('aggregate', function guard() {
    if (this.options && this.options.skipTenantScope) return;
    const first = this.pipeline()[0];
    const match = first && first.$match;
    if (!match || !isConcreteTenantValue(match.tenantId, allowNull)) {
      throw new Error('[tenantScope] Unscoped aggregate: first stage must be $match with a concrete tenantId');
    }
  });
}

module.exports = tenantScope;
