// Sends an SMS to every security contact when an alert is raised.
// Uses Termii (a Nigerian SMS provider). Set these environment variables:
//   TERMII_API_KEY     your Termii API key
//   TERMII_SENDER_ID   an approved sender ID (default "CampusGuard")
// Without TERMII_API_KEY nothing is sent, and the in-app alarm on the
// security dashboard is still the live notification.
const { CONTACTS } = require('../config/campus');

function toInternational(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  return '234' + digits.replace(/^0/, '');
}

function buildMessage(alert, student, nearest) {
  const ref = String(alert.id).padStart(5, '0');
  const parts = [`CAMPUSGUARD ALERT #${ref}: ${alert.category}.`, `${student.full_name} (${student.phone}).`];
  if (nearest) parts.push(`Near ${nearest.name} (~${Math.round(nearest.distance)}m).`);
  if (alert.latitude != null) parts.push(`Map: https://maps.google.com/?q=${alert.latitude},${alert.longitude}`);
  else parts.push('Location not captured.');
  return parts.join(' ');
}

async function sendOne(contact, text) {
  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: toInternational(contact.phone),
      from: process.env.TERMII_SENDER_ID || 'CampusGuard',
      sms: text,
      type: 'plain',
      channel: 'generic',
      api_key: process.env.TERMII_API_KEY,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Resolves to { configured, sent, failed }. Never throws.
async function notifyContacts(alert, student, nearest) {
  if (!process.env.TERMII_API_KEY) {
    return { configured: false, sent: 0, failed: 0 };
  }
  const text = buildMessage(alert, student, nearest);
  const results = await Promise.allSettled(CONTACTS.map((c) => sendOne(c, text)));
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`SMS to ${CONTACTS[i].name} failed:`, r.reason && r.reason.message);
  });
  return { configured: true, sent, failed: results.length - sent };
}

module.exports = { notifyContacts };
