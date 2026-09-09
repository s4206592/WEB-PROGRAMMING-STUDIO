# StudioTrade — Optimised, Module-Independent Database Schema

**Stack assumption:** Node.js + Express + Mongoose + MongoDB Atlas.

## 1. Design goal: modules survive each other's failure

MongoDB has no enforced foreign keys or joins by default, which is an advantage here — we lean into it rather than fight it. The schema follows four hard rules everywhere a document from one module needs data owned by another module:

| Rule | What it means in practice |
|---|---|
| **1. Denormalized snapshots, not live joins** | Any cross-module reference stores a small cached copy (`xSnapshot: { title, image, username, ... }`) alongside the raw `ObjectId`. Pages render from the snapshot first; they never `.populate()` across module boundaries on the critical render path. |
| **2. Soft references only** | Cross-module IDs are plain `ObjectId`/`String` fields with **no `ref` + `required` validation** and no Mongo-level `$lookup` in request-time code. A missing/deleted target collection just means the ID doesn't resolve — it never throws. |
| **3. No cascading deletes** | Deleting/dropping a module's collections (e.g. `reviews`) never triggers writes to another module's collections (e.g. `products`). Aggregate numbers like `ratingSummary` on a product are a *cache*, refreshed opportunistically, not a dependency. |
| **4. Query-level fallbacks** | Every controller that reads another module's collection wraps the call and falls back to `[]` / `null` / the cached snapshot. A blank Reviews collection renders "No reviews yet," not a 500 error. |

Only two collections are genuinely load-bearing for the whole app: **`users`** (auth) and **`products`** (listings) — every other module treats even these as "may be stale/missing" via snapshots.

## 1b. Changes in this pass

