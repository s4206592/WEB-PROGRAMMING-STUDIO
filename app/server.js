require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/db');
const { attachUser } = require('./middleware/auth.middleware');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: process.env.MONGODB_URI ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI }) : undefined,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(attachUser);

// --- Module registry ---------------------------------------------------
// Each module is one require + one app.use. To remove a module entirely
// (routes, and by extension its pages), delete its line here and delete
// its route file — every other module keeps working because none of them
// import each other directly, only shared models via soft references.
// The try/catch means a broken module fails loudly in the log but does not
// take the rest of the site down with it.
const moduleRegistry = [
  ['core pages (home, sitemap)', './routes/page.routes'],
  ['auth / account', './routes/auth.routes'],
  ['product listing', './routes/product.routes'],
  ['shopping cart', './routes/cart.routes'],
  ['wishlist', './routes/wishlist.routes'],
  ['checkout & orders', './routes/order.routes'],
  ['product review & rating', './routes/review.routes'],
  ['buyer-seller chat & negotiation', './routes/chat.routes'],
  // studio.routes must load before forum.routes: forum.routes' catch-all
  // `GET /forum/:id` (an ObjectId lookup) would otherwise intercept
  // `/forum/studios` first, since Express matches app.use()'d routers in
  // registration order regardless of which file a route lives in.
  ['studio map (forum)', './routes/studio.routes'],
  ['discussion forum & faq', './routes/forum.routes'],
  ['blog', './routes/blog.routes'],
  ['administration', './routes/admin.routes'],
  ['notifications', './routes/notification.routes']
];

for (const [name, file] of moduleRegistry) {
  try {
    app.use(require(file));
    console.log(`[module loaded] ${name}`);
  } catch (err) {
    console.error(`[module failed to load] ${name}:`, err.message);
  }
}

app.use((req, res) => {
  res.status(404).render('404', { message: "That page doesn't exist or its module isn't available right now." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('404', { message: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`StudioTrade running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});
