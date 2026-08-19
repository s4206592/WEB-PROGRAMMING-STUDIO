# StudioTrade — Optimised, Module-Independent Database Schema

**Stack assumption:** Node.js + Express + Mongoose + MongoDB Atlas (matches your deployed setup).

## 1. Design goal: modules survive each other's failure

MongoDB has no enforced foreign keys or joins by default, which is an advantage here — we lean into it rather than fight it. The schema follows four hard rules everywhere a document from one module needs data owned by another module:

| Rule | What it means in practice |
|---|---|
| **1. Denormalized snapshots, not live joins** | Any cross-module reference stores a small cached copy (`xSnapshot: { title, image, username, ... }`) alongside the raw `ObjectId`. Pages render from the snapshot first; they never `.populate()` across module boundaries on the critical render path. |
| **2. Soft references only** | Cross-module IDs are plain `ObjectId`/`String` fields with **no `ref` + `required` validation** and no Mongo-level `$lookup` in request-time code. A missing/deleted target collection just means the ID doesn't resolve — it never throws. |
| **3. No cascading deletes** | Deleting/dropping a module's collections (e.g. `reviews`) never triggers writes to another module's collections (e.g. `products`). Aggregate numbers like `ratingSummary` on a product are a *cache*, refreshed opportunistically, not a dependency. |
| **4. Query-level fallbacks** | Every controller that reads another module's collection wraps the call and falls back to `[]` / `null` / the cached snapshot. A blank Reviews collection renders "No reviews yet," not a 500 error. |

Effect: you can `db.reviews.drop()`, `db.forumPosts.drop()`, or comment out an entire module's routes, and Product Listing, Cart, Checkout, Wishlist, etc. keep working, because none of them ever required a live read into the dropped collection to render their own pages.

Only two collections are genuinely load-bearing for the whole app: **`users`** (auth) and **`products`** (listings) — every other module treats even these as "may be stale/missing" via snapshots.

---

## 1b. Added since the first pass: password reset + sample-data flag

**`passwordResetTokens`** — its own collection so the "forgot password" flow (and its future real-email version) can be reworked without touching `users`:
```js
{ _id, userId, token: String, expiresAt: Date, used: { type: Boolean, default: false }, createdAt }
```
Currently the reset link is shown directly on the page instead of emailed (flagged in the UI as temporary). Swapping in real email delivery later only touches the one route that creates this token — the schema doesn't change.

**`sampleData: Boolean`** was added to `users` and `products` (default `false`). Seeded test accounts/listings are flagged `true` so they can be removed later with one query (`deleteMany({ sampleData: true })`) without a manual list of IDs or touching real user data.

## 2. Core / Shared backbone

### `users`
```js
{
  _id, username, email, phone,
  passwordHash,
  role: { type: String, enum: ['buyer_seller','moderator','staff','admin'], default: 'buyer_seller' },
  verification: { emailVerified: Boolean, phoneVerified: Boolean, duplicateCheckPassed: Boolean },
  profile: { displayName, avatarUrl, bio },
  contact: { address, city, phone },
  reputation: { score: Number, badges: [String] },
  status: { type: String, enum: ['active','suspended','banned'], default: 'active' },
  notificationPrefs: { email: Boolean, inApp: Boolean },
  createdAt, updatedAt
}
// indexes: { username: 1 } unique, { email: 1 } unique, { phone: 1 } unique (sparse)
```

### `products` (listings)
```js
{
  _id,
  sellerId,                       // soft ref -> users
  sellerSnapshot: { username, avatarUrl, reputationScore },
  title, description, category, tags: [String],
  condition: { type: String, enum: ['new','secondhand'] },
  images: [String],
  pricing: { listPrice: Number, currency: 'VND', negotiable: Boolean },
  bulk: { available: Boolean, minQty: Number, bulkPrice: Number },
  quantityAvailable: Number,
  status: { type: String, enum: ['active','pending','sold','removed'], default: 'active' },
  // cached rollups, updated best-effort by other modules — never required to exist
  ratingSummary: { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  viewCount: { type: Number, default: 0 },
  createdAt, updatedAt
}
// indexes: { sellerId: 1 }, { category: 1, status: 1 }, text index on title+description+tags
```

### `offers` (Traderie-style negotiation, lives with the listing/PL module)
```js
{
  _id,
  productId, productSnapshot: { title, image, listPrice, sellerId },
  buyerId, buyerSnapshot: { username },
  sellerId, sellerSnapshot: { username },
  offerAmount, message,
  status: { type: String, enum: ['pending','countered','accepted','declined','expired'], default: 'pending' },
  counterHistory: [{ by: String, amount: Number, message: String, at: Date }],
  createdAt, updatedAt
}
// indexes: { productId: 1, status: 1 }, { buyerId: 1 }, { sellerId: 1 }
```

---

