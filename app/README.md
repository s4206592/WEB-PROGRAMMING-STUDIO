# StudioTrade

Secondhand studio equipment marketplace — Node.js + Express + EJS + MongoDB (Mongoose).

## Local setup
```bash
npm install
cp .env.example .env   # then fill in MONGODB_URI, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed            # creates the admin account, starter FAQ, 2 sample users, and 5 sample listings
npm start                # http://localhost:3000
```

`npm run seed` prints the sample accounts' usernames and passwords to the terminal — use those to log in as a "buyer" and "seller" for testing. Run `npm run unseed` any time to remove just the sample users/listings (flagged `sampleData: true`) without touching real accounts or your admin login.

## Forgot / reset password
`/forgot-password` → enter the account's email → the app shows a reset link directly on the page (no email sending is wired up yet — that page says so). Click it, set a new password. The link expires in 30 minutes and works once. Swapping in real email delivery later is a one-route change (`routes/auth.routes.js`); the token schema (`passwordResetTokens`) is already set up for it.

## Deploying on Render.com
1. Push this folder to a GitHub repo.
2. In Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables: `MONGODB_URI` (your MongoDB Atlas connection string), `SESSION_SECRET` (any long random string — Render can generate one), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`.
5. After the first deploy, open the Render **Shell** tab for the service and run `npm run seed` once — this creates the single admin account and leaves every other collection empty, like a real pre-launch marketplace. (`render.yaml` is included if you prefer Render's Blueprint deploys.)
6. Share the Render URL — anyone can register through `/register`.

## Logging in as admin
Use the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set before seeding. The admin account can suspend/reactivate users at `/admin/users`, resolve moderation flags at `/admin/moderation`, and approve/reject blog submissions at `/blog/staff`.

## Module independence
Every feature module (Cart, Wishlist, Reviews, Forum, Blog, Admin…) is one line in the `moduleRegistry` array in `server.js` plus its own route file and its own Mongoose model(s). To remove a module:
1. Delete (or comment out) its line in `server.js`.
2. Optionally drop its MongoDB collection(s).

Nothing else breaks, because:
- Every cross-module reference is a soft `ObjectId` plus a cached snapshot (see `studiotrade-database-schema.md`), never a live join.
- Client-side, a module's own JS file (`public/js/<module>.js`) never imports another module's JS. Buttons that trigger another module's feature (e.g. "Add to cart" on the product page) give instant visual feedback via `pressFeedback()` *before* the network call, and catch failures quietly — so the button still animates even if that module's routes/collections are gone; only the underlying action (opening `/cart`) 404s.
- `server.js` wraps each module's `require`/`app.use` in try/catch and logs a `[module failed to load]` line instead of crashing the whole server.

## What's implemented
Auth (register/login/logout/profile/forgot-password/reset-password, show/hide password toggle), Product Listing + Individual Product (search + sort by newest/price/rating, multi-item listing form, edit/delete your own listings), Shopping Cart (live subtotal, no reload needed), Wishlist, Checkout → Order → Delivery Progress (with a demo "advance" button standing in for a real courier integration), Product Review & Rating, Discussion Forum + FAQ (search + sort, Post Management page to edit/delete your own posts), Blog (search + sort + staff review queue), Administration (users, moderation queue), Notifications (basic), Sitemap.

**Client-side (Web Storage API):** recently-viewed products (shown on the marketplace page) and your last-used search/filter/sort choice are remembered in `localStorage` — pure UI convenience, never sent to the server, so it never belonged in MongoDB.

**Database diagram:** `docs/database-schema-erd.pdf` — the full entity-relationship diagram (matching `studiotrade-database-schema.md`), ready to drop straight into your design-doc report. Every module still owns its own collections with no enforced foreign keys, exactly as before — the diagram documents the relationships, it doesn't change them.

## What's stubbed / left for a later pass
Offers & negotiation and Studio advertisement listings are in the design doc and database schema but not wired into routes/views yet. **Buyer–seller chat/messaging is also not built yet** — the two sample users are useful for testing multi-account flows (forum replies, reviews, buying each other's listings) but not for chat specifically, since that feature doesn't exist in the app yet. The schema already has collections ready for these (`offers`, `conversations`/`messages`, `studios`) — say the word and I'll wire chat in next.
