const router = require('../lib/mini').Router();
const { groupView } = require('../services/groups');
const { alertsFor } = require('../services/alerts');

// One call that returns everything the UI needs to render.
router.get('/', (req, res) => {
  const L = req.user.ledger;
  res.json({
    transactions: L.transactions,
    budgets: L.budgets,
    groups: L.groups.map(groupView),
    bank: { bankLink: L.bankLink, autoDetected: L.autoDetected },
    alerts: alertsFor(L),
  });
});

router.post('/alerts/dismiss', (req, res) => {
  if (req.body.key) req.user.ledger.dismissedAlerts.add(String(req.body.key));
  res.json({ ok: true });
});

module.exports = router;
