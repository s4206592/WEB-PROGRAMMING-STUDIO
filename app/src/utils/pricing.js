const { Product, Offer, Cart } = require('../models');
const { primaryImage, availableQty } = require('./helpers');

/**
 * Resolve the price a buyer actually pays for `quantity` units of a listing.
 *
 * Order of precedence:
 *   1. an accepted, unexpired, cash-settlement offer belonging to this buyer
 *   2. a bulk-pricing tier the quantity crosses
 *   3. the listing price
 *
 * A saved wishlist price NEVER enters this function. wishlists.items.priceAtSave
 * is an alerting baseline, not a price the buyer is entitled to.
 */
async function resolveUnitPrice(product, buyerId, quantity = 1) {
  const offer = await Offer.findOne({
    productId: product._id,
    buyerId,
    status: 'accepted',
    settlement: 'cash_checkout',
    expiresAt: { $gt: new Date() }
  }).lean();

  if (offer && offer.acceptedConsideration?.cash > 0) {
    return {
      unitPrice: Math.round(offer.acceptedConsideration.cash / Math.max(1, offer.quantity || 1)),
      priceSource: 'negotiated',
      offerId: offer._id
    };
  }

  const tiers = (product.bulkPricing || []).filter(t => quantity >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty);
  if (tiers.length) {
    return { unitPrice: tiers[0].unitPrice, priceSource: 'bulk_tier', offerId: null };
  }

  return { unitPrice: product.price, priceSource: 'list', offerId: null };
}

/**
 * Recompute availability and price for every line on the cart.
 * Runs on every cart load and again at Place Order — a stale line must
 * never reach the totals.
 */
async function revalidateCart(cart, buyerId) {
  if (!cart || !cart.items.length) return { cart, changed: false, blocking: false };

  const ids = cart.items.map(i => i.productId).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map(p => [String(p._id), p]));

  let changed = false;
  let blocking = false;

  for (const line of cart.items) {
    const p = byId.get(String(line.productId));

    if (!p || p.status === 'removed' || p.status === 'rejected') {
      if (line.isAvailable !== false) changed = true;
      line.isAvailable = false;
      line.unavailableReason = 'removed';
      blocking = true;
      continue;
    }
    if (p.status === 'sold' || availableQty(p) < 1) {
      line.isAvailable = false;
      line.unavailableReason = 'sold';
      blocking = true;
      changed = true;
      continue;
    }
    if (availableQty(p) < line.quantity) {
      line.quantity = availableQty(p);
      line.isAvailable = true;
      line.unavailableReason = 'out_of_stock';
      blocking = true;
      changed = true;
    }

    const resolved = await resolveUnitPrice(p, buyerId, line.quantity);
    if (resolved.unitPrice !== line.unitPrice) {
      line.unitPrice = resolved.unitPrice;
      line.priceSource = resolved.priceSource;
      line.offerId = resolved.offerId;
      line.unavailableReason = 'price_changed';
      changed = true;
    } else if (line.unavailableReason === 'price_changed') {
      line.unavailableReason = null;
    }

    if (line.isAvailable !== true && !['sold', 'removed', 'out_of_stock'].includes(line.unavailableReason)) {
      line.isAvailable = true;
      changed = true;
    }
    line.titleSnapshot = p.title;
    line.imageSnapshot = primaryImage(p) || line.imageSnapshot;
  }

  if (changed) await cart.save();
  return { cart, changed, blocking };
}

/** Add (or top up) one cart line. Returns { ok, message }. */
async function addToCart({ cart, product, buyerId, quantity, addedFrom, wishlistItemId }) {
  if (String(product.sellerId) === String(buyerId)) {
    return { ok: false, message: 'You cannot buy your own listing.' };
  }
  if (!['active', 'reserved'].includes(product.status)) {
    return { ok: false, message: 'That listing is not available right now.' };
  }
  const existing = cart.items.find(i => String(i.productId) === String(product._id));
  const wanted = (existing ? existing.quantity : 0) + quantity;
  const stock = availableQty(product);
  if (wanted > stock) {
    return { ok: false, message: `Only ${stock} available.` };
  }

  const resolved = await resolveUnitPrice(product, buyerId, wanted);

  if (existing) {
    // Never duplicate a line — top the existing one up.
    existing.quantity = wanted;
    existing.unitPrice = resolved.unitPrice;
    existing.priceSource = resolved.priceSource;
    existing.offerId = resolved.offerId;
    existing.isAvailable = true;
    existing.unavailableReason = null;
  } else {
    cart.items.push({
      productId: product._id,
      sellerId: product.sellerId,
      quantity,
      unitPrice: resolved.unitPrice,
      priceSource: resolved.priceSource,
      offerId: resolved.offerId,
      titleSnapshot: product.title,
      imageSnapshot: primaryImage(product),
      isAvailable: true,
      addedFrom: addedFrom || 'product_page',
      wishlistItemId: wishlistItemId || undefined,
      addedAt: new Date()
    });
  }
  await cart.save();
  return { ok: true, message: 'Added to cart.', priceSource: resolved.priceSource };
}

/** Fetch (or lazily create) the user's single live cart. */
async function getCart(userId) {
  let cart = await Cart.findOne({ userId });
  if (!cart) cart = await Cart.create({ userId, items: [] });
  return cart;
}

module.exports = { resolveUnitPrice, revalidateCart, addToCart, getCart };
