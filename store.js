// In-memory data store. Swap this module for MongoDB/SQL models in production.
const crypto = require('crypto');
const cfg = require('./config');
const { hashPassword, currentMonthKey } = require('./utils');
const { seedLedger } = require('./services/seed');

const users = [];            // { id, name, email, passwordHash, hasOnboarded, isAdmin, ledger }
const sessions = new Map();  // token -> userId
let userIdCounter = 1;

function createUser({ name, email, password, hasOnboarded = false, isAdmin = false, ledger }) {
  const user = { id: userIdCounter++, name, email, passwordHash: hashPassword(password), hasOnboarded, isAdmin, ledger };
  users.push(user);
  return user;
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, userId);
  return token;
}
function getUserByToken(token) {
  const id = sessions.get(token);
  return id ? users.find(u => u.id === id) : null;
}
function destroySession(token) { sessions.delete(token); }

// Demo user + admin (both start with the sample ledger, as in the original demo)
createUser({ name: 'Demo User', email: cfg.DEMO_EMAIL, password: cfg.DEMO_PASSWORD, ledger: seedLedger(currentMonthKey()) });
createUser({ name: 'Administrator', email: cfg.ADMIN_ID, password: cfg.ADMIN_PASSWORD, hasOnboarded: true, isAdmin: true, ledger: seedLedger(currentMonthKey()) });

// Mock "other users" shown only in the Admin Panel (no real PII, no live bank feeds)
const adminMockUsers = [
  { id: 1, name: 'Aditi Rao', email: 'aditi.rao@example.com', joined: '2026-02-14', plan: 'Free', bankLinked: true, bankName: 'HDFC', status: 'active', txCount: 142, groupsCount: 2, budgetAlert: { type: 'over', category: 'Shopping', detail: '₹1,850 over the ₹5,000 limit' }, settlementPending: 0 },
  { id: 2, name: 'Karan Mehta', email: 'karan.mehta@example.com', joined: '2026-03-02', plan: 'Pro', bankLinked: true, bankName: 'ICICI', status: 'active', txCount: 98, groupsCount: 1, budgetAlert: { type: 'warn', category: 'Food', detail: '86% of ₹6,000 budget used' }, settlementPending: 1200 },
  { id: 3, name: 'Neha Verma', email: 'neha.verma@example.com', joined: '2026-01-20', plan: 'Free', bankLinked: false, bankName: null, status: 'suspended', txCount: 12, groupsCount: 0, budgetAlert: null, settlementPending: 0 },
  { id: 4, name: 'Ritesh Singh', email: 'ritesh.singh@example.com', joined: '2026-04-11', plan: 'Pro', bankLinked: true, bankName: 'Axis', status: 'active', txCount: 210, groupsCount: 3, budgetAlert: null, settlementPending: 3400 },
  { id: 5, name: 'Sana Sheikh', email: 'sana.sheikh@example.com', joined: '2026-05-30', plan: 'Free', bankLinked: true, bankName: 'Kotak', status: 'active', txCount: 57, groupsCount: 1, budgetAlert: { type: 'over', category: 'Entertainment', detail: '₹620 over the ₹1,500 limit' }, settlementPending: 0 },
];
const adminAuditLog = [];
function addAuditLog(msg) {
  adminAuditLog.unshift({ time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), msg });
  if (adminAuditLog.length > 20) adminAuditLog.pop();
}

module.exports = { users, createUser, createSession, getUserByToken, destroySession, adminMockUsers, adminAuditLog, addAuditLog };
