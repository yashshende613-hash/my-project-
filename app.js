/* ============================================================
   SPENDWISE — frontend (UI logic only)
   All data lives on the backend (see /backend). This file talks to
   it through js/api.js, keeps a local cache of the server state for
   rendering, and draws the UI/charts exactly as before.
   ============================================================ */

const CATEGORY_COLORS = {
  Food:'#B9862F', Transport:'#2E7D5B', Rent:'#4C6B8A', Utilities:'#8E5AA6',
  Shopping:'#C0574A', Entertainment:'#3E9AA6', Health:'#8A9A3E', Education:'#A66B3E', Other:'#7A8A82'
};

/* ---------- client-side cache of server state ---------- */
let currentUser = null;
let isAdminSession = false;

let transactions = [];   // {id, type, category, amount, date, note}
let budgets = {};        // { 'YYYY-MM': { Category: amount } }
let groups = [];         // server-computed: {id,name,members,expenses,total,balances,transfers}
let BANKS = [];
let bankLink = { linked:false, bankName:null, accountHolder:null, last4:null, accountType:null, balance:0, lastSynced:null };
let autoDetected = [];
let alertsData = { budget:[], group:[], dismissed:[] };
let dismissedAlertKeys = new Set();
let adminData = null;
let pendingBank = null; // bank selected but details not yet submitted

