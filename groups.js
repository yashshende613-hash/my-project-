// Fair & transparent splitting: balances + greedy minimal-transaction settlement.
function computeBalances(g) {
  // positive = is owed money, negative = owes money
  const bal = {}; g.members.forEach(m => bal[m] = 0);
  g.expenses.forEach(e => {
    bal[e.payer] = (bal[e.payer] || 0) + e.amount;
    Object.entries(e.split).forEach(([m, share]) => { bal[m] = (bal[m] || 0) - share; });
  });
  return bal;
}

function simplifyDebts(bal) {
  const debtors = [], creditors = [];
  Object.entries(bal).forEach(([m, v]) => {
    if (v < -0.5) debtors.push({ m, v: -v });
    else if (v > 0.5) creditors.push({ m, v });
  });
  debtors.sort((a, b) => b.v - a.v); creditors.sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    transfers.push({ from: debtors[i].m, to: creditors[j].m, amount: pay });
    debtors[i].v -= pay; creditors[j].v -= pay;
    if (debtors[i].v < 0.5) i++;
    if (creditors[j].v < 0.5) j++;
  }
  return transfers;
}

// API representation of a group (with computed totals / settlement plan)
function groupView(g) {
  const balances = computeBalances(g);
  return {
    id: g.id, name: g.name, members: g.members, expenses: g.expenses, settledLog: g.settledLog,
    total: g.expenses.reduce((s, e) => s + e.amount, 0),
    balances, transfers: simplifyDebts(balances),
  };
}

module.exports = { computeBalances, simplifyDebts, groupView };
