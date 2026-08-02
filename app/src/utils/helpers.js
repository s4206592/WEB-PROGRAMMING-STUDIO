const crypto = require('crypto');

/** URL-safe slug. Handles Vietnamese diacritics. */
function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'item';
}

/** Slug + short random suffix, so two "Godox SL60W" listings never collide. */
function uniqueSlug(text) {
  return `${slugify(text)}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Money is stored as integer VND. 1250000 → "1,250,000₫" */
function formatVND(amount) {
  const n = Math.round(Number(amount) || 0);
  return n.toLocaleString('en-US') + '₫';
}

/** Parse a money field from a form: strips commas, dots and the ₫ sign. */
function parseVND(input) {
  const n = parseInt(String(input == null ? '' : input).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-GB');
}

function stars(rating) {
  const r = Math.round(Number(rating) || 0);
  return '★'.repeat(Math.min(5, r)) + '☆'.repeat(Math.max(0, 5 - r));
}

function orderNumber(seq) {
  const year = new Date().getFullYear();
  return `ST-${year}-${String(seq).padStart(6, '0')}`;
}

/** Wrap an async route handler so rejections reach the Express error handler. */
function asyncH(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isObjectId(v) {
  return /^[a-f\d]{24}$/i.test(String(v || ''));
}

const CONDITION_LABELS = {
  new: 'New', like_new: 'Like new', good: 'Good', fair: 'Fair', for_parts: 'For parts'
};

const VN_PROVINCES = [
  'Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
  'Bình Dương', 'Đồng Nai', 'Khánh Hòa', 'Lâm Đồng', 'Thừa Thiên Huế', 'Other'
];

/**
 * These three read the same values as the Mongoose virtuals of the same name,
 * but work on plain objects too. `.lean()` strips virtuals, so views call
 * these helpers rather than the virtuals — one code path for both shapes.
 */
function primaryImage(product) {
  if (!product || !product.media || !product.media.length) return null;
  const p = product.media.find(m => m.isPrimary) || product.media[0];
  return p ? p.url : null;
}

function availableQty(product) {
  if (!product) return 0;
  return Math.max(0, (product.quantity || 0) - (product.quantitySold || 0));
}

function daysRemaining(order) {
  const rw = order && order.returnWindow;
  if (!rw || rw.status !== 'open' || !rw.closesAt) return null;
  const ms = new Date(rw.closesAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

module.exports = {
  slugify, uniqueSlug, formatVND, parseVND, timeAgo, stars,
  orderNumber, asyncH, isObjectId, CONDITION_LABELS, VN_PROVINCES,
  primaryImage, availableQty, daysRemaining
};
