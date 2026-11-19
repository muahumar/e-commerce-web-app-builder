const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '..', '..', 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

/**
 * Local-disk image storage. To use Cloudinary/S3 later, replace the body of saveImage()
 * so it uploads the buffer and returns the remote URL; callers only use the returned URL.
 * Returns a path like /uploads/<tenantId>/<random>.png (served by express.static).
 */
async function saveImage(tenantId, file) {
  const ext = EXT[file.mimetype];
  if (!ext) {
    const err = new Error('Only JPEG, PNG, WebP or GIF images are allowed');
    err.status = 400;
    throw err;
  }
  const dir = path.join(UPLOAD_ROOT, String(tenantId));
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}${ext}`;
  await fs.writeFile(path.join(dir, name), file.buffer);
  return `/uploads/${tenantId}/${name}`;
}

module.exports = { saveImage, UPLOAD_ROOT };
