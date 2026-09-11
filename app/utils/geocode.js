// Shared Nominatim reverse-geocode helper. Originally lived only in
// studio.routes.js; extracted so product.routes.js (pickup location) can
// reuse the same "never trust client-submitted address text, only
// coordinates confirmed against a real place" pattern.
//
// A custom User-Agent is required by Nominatim's usage policy for
// server-side callers (browsers can't set this header, which is fine —
// theirs carries a Referer instead, which is what the policy expects from
// client-side calls).
async function confirmAddress(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'StudioTrade-Geocode/1.0 (class project)' } });
  if (!res.ok) throw new Error('Nominatim reverse geocode request failed');
  const data = await res.json();
  if (!data || !data.display_name) throw new Error('No address found for that location');
  return {
    formattedAddress: data.display_name,
    osmId: data.osm_id ? String(data.osm_id) : undefined,
    city: extractCity(data)
  };
}

// Pulls a city-level label out of Nominatim's structured address block.
// Falls back through progressively broader fields since rural pins often
// have no `city`, only `town`/`village`/`county`.
function extractCity(nominatimResult) {
  const addr = nominatimResult && nominatimResult.address;
  if (!addr) return undefined;
  return addr.city || addr.town || addr.village || addr.county || addr.state || undefined;
}

module.exports = { confirmAddress, extractCity };
