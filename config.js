module.exports = {
  PORT: process.env.PORT || 3000,
  ADMIN_ID: (process.env.ADMIN_ID || 'admin@spendwise.app').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  DEMO_EMAIL: 'demo@spendwise.app',
  DEMO_PASSWORD: 'demo1234',
};
