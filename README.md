# StudioTrade — Team GitHub Repository

Static HTML/CSS wireframes for the StudioTrade online marketplace (secondhand studio equipment trading platform). This README documents team ownership per the project requirements.

## Team Members & Module Responsibilities

| Team Member | Student ID | Module(s) Responsible For |
|---|---|---|
| Tran Hong Minh | S4206592 | Product Review and Rating module |
| Truong Gia Bao | S4139453 | Discussion Forum and FAQ module |
| Mai Thanh Ngu | S4163542 | Blog module, Wishlist module |
| Nguyen Duy Dang Phong | S4183562 | Shopping Cart module |
| **All members (shared)** | — | User Account Management module, Administration module, Sitemap module, and shared hub pages |

## Repository Structure & File/Folder Ownership

```
wireframes/
├── style.css                      # Shared stylesheet — co-owned by all members
├── index.html                     # Master sitemap/index — co-owned by all members
├── shared/                        # Shared hub pages — co-owned by all members
├── product-review/                # Tran Hong Minh
├── discussion-forum/              # Truong Gia Bao
├── blog/                          # Mai Thanh Ngu
├── wishlist/                      # Mai Thanh Ngu
├── shopping-cart/                 # Nguyen Duy Dang Phong
├── account/                       # Shared — all members
├── administration/                # Shared — all members
└── sitemap/                       # Shared — all members
```

### Tran Hong Minh — Product Review and Rating module
**Folder:** `product-review/`
- `product-review.html` — Product Review (PR) page: submit rating, written review, and photo/video upload.

**Also contributes review data displayed on the shared page:**
- `shared/individual-product.html` — Review summary section (aggregated rating, sorted reviews).

---

### Truong Gia Bao — Discussion Forum and FAQ module
**Folder:** `discussion-forum/`
- `forum-landing.html` — Forum Landing Page (trending topics, search, ask a question).
- `faq.html` — FAQ Page (categorized Q&A).
- `submit-question.html` — Submit Question to staff.
- `new-post.html` — New Post editor (text, media, tags).
- `post-management.html` — Post Management (edit/delete own posts).
- `moderation-dashboard.html` — Moderation Dashboard (flagged content review).
- `studios-page.html` — Studios Page (grid/map listing of studios).
- `studio-profile.html` — Studio Profile (studio detail + booking).
- `studio-owner-dashboard.html` — Studio Owner Dashboard (manage listings/inquiries).

---

### Mai Thanh Ngu — Blog module & Wishlist module
**Folder:** `blog/`
- `blog-listing.html` — Blog Listing / Home (featured articles, categories).
- `blog-post.html` — Blog Post (full article view).
- `discussion-post.html` — Discussion Post Page (comments/replies on an article).
- `search-article.html` — Search Article Page.
- `blog-submission.html` — Blog Submission (user article upload for review).
- `staff-review-dashboard.html` — Staff Review Dashboard (approve/reject submissions).

**Folder:** `wishlist/`
- `wishlist-landing.html` — Wishlist Landing (saved items, filters, sorting).
- `item-detail.html` — Item Detail Page (price history, seller reputation, notes).
- `saved-searches.html` — Saved Searches Page (alerts for matching listings).
- `similar-listings.html` — Similar Listing Page (suggested alternatives).

---

### Nguyen Duy Dang Phong — Shopping Cart module
**Folder:** `shopping-cart/`
- `shopping-cart.html` — Shopping Cart (SC): item list, quantities, totals.
- `checkout-delivery.html` — Checkout Step 1: Delivery Information.
- `checkout-payment.html` — Checkout Step 2: Payment Information.
- `checkout-review.html` — Checkout Step 3: Review Order.
- `order-confirmation.html` — Order Confirmation (OC).
- `product-delivery-progress.html` — Product Delivery Progress (PD): milestone tracker.

---

### Shared — All Team Members
**Folder:** `account/` (User Account Settings and Management module)
- `register.html` — Register (sign-up with verification).
- `login.html` — Login (authentication).
- `profile-view.html` — Profile (View): details, purchase history, wishlist, reviews, contributions.
- `account-settings.html` — Account Settings (password, contact info, notification preferences).
- `activity-history.html` — Activity History (past orders, reviews, posts).

**Folder:** `administration/` (Administration module)
- `administration-page.html` — Administration Page (central admin hub).
- `user-management.html` — User Management (edit/suspend/delete accounts).
- `transaction-records.html` — Transaction Records (purchases, escrow, delivery status).
- `content-moderation.html` — Content Moderation (flagged reviews/posts/blogs).
- `analytics-dashboard.html` — Analytics Dashboard (system metrics).

**Folder:** `sitemap/` (Sitemap module)
- `sitemap.html` — Sitemap (hierarchical map of all modules/pages).
- `search-sitemap.html` — Search Sitemap (find a specific page/feature).
- `seo-integration.html` — SEO Integration (sitemap.xml / indexing status).

**Folder:** `shared/` (cross-module hub pages)
- `product-listing.html` — Product Listing (PL): browse/filter products.
- `individual-product.html` — Individual Product (IP): product detail, add to cart/wishlist.
- `notification-center.html` — Notification Center: alerts from Forum, Blog, Wishlist, Orders.

**Root files:**
- `style.css` — Shared wireframe stylesheet used by every page.
- `index.html` — Master sitemap/index linking to every module's pages.

## How to View
Open `index.html` in a browser — it links to every page, sorted by module. All pages are static HTML/CSS with relative links, so the whole prototype works offline with no build step.
