require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const morgan = require('morgan');
const methodOverride = require('method-override');

const { connectDB } = require('./src/config/db');
const { loadUser } = require('./src/middleware/auth');
const { locals } = require('./src/middleware/locals');
const { ensureAdmin, ensureReferenceData } = require('./src/seed');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Render terminates TLS at its proxy — this makes secure cookies work.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(morgan(isProd ? 'tiny' : 'dev'));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));

app.use(session({
  name: 'studiotrade.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

app.use(flash());
app.use(locals);
app.use(loadUser);

// Health check — Render pings this to confirm the service is up.
app.get('/healthz', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

// ── Routes ────────────────────────────────────────────────────────
app.use('/', require('./src/routes/index'));
app.use('/', require('./src/routes/auth'));
app.use('/account', require('./src/routes/account'));
app.use('/products', require('./src/routes/products'));
app.use('/sell', require('./src/routes/seller'));
app.use('/offers', require('./src/routes/offers'));
app.use('/messages', require('./src/routes/messages'));
app.use('/cart', require('./src/routes/cart'));
app.use('/checkout', require('./src/routes/checkout'));
app.use('/orders', require('./src/routes/orders'));
app.use('/reviews', require('./src/routes/reviews'));
app.use('/wishlist', require('./src/routes/wishlist'));
app.use('/blog', require('./src/routes/blog'));
app.use('/forum', require('./src/routes/forum'));
app.use('/faq', require('./src/routes/faq'));
app.use('/studios', require('./src/routes/studios'));
app.use('/notifications', require('./src/routes/notifications'));
app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/sitemap'));

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    status: 404,
    message: `No page at ${req.path}.`
  });
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).render('error', {
    title: 'Something went wrong',
    status: err.status || 500,
    message: isProd ? 'An unexpected error occurred. Try again.' : err.message
  });
});

(async () => {
  try {
    await connectDB();
    // Reference data (categories, FAQ/blog taxonomy) + the admin account.
    // No demo listings, posts or orders — every user-generated table starts empty.
    await ensureReferenceData();
    await ensureAdmin();
    app.listen(PORT, () => console.log(`✓ StudioTrade listening on http://localhost:${PORT}`));
  } catch (err) {
    console.error('✗ Startup failed:', err);
    process.exit(1);
  }
})();
