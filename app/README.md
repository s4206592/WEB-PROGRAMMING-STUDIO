# StudioTrade

An online marketplace for buying and selling secondhand studio equipment — lamps, softboxes, cameras and everything around them. Built for **COSC3060 Web Programming Studio**, team **SG-G5**.

Node.js + Express + EJS + MongoDB (Mongoose). Deploys to Render.com on the free tier.

---

## Team and modules

| Member | Student ID | Module |
|---|---|---|
| Tran Hong Minh | S4206592 | Product Review and Rating |
| Truong Gia Bao | S4139453 | Discussion Forum and FAQ (+ Studios) |
| Mai Thanh Ngu | S4163542 | Blog, Wishlist |
| Nguyen Duy Dang Phong | S4183562 | Shopping Cart |
| All members | — | User Account, Administration, Sitemap |

---

## Quick start (local)

You need Node 18+ and a MongoDB connection string.

```bash
npm install
cp .env.example .env      # then edit .env
npm start
```

Open http://localhost:3000.

For MongoDB you can either run one locally (`mongodb://127.0.0.1:27017/studiotrade`) or use a free MongoDB Atlas cluster — see below. Atlas is what you want for the deployed version anyway, so it is worth setting up once and using for both.

---

## Deploying to Render.com

### 1. Create the database (MongoDB Atlas, free tier)

1. Sign up at https://www.mongodb.com/cloud/atlas and create a free **M0** cluster.
2. **Database Access** → *Add New Database User*. Note the username and password.
3. **Network Access** → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`). Render's outbound IPs are not fixed on the free plan, so this is required.
4. **Database** → *Connect* → *Drivers* → copy the connection string. It looks like:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

   Insert the database name before the `?`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/studiotrade?retryWrites=true&w=majority
   ```

   If your password contains `@ : / ? # [ ] %`, URL-encode it or it will break the string.

### 2. Push the code to GitHub

```bash
git init
git add .
git commit -m "StudioTrade application"
git remote add origin https://github.com/s4206592/WEB-PROGRAMMING-STUDIO.git
git push -u origin main
```

`.gitignore` already keeps `node_modules/` and `.env` out of the repo. Never commit `.env` — it holds your database password.

### 3. Create the Render service

1. Sign in at https://render.com and pick **New → Web Service**.
2. Connect the GitHub repo.
3. Settings:
   - **Runtime**: Node
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Instance type**: Free
4. Add environment variables:

   | Key | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas string from step 1 |
   | `SESSION_SECRET` | a long random string |
   | `NODE_ENV` | `production` |
   | `ADMIN_EMAIL` | `admin@studiotrade.local` (or your own) |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_PASSWORD` | a password you choose |
   | `ADMIN_PHONE` | `+84900000000` |

5. Deploy. The first build takes a couple of minutes.

The repo also contains `render.yaml`, so you can instead use **New → Blueprint** and point Render at the repo — it will read the service definition and only prompt you for `MONGODB_URI` and `ADMIN_PASSWORD`.

Your public URL will be something like `https://studiotrade.onrender.com`. Anyone can visit it and sign up.

> **Free tier note:** Render spins the service down after 15 minutes of inactivity. The first request after that takes 30–50 seconds while it wakes up. This is normal — do not read it as a bug during a demo. Open the site a minute before you present.

---

## The admin account

An administrator is created automatically the first time the server connects to an empty database, and the credentials are printed to the Render logs:

```
┌─────────────────────────────────────────────┐
│  Admin account created                      │
├─────────────────────────────────────────────┤
│  Email:    admin@studiotrade.local          │
│  Password: Admin@12345                      │
└─────────────────────────────────────────────┘
```

Sign in at `/login`, then go to `/admin`. The account holds the `admin`, `staff`, `moderator`, `buyer` and `seller` roles, so it can reach every part of the site. **Change the password** from Account Settings after your first sign-in, or set `ADMIN_PASSWORD` in Render before the first deploy.

The seed is idempotent — it will not create a second admin or overwrite the password on later restarts. You can also run it by hand with `npm run seed`.

---

## What is in the database on day one

