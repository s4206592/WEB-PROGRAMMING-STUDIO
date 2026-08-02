const express = require('express');
const { Studio, StudioBooking, Conversation, User } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, uniqueSlug, parseVND, VN_PROVINCES } = require('../utils/helpers');
const { notify } = require('../utils/notify');

const router = express.Router();

const AMENITIES = [
  'parking', 'makeup_room', 'backdrop', 'green_screen', 'wifi',
  'air_conditioning', 'lighting_kit', 'changing_room', 'kitchen', 'wheelchair_access'
];

// ── Studios Page ──────────────────────────────────────────────────
router.get('/', asyncH(async (req, res) => {
  const filter = { status: 'active' };
  if (req.query.province) filter['address.province'] = String(req.query.province);
  if (req.query.verified === '1') filter['verification.status'] = 'verified';
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }
  const amenities = [].concat(req.query.amenity || []).filter(a => AMENITIES.includes(a));
  if (amenities.length) filter.amenities = { $all: amenities };

  const studios = await Studio.find(filter)
    .sort({ isFeatured: -1, 'ratingSummary.average': -1, createdAt: -1 })
    .limit(40).populate('ownerId', 'username fullName').lean();

  // Price filter applies to the cheapest hourly rate, computed after fetch
  // because pricing is an array of tiers rather than a single number.
  const maxPrice = parseVND(req.query.maxPrice);
  const rows = studios.map(s => ({
    ...s,
    fromPrice: (s.pricing || []).length ? Math.min(...s.pricing.map(p => p.price)) : null
  })).filter(s => !maxPrice || (s.fromPrice != null && s.fromPrice <= maxPrice));

  res.render('studios/listing', {
    title: 'Studios',
    breadcrumb: 'Home / Studios',
    studios: rows, provinces: VN_PROVINCES, AMENITIES,
    q: req.query.q || '',
    activeProvince: req.query.province || '',
    activeAmenities: amenities,
    maxPrice: req.query.maxPrice || '',
    verifiedOnly: req.query.verified === '1'
  });
}));

// ── Studio Owner Dashboard ────────────────────────────────────────
router.get('/dashboard', requireAuth, asyncH(async (req, res) => {
  const [studios, bookings] = await Promise.all([
    Studio.find({ ownerId: req.user._id, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).lean(),
    StudioBooking.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).limit(50)
      .populate('userId', 'username fullName')
      .populate('studioId', 'name slug').lean()
  ]);
  res.render('studios/dashboard', {
    title: 'Studio Owner Dashboard',
    breadcrumb: 'Home / Studios / Owner Dashboard',
    studios, bookings
  });
}));

// ── Create / edit a studio ────────────────────────────────────────
router.get('/new', requireAuth, (req, res) => {
  res.render('studios/form', {
    title: 'List a Studio',
    breadcrumb: 'Home / Studios / List a Studio',
    studio: null, provinces: VN_PROVINCES, AMENITIES, form: {}, errors: []
  });
});

