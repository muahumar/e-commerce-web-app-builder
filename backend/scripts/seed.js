/** Seeds demo plans + themes. Usage: npm run seed  (needs MONGO_URI in .env) */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Plan, Theme } = require('../src/models');

const plans = [
  { name: 'Basic', maxProducts: 50, maxAdmins: 2, priceMonthly: 9, commissionPercent: 5, allowedFeatures: { discountBadge: false, multiVendor: false, reviews: true } },
  { name: 'Pro', maxProducts: 1000, maxAdmins: 10, priceMonthly: 29, commissionPercent: 2, allowedFeatures: { discountBadge: true, multiVendor: true, reviews: true } },
];
const themes = [
  { name: 'Classic', description: 'Clean light layout', options: { colorPalettes: [{ name: 'Ocean', primary: '#0369a1', secondary: '#e0f2fe' }, { name: 'Forest', primary: '#166534', secondary: '#dcfce7' }] } },
  { name: 'Bold', description: 'High-contrast dark layout', options: { colorPalettes: [{ name: 'Sunset', primary: '#c2410c', secondary: '#ffedd5' }, { name: 'Violet', primary: '#6d28d9', secondary: '#ede9fe' }] } },
];

(async () => {
  await connectDB();
  for (const p of plans) await Plan.updateOne({ name: p.name }, p, { upsert: true });
  for (const t of themes) await Theme.updateOne({ name: t.name }, t, { upsert: true });
  console.log('Seeded plans and themes');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
