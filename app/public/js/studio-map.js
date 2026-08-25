// Studio Map module: shared Leaflet + Nominatim helper used by three pages —
// the address picker (submit/edit form), the single-pin detail map, and the
// multi-pin all-studios widget. No API key needed for any of it.
window.StudioMap = (function () {
  function mapsSearchUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  // Single marker, click/tap opens the location in Google Maps.
  function initDetailMap(containerId, lat, lng, name) {
    const el = document.getElementById(containerId);
    if (!el || typeof L === 'undefined') return;
    const map = L.map(containerId, { scrollWheelZoom: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.marker([lat, lng]).addTo(map).bindPopup(name);
    const openInMaps = () => window.open(mapsSearchUrl(lat, lng), '_blank', 'noopener');
    map.on('click', openInMaps);
    el.style.cursor = 'pointer';
    el.title = 'Open in Google Maps';
  }

  // Multi-marker widget for the studio-listing page. Each pin links to its
  // studio's detail page.
  function initListWidget(containerId, studios) {
    const el = document.getElementById(containerId);
    if (!el || typeof L === 'undefined') return;
    if (!studios || studios.length === 0) return;

    const map = L.map(containerId, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const bounds = [];
    studios.forEach((s) => {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
      bounds.push([s.lat, s.lng]);
      const ratingText = s.reviewCount ? `${s.rating.toFixed(1)}★ (${s.reviewCount})` : 'No reviews yet';
      L.marker([s.lat, s.lng]).addTo(map).bindPopup(
        `<strong>${s.name}</strong><br/>${ratingText}<br/><a href="/forum/studios/${s.id}">View studio</a>`
      );
    });

    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
    else map.setView([0, 0], 2);
  }

  // Debounced Nominatim search-as-you-type. On selection, fills the hidden
  // lat/lng/formattedAddress/osmId inputs (the only source the server will
  // trust) and drops a preview pin so the owner can confirm the pick.
  function initAddressPicker(opts) {
    const searchInput = document.getElementById(opts.searchInputId);
    const resultsBox = document.getElementById(opts.resultsListId);
    const latField = document.getElementById(opts.latFieldId);
    const lngField = document.getElementById(opts.lngFieldId);
    const addressField = document.getElementById(opts.addressFieldId);
    const osmIdField = document.getElementById(opts.osmIdFieldId);
    const previewEl = document.getElementById(opts.previewMapId);
    if (!searchInput || !resultsBox) return;

    let debounceTimer = null;
    let previewMap = null;
    let previewMarker = null;

    function clearResults() {
      resultsBox.innerHTML = '';
      resultsBox.style.display = 'none';
    }

    function showPreview(lat, lng) {
      if (!previewEl || typeof L === 'undefined') return;
      if (!previewMap) {
        previewMap = L.map(opts.previewMapId).setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(previewMap);
      } else {
        previewMap.setView([lat, lng], 15);
      }
      if (previewMarker) previewMarker.remove();
      previewMarker = L.marker([lat, lng]).addTo(previewMap);
    }

    function selectResult(result) {
      latField.value = result.lat;
      lngField.value = result.lon;
      addressField.value = result.display_name;
      if (osmIdField) osmIdField.value = result.osm_id || '';
      searchInput.value = result.display_name;
      clearResults();
      showPreview(Number(result.lat), Number(result.lon));
    }

    // Edit form loaded with an already-confirmed address — show it without
    // waiting for a fresh search.
    if (latField.value && lngField.value) {
      showPreview(Number(latField.value), Number(lngField.value));
    }

    searchInput.addEventListener('input', () => {
      // Any manual retyping invalidates the previously confirmed pick —
      // the server rejects submission without a fresh selected suggestion.
      latField.value = '';
      lngField.value = '';
      addressField.value = '';
      if (osmIdField) osmIdField.value = '';

      clearTimeout(debounceTimer);
      const query = searchInput.value.trim();
      if (query.length < 3) { clearResults(); return; }

      debounceTimer = setTimeout(async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`;
          const res = await fetch(url);
          const results = await res.json();
          if (!results.length) { clearResults(); return; }
          resultsBox.innerHTML = '';
          results.forEach((r) => {
            const item = document.createElement('div');
            item.className = 'address-suggestion';
            item.textContent = r.display_name;
            item.addEventListener('click', () => selectResult(r));
            resultsBox.appendChild(item);
          });
          resultsBox.style.display = 'block';
        } catch (e) { clearResults(); }
      }, 400);
    });

    document.addEventListener('click', (e) => {
      if (e.target !== searchInput && !resultsBox.contains(e.target)) clearResults();
    });
  }

  return { initDetailMap, initListWidget, initAddressPicker };
})();