function readStudioForm(body) {
  const errors = [];
  const name = String(body.name || '').trim().slice(0, 120);
  if (name.length < 3) errors.push('Give the studio a name.');
  if (!String(body.province || '').trim()) errors.push('Choose a province.');

  const units = [].concat(body.priceUnit || []);
  const amounts = [].concat(body.priceAmount || []);
  const pricing = [];
  for (let i = 0; i < units.length; i++) {
    const price = parseVND(amounts[i]);
    if (price > 0 && ['hour', 'half_day', 'day'].includes(units[i])) {
      pricing.push({ unit: units[i], price });
    }
  }

  const equipNames = [].concat(body.equipName || []);
  const equipQty = [].concat(body.equipQty || []);
  const equipment = equipNames
    .map((n, i) => ({ name: String(n).trim(), quantity: parseInt(equipQty[i], 10) || 1 }))
    .filter(e => e.name);

  const gallery = [].concat(body.galleryUrl || [])
    .map(u => String(u).trim()).filter(Boolean).slice(0, 10)
    .map((url, i) => ({ url, order: i }));

  return {
    errors,
    data: {
      name,
      description: String(body.description || '').trim().slice(0, 3000),
      coverImageUrl: String(body.coverImageUrl || '').trim(),
      gallery,
      address: {
        line1: String(body.line1 || '').trim(),
        ward: String(body.ward || '').trim(),
        district: String(body.district || '').trim(),
        province: String(body.province || '').trim(),
        country: 'VN'
      },
      contact: {
        phone: String(body.phone || '').trim(),
        email: String(body.email || '').trim(),
        website: String(body.website || '').trim(),
        facebook: String(body.facebook || '').trim(),
        instagram: String(body.instagram || '').trim()
      },
      equipment,
      amenities: [].concat(body.amenity || []).filter(a => AMENITIES.includes(a)),
      areaSqm: parseInt(body.areaSqm, 10) || undefined,
      capacity: parseInt(body.capacity, 10) || undefined,
      pricing
    }
  };
}

router.post('/new', requireAuth, asyncH(async (req, res) => {
  const { data, errors } = readStudioForm(req.body);
  if (errors.length) {
    return res.status(400).render('studios/form', {
      title: 'List a Studio',
      breadcrumb: 'Home / Studios / List a Studio',
      studio: null, provinces: VN_PROVINCES, AMENITIES, form: req.body, errors
    });
  }

  const studio = await Studio.create({
    ...data,
    ownerId: req.user._id,
    slug: uniqueSlug(data.name),
    status: 'active',
    verification: { status: 'pending' }   // an admin verifies it later
  });

  if (!req.user.roles.includes('studio_owner')) {
    req.user.roles.push('studio_owner');
    await req.user.save();
  }

  req.flash('success', 'Studio listed. Verification is pending — an admin will review it.');
  res.redirect(`/studios/${studio.slug}`);
}));

router.get('/:id/edit', requireAuth, asyncH(async (req, res) => {
  const studio = await Studio.findOne({ _id: req.params.id, ownerId: req.user._id });
  if (!studio) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'That studio is not yours.' });
  }
  res.render('studios/form', {
    title: 'Edit Studio',
    breadcrumb: `Home / Studios / ${studio.name} / Edit`,
    studio, provinces: VN_PROVINCES, AMENITIES, form: {}, errors: []
  });
}));

router.post('/:id/edit', requireAuth, asyncH(async (req, res) => {
  const studio = await Studio.findOne({ _id: req.params.id, ownerId: req.user._id });
  if (!studio) return res.redirect('/studios/dashboard');

  const { data, errors } = readStudioForm(req.body);
  if (errors.length) {
    return res.status(400).render('studios/form', {
      title: 'Edit Studio',
      breadcrumb: `Home / Studios / ${studio.name} / Edit`,
      studio, provinces: VN_PROVINCES, AMENITIES, form: req.body, errors
    });
  }
  Object.assign(studio, data);
  await studio.save();
  req.flash('success', 'Studio updated.');
  res.redirect(`/studios/${studio.slug}`);
}));

router.post('/:id/status', requireAuth, asyncH(async (req, res) => {
  const next = ['active', 'paused', 'removed'].includes(req.body.status) ? req.body.status : null;
  if (!next) return res.redirect('/studios/dashboard');
  await Studio.updateOne({ _id: req.params.id, ownerId: req.user._id }, { $set: { status: next } });
  req.flash('success', `Studio set to ${next}.`);
  res.redirect('/studios/dashboard');
}));

// ── Studio Profile ────────────────────────────────────────────────
router.get('/:slug', asyncH(async (req, res) => {
  const studio = await Studio.findOne({ slug: req.params.slug })
    .populate('ownerId', 'username fullName avatarUrl createdAt');
  if (!studio || studio.status === 'removed') {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such studio.' });
  }
  const isOwner = req.user && String(studio.ownerId._id) === String(req.user._id);
  const myBookings = req.user
    ? await StudioBooking.find({ studioId: studio._id, userId: req.user._id }).sort({ createdAt: -1 }).limit(5).lean()
    : [];

  res.render('studios/profile', {
    title: studio.name,
    breadcrumb: `Home / Studios / ${studio.name}`,
    studio, isOwner, myBookings, AMENITIES
  });
}));

