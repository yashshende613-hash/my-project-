const router = require('../lib/mini').Router();
const store = require('../store');
const { publicUser } = require('./auth');
const { HttpError } = require('../utils');

router.get('/', (req, res) => res.json({ user: publicUser(req.user) }));

router.put('/', (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  if (!name || !email) return next(new HttpError(400, 'Name and email are required.'));
  if (store.users.some(u => u.id !== req.user.id && u.email.toLowerCase() === email.toLowerCase())) return next(new HttpError(409, 'An account with that email already exists.'));
  req.user.name = name; req.user.email = email;
  res.json({ user: publicUser(req.user) });
});

router.post('/onboarded', (req, res) => { req.user.hasOnboarded = true; res.json({ user: publicUser(req.user) }); });

module.exports = router;