- **`users.phone` is now required** (previously optional). The registration form requires it too. **Known issue:** `seed/seed.js` was not updated to match — it creates the admin account and the 2 sample users without a `phone` value, which now fails Mongoose's required-field validation. Confirmed with `.validateSync()` (no DB needed): all three fail with `phone: Path 'phone' is required.` This needs a fix before `npm run seed` will work.
- **`offers` collection is gone.** Negotiation now lives directly on `conversations` (see §8) — the seller "confirms" a price in-chat rather than there being a separate offer/accept/decline/counter object.
- **`orders`**: checkout now creates one order per seller from a multi-seller cart (previously one order for the whole cart). Fulfillment is now entirely seller-driven (`confirmed` → `shipped` → `delivered`), replacing the old buyer-facing "simulate delivery" demo button. `payment.method` is restricted to `'cod'` (cash on delivery only) — `status` only ever moves to `'paid'` when the seller marks the order delivered. The `status` enum still lists `received`, `disputed`, and `completed`, but no route sets any of them anymore — they're unused legacy values, not deleted from the schema.
- **Review eligibility changed**: unlocked by order `status === 'delivered'` (seller-confirmed), not `'received'` (there's no buyer "mark received" step anymore).
- **New: Studio Map module** (§6b) — studio listings with owner submission, admin approval/rejection, resubmission after rejection, and their own review collection (`studioReviews`, separate from product `reviews`).
- **`moderationFlags.targetType`** enum expanded to include `'studio'` and `'studio_review'`.
- **Explicit collection names** are now used for two model pairs — `Conversation`/`Message` map to `chatConversations`/`chatMessages`, and `Studio`/`StudioReview` map to `studioListings`/`studioReviews` — rather than Mongoose's default pluralized-model-name collections. This is deliberate: the shared MongoDB cluster already has `conversations`/`messages`/`studios` collections left over from an unrelated, never-wired-in earlier schema (with their own indexes, e.g. a unique `slug` index on `studios`), and giving the real models their own collection names sidesteps any collision without needing to drop indexes on data nobody on this team created.

## 2. Core / Shared backbone

### `users`
```js
{
  _id, username, email,
  phone: { type: String, required: true, unique: true, sparse: true }, // now required
  passwordHash,
  role: { type: String, enum: ['buyer_seller','moderator','staff','admin'], default: 'buyer_seller' },
  profile: { displayName, avatarUrl, bio },
  contact: { address, city },
  reputation: { score: Number, badges: [String] },
  status: { type: String, enum: ['active','suspended'], default: 'active' },
  sampleData: { type: Boolean, default: false },
  createdAt
}
// indexes: { username: 1 } unique, { email: 1 } unique, { phone: 1 } unique (sparse)
```

### `products` (listings)
```js
{
  _id, sellerId, sellerSnapshot: { username, avatarUrl, reputationScore },
  title, description, category, tags: [String],
  condition: { type: String, enum: ['new','secondhand'] },
  images: [String],
  pricing: { listPrice: Number, currency: 'VND', negotiable: Boolean },
  quantityAvailable: Number,
  status: { type: String, enum: ['active','pending','sold','removed'], default: 'active' },
  ratingSummary: { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  viewCount: { type: Number, default: 0 },
  sampleData: { type: Boolean, default: false },
  createdAt
}
// indexes: { sellerId: 1 }, { category: 1, status: 1 }, text index on title+description+tags
```

### `passwordResetTokens`
```js
{ _id, userId, token: String, expiresAt: Date, used: { type: Boolean, default: false }, createdAt }
```

---

## 3. Shopping Cart & Checkout module (Nguyen Duy Dang Phong)

### `carts`
```js
{ _id, userId, items: [{ productId, productSnapshot: { title, image, price, sellerId, sellerName }, quantity, addedAt }], updatedAt }
// index: { userId: 1 } unique
```

### `orders`
```js
{
  _id, orderNumber, buyerId, buyerSnapshot: { username, contact },
  items: [{ productId, productSnapshot: { title, image, sellerId, sellerName }, quantity, priceAtPurchase }],
  delivery: { address, contactPhone, shippingMethod },
  payment: { method: { type: String, enum: ['cod'], default: 'cod' }, status: { type: String, enum: ['pending','paid','failed'], default: 'pending' } },
  totals: { subtotal, shippingFee, total },
  status: { type: String, enum: ['placed','confirmed','shipped','delivered','received','cancelled','disputed','completed'], default: 'placed' },
  // 'received'/'disputed'/'completed' are unused by any current route — kept for future use
  deliveryMilestones: [{ stage: String, at: Date }],
  returnWindow: { deliveredAt: Date, eligibleUntil: Date, disputeRaised: { type: Boolean, default: false } },
  createdAt
}
// indexes: { buyerId: 1, createdAt: -1 }, { orderNumber: 1 } unique, { 'items.productId': 1 }, { 'items.productSnapshot.sellerId': 1 } (seller's "selling" dashboard)
```
Checkout splits a multi-seller cart into one order per seller. Fulfillment (confirm/ship/mark-delivered) is a seller action on their own order, not a buyer one. Marking an order delivered is what: decrements `product.quantityAvailable` (marks the product `sold` at zero), sets `payment.status` to `paid` (cash-on-delivery — this is the real moment money changes hands), opens the 15-day `returnWindow`, and unlocks the buyer's review for that product. Placing an order also best-effort opens a buyer↔seller `conversation` for that order (see §8) — checkout still succeeds if the Chat module is unavailable.

---

## 4. Product Review & Rating module (Tran Hong Minh)

### `reviews`
```js
{
  _id, productId, productSnapshot: { title, image }, orderId,
  reviewerId, reviewerSnapshot: { username, avatarUrl },
  rating: { type: Number, min: 1, max: 5 }, title, comment, media: [String],
  helpfulVotes: { type: Number, default: 0 },
  status: { type: String, enum: ['published','flagged','removed'], default: 'published' },
  createdAt
}
// indexes: { productId: 1, rating: -1 }, { reviewerId: 1 }
```
Eligibility to review is gated on the buyer having an order **`status: 'delivered'`** containing that product — set by the seller, not the buyer. `products.ratingSummary` is a best-effort cache refreshed on write.

---

## 5. Wishlist module (Truong Gia Bao + Mai Thanh Ngu, shared)

### `wishlists`
```js
{ _id, userId, items: [{ productId, productSnapshot: { title, image, price, sellerName, availability }, priceHistory: [{ price, at }], inspectionNotes, addedAt }] }
// index: { userId: 1 } unique
```

### `savedSearches`
```js
{
  _id, userId,
  queryParams: { q, category, condition, minPrice, maxPrice },
  label: String,
  alertsEnabled: { type: Boolean, default: true },
  lastNotifiedAt, createdAt
}
// index: { userId: 1 }
```
`alertsEnabled`/`lastNotifiedAt` are reserved for a future alert job — not wired to anything yet.

---

## 6. Discussion Forum & FAQ module (Truong Gia Bao)

### `faqs`
```js
{ _id, category, question, answer, order: Number }
```

### `forumPosts` / `forumReplies`
```js
{ _id, authorId, authorSnapshot: { username }, title, body, tags: [String], upvotes, status: { type: String, enum: ['active','flagged','removed'] }, createdAt }
{ _id, postId, postSnapshot: { title }, authorId, authorSnapshot: { username }, body, votes, createdAt }
```

---

## 6b. Studio Map module (extra — sub-feature of Discussion Forum, not part of the assigned module list)

Registered as its own route file/module (`studio.routes.js`) under `/forum/studios/*`, but loaded **before** `forum.routes.js` in `server.js` — `forum.routes.js`'s catch-all `GET /forum/:id` would otherwise intercept `/forum/studios` first, since Express matches mounted routers in registration order.

### `studios` (collection: `studioListings`)
```js
{
  _id, ownerId, ownerSnapshot: { username, avatarUrl },
  ownerContact: { businessName, phone, contactEmail },
  name, description, equipmentHighlights: [String], photos: [String],
  rates: { hourly, daily },
  location: {
    // Server-confirmed via Nominatim (OpenStreetMap) reverse geocoding —
    // never trusted from free text, only from a client-picked lat/lng.
    formattedAddress: { type: String, required: true }, osmId: String,
    lat: { type: Number, required: true }, lng: { type: Number, required: true }
  },
  status: { type: String, enum: ['pending_review','approved','rejected'], default: 'pending_review' },
  reviewNote, reviewedBy, reviewedAt,
  reviewHistory: [{ action: { type: String, enum: ['submitted','resubmitted','approved','rejected'] }, note, byId, at }],
  ratingSummary: { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  createdAt
}
// index: { status: 1, createdAt: -1 }
```

### `studioReviews` (collection: `studioReviews`)
```js
{
  _id, studioId, studioSnapshot: { name, photo },
  reviewerId, reviewerSnapshot: { username, avatarUrl },
  rating: { type: Number, min: 1, max: 5 }, title, comment,
  status: { type: String, enum: ['published','flagged','removed'], default: 'published' },
  createdAt
}
// index: { studioId: 1, createdAt: -1 }
```
A **separate** collection from `reviews` — studio ratings do not reuse the Product Review and Rating module's collection, only the same UI/aggregation pattern (best-effort `ratingSummary` cache refresh on write). A rejected studio can be edited by its owner, which automatically re-enters `pending_review` and appends a `resubmitted` entry to `reviewHistory`.

---

## 7. Blog module (Mai Thanh Ngu)

### `blogPosts` / `blogComments`
```js
{ _id, authorId, authorSnapshot: { username }, title, category, coverImage, body, status: { type: String, enum: ['pending_review','published','rejected'] }, publishedAt, viewCount, createdAt }
{ _id, postId, postSnapshot: { title }, authorId, authorSnapshot: { username }, body, createdAt }
```

---

## 8. Chat & Negotiation (extra — not part of the assigned module list; replaces the earlier separate `offers` design)

### `conversations` (collection: `chatConversations`)
```js
{
  _id,
  participantIds: [ObjectId],           // exactly 2, stored [buyer, seller]
  participantSnapshots: [{ userId, username }],
  relatedProductId, relatedProductSnapshot: { title, image, listPrice },
  relatedOrderId,                        // set when auto-opened from checkout rather than negotiation
  negotiation: { agreedPrice: Number, confirmedAt: Date }, // the seller "closing the deal" IS this field — no separate offer object
  lastMessageAt, lastMessagePreview, createdAt
}
// index: { participantIds: 1, lastMessageAt: -1 }
```

### `messages` (collection: `chatMessages`)
```js
{ _id, conversationId, senderId, senderSnapshot: { username }, body, sentAt }
// index: { conversationId: 1, sentAt: 1 }
```
No websockets — the conversation view polls `GET /messages/:id/poll` every ~4 seconds for messages newer than the last one seen. Checkout can pull a single item at the conversation's `negotiation.agreedPrice` (`GET /messages/:id/checkout`), re-verified server-side against the conversation document, never trusted from the submitted form.

---

## 9. Notification Center (shared, purely additive)

### `notifications`
```js
{ _id, userId, type, title, body, linkUrl, isRead: { type: Boolean, default: false }, createdAt }
// index: { userId: 1, isRead: 1, createdAt: -1 }
```

---

## 10. Administration module (Tran Hong Minh + Mai Thanh Ngu, shared)

### `moderationFlags`
```js
{
  _id,
  targetType: { type: String, enum: ['review','forum_post','forum_reply','blog_post','blog_comment','studio','studio_review'] },
  targetId, targetSnapshot, flaggedBy, reason,
  status: { type: String, enum: ['open','resolved','dismissed'], default: 'open' },
  createdAt
}
```

### `adminAuditLog`
```js
{ _id, adminId, action, targetType, targetId, notes, timestamp }
```

---

## 11. Sitemap module (Nguyen Duy Dang Phong, shared)

No dedicated collection — generated from the Express route registry at request time.

---

## 12. Why this survives the module-independence requirement

- **Broken/missing module UI:** each module has its own router + views folder; none import another module's controller code, only the shared `db` connection and, at most, a read-only snapshot field it already owns.
- **Dropped collections:** every cross-module link is a snapshot + soft `ObjectId`, so dropping e.g. `reviews`, `forumPosts`, `chatConversations`, or `studioListings` entirely removes zero fields from any other module's documents — only that module's own pages show an empty state.
- **Core exception (by necessity):** `users` and `products` are the only collections every module reads from.

## 13. Seed state
`npm run seed` creates one admin account, starter FAQ entries, 2 sample users, and 5 sample listings — flagged `sampleData: true` so `npm run unseed` can remove just the sample data later. **Currently broken** — see §1b; the admin/sample-user creation calls don't pass the now-required `phone` field.