## 3. Shopping Cart & Checkout module (Nguyen Duy Dang Phong)

### `carts`
```js
{
  _id, userId,
  items: [{
    productId, productSnapshot: { title, image, price, sellerId, sellerName },
    quantity, selectedOptions,
    addedAt
  }],
  updatedAt
}
// index: { userId: 1 } unique
```

### `orders` (checkout, delivery, payment, review-order, PD progress — all embedded, one collection)
```js
{
  _id, orderNumber,
  buyerId, buyerSnapshot: { username, contact },
  items: [{
    productId, productSnapshot: { title, image, sellerId, sellerSnapshot },
    quantity, priceAtPurchase
  }],
  delivery: { address, contactPhone, shippingMethod },
  payment: { method: String, status: { type: String, enum: ['pending','paid','failed'] }, simulatedRef: String },
  totals: { subtotal, shippingFee, total },
  status: { type: String, enum: ['placed','confirmed','shipped','delivered','received','disputed','completed'], default: 'placed' },
  deliveryMilestones: [{ stage: String, at: Date }],  // Product Delivery Progress (PD) page reads this
  returnWindow: { deliveredAt: Date, eligibleUntil: Date, disputeRaised: { type: Boolean, default: false } },
  createdAt, updatedAt
}
// indexes: { buyerId: 1, createdAt: -1 }, { orderNumber: 1 } unique, { 'items.productId': 1 }
```
Independence note: PD, checkout steps, and order confirmation are all one document, not four collections — so the whole checkout flow lives or dies as a single unit rather than depending on other modules' tables.

---

## 4. Product Review & Rating module (Tran Hong Minh)

### `reviews`
```js
{
  _id,
  productId, productSnapshot: { title, image },
  orderId,                         // soft ref, proves the reviewer actually bought it
  reviewerId, reviewerSnapshot: { username, avatarUrl },
  rating: { type: Number, min: 1, max: 5 },
  title, comment, media: [String],
  helpfulVotes: { type: Number, default: 0 },
  status: { type: String, enum: ['published','flagged','removed'], default: 'published' },
  createdAt
}
// indexes: { productId: 1, rating: -1 }, { reviewerId: 1 }
```
The Individual Product (IP) page queries `reviews` separately from `products` and computes/display the average from whatever it gets back (0 results = "No reviews yet"). `products.ratingSummary` is a cache updated by a review-write hook — if that hook is missing or the `reviews` collection is dropped, the product doc itself is untouched.

---

## 5. Wishlist module (Mai Thanh Ngu)

### `wishlists`
```js
{
  _id, userId,
  items: [{
    productId, productSnapshot: { title, image, price, sellerName, availability },
    priceHistory: [{ price: Number, at: Date }],   // wishlist keeps its own trail, doesn't recompute from products history
    inspectionNotes: String,
    alertsEnabled: { type: Boolean, default: true },
    addedAt
  }]
}
// index: { userId: 1 } unique
```

### `savedSearches`
```js
{
  _id, userId,
  queryParams: { keywords, category, priceMin, priceMax, condition },
  alertsEnabled: Boolean,
  lastNotifiedAt, createdAt
}
// index: { userId: 1 }
```
Checkout-from-wishlist just copies the `productSnapshot` (+ live price re-check) into a new `cart` item — no schema coupling required beyond that one read.

---

## 6. Discussion Forum, FAQ & Studios module (Truong Gia Bao)

### `faqs`
```js
{ _id, category, question, answer, order: Number, updatedAt }
// index: { category: 1, order: 1 }
```

### `submitQuestions`
```js
{ _id, userId, userSnapshot: { username }, question, status: { type: String, enum: ['open','answered'] }, staffReply, createdAt }
```

### `forumPosts`
```js
{
  _id, authorId, authorSnapshot: { username, reputationBadge },
  title, body, tags: [String], media: [String],
  upvotes: { type: Number, default: 0 }, downvotes: { type: Number, default: 0 },
  acceptedReplyId,
  status: { type: String, enum: ['active','flagged','removed'], default: 'active' },
  createdAt
}
// index: { tags: 1 }, text index on title+body, { status: 1, createdAt: -1 }
```

### `forumReplies`
```js
{
  _id,
  postId, postSnapshot: { title },     // survives even if the parent post doc is gone
  authorId, authorSnapshot: { username },
  body, votes: { type: Number, default: 0 }, isAccepted: Boolean,
  createdAt
}
// index: { postId: 1, createdAt: 1 }
```

### `studios`
```js
{
  _id, ownerId, ownerSnapshot: { username },
  name, description,
  location: { lat, lng, address },
  photos: [String], equipmentList: [String], rates: { hourly, daily },
  status: { type: String, enum: ['active','pending','removed'], default: 'active' },
  createdAt
}
// index: { location: '2dsphere' } for map view
```

