const crypto = require('crypto');

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthKey(dateStr) { return dateStr.slice(0, 7); }
function currentMonthKey() { return monthKey(todayISO()); }
function fmt(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

module.exports = { todayISO, monthKey, currentMonthKey, fmt, hashPassword, verifyPassword, HttpError };