// ── Send an enquiry / booking request ─────────────────────────────
router.post('/:slug/enquire', requireAuth, asyncH(async (req, res) => {
  const studio = await Studio.findOne({ slug: req.params.slug });
  if (!studio) return res.redirect('/studios');
  if (String(studio.ownerId) === String(req.user._id)) {
    req.flash('error', 'That is your own studio.');
    return res.redirect(`/studios/${studio.slug}`);
  }

  const message = String(req.body.message || '').trim().slice(0, 1000);
  if (message.length < 10) {
    req.flash('error', 'Tell the owner a little about what you need.');
    return res.redirect(`/studios/${studio.slug}`);
  }

  const type = req.body.type === 'booking' ? 'booking' : 'enquiry';
  const startAt = req.body.startAt ? new Date(req.body.startAt) : undefined;
  const endAt = req.body.endAt ? new Date(req.body.endAt) : undefined;
  if (type === 'booking' && (!startAt || !endAt || endAt <= startAt)) {
    req.flash('error', 'Choose a start and end time, with the end after the start.');
    return res.redirect(`/studios/${studio.slug}`);
  }

  const booking = await StudioBooking.create({
    studioId: studio._id,
    userId: req.user._id,
    ownerId: studio.ownerId,
    type, startAt, endAt,
    headcount: parseInt(req.body.headcount, 10) || undefined,
    message,
    status: type === 'booking' ? 'pending' : 'enquiry'
  });

  // Open a chat thread alongside the enquiry.
  const participantsKey = Conversation.buildKey(req.user._id, studio.ownerId);
  await Conversation.findOneAndUpdate(
    { participantsKey, studioId: studio._id },
    {
      $setOnInsert: {
        participants: [req.user._id, studio.ownerId],
        context: 'studio', subject: studio.name,
        thumbUrl: studio.coverImageUrl, status: 'open'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await notify(studio.ownerId, {
    type: 'studio_enquiry',
    title: type === 'booking' ? 'New booking request' : 'New studio enquiry',
    body: `${req.user.username} contacted you about ${studio.name}.`,
    linkUrl: '/studios/dashboard',
    targetType: 'studio', targetId: studio._id,
    priority: 'high'
  });

  req.flash('success', 'Sent. The owner will respond from their dashboard.');
  res.redirect(`/studios/${studio.slug}`);
}));

// ── Owner responds ────────────────────────────────────────────────
router.post('/bookings/:id/respond', requireAuth, asyncH(async (req, res) => {
  const booking = await StudioBooking.findOne({ _id: req.params.id, ownerId: req.user._id })
    .populate('studioId', 'name slug');
  if (!booking) return res.redirect('/studios/dashboard');

  const decision = ['confirmed', 'declined', 'completed', 'cancelled'].includes(req.body.decision)
    ? req.body.decision : null;
  if (!decision) return res.redirect('/studios/dashboard');

  booking.status = decision;
  booking.ownerResponse = {
    message: String(req.body.message || '').slice(0, 1000),
    respondedAt: new Date()
  };
  const quoted = parseVND(req.body.quotedPrice);
  if (quoted) booking.quotedPrice = quoted;
  await booking.save();

  await notify(booking.userId, {
    type: 'studio_enquiry',
    title: `Studio ${decision}`,
    body: `${booking.studioId.name}: ${booking.ownerResponse.message || decision}`,
    linkUrl: `/studios/${booking.studioId.slug}`,
    targetType: 'studio', targetId: booking.studioId._id
  });

  req.flash('success', `Marked as ${decision}.`);
  res.redirect('/studios/dashboard');
}));

module.exports = router;
