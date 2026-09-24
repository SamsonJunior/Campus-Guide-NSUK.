// Sends real emails through your Gmail account using an "App Password"
// (not your normal Gmail password — Google requires a separate 16-character
// App Password for this, generated at myaccount.google.com/apppasswords,
// which only works if 2-Step Verification is turned on for the account).
const nodemailer = require('nodemailer');

const gmailUser = (process.env.GMAIL_USER || '').trim();
const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || '').trim();

let transporter = null;

function getTransporter() {
  if (!gmailUser || !gmailAppPassword) {
    throw new Error(
      'Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables. ' +
      'Set them (e.g. in Render\u2019s Environment tab) to enable password-reset emails.'
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailAppPassword },
    });
  }
  return transporter;
}

async function sendPasswordResetEmail(toEmail, resetUrl, opts = {}) {
  const heading = opts.heading || 'CampusGuard';
  await getTransporter().sendMail({
    from: `"CampusGuard \u2022 NSUK" <${gmailUser}>`,
    to: toEmail,
    subject: `Reset your ${heading} password`,
    text:
      `We received a request to reset your ${heading} password.\n\n` +
      `Reset it here (this link expires in 1 hour):\n${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`,
    html:
      `<p>We received a request to reset your ${heading} password.</p>` +
      `<p><a href="${resetUrl}" style="background:#1f7a4d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Reset your password</a></p>` +
      `<p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
  });
}

module.exports = { sendPasswordResetEmail };
