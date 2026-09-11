# StudioTrade

**COSC3060 Web Programming Studio — Team SG-G5**

StudioTrade is an online marketplace for buying and selling secondhand studio equipment (cameras, lighting, grip, audio gear) in Vietnam. Sellers list gear — solo or in bulk, with an optional pickup location — and buyers search, filter, wishlist, negotiate price directly with a seller in chat, check out by Cash on Delivery or Cash on Pickup, track fulfillment, and review purchases once delivered. A companion Studio Map lets studio owners advertise physical spaces, gated by admin approval. Built with Node.js, Express, EJS, and MongoDB (Mongoose).

## Live application

**https://web-programming-studio-studiotrade.onrender.com/**

| Account | Username | Password |
|---|---|---|
| Admin | `admin` | `ChangeMe123!` |
| Test user | `s4206592@rmit.edu.vn` | `12345678` |

**GitHub repo:** s4206592/WEB-PROGRAMMING-STUDIO

---

## Team members and module responsibility

Modules were originally divided evenly, but as development went on, some modules needed more support than others, and helping a teammate debug their module made multiple people contributors to it too — several modules below list more than one name for that reason. The exact endpoint each person is responsible for is in the full feature tables in the Assignment report (§2).

| Team member | Modules |
|---|---|
| Tran Hong Minh | Core Pages (Home); Auth/Account (register, log in, log out); Product Review & Rating; Chat & Negotiation (shared); Administration (users, suspend/reactivate, resolve flag) |
| Truong Gia Bao | Auth/Account (profile, password reset/change); Shopping Cart (shared); Checkout & Orders (shared); Chat & Negotiation (shared); Studio Map; Discussion Forum & FAQ; Wishlist (view only) |
| Mai Thanh Ngu | Wishlist (add/remove/save search); Blog; Administration (dashboard, moderation queue) |
| Nguyen Duy Dang Phong | Core Pages (Sitemap); Product Listing; Shopping Cart (shared); Checkout & Orders (shared) |
| *Unconfirmed* | Notifications — implemented and reachable in the app, but not claimed by anyone in the team roster or the original report. Confirm ownership with the team before presenting it as complete. |

### Files and folders per module

Naming follows the project's convention throughout: `routes/<module>.routes.js`, `models/<module>.model.js`, `views/<module>/*.ejs`. Shared route files list the specific endpoint(s) each contributor owns within them.

**Core Pages** (Minh: home · Phong: sitemap)
`routes/page.routes.js` — `GET /` (Minh), `GET /sitemap` (Phong)
`views/home.ejs`, `views/sitemap.ejs`

**Auth / Account — User Account Management** (Minh: register/login/logout · Bao: profile/password)
`routes/auth.routes.js` — `GET/POST /register`, `GET/POST /login`, `POST /logout` (Minh); `GET/POST /profile`, `POST /profile/password`, `GET/POST /forgot-password`, `GET/POST /reset-password/:token` (Bao)
`views/auth/`, `views/account/profile.ejs`
`models/user.model.js`, `models/passwordResetToken.model.js`

**Product Listing** (Phong)
`routes/product.routes.js`, `models/product.model.js`
`views/products/` (listing, individual, new-listing, edit-listing), `views/sellers/` (storefront — *new; confirm exact view path with Phong*)

**Shopping Cart** (Bao + Phong)
`routes/cart.routes.js`, `models/cart.model.js`, `views/cart/cart.ejs`

**Wishlist** (Bao: view · Ngu: add/remove/search)
`routes/wishlist.routes.js`, `models/wishlist.model.js`, `models/savedSearch.model.js`, `views/wishlist/landing.ejs`

**Checkout & Orders** (Bao + Phong)
`routes/order.routes.js`, `models/order.model.js`
`views/checkout/checkout.ejs`, `views/orders/` (list, placed-summary, selling, confirmation, delivery-progress)

**Product Review & Rating** (Minh)
`routes/review.routes.js`, `models/review.model.js`, `views/reviews/submit.ejs`

**Chat & Negotiation** (Minh + Bao)
`routes/chat.routes.js`, `models/chat.model.js`, `views/messages/`, `public/js/messages.js`

**Studio Map** (Bao) — sub-feature of Discussion Forum, kept in its own route file so it stays independently removable
`routes/studio.routes.js`, `models/studio.model.js`, `views/forum/studios/`, `public/js/studio-map.js`, `public/js/studio-form.js`

**Discussion Forum & FAQ** (Bao)
`routes/forum.routes.js`, `models/forumPost.model.js`, `models/faq.model.js`, `views/forum/` (excl. `studios/`)

**Blog** (Ngu)
`routes/blog.routes.js`, `models/blogPost.model.js`, `views/blog/`

**Administration** (Ngu: dashboard/moderation · Minh: users/suspend/activate/resolve)
`routes/admin.routes.js`, `models/moderationFlag.model.js`, `views/admin/`

**Notifications** (unconfirmed)
`routes/notification.routes.js`, `models/notification.model.js`, `views/account/notifications.ejs`

**Shared / not owned by a single module**
`server.js`, `config/db.js`, `middleware/auth.middleware.js`, `public/css/style.css`, `public/js/main.js`, `views/partials/`, `views/404.ejs`, `seed/seed.js`, `seed/unseed.js`, `studiotrade-database-schema.md`, `docs/`

---

## Instructions for configuration of the application

