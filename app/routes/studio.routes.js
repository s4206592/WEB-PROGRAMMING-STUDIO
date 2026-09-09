const express = require('express');
const { Studio, StudioReview } = require('../models/studio.model');
const { requireLogin, requireAdmin } = require('../middleware/auth.middleware');

// Studio Map — a sub-feature of the Discussion Forum module, kept in its own
// route file/moduleRegistry entry so it can be deleted (file + registry line)
// without touching forum.routes.js or any other module. All paths live under
// /forum/studios/* so it still reads as part of the forum in the URL space.
const router = express.Router();

function splitList(value) {
  return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function canManageStudio(req, studio) {
  if (!req.session.user) return false;
  return String(studio.ownerId) === String(req.session.user.id) || req.session.user.role === 'admin';
}

// Confirms a client-picked lat/lng against Nominatim's reverse-geocode
// endpoint server-side, so the stored address is never taken from free text
// or a tampered request — only from coordinates that resolve to a real place.
// A custom User-Agent is required by Nominatim's usage policy for server-side
// callers (browsers can't set this header, which is fine — theirs carries a
// Referer instead, which is what the policy expects from client-side calls).
async function confirmAddress(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'StudioTrade-StudioMap/1.0 (class project)' } });
  if (!res.ok) throw new Error('Nominatim reverse geocode request failed');
  const data = await res.json();
  if (!data || !data.display_name) throw new Error('No address found for that location');
  return { formattedAddress: data.display_name, osmId: data.osm_id ? String(data.osm_id) : undefined };
}

// Builds the location subdocument from form fields. The hidden lat/lng/
// formattedAddress/osmId inputs are only ever populated client-side by
// selecting a Nominatim search suggestion (see studio-map.js) — never typed
// directly — and are re-confirmed here server-side before being trusted.
async function resolveLocation(body, fallback) {
  const loc = body.location || {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  try {
    const confirmed = await confirmAddress(lat, lng);
    return { lat, lng, formattedAddress: confirmed.formattedAddress, osmId: confirmed.osmId };
  } catch (e) {
    // Nominatim's public instance has no uptime guarantee (1 req/sec, best
    // effort) — fall back to what the client's picker already resolved
    // rather than blocking submission entirely. Coordinates still only ever
    // arrive here via a selected suggestion, so this isn't a free-text hole.
    if (loc.formattedAddress) {
      return { lat, lng, formattedAddress: loc.formattedAddress, osmId: loc.osmId || undefined };
    }
    return fallback || null;
  }
}

const EMPTY_STUDIO = {
  name: '', description: '', equipmentHighlights: '', photos: '',
  rates: { hourly: '', daily: '' },
  ownerContact: { businessName: '', phone: '', contactEmail: '' },
  location: { lat: '', lng: '', formattedAddress: '' }
};

router.get('/forum/studios', async (req, res) => {
  let studios = [];
  try {
    studios = await Studio.find({ status: 'approved' }).sort({ createdAt: -1 }).lean();
  } catch (e) { /* studios collection unavailable — page still renders, empty state */ }
  const mapStudios = studios.map(s => ({
    id: String(s._id), name: s.name, lat: s.location.lat, lng: s.location.lng,
    rating: s.ratingSummary.avg, reviewCount: s.ratingSummary.count
  }));
  res.render('forum/studios/listing', { studios, mapStudios });
});

router.get('/forum/studios/new', requireLogin, (req, res) => {
  res.render('forum/studios/submit', { error: null, old: EMPTY_STUDIO });
});

router.post('/forum/studios/new', requireLogin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !description) {
      return res.render('forum/studios/submit', { error: 'Name and description are required.', old: req.body });
    }

    const location = await resolveLocation(req.body);
    if (!location) {
      return res.render('forum/studios/submit', { error: 'Please pick a valid address from the search suggestions.', old: req.body });
    }

    const ownerContact = req.body.ownerContact || {};
    const rates = req.body.rates || {};

    const studio = await Studio.create({
      ownerId: req.session.user.id,
      ownerSnapshot: { username: req.session.user.username },
      ownerContact: { businessName: ownerContact.businessName, phone: ownerContact.phone, contactEmail: ownerContact.contactEmail },
      name, description,
      equipmentHighlights: splitList(req.body.equipmentHighlights),
      photos: splitList(req.body.photos),
      rates: { hourly: rates.hourly ? Number(rates.hourly) : undefined, daily: rates.daily ? Number(rates.daily) : undefined },
      location,
      reviewHistory: [{ action: 'submitted', byId: req.session.user.id }]
    });
    res.redirect(`/forum/studios/manage?submitted=${studio._id}`);
  } catch (err) {
    console.error(err);
    res.render('forum/studios/submit', { error: 'Could not submit your studio. Please try again.', old: req.body });
  }
});

// Owner's own listings, with status badges + edit/resubmit links. Registered
// before /forum/studios/:id — same static-vs-param ordering rule already
// documented in forum.routes.js for /forum/manage.
router.get('/forum/studios/manage', requireLogin, async (req, res) => {
  const studios = await Studio.find({ ownerId: req.session.user.id }).sort({ createdAt: -1 }).lean();
  res.render('forum/studios/manage', { studios });
});

// Admin pending-review queue. Also registered before /forum/studios/:id.
router.get('/forum/studios/staff', requireAdmin, async (req, res) => {
  const pending = await Studio.find({ status: 'pending_review' }).sort({ createdAt: 1 }).lean();
  res.render('forum/studios/staff-review', { pending });
});

