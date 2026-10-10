const router = require('../lib/mini').Router();
const { todayISO, HttpError } = require('../utils');
const { checkOverspend } = require('../services/alerts');

const INCOME_CATS = ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Other'];
const EXPENSE_CATS = ['Food', 'Transport', 'Rent', 'Utilities', 'Shopping', 'Entertainment', 'Health', 'Education', 'Other'];

router.get('/', (req, res) => res.json({ transactions: req.user.ledger.transactions }));

router.post('/', (req, res, next) => {
  const L = req.user.ledger;
  const { type, category, note } = req.body;
  const amount = parseFloat(req.body.amount);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : todayISO();
  if (!['income', 'expense'].includes(type)) return next(new HttpError(400, 'Invalid transaction type.'));
  if (!amount || amount <= 0) return next(new HttpError(400, 'Enter a valid amount.'));
  if (!(type === 'income' ? INCOME_CATS : EXPENSE_CATS).includes(category)) return next(new HttpError(400, 'Invalid category.'));
  const tx = { id: L.counters.tx++, type, category, amount, date, note: String(note || '').trim() };
  L.transactions.push(tx);
  const alert = type === 'expense' ? checkOverspend(L, category) : null;
  res.status(201).json({ transaction: tx, alert });
});

router.delete('/:id', (req, res) => {
  const L = req.user.ledger;
  L.transactions = L.transactions.filter(t => t.id !== parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
module.exports.INCOME_CATS = INCOME_CATS;
module.exports.EXPENSE_CATS = EXPENSE_CATS;
