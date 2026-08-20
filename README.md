# StudioTrade

**COSC3060 Web Programming Studio — Assignment 2: Web Application Prototype**
**Team:** SG-G5 · **Project GitHub repo:** s4206592/WEB-PROGRAMMING-STUDIO

StudioTrade is an online marketplace for buying and selling secondhand studio equipment (cameras, lighting, grip, audio gear), built for sellers and buyers in Vietnam. Sellers can list gear with individual pricing, and buyers can search, filter, wishlist, cart, check out, track delivery, and review purchases. Built with Node.js, Express, EJS, and MongoDB (Mongoose).

---

## Team members and module responsibility

| Team member | Student ID | Module(s) responsible for |
|---|---|---|
| Tran Hong Minh | S4206592 | Product Review and Rating module; Administration module (shared); User Account Management module (shared) |
| Truong Gia Bao | S4139453 | Discussion Forum and FAQ module; Wishlist module (shared); User Account Management module (shared) |
| Mai Thanh Ngu | S4163542 | Blog module; Wishlist module (shared); Administration module (shared) |
| Nguyen Duy Dang Phong | S4183562 | Shopping Cart module (incl. shared Product Listing); Sitemap module (shared) |

### Files and folders each member is responsible for

Several modules share one route file because closely related actions (e.g. every `/admin/*` route, or every `/wishlist`-related route) live together — where that's the case, the specific route(s) each person owns within that shared file are listed.

**Tran Hong Minh — Product Review and Rating, Administration (shared), User Account (shared)**
- `routes/review.routes.js`, `models/review.model.js`, `views/reviews/submit.ejs`
- `routes/admin.routes.js` — `GET /admin/users`, `POST /admin/users/:id/suspend`, `POST /admin/users/:id/activate`, `POST /admin/moderation/:id/resolve`
- `views/admin/users.ejs`
- `routes/auth.routes.js` — `GET/POST /register`, `GET/POST /login`, `POST /logout`
- `views/auth/register.ejs`, `views/auth/login.ejs`
- `models/user.model.js` (shared)

**Truong Gia Bao — Discussion Forum and FAQ, Wishlist (shared), User Account (shared)**
- `routes/forum.routes.js`, `models/forumPost.model.js`, `models/faq.model.js`
- `views/forum/faq.ejs`, `views/forum/landing.ejs`, `views/forum/new-post.ejs`, `views/forum/edit-post.ejs`, `views/forum/manage.ejs`, `views/forum/post.ejs`
- `routes/wishlist.routes.js` — `GET /wishlist`
- `views/wishlist/landing.ejs` (shared with Mai Thanh Ngu)
- `routes/auth.routes.js` — `GET/POST /profile`, `GET/POST /forgot-password`, `GET/POST /reset-password/:token`
- `views/account/profile.ejs`, `views/auth/forgot-password.ejs`, `views/auth/reset-password.ejs`, `views/auth/reset-link-sent.ejs`
- `models/passwordResetToken.model.js`

**Mai Thanh Ngu — Blog, Wishlist (shared), Administration (shared)**
- `routes/blog.routes.js`, `models/blogPost.model.js`
- `views/blog/listing.ejs`, `views/blog/post.ejs`, `views/blog/staff-review.ejs`, `views/blog/submit.ejs`
- `routes/wishlist.routes.js` — `POST /api/wishlist/add`, `POST /api/wishlist/remove`, `POST /wishlist/:productId/checkout`
- `views/wishlist/landing.ejs` (shared with Truong Gia Bao)
- `models/wishlist.model.js`
- `routes/admin.routes.js` — `GET /admin`, `GET /admin/moderation`
- `views/admin/dashboard.ejs`, `views/admin/moderation.ejs`
- `models/moderationFlag.model.js`

**Nguyen Duy Dang Phong — Shopping Cart (incl. shared Product Listing), Sitemap (shared)**
- `routes/product.routes.js`, `models/product.model.js`
- `views/products/listing.ejs`, `views/products/individual.ejs`, `views/products/new-listing.ejs`, `views/products/edit-listing.ejs`
- `routes/cart.routes.js`, `models/cart.model.js`, `views/cart/cart.ejs`
- `routes/order.routes.js`, `models/order.model.js`, `views/checkout/checkout.ejs`, `views/orders/confirmation.ejs`, `views/orders/delivery-progress.ejs`
- `routes/page.routes.js` (home page + `/sitemap`), `views/home.ejs`, `views/sitemap.ejs`