### `studioInquiries`
```js
{
  _id,
  studioId, studioSnapshot: { name },
  requesterId, requesterSnapshot: { username },
  message, status: { type: String, enum: ['pending','responded','booked'], default: 'pending' },
  createdAt
}
// index: { studioId: 1 }, { requesterId: 1 }
```

---

## 7. Blog module (Mai Thanh Ngu)

### `blogPosts`
```js
{
  _id, authorId, authorSnapshot: { username },
  title, slug, category, coverImage, body,
  mentionedProducts: [{ productId, productSnapshot: { title, image } }],  // powers Wishlist Integration without a live join
  tags: [String],
  status: { type: String, enum: ['draft','pending_review','published','rejected'], default: 'draft' },
  reviewedBy, publishedAt, viewCount: { type: Number, default: 0 },
  createdAt
}
// index: { slug: 1 } unique, { status: 1, publishedAt: -1 }, text index on title+body
```

### `blogComments`
```js
{
  _id,
  postId, postSnapshot: { title },
  authorId, authorSnapshot: { username },
  body, status: { type: String, enum: ['visible','flagged','removed'], default: 'visible' },
  createdAt
}
// index: { postId: 1, createdAt: 1 }
```

---

## 8. Chat (seller messaging, needed by your wishlist-checkout + negotiation flow)

### `conversations`
```js
{
  _id,
  participantIds: [ObjectId],       // exactly 2
  participantSnapshots: [{ userId, username, avatarUrl }],
  relatedProductId, relatedProductSnapshot: { title, image },
  lastMessageAt, lastMessagePreview
}
// index: { participantIds: 1, lastMessageAt: -1 }
```

### `messages`
```js
{
  _id, conversationId,
  senderId, senderSnapshot: { username },
  body, attachments: [String],
  sentAt, readAt
}
// index: { conversationId: 1, sentAt: 1 }
```

---

## 9. Notification Center (shared, but purely additive)

### `notifications`
```js
{
  _id, userId,
  type: { type: String, enum: ['price_drop','new_reply','review_reply','order_update','blog_approved','forum_mention','offer_received','message_received'] },
  title, body, linkUrl,
  sourceModule: String,     // which module wrote it, for debugging only
  isRead: { type: Boolean, default: false },
  createdAt
}
// index: { userId: 1, isRead: 1, createdAt: -1 }
```
Every module *writes* here on relevant events, but **no module ever reads its own state back out of `notifications`** to decide behavior — so if this collection is dropped, every other feature keeps working; users just stop getting alerts.

---

## 10. Administration module

### `moderationFlags`
```js
{
  _id,
  targetType: { type: String, enum: ['review','forum_post','forum_reply','blog_post','blog_comment','studio'] },
  targetId, targetSnapshot: { title_or_excerpt: String },
  flaggedBy, reason,
  status: { type: String, enum: ['open','resolved','dismissed'], default: 'open' },
  resolvedBy, resolvedAt, createdAt
}
// index: { status: 1, targetType: 1 }
```

### `adminAuditLog`
```js
{ _id, adminId, action, targetType, targetId, notes, timestamp }
// index: { adminId: 1, timestamp: -1 }
```
Admin dashboards mostly do **read-only** aggregation queries against other modules' collections (counts, recent items) — if a target collection is empty or missing, that panel of the dashboard just shows zero/empty, the rest of the dashboard is unaffected.

---

## 11. Sitemap module

No dedicated collection needed — it's generated from your Express route registry at request time, not from data. If you want it searchable/DB-backed anyway:
```js
// sitemapEntries (optional)
{ _id, path, title, module, isIndexed: Boolean }
```

---

## 12. Why this survives your stated failure test

> "individual modules should work independently even if one module's HTML/CSS/JS is broken or all its tables are removed"

- **Broken/missing module UI:** each module has its own Express router + views folder; none of them import or depend on another module's controller code, only on the shared `db` connection and, at most, a read-only snapshot field they already own.
- **Dropped tables:** because every cross-module link is a snapshot + soft `ObjectId`, dropping e.g. `reviews`, `forumPosts`, or `wishlists` entirely removes zero fields from `users`, `products`, `orders`, or any other module's documents. The only visible effect is that module's own pages show empty state.
- **Core exception (by necessity):** `users` and `products` are the only collections every module reads from. If you truly need *every* module — including Cart/Checkout — to survive `products` being wiped, the snapshot pattern already covers it for anything already in a cart/order/review/wishlist; only *new* actions (browsing, adding to cart) would be affected, which is unavoidable in any marketplace since there's nothing to sell.

## 13. Suggested seed state
Per your earlier requirement: seed only one `admin` user in `users`; every other collection (`products`, `orders`, `reviews`, `wishlists`, `forumPosts`, `blogPosts`, `studios`, `conversations`, `notifications`, `moderationFlags`) starts empty so the site looks like a real pre-launch marketplace.