function todayISO(){ return new Date().toISOString().slice(0,10); }
function monthKey(dateStr){ return dateStr.slice(0,7); }
function currentMonthKey(){ return monthKey(todayISO()); }
function fmt(n){ return '₹' + Number(n||0).toLocaleString('en-IN', {maximumFractionDigits:0}); }
function fmtSigned(n, type){
  const s = fmt(Math.abs(n));
  return type==='income' ? '+ '+s : '− '+s;
}
function monthLabel(key){
  const [y,m] = key.split('-');
  return new Date(y, m-1, 1).toLocaleString('en-IN', {month:'long', year:'numeric'});
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- sync with backend ---------- */
async function syncState(){
  const s = await api.get('/state');
  transactions = s.transactions;
  budgets = s.budgets;
  groups = s.groups;
  bankLink = s.bank.bankLink;
  autoDetected = s.bank.autoDetected;
  alertsData = s.alerts;
  dismissedAlertKeys = new Set(s.alerts.dismissed);
}
async function loadBanks(){
  if(BANKS.length) return;
  BANKS = (await api.get('/bank/banks')).banks;
}
// run an async UI action; surface backend errors as toasts
async function run(fn){
  try { await fn(); } catch(e){ toast(e.message); }
}

/* ---------- auth ---------- */
function showAuthTab(tab){
  const isAdmin = tab==='admin';
  document.getElementById('tab-user').classList.toggle('active', !isAdmin);
  document.getElementById('tab-admin').classList.toggle('active', isAdmin);
  document.getElementById('user-auth-block').style.display = isAdmin ? 'none' : 'block';
  document.getElementById('admin-login-form').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('login-error').style.display='none';
  document.getElementById('register-error').style.display='none';
  document.getElementById('admin-error').style.display='none';
  if(isAdmin){ showAuth('login'); } // keep user block in a sane state underneath
}
function showAuth(which){
  document.getElementById('login-form').style.display = which==='login' ? 'block':'none';
  document.getElementById('register-form').style.display = which==='register' ? 'block':'none';
  document.getElementById('login-error').style.display='none';
  document.getElementById('register-error').style.display='none';
}
function showErr(id, msg){ const el = document.getElementById(id); el.textContent = msg; el.style.display='block'; }

async function handleLogin(){
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pw = document.getElementById('login-password').value;
  try {
    const res = await api.post('/auth/login', { email, password:pw });
    api.setToken(res.token);
    isAdminSession = false;
    currentUser = res.user;
    await routeAfterAuth();
  } catch(e){ showErr('login-error', e.message); }
}
async function handleRegister(){
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pw = document.getElementById('reg-password').value;
  if(!name || !email || pw.length<6){ showErr('register-error','Please fill all fields — password needs 6+ characters.'); return; }
  try {
    const res = await api.post('/auth/register', { name, email, password:pw });
    api.setToken(res.token);
    isAdminSession = false;
    currentUser = res.user;
    await routeAfterAuth();
  } catch(e){ showErr('register-error', e.message); }
}
async function handleAdminLogin(){
  const id = document.getElementById('admin-id').value.trim().toLowerCase();
  const pw = document.getElementById('admin-password').value;
  try {
    const res = await api.post('/auth/admin-login', { id, password:pw });
    api.setToken(res.token);
    isAdminSession = true;
    currentUser = res.user;
    document.getElementById('admin-id').value=''; document.getElementById('admin-password').value='';
    await enterApp();
    toast('Signed in as Administrator.');
  } catch(e){ showErr('admin-error', e.message); }
}
async function handleLogout(){
  try { await api.post('/auth/logout'); } catch(e){ /* session may already be gone */ }
  api.setToken(null);
  currentUser = null;
  isAdminSession = false;
  transactions = []; budgets = {}; groups = []; autoDetected = []; adminData = null;
  document.getElementById('app-screen').style.display='none';
  document.getElementById('onboard-screen').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  showAuthTab('user');
  document.getElementById('login-email').value='';
  document.getElementById('login-password').value='';
}

/* ---------- routing: first login goes through onboarding (attach bank) ---------- */
async function routeAfterAuth(){
  if(!currentUser.hasOnboarded){
    await loadBanks();
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('onboard-screen').style.display='flex';
    document.getElementById('onboard-card-choose').style.display='block';
    document.getElementById('onboard-card-details').style.display='none';
    document.getElementById('onboard-card-connected').style.display='none';
    renderOnboardBankGrid();
  } else {
    await enterApp();
  }
}
function renderOnboardBankGrid(){
  const grid = document.getElementById('onboard-bank-grid');
  grid.innerHTML = BANKS.map(b=>`
    <div class="onboard-bank-opt" onclick="onboardConnectBank('${b}')">
      <div class="bic">${b.charAt(0)}</div>
      <div class="bname">${b}</div>
    </div>
  `).join('');
}
// Step 1: pick a bank -> open detail-entry form
function onboardConnectBank(bankName){
  pendingBank = bankName;
  document.getElementById('onboard-card-choose').style.display='none';
  document.getElementById('onboard-card-details').style.display='block';
  document.getElementById('onboard-detail-bic').textContent = bankName.charAt(0);
  document.getElementById('onboard-detail-bankname').textContent = bankName;
}
function onboardBackToChoice(){
  document.getElementById('onboard-card-details').style.display='none';
  document.getElementById('onboard-card-choose').style.display='block';
}
// Step 2: submit mock account details -> backend finalizes connection + we show full summary
function onboardSubmitBankDetails(){ return run(async ()=>{
  const holder = document.getElementById('onboard-acc-holder').value.trim();
  const acct = document.getElementById('onboard-acc-number').value.trim();
  const type = document.getElementById('onboard-acc-type').value;
  const mobile = document.getElementById('onboard-acc-mobile').value.trim();
  if(!holder || acct.replace(/\D/g,'').length<6 || mobile.length<10){ toast('Enter a valid mock account holder name, account number (6+ digits) and 10-digit mobile.'); return; }
  const res = await api.post('/bank/link', { bankName:pendingBank, accountHolder:holder, accountNumber:acct, accountType:type, mobile });
  bankLink = res.bankLink; autoDetected = res.autoDetected;
  document.getElementById('onboard-card-details').style.display='none';
  document.getElementById('onboard-card-connected').style.display='block';
  document.getElementById('onboard-connected-bank').textContent = bankLink.bankName;
  document.getElementById('onboard-connected-count').textContent = autoDetected.length+' transactions found — review them anytime on the Link Bank page.';
  document.getElementById('onboard-summary-mini').innerHTML = `
    <div class="onboard-secure-note" style="border-top:none;padding-top:0;margin-top:14px;">
      <span>👤</span><span><strong>${escapeHtml(bankLink.accountHolder)}</strong> · ${bankLink.accountType} · A/C ending ${bankLink.last4} · Balance ${fmt(bankLink.balance)}</span>
    </div>`;
}); }
function finishOnboarding(wasConnected){ return run(async ()=>{
  const res = await api.post('/me/onboarded');
  currentUser = res.user;
  document.getElementById('onboard-screen').style.display='none';
  await enterApp();
  if(wasConnected) toast('Bank connected. Full summary is on the Link Bank page.');
}); }

async function enterApp(){
  await loadBanks();
  await syncState();
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-screen').style.display='block';
  document.getElementById('side-name').textContent = currentUser.name;
  document.getElementById('side-email').textContent = currentUser.email;
  document.getElementById('side-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('prof-name').value = currentUser.name;
  document.getElementById('prof-email').value = currentUser.email;
  document.getElementById('inc-date').value = todayISO();
  document.getElementById('exp-date').value = todayISO();
  document.getElementById('nav-admin').style.display = isAdminSession ? 'flex' : 'none';
  goPage(isAdminSession ? 'admin' : 'dashboard');
  buildReportMonthOptions();
  renderAll();
}

/* ---------- navigation ---------- */
function goPage(name){
  if(name==='admin' && !isAdminSession){
    toast('Admin access requires signing in from the Admin tab.');
    name = 'dashboard';
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const btn = document.querySelector('.nav-item[data-page="'+name+'"]');
  if(btn) btn.classList.add('active');
  if(name==='dashboard') renderDashboard();
  if(name==='transactions') renderTransactions();
  if(name==='budgets') renderBudgets();
  if(name==='groups') renderGroups();
  if(name==='linkbank') renderLinkBankPage();
  if(name==='analytics') renderAnalytics();
  if(name==='reports') renderReport();
  if(name==='admin') renderAdmin();
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display='block';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.style.display='none'; }, 2200);
}

/* ---------- add income / expense ---------- */
function addIncome(){ return run(async ()=>{
  const amount = parseFloat(document.getElementById('inc-amount').value);
  const date = document.getElementById('inc-date').value || todayISO();
  const category = document.getElementById('inc-category').value;
  const note = document.getElementById('inc-note').value.trim();
  if(!amount || amount<=0){ toast('Enter a valid amount.'); return; }
  await api.post('/transactions', { type:'income', category, amount, date, note });
  await syncState();
  clearIncomeForm();
  toast('Income added.');
  renderAll();
}); }
function clearIncomeForm(){
  document.getElementById('inc-amount').value='';
  document.getElementById('inc-note').value='';
  document.getElementById('inc-date').value = todayISO();
}
function addExpense(){ return run(async ()=>{
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const date = document.getElementById('exp-date').value || todayISO();
  const category = document.getElementById('exp-category').value;
  const note = document.getElementById('exp-note').value.trim();
  if(!amount || amount<=0){ toast('Enter a valid amount.'); return; }
  const res = await api.post('/transactions', { type:'expense', category, amount, date, note });
  await syncState();
  clearExpenseForm();
  toast(res.alert ? res.alert.message : 'Expense added.'); // backend flags over-budget / 80% reminders
  renderAll();
}); }
function clearExpenseForm(){
  document.getElementById('exp-amount').value='';
  document.getElementById('exp-note').value='';
  document.getElementById('exp-date').value = todayISO();
}
function deleteTx(id){ return run(async ()=>{
  await api.del('/transactions/'+id);
  await syncState();
  renderAll();
}); }

/* ---------- budgets ---------- */
function setBudget(){ return run(async ()=>{
  const category = document.getElementById('budget-category').value;
  const amount = parseFloat(document.getElementById('budget-amount').value);
  if(!amount || amount<=0){ toast('Enter a valid budget amount.'); return; }
  const res = await api.put('/budgets', { category, amount });
  await syncState();
  document.getElementById('budget-amount').value='';
  cancelBudgetEdit();
  toast((res.isUpdate ? 'Budget updated for ' : 'Budget saved for ')+category+'.');
  renderBudgets(); renderDashboard();
}); }
function editBudget(cat){
  const mk = currentMonthKey();
  const limit = (budgets[mk]||{})[cat];
  document.getElementById('budget-category').value = cat;
  document.getElementById('budget-amount').value = limit;
  document.getElementById('budget-amount').focus();
  const tag = document.getElementById('budget-editing-tag');
  tag.textContent = '— adjusting "'+cat+'"';
  tag.style.display = 'inline';
  document.getElementById('budget-cancel-edit').style.display = 'inline-block';
  document.getElementById('budget-form-panel').scrollIntoView({behavior:'smooth', block:'center'});
}
function cancelBudgetEdit(){
  document.getElementById('budget-editing-tag').style.display = 'none';
  document.getElementById('budget-cancel-edit').style.display = 'none';
}
function adjustBudgetAmount(cat, delta){ return run(async ()=>{
  const res = await api.patch('/budgets/adjust', { category:cat, delta });
  await syncState();
  toast('Budget for '+cat+' adjusted to '+fmt(res.amount)+'.');
  renderBudgets(); renderDashboard();
}); }
function renderBudgets(){
  const mk = currentMonthKey();
  const b = budgets[mk] || {};
  const list = document.getElementById('budget-list');
  const cats = Object.keys(b);
  if(cats.length===0){ list.innerHTML = '<div class="empty">No budgets set for this month yet.</div>'; renderAlerts(); return; }
  list.innerHTML = cats.map(cat=>{
    const limit = b[cat];
    const spent = transactions.filter(t=>t.type==='expense' && t.category===cat && monthKey(t.date)===mk).reduce((s,t)=>s+t.amount,0);
    const pct = Math.min(100, Math.round((spent/limit)*100));
    const over = spent>limit;
    const cls = over ? 'over' : (pct>=80 ? 'warn':'');
    return `<div class="budget-item">
      <div class="budget-top"><span class="cat">${cat}</span><span class="mono">${fmt(spent)} / ${fmt(limit)}</span></div>
      <div class="budget-track"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="budget-note ${over?'over':''}">${over ? 'Over budget by '+fmt(spent-limit) : pct+'% of budget used'}</div>
      <div class="budget-actions">
        <button class="badj-btn" title="Decrease by ₹500" onclick="adjustBudgetAmount('${cat}', -500)">−</button>
        <button class="badj-btn" title="Increase by ₹500" onclick="adjustBudgetAmount('${cat}', 500)">+</button>
        <button class="badj-edit" onclick="editBudget('${cat}')">Adjust / Edit</button>
      </div>
    </div>`;
  }).join('');
  renderAlerts();
}

/* ---------- alerts & reminders (computed by the backend) ---------- */
function dismissAlert(key){
  dismissedAlertKeys.add(key);
  renderAlerts();
  api.post('/state/alerts/dismiss', { key }).catch(()=>{});
}
function renderAlertsInto(id, list){
  const wrap = document.getElementById(id);
  if(!wrap) return;
  wrap.innerHTML = list.map(a=>`
    <div class="alert-card ${a.type}">
      <span class="ic">${a.icon}</span>
      <div class="body"><div class="title">${escapeHtml(a.title)}</div><div class="desc">${escapeHtml(a.desc)}</div></div>
      <button class="dismiss" title="Dismiss" onclick="dismissAlert('${a.key}')">✕</button>
    </div>`).join('');
}
function setNavBadge(page, show){
  const btn = document.querySelector('.nav-item[data-page="'+page+'"]');
  if(!btn) return;
  let dot = btn.querySelector('.nav-alert-dot');
  if(show && !dot){
    dot = document.createElement('span'); dot.className='nav-alert-dot'; btn.appendChild(dot);
  } else if(!show && dot){
    dot.remove();
  }
}
function renderAlerts(){
  const budgetAlerts = alertsData.budget.filter(a=>!dismissedAlertKeys.has(a.key));
  const groupAlerts = alertsData.group.filter(a=>!dismissedAlertKeys.has(a.key));
  renderAlertsInto('dash-alerts', [...budgetAlerts, ...groupAlerts]);
  renderAlertsInto('budget-page-alerts', budgetAlerts);
  renderAlertsInto('group-page-alerts', groupAlerts);
  setNavBadge('budgets', budgetAlerts.length>0);
  setNavBadge('groups', groupAlerts.length>0);
}

/* ---------- groups (fair & transparent splitting — maths done by the backend) ---------- */
function createGroup(){ return run(async ()=>{
  const name = document.getElementById('grp-name').value.trim();
  const membersRaw = document.getElementById('grp-members').value.trim();
  if(!name || !membersRaw){ toast('Enter a group name and members.'); return; }
  await api.post('/groups', { name, members:membersRaw });
  await syncState();
  document.getElementById('grp-name').value='';
  document.getElementById('grp-members').value='';
  toast('Group "'+name+'" created.');
  renderGroups();
}); }

function populateGroupSelectors(){
  const gsel = document.getElementById('gexp-group');
  const prev = gsel.value;
  gsel.innerHTML = groups.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('') || '<option value="">No groups yet</option>';
  if(prev && groups.some(g=>String(g.id)===prev)) gsel.value = prev;
  updatePayerOptions();
}
function updatePayerOptions(){
  const gid = parseInt(document.getElementById('gexp-group').value);
  const g = groups.find(x=>x.id===gid);
  const psel = document.getElementById('gexp-payer');
  psel.innerHTML = g ? g.members.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('') : '';
}
document.addEventListener('change', e=>{ if(e.target && e.target.id==='gexp-group') updatePayerOptions(); });

function toggleCustomSplit(){
  const isCustom = document.getElementById('gexp-split-type').value==='custom';
  document.getElementById('gexp-custom-wrap').style.display = isCustom ? 'block':'none';
}

function addGroupExpense(){ return run(async ()=>{
  const gid = parseInt(document.getElementById('gexp-group').value);
  const g = groups.find(x=>x.id===gid);
  if(!g){ toast('Create a group first.'); return; }
  const amount = parseFloat(document.getElementById('gexp-amount').value);
  const payer = document.getElementById('gexp-payer').value;
  const splitType = document.getElementById('gexp-split-type').value;
  const note = document.getElementById('gexp-note').value.trim();
  if(!amount || amount<=0){ toast('Enter a valid amount.'); return; }
  const customShares = document.getElementById('gexp-custom-shares').value;
  const res = await api.post('/groups/'+gid+'/expenses', { amount, payer, splitType, note, customShares });
  await syncState();
  document.getElementById('gexp-amount').value='';
  document.getElementById('gexp-note').value='';
  document.getElementById('gexp-custom-shares').value='';
  toast(res.message);
  renderGroups();
}); }

function settleGroup(gid){ return run(async ()=>{
  const g = groups.find(x=>x.id===gid);
  await api.post('/groups/'+gid+'/settle');
  await syncState();
  toast('Balances settled for '+(g?g.name:'group')+'.');
  renderGroups();
}); }

function renderGroups(){
  populateGroupSelectors();
  const wrap = document.getElementById('groups-list');
  if(groups.length===0){ wrap.innerHTML = '<div class="empty">No groups yet — create one above to start splitting.</div>'; renderAlerts(); return; }
  wrap.innerHTML = groups.map(g=>{
    const total = g.total;
    const transfers = g.transfers;
    const membersHtml = g.members.map(m=>`<span class="member-chip"><span class="av">${escapeHtml(m.charAt(0).toUpperCase())}</span>${escapeHtml(m)}</span>`).join('');
    const gexpHtml = g.expenses.slice().reverse().slice(0,5).map(e=>`
      <div class="gexp-row"><span>${escapeHtml(e.note)}<div class="who">Paid by ${escapeHtml(e.payer)}</div></span><span class="mono">${fmt(e.amount)}</span></div>
    `).join('') || '<div class="empty" style="padding:14px 0;">No shared expenses logged yet.</div>';
    const settleHtml = transfers.length ? transfers.map(t=>`
      <div class="settle-row"><span>${escapeHtml(t.from)} <span class="arrow">→</span> ${escapeHtml(t.to)}</span><span class="amt mono">${fmt(t.amount)}</span></div>
    `).join('') : '<div class="settle-row"><span class="settle-clear-badge">All settled up</span><span></span></div>';
    return `<div class="group-card">
      <div class="group-card-head"><h4>${escapeHtml(g.name)}</h4><span class="grp-total mono">Total: ${fmt(total)}</span></div>
      <div class="member-row">${membersHtml}</div>
      <div class="grid-2" style="gap:16px;">
        <div><strong style="font-size:13px;">Shared Expenses</strong>${gexpHtml}</div>
        <div>
          <strong style="font-size:13px;">Minimal Settlement</strong>
          <div class="settle-list">${settleHtml}</div>
          ${transfers.length ? `<button class="btn-ghost" style="margin-top:10px;padding:8px 14px;font-size:12.5px;" onclick="settleGroup(${g.id})">Mark as Settled</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  renderAlerts();
}

/* ---------- link bank + auto-detect (rule-based categorisation runs on the backend) ---------- */
// Step 1: pick a bank -> open the detail-entry form (Link Bank page)
function linkBankPrompt(bankName){
  pendingBank = bankName;
  document.getElementById('bank-choose-panel').style.display='none';
  document.getElementById('bank-detail-panel').style.display='block';
  document.getElementById('lb-detail-bic').textContent = bankName.charAt(0);
  document.getElementById('lb-detail-bankname').textContent = bankName;
}
function cancelBankDetailForm(){
  pendingBank = null;
  document.getElementById('bank-detail-panel').style.display='none';
  document.getElementById('bank-choose-panel').style.display='block';
}
// Step 2: submit mock details -> backend finalizes connection (Link Bank page)
function linkBankSubmit(){ return run(async ()=>{
  const holder = document.getElementById('lb-acc-holder').value.trim();
  const acct = document.getElementById('lb-acc-number').value.trim();
  const type = document.getElementById('lb-acc-type').value;
  const mobile = document.getElementById('lb-acc-mobile').value.trim();
  if(!holder || acct.replace(/\D/g,'').length<6 || mobile.length<10){ toast('Enter a valid mock account holder name, account number (6+ digits) and 10-digit mobile.'); return; }
  const res = await api.post('/bank/link', { bankName:pendingBank, accountHolder:holder, accountNumber:acct, accountType:type, mobile });
  bankLink = res.bankLink; autoDetected = res.autoDetected;
  document.getElementById('bank-detail-panel').style.display='none';
  document.getElementById('bank-choose-panel').style.display='block';
  toast(pendingBank+' linked (demo). Full account summary is ready below.');
  renderLinkBankPage();
}); }
function unlinkBank(){ return run(async ()=>{
  await api.del('/bank');
  await syncState();
  toast('Bank unlinked.');
  renderLinkBankPage();
}); }

function approveAutoDetected(id){ return run(async ()=>{
  const catSelect = document.getElementById('auto-cat-'+id);
  const res = await api.post('/bank/auto/'+id+'/approve', { category: catSelect ? catSelect.value : undefined });
  await syncState();
  toast('Added to '+ (res.type==='income'?'income':'expenses') +'.');
  renderLinkBankPage();
  renderAll();
}); }
function dismissAutoDetected(id){ return run(async ()=>{
  await api.del('/bank/auto/'+id);
  await syncState();
  renderLinkBankPage();
}); }

function renderAcctSummaryCard(){
  const wrap = document.getElementById('acct-summary-wrap');
  if(!wrap) return;
  if(!bankLink.linked){ wrap.innerHTML=''; return; }
  wrap.innerHTML = `
    <div class="acct-summary-card">
      <div class="acct-summary-top">
        <div><div class="bank-tag">${bankLink.bankName} · Linked Account</div></div>
        <div class="acct-type">${bankLink.accountType}</div>
      </div>
      <div class="acct-summary-number mono">XXXX XXXX ${bankLink.last4}</div>
      <div class="acct-summary-grid">
        <div><div class="lbl">Account Holder</div><div class="v" style="font-family:'IBM Plex Sans',sans-serif;">${escapeHtml(bankLink.accountHolder)}</div></div>
        <div><div class="lbl">Available Balance</div><div class="v bal">${fmt(bankLink.balance)}</div></div>
        <div><div class="lbl">Last Synced</div><div class="v" style="font-size:12.5px;">${bankLink.lastSynced}</div></div>
      </div>
    </div>`;
}

function renderLinkBankPage(){
  renderAcctSummaryCard();

  const stripWrap = document.getElementById('bank-linked-strip-wrap');
  stripWrap.innerHTML = bankLink.linked
    ? `<div class="bank-linked-strip"><div class="l"><span class="dot-live"></span> Connected to <strong>${bankLink.bankName}</strong> — auto-detecting new transactions</div><button class="btn-ghost" style="padding:7px 12px;font-size:12.5px;" onclick="unlinkBank()">Unlink</button></div>`
    : '';

  document.getElementById('bank-detail-panel').style.display='none';
  document.getElementById('bank-choose-panel').style.display='block';

  const grid = document.getElementById('bank-grid');
  grid.innerHTML = BANKS.map(b=>`
    <div class="bank-option ${bankLink.linked && bankLink.bankName===b ? 'linked':''}" style="cursor:pointer;" onclick="linkBankPrompt('${b}')">
      <div class="bic">${b.charAt(0)}</div>
      <div class="bname">${b}</div>
    </div>
  `).join('');

  const catOptions = ['Food','Transport','Rent','Utilities','Shopping','Entertainment','Health','Education','Other','Salary','Freelance','Business','Investment','Gift'];
  const list = document.getElementById('autodetect-list');
  if(!bankLink.linked){
    list.innerHTML = '<div class="empty">Link a bank above to start auto-detecting transactions.</div>';
  } else if(autoDetected.length===0){
    list.innerHTML = '<div class="empty">No pending auto-detected transactions. All clear.</div>';
  } else {
    list.innerHTML = autoDetected.map(item=>`
      <div class="autodetect-item">
        <div>
          <div>${escapeHtml(item.merchant)}<span class="badge-auto">Auto</span></div>
          <div class="meta">${item.date} · ${item.type==='income'?'Income':'Expense'} · ${fmt(item.amount)}</div>
        </div>
        <div class="autodetect-actions">
          <select id="auto-cat-${item.id}">${catOptions.map(c=>`<option ${c===item.suggestedCat?'selected':''}>${c}</option>`).join('')}</select>
          <button class="btn-mini approve" onclick="approveAutoDetected(${item.id})">Add</button>
          <button class="btn-mini dismiss" onclick="dismissAutoDetected(${item.id})">Ignore</button>
        </div>
      </div>
    `).join('');
  }
}

/* ---------- dashboard ---------- */
let dashPieChart, analyticsPieChart, analyticsBarChart, analyticsLineChart;

function totalsForMonth(mk){
  const inc = transactions.filter(t=>t.type==='income' && monthKey(t.date)===mk).reduce((s,t)=>s+t.amount,0);
  const exp = transactions.filter(t=>t.type==='expense' && monthKey(t.date)===mk).reduce((s,t)=>s+t.amount,0);
  return {inc, exp};
}

function renderDashboard(){
  const mk = currentMonthKey();
  document.getElementById('dash-month-label').textContent = monthLabel(mk);
  const {inc, exp} = totalsForMonth(mk);
  const balance = inc - exp;
  const savings = Math.max(0, balance);

  document.getElementById('stat-income').textContent = fmt(inc);
  document.getElementById('stat-expense').textContent = fmt(exp);
  document.getElementById('stat-balance').textContent = fmt(balance);
  document.getElementById('stat-savings').textContent = fmt(savings);

  const b = budgets[mk] || {};
  const totalBudget = Object.values(b).reduce((s,v)=>s+v,0);
  const util = totalBudget>0 ? Math.min(100, Math.round((exp/totalBudget)*100)) : 0;
  document.getElementById('stat-util').textContent = util+'%';
  document.getElementById('stat-util-bar').style.width = util+'%';

  // recent transactions
  const recent = [...transactions].sort((a,b2)=>b2.date.localeCompare(a.date)).slice(0,6);
  const tbody = document.querySelector('#dash-recent-table tbody');
  tbody.innerHTML = recent.map(t=>`<tr>
    <td>${t.date}</td>
    <td>${t.category}${t.note? ' — '+escapeHtml(t.note):''}</td>
    <td style="text-align:right;" class="mono ${t.type==='income'?'amt-pos':'amt-neg'}">${fmtSigned(t.amount,t.type)}</td>
  </tr>`).join('') || '<tr><td colspan="3" class="empty">No transactions yet.</td></tr>';

  // pie by category (this month expenses)
  const catTotals = {};
  transactions.filter(t=>t.type==='expense' && monthKey(t.date)===mk).forEach(t=>{
    catTotals[t.category] = (catTotals[t.category]||0)+t.amount;
  });
  const labels = Object.keys(catTotals);
  const data = Object.values(catTotals);
  const colors = labels.map(l=>CATEGORY_COLORS[l]||'#7A8A82');
  if(dashPieChart) dashPieChart.destroy();
  dashPieChart = new Chart(document.getElementById('chart-dash-pie'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor: colors, borderWidth:2, borderColor:'#fff' }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{size:11} } } }, maintainAspectRatio:false }
  });
}

