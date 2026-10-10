const router = require('../lib/mini').Router();
const store = require('../store');
const { getBudgetAlerts, getGroupAlerts } = require('../services/alerts');
const { fmt, HttpError } = require('../utils');

// Demo mode: aggregated mock users + the admin's own sample ledger. No real PII / live bank feeds.
router.get('/overview', (req, res) => {
  const L = req.user.ledger;
  const mock = store.adminMockUsers;
  const own = [...getBudgetAlerts(L), ...getGroupAlerts(L)];

  const stats = {
    users: mock.length + 1,
    transactions: mock.reduce((s, u) => s + u.txCount, 0) + L.transactions.length,
    groups: mock.reduce((s, u) => s + u.groupsCount, 0) + L.groups.length,
    openAlerts: mock.filter(u => u.budgetAlert || u.settlementPending > 0).length + (own.length > 0 ? 1 : 0),
  };

  const alerts = [
    ...own.map(a => ({ type: a.type, icon: a.icon, title: 'Your account — ' + a.title, desc: a.desc })),
    ...mock.filter(u => u.budgetAlert).map(u => ({ type: u.budgetAlert.type, icon: u.budgetAlert.type === 'over' ? '🚨' : '⚠', title: u.name + ' — ' + u.budgetAlert.category, desc: u.budgetAlert.detail })),
    ...mock.filter(u => u.settlementPending > 0).map(u => ({ type: 'info', icon: '🔔', title: u.name + ' has a pending settlement', desc: fmt(u.settlementPending) + ' still due across their groups.' })),
  ];

  const banks = [
    ...(L.bankLink.linked ? [{ name: req.user.name + ' (you)', detail: L.bankLink.bankName + ' · A/C ending ' + L.bankLink.last4 }] : []),
    ...mock.filter(u => u.bankLinked).map(u => ({ name: u.name, detail: u.bankName + ' · linked account' })),
  ];

  res.json({ stats, alerts, users: mock, banks, audit: store.adminAuditLog });
});

router.patch('/users/:id/status', (req, res, next) => {
  const u = store.adminMockUsers.find(x => x.id === parseInt(req.params.id));
  if (!u) return next(new HttpError(404, 'User not found.'));
  u.status = u.status === 'active' ? 'suspended' : 'active';
  store.addAuditLog((u.status === 'active' ? 'Activated ' : 'Suspended ') + u.name + '’s account.');
  res.json({ user: u });
});

router.delete('/users/:id', (req, res, next) => {
  const idx = store.adminMockUsers.findIndex(x => x.id === parseInt(req.params.id));
  if (idx === -1) return next(new HttpError(404, 'User not found.'));
  const [u] = store.adminMockUsers.splice(idx, 1);
  store.addAuditLog('Removed user ' + u.name + ' (' + u.email + ').');
  res.json({ ok: true });
});

router.get('/users/export.csv', (req, res) => {
  const header = ['Name', 'Email', 'Joined', 'Plan', 'Bank Linked', 'Status', 'Transactions', 'Groups'];
  const rows = store.adminMockUsers.map(u => [u.name, u.email, u.joined, u.plan, u.bankLinked ? u.bankName : 'No', u.status, u.txCount, u.groupsCount]);
  const csv = [header, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  store.addAuditLog('Exported the demo user list to CSV.');
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="spendwise-admin-users.csv"').send(csv);
});

module.exports = router;
