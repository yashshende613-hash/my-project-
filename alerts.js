const { currentMonthKey, monthKey, fmt } = require('../utils');
const { computeBalances, simplifyDebts } = require('./groups');

function spentIn(ledger, cat, mk) {
  return ledger.transactions.filter(t => t.type === 'expense' && t.category === cat && monthKey(t.date) === mk).reduce((s, t) => s + t.amount, 0);
}

function getBudgetAlerts(ledger) {
  const mk = currentMonthKey();
  const b = ledger.budgets[mk] || {};
  const alerts = [];
  Object.keys(b).forEach(cat => {
    const limit = b[cat];
    if (!limit || limit <= 0) return;
    const spent = spentIn(ledger, cat, mk);
    const pct = Math.round((spent / limit) * 100);
    if (spent > limit) {
      alerts.push({ key: 'budget-over-' + cat, type: 'over', icon: '🚨', title: cat + ' is over budget', desc: 'Spent ' + fmt(spent) + ' of ' + fmt(limit) + ' — ' + fmt(spent - limit) + ' over the limit.' });
    } else if (pct >= 80) {
      alerts.push({ key: 'budget-warn-' + cat, type: 'warn', icon: '⚠', title: cat + ' is nearing its limit', desc: pct + '% of the ' + fmt(limit) + ' budget used (' + fmt(spent) + ' spent).' });
    }
  });
  return alerts;
}

function getGroupAlerts(ledger) {
  const alerts = [];
  ledger.groups.forEach(g => {
    if (!g.expenses.length) return;
    const transfers = simplifyDebts(computeBalances(g));
    if (transfers.length) {
      const total = transfers.reduce((s, t) => s + t.amount, 0);
      alerts.push({ key: 'group-settle-' + g.id, type: 'info', icon: '🔔', title: 'Pending settlement in "' + g.name + '"', desc: transfers.length + ' transfer' + (transfers.length > 1 ? 's' : '') + ' totalling ' + fmt(total) + ' still due.' });
    }
  });
  return alerts;
}

// Called right after an expense is saved; returns a message for the UI toast (or null)
function checkOverspend(ledger, category) {
  const mk = currentMonthKey();
  const limit = (ledger.budgets[mk] || {})[category];
  if (limit == null) return null;
  const spent = spentIn(ledger, category, mk);
  const pct = Math.round((spent / limit) * 100);
  if (spent > limit) {
    ledger.dismissedAlerts.delete('budget-over-' + category);
    return { level: 'over', message: '🚨 Over budget on ' + category + ' — ' + fmt(spent - limit) + ' beyond your ' + fmt(limit) + ' limit.' };
  } else if (pct >= 80) {
    ledger.dismissedAlerts.delete('budget-warn-' + category);
    return { level: 'warn', message: '⚠ Reminder: ' + category + ' spending is at ' + pct + '% of its ' + fmt(limit) + ' budget.' };
  }
  return null;
}

function alertsFor(ledger) {
  return { budget: getBudgetAlerts(ledger), group: getGroupAlerts(ledger), dismissed: [...ledger.dismissedAlerts] };
}

module.exports = { getBudgetAlerts, getGroupAlerts, checkOverspend, alertsFor };