/* ---------- transactions page ---------- */
function renderTransactions(){
  const search = document.getElementById('tx-search').value.toLowerCase();
  const typeFilter = document.getElementById('tx-type-filter').value;
  const sort = document.getElementById('tx-sort').value;

  let list = transactions.filter(t=>{
    if(typeFilter!=='all' && t.type!==typeFilter) return false;
    const hay = (t.category+' '+(t.note||'')).toLowerCase();
    return hay.includes(search);
  });
  list.sort((a,b)=>{
    if(sort==='date-desc') return b.date.localeCompare(a.date);
    if(sort==='date-asc') return a.date.localeCompare(b.date);
    if(sort==='amount-desc') return b.amount-a.amount;
    if(sort==='amount-asc') return a.amount-b.amount;
  });

  const tbody = document.querySelector('#tx-table tbody');
  document.getElementById('tx-empty').style.display = list.length===0 ? 'block':'none';
  tbody.innerHTML = list.map(t=>`<tr>
    <td>${t.date}</td>
    <td><span class="pill ${t.type}">${t.type==='income'?'Income':'Expense'}</span></td>
    <td>${t.category}</td>
    <td>${escapeHtml(t.note)||'<span style="color:var(--muted)">—</span>'}</td>
    <td style="text-align:right;" class="mono ${t.type==='income'?'amt-pos':'amt-neg'}">${fmtSigned(t.amount,t.type)}</td>
    <td style="text-align:right;"><button class="btn-ghost" style="padding:5px 10px;font-size:12px;" onclick="deleteTx(${t.id})">Delete</button></td>
  </tr>`).join('');
}

