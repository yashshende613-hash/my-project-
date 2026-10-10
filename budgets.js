const router = require('../lib/mini').Router();
const { currentMonthKey, HttpError } = require('../utils');
const { EXPENSE_CATS } = require('./transactions');

router.get('/', (req, res) => res.json({ budgets: req.user.ledger.budgets }));

// Create / update a category limit for the current month
router.put('/', (req, res, next) => {
  const { category } = req.body;
  const amount = parseFloat(req.body.amount);
  if (!EXPENSE_CATS.includes(category)) return next(new HttpError(400, 'Invalid category.'));
  if (!amount || amount <= 0) return next(new HttpError(400, 'Enter a valid budget amount.'));
  const mk = currentMonthKey();
  const L = req.user.ledger;
  if (!L.budgets[mk]) L.budgets[mk] = {};
  const isUpdate = L.budgets[mk][category] != null;
  L.budgets[mk][category] = amount;
  res.json({ budgets: L.budgets, isUpdate });
});

// +/- quick adjust
router.patch('/adjust', (req, res, next) => {
  const { category } = req.body;
  const delta = parseFloat(req.body.delta);
  const mk = currentMonthKey();
  const L = req.user.ledger;
  if (!L.budgets[mk] || L.budgets[mk][category] == null || isNaN(delta)) return next(new HttpError(404, 'Budget not found.'));
  L.budgets[mk][category] = Math.max(0, L.budgets[mk][category] + delta);
  res.json({ budgets: L.budgets, amount: L.budgets[mk][category] });
});

module.exports = router;
