const mongoose = require('mongoose');

// Platform-level pool of store templates (FR-SA-08). No tenantId.
const themeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: String,
    previewImage: String,
    // customizable options a Client Admin may pick from (FR-CA-07)
    options: {
      colorPalettes: [{ name: String, primary: String, secondary: String }],
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Theme || mongoose.model('Theme', themeSchema);
