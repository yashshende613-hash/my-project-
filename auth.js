const router = require('../lib/mini').Router();
const store = require('../store');
const cfg = require('../config');
const { requireAuth } = require('../middleware/auth');
const { verifyPassword, HttpError } = require('../utils');
const { emptyLedger } = require('../services/seed');

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, hasOnboarded: u.hasOnboarded, isAdmin: !!u.isAdmin });

router.post('/login', (req, res, next) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = store.users.find(u => !u.isAdmin && u.email.toLowerCase() === email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.passwordHash)) return next(new HttpError(401, 'Incorrect email or password.'));
  res.json({ token: store.createSession(user.id), user: publicUser(user) });
});

router.post('/register', (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  if (!name || !email || pw.length < 6) return next(new HttpError(400, 'Please fill all fields — password needs 6+ characters.'));
  if (store.users.some(u => u.email.toLowerCase() === email)) return next(new HttpError(409, 'An account with that email already exists.'));
  const user = store.createUser({ name, email, password: pw, ledger: emptyLedger() }); // fresh ledger for a new registrant
  res.status(201).json({ token: store.createSession(user.id), user: publicUser(user) });
});

router.post('/admin-login', (req, res, next) => {
  const id = String(req.body.id || '').trim().toLowerCase();
  const user = store.users.find(u => u.isAdmin && u.email.toLowerCase() === id);
  if (!user || !verifyPassword(String(req.body.password || ''), user.passwordHash)) return next(new HttpError(401, 'Incorrect admin ID or password.'));
  res.json({ token: store.createSession(user.id), user: publicUser(user) });
});

router.post('/logout', requireAuth, (req, res) => { store.destroySession(req.token); res.json({ ok: true }); });

module.exports = { router, publicUser };
