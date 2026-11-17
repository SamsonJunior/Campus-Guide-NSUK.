// Great-circle distance (metres) between two lat/lng points.
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Returns { id, name, distance } for the closest location, or null.
function nearestLocation(lat, lng, locations) {
  let best = null;
  for (const l of locations) {
    const d = distanceM(lat, lng, Number(l.latitude), Number(l.longitude));
    if (!best || d < best.distance) best = { id: l.id, name: l.name, distance: d };
  }
  return best;
}

module.exports = { distanceM, nearestLocation };