Everything a user would create is **empty**: no listings, orders, offers, reviews, wishlists, forum threads, blog articles, studios, notifications or extra accounts. Every page shows its empty state until someone posts something, exactly as a real marketplace would on launch day.

Two things are seeded, because they are configuration rather than content:

- **The admin account** (above).
- **Taxonomy** — 6 product categories with 23 subcategories, 6 blog categories, 7 FAQ categories. Without these the "create a listing" and "write an article" forms would have empty dropdowns and nothing could be posted at all. The FAQ categories are seeded **with no questions in them** — you add those from `/admin/faq`.

---

## Walking through the features as admin

A suggested order, because several features unlock each other:

1. **Sign in as admin**, then visit `/admin` — every count reads zero.
2. **Create a second account** (use a private browsing window so you can be two people at once). This is your buyer.
3. **As admin, list an item**: *Sell an item* in the top nav. Paste any image URL. Tick "Accept offers".
4. **As the buyer, make an offer** on that listing, then switch back to admin and **accept it**. The listing flips to `reserved` and any rival offers would be auto-declined.
5. **As the buyer, check out** the accepted offer — the negotiated price carries into the cart. Choose *bank transfer* to see the full payment handshake, or *cash on delivery* to skip straight to shipping.
6. **As the buyer, mark it paid**; **as admin (the seller), confirm the payment**. Delivery only unlocks at this point.
7. **As the seller, advance the milestones** to *delivered*. That opens the buyer's 15-day return window.
8. **As the buyer, confirm receipt** — this is final and closes the window early. It also unlocks the review.
9. **Write a review**. Watch the rating summary appear on the listing and on the seller's profile.
10. Post a **forum question**, answer it from the other account, upvote and accept the answer, and watch reputation and badges accrue.
11. Submit a **blog article** from the non-staff account, then approve it at `/blog/review-dashboard`.
12. Back in `/admin`: **User Management**, **Transaction Records**, **Content Moderation**, **Analytics** and the **Audit Log** now all have data in them.

---

## Project structure

```
server.js                  Express app, sessions, route mounting, startup
render.yaml                Render blueprint
.env.example               Environment variables to copy into .env

src/
  config/db.js             Mongoose connection
  seed.js                  Admin account + taxonomy (idempotent)
  models/                  35 Mongoose models, one file each
  middleware/
    auth.js                Session user loading, requireAuth / requireRole
    locals.js              Template helpers and flash messages
  utils/
    helpers.js             Slugs, VND formatting, dates, small shared helpers
    pricing.js             Cart price resolution and revalidation
    sanitize.js            Server-side HTML sanitisation
    notify.js              In-app notification insert
  routes/                  19 routers, one per module area

views/                     67 EJS templates
  partials/                head, header, footer, empty state, pagination, card
public/style.css           The team's wireframe stylesheet, plus app additions
```

---

## Design decisions worth knowing

These are the parts where the obvious implementation is wrong, and they are the parts most worth explaining in your report.

**The 15 days are a return window, not an escrow hold.** Nothing in this system ever holds anyone's money. The buyer pays the seller directly. The 15 days govern *what the buyer may still ask for*, and they are tracked on `orders.returnWindow`. `deliveries.deliveredAt` opens the window; `deliveries.receivedAt` closes it. These are two different timestamps and it is easy to wire the wrong one. Buyer confirmation is irreversible and forfeits the remaining days — the UI says so next to the button.

**Accepting an offer is a transaction, not a status change.** Two buyers can hold open offers on a quantity-1 listing at the same time; that is the intended behaviour. The race is resolved at accept time by a single guarded update on the listing:

```js
Product.findOneAndUpdate(
  { _id, status: 'active', quantity: { $gte: offer.quantity } },
  { $set: { status: 'reserved', reservedForOfferId, reservedUntil } }
)
```

If it returns `null`, somebody else won. That conditional update *is* the lock. Checking availability with a separate `findOne` first would reopen the race. Rival offers are then auto-declined in one `updateMany`.

**Delivery is gated on payment confirmation.** A `deliveries` document must not exist while payment is `unpaid` or `submitted_by_buyer`, unless the method is COD. The buyer pressing "I have transferred the money" is a *claim*; only the seller checking their own account and confirming unlocks shipping. If the seller goes silent past `confirmationDueAt`, the design escalates to an admin rather than auto-confirming — auto-confirming would let a buyer unlock delivery by claiming a payment that never arrived.

