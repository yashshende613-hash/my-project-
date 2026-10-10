// Bank linking simulation + rule-based auto categorisation. No real bank connection is made.
const BANKS = ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'PNB'];

const AUTO_CATEGORY_RULES = [
  { kw: ['zomato', 'swiggy', 'restaurant', 'cafe', 'dining'], cat: 'Food', type: 'expense' },
  { kw: ['uber', 'ola', 'fuel', 'petrol', 'metro', 'irctc'], cat: 'Transport', type: 'expense' },
  { kw: ['rent', 'landlord'], cat: 'Rent', type: 'expense' },
  { kw: ['electricity', 'wifi', 'broadband', 'recharge', 'bill'], cat: 'Utilities', type: 'expense' },
  { kw: ['amazon', 'flipkart', 'myntra', 'mall'], cat: 'Shopping', type: 'expense' },
  { kw: ['netflix', 'bookmyshow', 'spotify', 'movie'], cat: 'Entertainment', type: 'expense' },
  { kw: ['pharmacy', 'hospital', 'clinic', 'apollo'], cat: 'Health', type: 'expense' },
  { kw: ['udemy', 'coursera', 'tuition', 'course'], cat: 'Education', type: 'expense' },
  { kw: ['salary', 'payroll'], cat: 'Salary', type: 'income' },
  { kw: ['refund', 'cashback', 'interest'], cat: 'Other', type: 'income' },
];

function suggestCategory(merchant) {
  const m = merchant.toLowerCase();
  const rule = AUTO_CATEGORY_RULES.find(r => r.kw.some(k => m.includes(k)));
  return rule ? { cat: rule.cat, type: rule.type } : { cat: 'Other', type: 'expense' };
}

function last4Of(acctNum) {
  const digits = String(acctNum).replace(/\D/g, '');
  return (digits.slice(-4) || '0000').padStart(4, '0');
}

function finalizeConnection(ledger, { bankName, holder, acctNum, accountType }) {
  ledger.bankLink = {
    linked: true, bankName,
    accountHolder: holder || 'Account Holder',
    last4: last4Of(acctNum),               // only the last 4 digits are ever stored
    accountType: accountType || 'Savings',
    balance: Math.floor(Math.random() * 140000) + 18000,
    lastSynced: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  };
  seedAutoDetected(ledger);
}

function seedAutoDetected(ledger) {
  const merchants = [
    { m: 'Zomato Order', amt: 420 }, { m: 'Uber Trip', amt: 180 }, { m: 'Amazon.in', amt: 1899 },
    { m: 'Electricity Bill Payment', amt: 1340 }, { m: 'Netflix Subscription', amt: 499 },
    { m: 'Apollo Pharmacy', amt: 260 }, { m: 'Salary Credit', amt: 45000 }, { m: 'Swiggy Instamart', amt: 610 },
  ];
  ledger.autoDetected = merchants.map((x, i) => {
    const s = suggestCategory(x.m);
    const d = new Date(); d.setDate(d.getDate() - i);
    return { id: ledger.counters.auto++, merchant: x.m, amount: x.amt, date: d.toISOString().slice(0, 10), suggestedCat: s.cat, type: s.type };
  });
}

function unlink(ledger) {
  ledger.bankLink = { linked: false, bankName: null, accountHolder: null, last4: null, accountType: null, balance: 0, lastSynced: null };
  ledger.autoDetected = [];
}

module.exports = { BANKS, suggestCategory, finalizeConnection, unlink };