/* ---------- analytics page ---------- */
function lastNMonthKeys(n){
  const keys=[];
  const d = new Date();
  for(let i=n-1;i>=0;i--){
    const dd = new Date(d.getFullYear(), d.getMonth()-i, 1);
    keys.push(dd.toISOString().slice(0,7));
  }
  return keys;
}
function renderAnalytics(){
  const mk = currentMonthKey();
  // Pie: expense by category (current month)
  const catTotals = {};
  transactions.filter(t=>t.type==='expense' && monthKey(t.date)===mk).forEach(t=>{
    catTotals[t.category] = (catTotals[t.category]||0)+t.amount;
  });
  const pl = Object.keys(catTotals), pd = Object.values(catTotals), pc = pl.map(l=>CATEGORY_COLORS[l]||'#7A8A82');
  if(analyticsPieChart) analyticsPieChart.destroy();
  analyticsPieChart = new Chart(document.getElementById('chart-pie'), {
    type:'pie',
    data:{ labels:pl, datasets:[{ data:pd, backgroundColor:pc, borderWidth:2, borderColor:'#fff' }] },
    options:{ plugins:{legend:{position:'bottom', labels:{boxWidth:10,font:{size:11}}}}, maintainAspectRatio:false }
  });

  // Bar: income vs expense, last 6 months
  const months = lastNMonthKeys(6);
  const incs = months.map(m=>totalsForMonth(m).inc);
  const exps = months.map(m=>totalsForMonth(m).exp);
  if(analyticsBarChart) analyticsBarChart.destroy();
  analyticsBarChart = new Chart(document.getElementById('chart-bar'), {
    type:'bar',
    data:{ labels: months.map(monthShort), datasets:[
      {label:'Income', data:incs, backgroundColor:'#2E7D5B', borderRadius:4},
      {label:'Expense', data:exps, backgroundColor:'#B4442E', borderRadius:4}
    ]},
    options:{ maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{ y:{ ticks:{ callback:v=>'₹'+v } } } }
  });

  // Line: spending trend last 6 months
  if(analyticsLineChart) analyticsLineChart.destroy();
  analyticsLineChart = new Chart(document.getElementById('chart-line'), {
    type:'line',
    data:{ labels: months.map(monthShort), datasets:[
      {label:'Total Expense', data:exps, borderColor:'#B9862F', backgroundColor:'rgba(185,134,47,.15)', fill:true, tension:.35, pointRadius:3}
    ]},
    options:{ maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ ticks:{ callback:v=>'₹'+v } } } }
  });
}
function monthShort(mk){
  const [y,m] = mk.split('-');
  return new Date(y,m-1,1).toLocaleString('en-IN',{month:'short'});
}

