const path = require('path');
const mini = require('./lib/mini'); // swap for require('express') + require('cors') if you prefer
const cfg = require('./config');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = mini.app();
app.use(mini.cors());
app.use(mini.json());

// ---- API ----
app.use('/api/auth', require('./routes/auth').router);
app.use('/api/me', requireAuth, require('./routes/profile'));
app.use('/api/state', requireAuth, require('./routes/state'));
app.use('/api/transactions', requireAuth, require('./routes/transactions'));
app.use('/api/budgets', requireAuth, require('./routes/budgets'));
app.use('/api/groups', requireAuth, require('./routes/groups'));
app.use('/api/bank', requireAuth, require('./routes/bank'));
app.use('/api/admin', requireAuth, requireAdmin, require('./routes/admin'));
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- Optional: serve the frontend from the same server (npm start → http://localhost:3000) ----
app.use(mini.static(path.join(__dirname, '..', '..', 'frontend')));

// ---- Errors ----
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error.' });
});

app.listen(cfg.PORT, () => console.log('SpendWise running → http://localhost:' + cfg.PORT));