**Shared / not owned by a single member**
- `server.js`, `config/db.js`, `middleware/auth.middleware.js` — application shell
- `public/css/style.css`, `public/js/main.js` — shared design system and nav
- `routes/notification.routes.js`, `models/notification.model.js`, `views/account/notifications.ejs` — Notification Center (cross-cutting utility used by several modules)
- `views/partials/header.ejs`, `views/partials/footer.ejs`, `views/404.ejs`
- `seed/seed.js`, `seed/unseed.js` — sample data
- `studiotrade-database-schema.md`, `docs/database-schema-erd.pdf`, `docs/database-schema-erd-by-module.pdf` — schema documentation

---

## How to run the application

### Prerequisites
- Node.js 18+
- A MongoDB connection string (MongoDB Atlas, or a local MongoDB instance)

### Setup
```bash
npm install
cp .env.example .env
```
Open `.env` and fill in:
- `MONGODB_URI` — your MongoDB connection string
- `SESSION_SECRET` — any long random string
- `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` — credentials for the seeded admin account

### Seed the database
```bash
npm run seed
```
This creates **one admin account** (credentials from `.env`), a starter set of FAQ entries, **2 sample users**, and **5 sample listings** — the terminal prints the sample users' usernames and passwords. Every other collection (orders, reviews, wishlists, forum posts, blog posts) starts empty. Run `npm run unseed` at any time to remove just the sample users/listings without touching the admin account or any real data.

### Start the server
```bash
npm start
```
Visit `http://localhost:3000`.

### Deployment
The app is configured for Render.com (`render.yaml` included) with a MongoDB Atlas cluster. Push to a GitHub repo, connect it as a Web Service on Render, set the same environment variables listed above, and run `npm run seed` once from Render's Shell tab after the first deploy.

---

## How to test each module

1. **Register / log in** — go to `/register` to create an account, or log in at `/login` with a seeded sample user's credentials (printed by `npm run seed`).
2. **Shopping Cart & Product Listing** — browse `/products`, open a listing, click "Add to cart," go to `/cart` to adjust quantities (subtotal updates live), then `/checkout` to place an order. Track it at `/orders/:id/delivery` — use the "Simulate next delivery step" button to move it through to "received."
3. **Product Review and Rating** — once an order is "received," a "Review" link appears on the delivery page; submit a star rating and comment, then revisit the product page to see it listed and sortable by newest/highest/lowest rated.
4. **Wishlist** — from any product page, click "Save to wishlist," then visit `/wishlist` to view, remove, or move an item into the cart.
5. **Discussion Forum and FAQ** — browse `/faq` and `/forum`; log in to post a new thread at `/forum/new`, reply to one, and manage your own posts at `/forum/manage`.
6. **Blog** — browse `/blog`; log in to submit an article at `/blog/submit`. Log in as the **admin** account to review and approve/reject it at `/blog/staff` before it appears publicly.
7. **User Account Management** — edit your profile at `/profile`; test the forgot-password flow at `/forgot-password` (since no email service is connected yet, the reset link is shown directly on the page instead of being emailed).
8. **Administration** — log in as the admin account, view stats at `/admin`, manage users at `/admin/users`, and resolve flagged content at `/admin/moderation`.
9. **Sitemap** — visit `/sitemap` to see every page across every module listed in one place; this works whether or not you're logged in.

### Known gap between this report and the code
The Wishlist module's route table in the assignment report lists **"Save search"** (`POST /api/wishlist/search`) and **"View saved searches"** (`GET /api/wishlist/searches`) as features. These are not implemented in the current build — only add/remove/move-to-cart are wired up in `routes/wishlist.routes.js`. A `SavedSearches` collection is documented in `studiotrade-database-schema.md` as part of the intended design, but no route or view exists for it yet.
