// Security contacts shown to students and notified (by SMS) on every alert.
// Edit here to add/remove people. Numbers are Nigerian local format.
const CONTACTS = [
  { name: 'Samuel (Security)', phone: '07030373881' },
  { name: 'Umaru Moses (Security)', phone: '08076179864' },
  { name: 'Ade (Security)', phone: '07082179223' },
];

// Monitored campus points. The coordinates below are APPROXIMATE placeholders
// placed around the NSUK Keffi campus centre (8.8471, 7.8776). They are NOT
// surveyed building positions. Set the exact points on /admin/locations
// (stand at the spot and press "Use my current location").
const DEFAULT_LOCATIONS = [
  { name: 'Senate Building', latitude: 8.8474, longitude: 7.8779 },
  { name: 'ICT Centre', latitude: 8.8468, longitude: 7.8772 },
  { name: 'Uni Port', latitude: 8.8463, longitude: 7.8781 },
  { name: 'Entrepreneurship Centre', latitude: 8.8478, longitude: 7.8769 },
];

module.exports = { CONTACTS, DEFAULT_LOCATIONS };