/* ---------- reports page ---------- */
function buildReportMonthOptions(){
  const sel = document.getElementById('report-month');
  const prev = sel.value;
  const keysSet = new Set(transactions.map(t=>monthKey(t.date)));
  keysSet.add(currentMonthKey());
  const keys = Array.from(keysSet).sort().reverse();
  sel.innerHTML = keys.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join('');
  if(prev && keys.includes(prev)) sel.value = prev;
}
function renderReport(){
  const sel = document.getElementById('report-month');
  if(!sel.value){ buildReportMonthOptions(); }
  const mk = sel.value || currentMonthKey();
  const monthTx = transactions.filter(t=>monthKey(t.date)===mk);
  const inc = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp = monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  document.getElementById('rep-income').textContent = fmt(inc);
  document.getElementById('rep-expense').textContent = fmt(exp);
  document.getElementById('rep-savings').textContent = fmt(inc-exp);
  document.getElementById('rep-count').textContent = monthTx.length;

  const totals = {};
  monthTx.forEach(t=>{
    const key = t.category+'|'+t.type;
    totals[key] = (totals[key]||0)+t.amount;
  });
  const rows = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const tbody = document.querySelector('#report-table tbody');
  tbody.innerHTML = rows.map(([key,val])=>{
    const [cat,type] = key.split('|');
    return `<tr><td>${cat}</td><td><span class="pill ${type}">${type==='income'?'Income':'Expense'}</span></td><td style="text-align:right;" class="mono">${fmt(val)}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="empty">No transactions for this month.</td></tr>';
}

/* ---------- profile ---------- */
function saveProfile(){ return run(async ()=>{
  const name = document.getElementById('prof-name').value.trim();
  const email = document.getElementById('prof-email').value.trim();
  if(!name || !email){ toast('Name and email are required.'); return; }
  const res = await api.put('/me', { name, email });
  currentUser = res.user;
  document.getElementById('side-name').textContent = currentUser.name;
  document.getElementById('side-email').textContent = currentUser.email;
  document.getElementById('side-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  toast('Profile updated.');
}); }

/* ---------- admin panel (data comes from /api/admin — demo data, no real PII or live bank feeds) ---------- */
async function renderAdmin(){
  try { adminData = await api.get('/admin/overview'); }
  catch(e){ toast(e.message); return; }
  renderAdminStats();
  renderAdminUsers();
  renderAdminAlerts();
  renderAdminBankAccounts();
  renderAdminAuditLog();
}
function renderAdminStats(){
  const s = adminData.stats;
  document.getElementById('admin-stat-users').textContent = s.users;
  document.getElementById('admin-stat-tx').textContent = s.transactions.toLocaleString('en-IN');
  document.getElementById('admin-stat-groups').textContent = s.groups;
  document.getElementById('admin-stat-alerts').textContent = s.openAlerts;
}
function renderAdminUsers(){
  if(!adminData) return;
  const search = (document.getElementById('admin-search').value||'').toLowerCase();
  const tbody = document.querySelector('#admin-users-table tbody');
  const rows = adminData.users.filter(u => (u.name+' '+u.email).toLowerCase().includes(search));
  tbody.innerHTML = rows.map(u=>`
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${u.joined}</td>
      <td>${u.plan}</td>
      <td>${u.bankLinked ? escapeHtml(u.bankName)+' <span class="dot-live" style="margin-left:4px;"></span>' : '<span style="color:var(--muted);">Not linked</span>'}</td>
      <td><span class="pill ${u.status==='active'?'status-active':'status-suspended'}">${u.status==='active'?'Active':'Suspended'}</span></td>
      <td style="text-align:right;">
        <button class="btn-mini ${u.status==='active'?'dismiss':'approve'}" onclick="adminToggleStatus(${u.id})">${u.status==='active'?'Suspend':'Activate'}</button>
        <button class="btn-mini" onclick="adminDeleteUser(${u.id})">Delete</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">No matching users.</td></tr>';
}
function adminToggleStatus(id){ return run(async ()=>{
  const res = await api.patch('/admin/users/'+id+'/status');
  toast(res.user.name+' marked as '+(res.user.status==='active'?'Active':'Suspended')+'.');
  await renderAdmin();
}); }
function adminDeleteUser(id){ return run(async ()=>{
  const u = adminData.users.find(x=>x.id===id);
  if(!u) return;
  if(!confirm('Remove '+u.name+' from the demo user list? This cannot be undone.')) return;
  await api.del('/admin/users/'+id);
  toast(u.name+' removed.');
  await renderAdmin();
}); }
function renderAdminAlerts(){
  const wrap = document.getElementById('admin-alerts');
  const all = adminData.alerts;
  wrap.innerHTML = all.length ? all.map(a=>`
    <div class="alert-card ${a.type}">
      <span class="ic">${a.icon}</span>
      <div class="body"><div class="title">${escapeHtml(a.title)}</div><div class="desc">${escapeHtml(a.desc)}</div></div>
    </div>`).join('') : '<div class="empty">No active alerts across any account.</div>';
}
function renderAdminBankAccounts(){
  const wrap = document.getElementById('admin-banks-list');
  const html = adminData.banks.map(b=>`
    <div class="autodetect-item">
      <div><strong>${escapeHtml(b.name)}</strong><div class="meta">${escapeHtml(b.detail)}</div></div>
      <span class="dot-live"></span>
    </div>`).join('');
  wrap.innerHTML = html || '<div class="empty">No linked accounts.</div>';
}
function renderAdminAuditLog(){
  const wrap = document.getElementById('admin-audit-log');
  const log = adminData.audit;
  wrap.innerHTML = log.length ? log.map(l=>`
    <div class="gexp-row"><span>${escapeHtml(l.msg)}</span><span class="who mono">${l.time}</span></div>
  `).join('') : '<div class="empty">No admin actions yet this session.</div>';
}
function adminExportUsersCSV(){ return run(async ()=>{
  const blob = await api.blob('/admin/users/export.csv');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'spendwise-admin-users.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Users exported to CSV.');
  await renderAdmin();
}); }

/* ---------- render everything ---------- */
function renderAll(){
  renderDashboard();
  renderTransactions();
  renderBudgets();
  buildReportMonthOptions();
  renderReport();
  renderGroups();
  renderAlerts();
  if(document.getElementById('page-analytics').classList.contains('active')) renderAnalytics();
}