### 1. Prerequisites
- **Node.js 18 or later** — the app uses the built-in `fetch` API for the Studio Map module's address lookup, which requires Node 18+. Check with `node -v`.
- **npm** (bundled with Node.js).
- **A MongoDB database** the server can reach — MongoDB Atlas (cloud, recommended) or a local/self-hosted instance. Any MongoDB 5+ compatible server works; the app only needs a connection string.
- No other external services or API keys are required — Studio Map's address search uses Nominatim (OpenStreetMap), which needs no API key.

### 2. Get the source code onto the target machine
Clone the repository, or copy the project folder (excluding `node_modules`, regenerated in step 3) onto the new machine.

### 3. Install required packages
```bash
npm install
```
Installs every dependency from `package.json`: express, mongoose, ejs, express-session, connect-mongo, bcryptjs, dotenv.

### 4. Configure environment variables
```bash
cp .env.example .env
```
Then set in `.env`:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Connection string for this instance's database |
| `SESSION_SECRET` | Any long random string, signs session cookies |
| `PORT` | Server port (defaults to 3000 if omitted) |
| `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Credentials the seed script uses for the one administrator account |

None of these are committed (`.env` is in `.gitignore`) — each environment keeps its own.

### 5. Seed the database
```bash
npm run seed
```
Creates the administrator account, starter FAQ entries, 2 sample users, and 5 sample listings. Every other collection (orders, reviews, wishlists, forum posts, blog posts, studio listings, chat conversations) starts empty. `npm run unseed` removes just the sample data at any time.

**Known issue:** the User model requires a `phone` field, but the seed script does not currently supply one for the administrator account or sample users, which causes `npm run seed` to fail schema validation on a completely fresh database. Fix by adding a `phone` value to each account created in `seed/seed.js` before relying on seeding.

### 6. Start the application
```bash
npm start
```
Runs `server.js`, connects to MongoDB via `MONGODB_URI`, listens on `PORT`. Once the terminal shows "StudioTrade running on port …", visit `http://localhost:<PORT>`.

### 7. Running on a different server machine or hosting environment
Steps 1–6 are identical regardless of host — laptop, lab machine, cloud VM, or managed platform — since nothing hardcodes a machine-specific path, port, or credential; everything comes from `.env`. Only two things differ per environment:
- **Where `MONGODB_URI` points** — local MongoDB is fine for same-machine development, but a remotely hosted server generally can't reach a database on another machine's `localhost`, so a cloud connection string (e.g. Atlas) is normally required once app and database aren't co-located.
- **How the process is kept running** — `npm start` runs in the foreground and stops when that terminal session ends; for an always-on server, run it under a process manager (`pm2 start server.js`) or let the hosting platform manage the process.

**Example — deploying to Render.com** (one concrete example of an "other server machine/environment"):
1. Set up a MongoDB Atlas cluster; allow network access from anywhere (`0.0.0.0/0`); copy its connection string.
2. Push the project to a GitHub repository.
3. Render: **New → Web Service**, connect the repo. Build command: `npm install`. Start command: `npm start`.
4. Set the same environment variables from step 4 in Render's environment configuration.
5. Once deployed, open the service's Shell and run `npm run seed`.
6. Confirm **Settings → Build & Deploy → Auto-Deploy** is **On Commit** for automatic redeploys, or use **Manual Deploy → Deploy latest commit** on demand.

---

## How to test each module

Each area below was verified end-to-end during development — see the Assignment report (§2) for the exact scenario each contributor tested. To re-verify after your own setup:

1. **Core Pages** — load `/` and `/sitemap` logged in and logged out; confirm the sitemap only lists modules actually registered in `server.js`.
2. **Auth/Account** — register with a duplicate username/email/phone (should be rejected); log in; suspend the account as admin and confirm login is then blocked; use "Forgot password?" to generate and use a reset link; change your password from `/profile` using the current password.
3. **Product Listing** — publish a multi-item listing with a shared pickup location; confirm the pickup badge shows only the city, never the full address; visit the seller's storefront and confirm it lists only their active items.
4. **Shopping Cart** — add an item, confirm `/api/cart/add` rejects an item that's since sold out.
5. **Wishlist** — save a search with a price filter, reload, confirm it persists; move a saved item into the cart.
6. **Checkout & Orders** — check out a cart spanning two sellers and confirm it splits into two separate orders; walk one order through confirm → ship → mark-delivered (Cash on Delivery) and another through confirm → mark-delivered (Cash on Pickup, no ship step); confirm payment only flips to `paid` at the final step and the review form unlocks then.
7. **Product Review & Rating** — confirm the review form is blocked before an order reaches `delivered`, then submit one after and confirm the product's average rating recalculates.
8. **Chat & Negotiation** — message a seller from a product page, negotiate a price in plain messages, have the seller confirm it, then check out at that price — confirm the order's `priceAtPurchase` matches the agreed price, not the listed price.
9. **Studio Map** — submit a studio, reject it as admin with a reason, edit and resubmit as the owner, approve it, and confirm it only appears on the public map once approved.
10. **Discussion Forum & FAQ** — post, reply, edit, and delete a forum post back-to-back (this flow previously crashed the server on a second post due to an orphaned unique index — confirm that's still fixed).
11. **Blog** — submit an article via "Write a blog about this" from a product page and confirm the product link survives review to the published article; also confirm the standalone `/blog/submit` flow works with no product attached.
12. **Administration** — suspend and reactivate a test account; resolve an open moderation flag.
13. **Notifications** — visit `/notifications` while logged in and confirm your recent notifications list and mark-as-read works. *(Ownership unconfirmed — verify this is actually someone's responsibility before demo day.)*
