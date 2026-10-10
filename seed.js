// Sample data so a first-time demo/admin ledger isn't empty.
function emptyLedger() {
  return {
    transactions: [], budgets: {}, groups: [],
    bankLink: { linked: false, bankName: null, accountHolder: null, last4: null, accountType: null, balance: 0, lastSynced: null },
    autoDetected: [], dismissedAlerts: new Set(),
    counters: { tx: 1, group: 1, auto: 1 },
  };
}

function seedLedger(currentMonthKey) {
  const L = emptyLedger();
  const uid = () => L.counters.tx++;
  const now = new Date();
  const mk = (offsetDays) => { const d = new Date(now); d.setDate(d.getDate() - offsetDays); return d.toISOString().slice(0, 10); };

  L.transactions = [
    { id: uid(), type: 'income', category: 'Salary', amount: 45000, date: mk(28), note: 'Monthly salary' },
    { id: uid(), type: 'income', category: 'Freelance', amount: 6000, date: mk(14), note: 'UI project payout' },
    { id: uid(), type: 'expense', category: 'Rent', amount: 12000, date: mk(27), note: 'August rent' },
    { id: uid(), type: 'expense', category: 'Food', amount: 3200, date: mk(20), note: 'Groceries + dining' },
    { id: uid(), type: 'expense', category: 'Transport', amount: 1450, date: mk(18), note: 'Fuel + auto' },
    { id: uid(), type: 'expense', category: 'Utilities', amount: 2100, date: mk(16), note: 'Electricity + wifi' },
    { id: uid(), type: 'expense', category: 'Shopping', amount: 2600, date: mk(10), note: 'Clothes' },
    { id: uid(), type: 'expense', category: 'Entertainment', amount: 900, date: mk(8), note: 'Movies' },
    { id: uid(), type: 'expense', category: 'Health', amount: 750, date: mk(5), note: 'Pharmacy' },
    { id: uid(), type: 'expense', category: 'Food', amount: 1100, date: mk(2), note: 'Restaurant' },
  ];
  for (let i = 1; i <= 5; i++) {
    const d = new Date(now); d.setMonth(d.getMonth() - i);
    const iso = d.toISOString().slice(0, 10);
    L.transactions.push({ id: uid(), type: 'income', category: 'Salary', amount: 44000 + i * 300, date: iso, note: 'Salary' });
    L.transactions.push({ id: uid(), type: 'expense', category: 'Food', amount: 2600 + i * 120, date: iso, note: 'Monthly food' });
    L.transactions.push({ id: uid(), type: 'expense', category: 'Rent', amount: 12000, date: iso, note: 'Rent' });
    L.transactions.push({ id: uid(), type: 'expense', category: 'Transport', amount: 1300 + i * 60, date: iso, note: 'Transport' });
  }
  L.budgets[currentMonthKey] = { Food: 5000, Transport: 2000, Rent: 12000, Utilities: 2500, Shopping: 3000, Entertainment: 1500, Health: 1500, Education: 2000, Other: 1000 };

  const g = { id: L.counters.group++, name: 'Goa Trip', members: ['You', 'Rohit', 'Yash', 'Ruchita'], expenses: [], settledLog: [] };
  g.expenses.push({ id: uid(), amount: 4000, payer: 'You', split: { You: 1000, Rohit: 1000, Yash: 1000, Ruchita: 1000 }, note: 'Hotel booking', date: mk(6) });
  g.expenses.push({ id: uid(), amount: 1600, payer: 'Rohit', split: { You: 400, Rohit: 400, Yash: 400, Ruchita: 400 }, note: 'Dinner', date: mk(5) });
  g.expenses.push({ id: uid(), amount: 800, payer: 'Yash', split: { You: 200, Rohit: 200, Yash: 200, Ruchita: 200 }, note: 'Cab fare', date: mk(4) });
  L.groups.push(g);
  return L;
}

module.exports = { emptyLedger, seedLedger };