**A saved wishlist price is never a price the buyer gets.** `wishlists.items.priceAtSave` is an alerting baseline only. Moving an item to the cart always re-resolves the price from the live listing (or an accepted offer, or a bulk tier), and it is re-resolved again at Place Order. Honouring a six-month-old saved price would be a real vulnerability, not a nicety. The transfer also **copies** rather than moves by default — emptying your cart should not silently destroy a saved item.

**Reviews require receipt, not delivery.** A review needs an order line with `itemStatus: 'received'`, and the unique index on `orderItemId` is what actually prevents duplicates. `products.ratingSummary` is denormalised and recomputed with one `$group` on every review write, so the listing page never has to aggregate.

**Sign-up relies on the unique indexes, not a pre-check.** Registration catches the `E11000` duplicate-key error rather than calling `findOne` first, because a pre-check alone is racy under concurrent sign-ups.

**Rich text is sanitised before insert.** Blog and forum bodies go through `sanitize-html` on the way into the database, not escaped at render time. Stored XSS is the classic failure in projects that ship a text editor.

**Users are never hard-deleted.** The admin "anonymise" action scrubs the name, email and phone but keeps orders, reviews and posts. Hard-deleting a user orphans financial records.

**Trades are recorded, not escrowed.** An offer can include the buyer's own listings as barter. When it does, `settlement` is `trade`: the accepted terms are recorded, a conversation opens, and the two people arrange the swap themselves. Two-sided goods escrow is genuinely hard and deliberately out of scope — say so in the report and it reads as a scoping decision rather than an omission.

---

## Things this build does not do

Stated plainly so they are not mistaken for bugs:

- **No file uploads.** Images are supplied as URLs. Render's free filesystem is ephemeral, so uploaded files would vanish on every restart. A production build would use Cloudinary or S3.
- **Payments are simulated.** No real money moves. No card number is ever stored — only the last four digits the user typed, as a display reference. Storing a real PAN or CVV would be a PCI-DSS violation.
- **No email is sent.** Notifications are in-app only. Email verification flags exist on the user model but nothing is dispatched.
- **No background jobs.** Offer expiry, reservation lapse, saved-search digests and return-window auto-close are all modelled in the schema and would be driven by a cron worker. In this build the return window closes when the buyer confirms, and expiry is checked when a record is read.
- **Listings publish immediately.** The `pending_review` state exists in the model but the staff gate is not enforced for listings, only for community blog submissions.
- **`escrows` and `analytics_daily` are modelled but unused.** The payment flow is peer-to-peer, so there is nothing to escrow; analytics are computed live rather than pre-aggregated. Both are documented in the schema for completeness.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `SESSION_SECRET` | yes | Signs the session cookie |
| `ADMIN_EMAIL` | no | Seeded admin email (default `admin@studiotrade.local`) |
| `ADMIN_USERNAME` | no | Seeded admin username (default `admin`) |
| `ADMIN_PASSWORD` | no | Seeded admin password (default `Admin@12345`) |
| `ADMIN_PHONE` | no | Seeded admin phone (default `+84900000000`) |
| `PORT` | no | Render sets this automatically |
| `NODE_ENV` | no | Set to `production` on Render — enables secure cookies |

---

## Troubleshooting

**`MONGODB_URI is not set`** — the variable is missing. Locally, check `.env` exists; on Render, check the Environment tab.

**Server starts then exits, or logs a timeout** — Atlas is refusing the connection. Almost always Network Access: add `0.0.0.0/0`. Second most likely: a special character in the password that needs URL-encoding.

**Signed in, then immediately signed out on Render** — `NODE_ENV` is `production` but the site is being served over plain HTTP. Secure cookies need HTTPS; Render provides it, so use the `https://` URL.

**"That email is already registered"** — the unique index is doing its job. Every email, username and phone must be distinct across all accounts.

**Everything is empty** — that is intended. See "What is in the database on day one".

**First page load takes 40 seconds** — free-tier cold start. Wake the site before demonstrating it.