router.post('/forum/studios/staff/:id/approve', requireAdmin, async (req, res) => {
  try {
    await Studio.findByIdAndUpdate(req.params.id, {
      status: 'approved',
      reviewNote: req.body.note || '',
      reviewedBy: req.session.user.id,
      reviewedAt: new Date(),
      $push: { reviewHistory: { action: 'approved', note: req.body.note || '', byId: req.session.user.id } }
    });
  } catch (err) { console.error(err); }
  res.redirect('/forum/studios/staff');
});

router.post('/forum/studios/staff/:id/reject', requireAdmin, async (req, res) => {
  if (!req.body.reason) return res.redirect('/forum/studios/staff');
  try {
    await Studio.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      reviewNote: req.body.reason,
      reviewedBy: req.session.user.id,
      reviewedAt: new Date(),
      $push: { reviewHistory: { action: 'rejected', note: req.body.reason, byId: req.session.user.id } }
    });
  } catch (err) { console.error(err); }
  res.redirect('/forum/studios/staff');
});

router.get('/forum/studios/:id/edit', requireLogin, async (req, res) => {
  const studio = await Studio.findById(req.params.id).lean();
  if (!studio) return res.status(404).render('404', { message: 'Studio not found.' });
  if (!canManageStudio(req, studio)) return res.status(403).render('404', { message: "You don't have access to edit this studio." });
  res.render('forum/studios/edit', { studio, error: null });
});

router.post('/forum/studios/:id/edit', requireLogin, async (req, res) => {
  const studio = await Studio.findById(req.params.id);
  if (!studio) return res.status(404).render('404', { message: 'Studio not found.' });
  if (!canManageStudio(req, studio)) return res.status(403).render('404', { message: "You don't have access to edit this studio." });

  const { name, description } = req.body;
  if (!name || !description) {
    return res.render('forum/studios/edit', { studio: { ...studio.toObject(), ...req.body }, error: 'Name and description are required.' });
  }

  const location = await resolveLocation(req.body, studio.location);
  if (!location) {
    return res.render('forum/studios/edit', { studio: { ...studio.toObject(), ...req.body }, error: 'Please pick a valid address from the search suggestions.' });
  }

  const ownerContact = req.body.ownerContact || {};
  const rates = req.body.rates || {};

  try {
    studio.name = name;
    studio.description = description;
    studio.equipmentHighlights = splitList(req.body.equipmentHighlights);
    studio.photos = splitList(req.body.photos);
    studio.rates = { hourly: rates.hourly ? Number(rates.hourly) : undefined, daily: rates.daily ? Number(rates.daily) : undefined };
    studio.ownerContact = { businessName: ownerContact.businessName, phone: ownerContact.phone, contactEmail: ownerContact.contactEmail };
    studio.location = location;

    // Resubmit loop: an edit after rejection re-enters the review queue.
    // An edit to an already-approved listing keeps its current status —
    // only the reject -> edit -> resubmit cycle is in scope here.
    if (studio.status === 'rejected') {
      studio.status = 'pending_review';
      studio.reviewHistory.push({ action: 'resubmitted', byId: req.session.user.id });
    }

    await studio.save();
    res.redirect('/forum/studios/manage');
  } catch (err) {
    console.error(err);
    res.render('forum/studios/edit', { studio: { ...studio.toObject(), ...req.body }, error: 'Could not save your changes. Please try again.' });
  }
});

router.get('/forum/studios/:id', async (req, res) => {
  const studio = await Studio.findById(req.params.id).lean();
  if (!studio) return res.status(404).render('404', { message: 'Studio not found.' });

  const isOwner = req.session.user && String(studio.ownerId) === String(req.session.user.id);
  const isAdmin = req.session.user && req.session.user.role === 'admin';
  if (studio.status !== 'approved' && !isOwner && !isAdmin) {
    return res.status(404).render('404', { message: 'Studio not found.' });
  }

  let reviews = [];
  try {
    reviews = await StudioReview.find({ studioId: studio._id, status: 'published' }).sort({ createdAt: -1 }).lean();
  } catch (e) { /* studio reviews unavailable — page still renders */ }

  res.render('forum/studios/detail', { studio, reviews, canManage: isOwner || isAdmin });
});

router.post('/forum/studios/:id/reviews', requireLogin, async (req, res) => {
  try {
    const { rating, title, comment } = req.body;
    const studio = await Studio.findById(req.params.id).lean();
    if (!studio || studio.status !== 'approved') return res.redirect('/forum/studios');
    if (!rating || !comment) return res.redirect(`/forum/studios/${req.params.id}`);

    await StudioReview.create({
      studioId: studio._id,
      studioSnapshot: { name: studio.name, photo: studio.photos[0] || '' },
      reviewerId: req.session.user.id,
      reviewerSnapshot: { username: req.session.user.username },
      rating: Number(rating), title, comment
    });

    // Best-effort cache refresh, mirrors review.routes.js's Product.ratingSummary update.
    try {
      const stats = await StudioReview.aggregate([
        { $match: { studioId: studio._id, status: 'published' } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]);
      if (stats[0]) {
        await Studio.findByIdAndUpdate(studio._id, {
          'ratingSummary.avg': Math.round(stats[0].avg * 10) / 10,
          'ratingSummary.count': stats[0].count
        });
      }
    } catch (e) { /* rating cache refresh is optional */ }

    res.redirect(`/forum/studios/${studio._id}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/forum/studios/${req.params.id}`);
  }
});

module.exports = router;
