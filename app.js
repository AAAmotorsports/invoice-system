/* ===================================================
   請求書発行システム - メインアプリケーション
   =================================================== */

// ---- Data Store ----
const STORAGE_KEYS = {
  inventory: 'invoice_sys_inventory',
  invoices: 'invoice_sys_invoices',
  settings: 'invoice_sys_settings',
  customers: 'invoice_sys_customers',
  purchases: 'invoice_sys_purchases',
  expenses: 'invoice_sys_expenses'
};

const DEFAULT_SETTINGS = {
  companyName: '福岡キッズカートアカデミー',
  representativeName: '原野正明',
  postalCode: '818-0024',
  address: '福岡県筑紫野市大字原田１３３８',
  registrationNumber: 'T7810928956182',
  bankAccounts: [
    { id: '1', bankName: '福岡銀行', branchName: '筑紫支店', accountType: '普通', accountNumber: '0103993', accountHolder: 'ﾊﾗﾉﾏｻｱｷ' },
    { id: '2', bankName: '西日本ｼﾃｨ銀行', branchName: '美しが丘出張所', accountType: '普通', accountNumber: '3015580', accountHolder: 'ﾊﾗﾉﾏｻｱｷ' },
    { id: '3', bankName: 'PayPay銀行', branchName: 'ｽｽﾞﾒ支店 (002)', accountType: '普通', accountNumber: '3215096', accountHolder: 'ﾌｸｵｶｷｯｽﾞｶ−ﾄｱｶﾃﾞﾐ−' }
  ],
  taxRate: 10,
  logoImage: '',
  anthropicApiKey: '', // AI機能用（ローカル端末にのみ保存、Firebase同期対象外）
  masterCategories: [
    'エンジン部品',
    'フレーム部品',
    'ケミカル',
    'フォルツァ（エンジン外注）',
    'アパレル',
    'タイヤ',
    'サービス'
  ]
};

function loadData(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch(e) { return null; }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

let dataUnsaved = false;

function markUnsaved() {
  dataUnsaved = true;
  // Firestore同期
  if (typeof debouncedPush === 'function') debouncedPush();
}

function markSaved() {
  dataUnsaved = false;
}

function getInventory() { return loadData(STORAGE_KEYS.inventory) || []; }
function setInventory(items) { saveData(STORAGE_KEYS.inventory, items); markUnsaved(); }
function getInvoices() { return loadData(STORAGE_KEYS.invoices) || []; }
function setInvoices(invoices) { saveData(STORAGE_KEYS.invoices, invoices); markUnsaved(); }
function getSettings() { return loadData(STORAGE_KEYS.settings) || { ...DEFAULT_SETTINGS }; }
function setSettings(settings) { saveData(STORAGE_KEYS.settings, settings); markUnsaved(); }
function getCustomers() { return loadData(STORAGE_KEYS.customers) || []; }
function setCustomers(customers) { saveData(STORAGE_KEYS.customers, customers); markUnsaved(); }
function getPurchases() { return loadData(STORAGE_KEYS.purchases) || []; }
function setPurchases(purchases) { saveData(STORAGE_KEYS.purchases, purchases); markUnsaved(); }
function getExpenses() { return loadData(STORAGE_KEYS.expenses) || []; }
function setExpenses(expenses) { saveData(STORAGE_KEYS.expenses, expenses); markUnsaved(); }

// 仕入れ履歴を記録
function addPurchase(itemName, quantity, unitPrice, date) {
  const purchases = getPurchases();
  purchases.push({
    id: generateId(),
    itemName: itemName,
    quantity: quantity,
    unitPrice: unitPrice,
    amount: quantity * unitPrice,
    date: date || new Date().toISOString().slice(0, 10),
    createdAt: Date.now()
  });
  setPurchases(purchases);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---- Invoice Number Generation ----
function generateInvoiceNumber(dateStr) {
  const d = dateStr.replace(/-/g, '');
  const invoices = getInvoices();
  let maxSeq = 0;
  invoices.forEach(inv => {
    if (inv.invoiceNumber && inv.invoiceNumber.startsWith(d)) {
      const seq = parseInt(inv.invoiceNumber.slice(8), 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  });
  return d + String(maxSeq + 1).padStart(3, '0');
}

// ---- Number Formatting ----
function formatNumber(n) { return Number(n).toLocaleString('ja-JP'); }
function formatCurrency(n) { return formatNumber(n) + '円'; }

// ---- Toast Notifications ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---- Modal Helpers ----
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ---- Customer Management ----
function addCustomerIfNew(name) {
  if (!name) return;
  const customers = getCustomers();
  if (!customers.includes(name)) {
    customers.push(name);
    customers.sort();
    setCustomers(customers);
  }
}

function updateCustomerDropdown() {
  const select = document.getElementById('inv-customer-select');
  const customers = getCustomers();
  let html = '<option value="">-- 顧客を選択 --</option>';
  html += customers.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  html += '<option value="__new__">+ 新規顧客を入力</option>';
  select.innerHTML = html;
}

function onCustomerSelectChange() {
  const select = document.getElementById('inv-customer-select');
  const input = document.getElementById('inv-customer-new');
  if (select.value === '__new__') {
    input.style.display = 'block';
    input.focus();
  } else {
    input.style.display = 'none';
    input.value = '';
  }
}

function getSelectedCustomerName() {
  const select = document.getElementById('inv-customer-select');
  if (select.value === '__new__') {
    return document.getElementById('inv-customer-new').value.trim();
  }
  return select.value;
}

// ---- Tab Navigation ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');

    const tab = btn.dataset.tab;
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'inventory') renderInventory();
    if (tab === 'history') renderHistory();
    if (tab === 'sales') renderSalesHistory();
    if (tab === 'settings') loadSettingsForm();
    if (tab === 'create') refreshCreatePage();
    if (tab === 'expense') refreshExpensePage();
  });
});

// ===================================================
// DASHBOARD
// ===================================================
let dashboardSalesView = 'monthly'; // 'monthly' | 'customer'
let dashPeriodFrom = ''; // 'YYYY-MM-DD'
let dashPeriodTo = '';   // 'YYYY-MM-DD'

function onDashDateChange() {
  dashPeriodFrom = document.getElementById('dash-date-from').value || '';
  dashPeriodTo = document.getElementById('dash-date-to').value || '';
  renderDashboardSalesBlock();
}

function setDashPeriodPreset(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let from = '', to = '';
  const iso = (d) => d.toISOString().slice(0, 10);
  if (preset === 'thisMonth') {
    from = iso(new Date(y, m, 1));
    to = iso(new Date(y, m + 1, 0));
  } else if (preset === 'lastMonth') {
    from = iso(new Date(y, m - 1, 1));
    to = iso(new Date(y, m, 0));
  } else if (preset === 'thisYear') {
    from = `${y}-01-01`;
    to = `${y}-12-31`;
  } else if (preset === 'last12') {
    from = iso(new Date(y, m - 11, 1));
    to = iso(new Date(y, m + 1, 0));
  } else if (preset === 'all') {
    from = '';
    to = '';
  }
  dashPeriodFrom = from;
  dashPeriodTo = to;
  const fromEl = document.getElementById('dash-date-from');
  const toEl = document.getElementById('dash-date-to');
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
  renderDashboardSalesBlock();
}

// 期間フィルタ（YYYY-MM-DD の文字列比較）
function inDashPeriod(dateStr) {
  if (!dateStr) return false;
  if (dashPeriodFrom && dateStr < dashPeriodFrom) return false;
  if (dashPeriodTo && dateStr > dashPeriodTo) return false;
  return true;
}

function switchSalesView(mode) {
  dashboardSalesView = mode;
  const bMonthly = document.getElementById('btn-sales-monthly');
  const bCustomer = document.getElementById('btn-sales-customer');
  const title = document.getElementById('sales-view-title');
  const activeStyle = 'background:var(--primary,#3498db);color:#fff;border-color:var(--primary,#3498db);';
  if (mode === 'monthly') {
    bMonthly.setAttribute('style', activeStyle);
    bCustomer.removeAttribute('style');
    title.textContent = '月別売上履歴';
  } else {
    bCustomer.setAttribute('style', activeStyle);
    bMonthly.removeAttribute('style');
    title.textContent = '顧客別売上履歴';
  }
  renderDashboardSalesBlock();
}

function renderDashboardSalesBlock() {
  if (dashboardSalesView === 'customer') {
    renderDashboardCustomerSales();
  } else {
    renderDashboardMonthlySales();
  }
}

function renderDashboardCustomerSales() {
  const allInvoices = getInvoices();
  const el = document.getElementById('monthly-sales-history');
  if (!el) return;
  const invoices = (dashPeriodFrom || dashPeriodTo)
    ? allInvoices.filter(inv => inDashPeriod(inv.invoiceDate))
    : allInvoices;
  if (invoices.length === 0) {
    const msg = (dashPeriodFrom || dashPeriodTo) ? '期間内の売上データがありません' : '売上データがありません';
    el.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    return;
  }
  const map = {};
  invoices.forEach(inv => {
    const name = inv.customerName || '(未設定)';
    if (!map[name]) map[name] = { count: 0, total: 0, cost: 0, latest: '' };
    map[name].count++;
    map[name].total += (inv.total || 0);
    map[name].cost += (inv.totalCost || 0);
    if (!map[name].latest || (inv.invoiceDate && inv.invoiceDate > map[name].latest)) {
      map[name].latest = inv.invoiceDate || '';
    }
  });
  const names = Object.keys(map).sort((a, b) => map[b].total - map[a].total);
  const grandTotal = names.reduce((s, n) => s + map[n].total, 0);
  const grandCost = names.reduce((s, n) => s + map[n].cost, 0);
  const periodLabel = periodLabelText();
  let html = `
    <div style="margin-bottom:8px;font-size:0.9rem;color:var(--text-light);">
      ${escapeHtml(periodLabel)} / ${names.length}顧客 / 売上 ${formatCurrency(grandTotal)} / 粗利 ${formatCurrency(grandTotal - grandCost)}
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>顧客名</th>
        <th class="text-right">件数</th>
        <th class="text-right">売上</th>
        <th class="text-right">粗利</th>
        <th>最終請求日</th>
      </tr></thead>
      <tbody>
        ${names.map(n => {
          const d = map[n];
          const profit = d.total - d.cost;
          return `<tr>
            <td>${escapeHtml(n)}</td>
            <td class="text-right">${d.count}</td>
            <td class="text-right"><strong>${formatCurrency(d.total)}</strong></td>
            <td class="text-right">${formatCurrency(profit)}</td>
            <td>${escapeHtml(d.latest || '')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  el.innerHTML = html;
}

function periodLabelText() {
  if (!dashPeriodFrom && !dashPeriodTo) return '全期間';
  if (dashPeriodFrom && dashPeriodTo) return `${dashPeriodFrom} 〜 ${dashPeriodTo}`;
  if (dashPeriodFrom) return `${dashPeriodFrom} 以降`;
  return `${dashPeriodTo} 以前`;
}

function renderDashboardMonthlySales() {
  const allInvoices = getInvoices();
  const allPurchases = getPurchases();
  const usingPeriod = dashPeriodFrom || dashPeriodTo;
  const invoices = usingPeriod ? allInvoices.filter(inv => inDashPeriod(inv.invoiceDate)) : allInvoices;
  const purchases = usingPeriod ? allPurchases.filter(p => inDashPeriod(p.date)) : allPurchases;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyMap = {};
  invoices.forEach(inv => {
    if (!inv.invoiceDate) return;
    const m = inv.invoiceDate.slice(0, 7);
    if (!monthlyMap[m]) monthlyMap[m] = { count: 0, subtotal: 0, tax: 0, total: 0, cost: 0 };
    monthlyMap[m].count++;
    monthlyMap[m].subtotal += (inv.subtotal || 0);
    monthlyMap[m].tax += (inv.tax || 0);
    monthlyMap[m].total += (inv.total || 0);
  });
  purchases.forEach(p => {
    if (!p.date) return;
    const m = p.date.slice(0, 7);
    if (!monthlyMap[m]) monthlyMap[m] = { count: 0, subtotal: 0, tax: 0, total: 0, cost: 0 };
    monthlyMap[m].cost += (p.amount || 0);
  });
  const monthlyEl = document.getElementById('monthly-sales-history');
  const monthKeys = Object.keys(monthlyMap).sort().reverse();
  if (monthKeys.length === 0) {
    const msg = usingPeriod ? '期間内の売上データがありません' : '売上データがありません';
    monthlyEl.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    return;
  }
  // 期間指定時は全部表示、指定なしなら従来通り最近6ヶ月+古い月セレクタ
  const displayMonths = usingPeriod ? monthKeys : monthKeys.slice(0, 6);
  const older = usingPeriod ? [] : monthKeys.slice(6);

  function monthLabel(m) { return m.replace('-', '年') + '月'; }
  function monthRow(m) {
    const d = monthlyMap[m];
    const isCurrent = m === thisMonth;
    const profit = d.total - d.cost;
    return `<tr${isCurrent ? ' style="background:#e8f5e9;font-weight:bold;"' : ''}>
      <td>${monthLabel(m)}${isCurrent ? ' ★' : ''}</td>
      <td class="text-right">${d.count}</td>
      <td class="text-right">${formatCurrency(d.subtotal)}</td>
      <td class="text-right">${formatCurrency(d.tax)}</td>
      <td class="text-right">${formatCurrency(d.total)}</td>
      <td class="text-right">${formatCurrency(d.cost)}</td>
      <td class="text-right">${formatCurrency(profit)}</td></tr>`;
  }

  // 期間サマリー
  const totalSum = displayMonths.reduce((s, m) => s + monthlyMap[m].total, 0);
  const costSum = displayMonths.reduce((s, m) => s + monthlyMap[m].cost, 0);
  const countSum = displayMonths.reduce((s, m) => s + monthlyMap[m].count, 0);
  const summaryHtml = usingPeriod
    ? `<div style="margin-bottom:8px;font-size:0.9rem;color:var(--text-light);">${escapeHtml(periodLabelText())} / ${displayMonths.length}ヶ月 / ${countSum}件 / 売上 ${formatCurrency(totalSum)} / 粗利 ${formatCurrency(totalSum - costSum)}</div>`
    : '';

  let html = summaryHtml + '<div class="table-wrap"><table><thead><tr><th>年月</th><th class="text-right">件数</th><th class="text-right">小計</th><th class="text-right">消費税</th><th class="text-right">売上合計</th><th class="text-right">仕入合計</th><th class="text-right">粗利</th></tr></thead><tbody>';
  html += displayMonths.map(m => monthRow(m)).join('');
  html += '</tbody></table></div>';
  if (older.length > 0) {
    html += '<div style="margin-top:10px;display:flex;align-items:center;gap:8px;">' +
      '<label style="font-size:0.9rem;font-weight:500;">過去の月を表示：</label>' +
      '<select id="older-month-select" onchange="showOlderMonth()" style="padding:6px 10px;border-radius:6px;border:1px solid #ccc;font-size:0.9rem;">' +
      '<option value="">選択してください</option>' +
      older.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('') +
      '</select></div>' +
      '<div id="older-month-detail"></div>';
  }
  monthlyEl.innerHTML = html;
}

function renderDashboard() {
  const inventory = getInventory();
  const invoices = getInvoices();

  const totalInvoices = invoices.length;
  const totalItems = inventory.length;
  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const lowStockCount = inventory.filter(i => i.quantity <= 3).length;

  // 今月の売上・仕入れ
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthInvoices = invoices.filter(inv => inv.invoiceDate && inv.invoiceDate.startsWith(thisMonth));
  const monthlyRevenue = monthInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const purchases = getPurchases();
  const monthPurchases = purchases.filter(p => p.date && p.date.startsWith(thisMonth));
  const monthlyCost = monthPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  const monthlyProfit = monthlyRevenue - monthlyCost;

  document.getElementById('dashboard-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalInvoices}</div><div class="stat-label">発行済み請求書</div></div>
    <div class="stat-card"><div class="stat-value">${totalItems}</div><div class="stat-label">在庫商品数</div></div>
    <div class="stat-card"><div class="stat-value">${formatCurrency(monthlyRevenue)}</div><div class="stat-label">今月の売上</div></div>
    <div class="stat-card"><div class="stat-value">${formatCurrency(monthlyCost)}</div><div class="stat-label">今月の仕入</div></div>
    <div class="stat-card"><div class="stat-value">${formatCurrency(monthlyProfit)}</div><div class="stat-label">今月の粗利</div></div>
  `;

  // 月別 or 顧客別 売上履歴（切替）
  renderDashboardSalesBlock();

  // Recent invoices
  const recent = invoices.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentEl = document.getElementById('recent-invoices');
  if (recent.length === 0) {
    recentEl.innerHTML = '<div class="empty-state"><p>請求書はまだありません</p></div>';
  } else {
    recentEl.innerHTML = recent.map(inv => `
      <div class="history-card" onclick="showInvoiceDetail('${inv.id}')">
        <div class="hc-header">
          <span class="hc-customer">${escapeHtml(inv.customerName)} ${escapeHtml(inv.honorific || '様')}</span>
          <span class="hc-date">${inv.invoiceDate}</span>
        </div>
        <div class="hc-subject">${escapeHtml(inv.subject)} (${inv.invoiceNumber})</div>
        <div class="hc-total">${formatCurrency(inv.total)}</div>
      </div>
    `).join('');
  }

  // 今月入庫・未請求アラート（数量ベースで判定 = 一部残っていればアラート）
  const uninvoicedThisMonth = [];
  purchases.forEach(p => {
    if (!p.date || !p.date.startsWith(thisMonth)) return;
    if (p.excluded) return;
    const status = getPurchaseStatus(p, invoices);
    if (status === 'paid') return;
    const invoicedQty = getPurchaseInvoicedQty(p.id, invoices);
    const remainingQty = Math.max(0, (p.quantity || 0) - invoicedQty);
    if (remainingQty <= 0) return;
    uninvoicedThisMonth.push({ p, remainingQty, invoicedQty, status });
  });
  // 商品名でグループ化して集計（残数量ベース）
  const grouped = {};
  uninvoicedThisMonth.forEach(x => {
    const p = x.p;
    const key = p.itemName || '(名称なし)';
    if (!grouped[key]) grouped[key] = { count: 0, totalQty: 0, totalAmount: 0, latestDate: '', hasPartial: false };
    grouped[key].count++;
    grouped[key].totalQty += x.remainingQty;
    // 残数量ベースの金額
    const unitPrice = p.quantity > 0 ? ((p.amount || 0) / p.quantity) : 0;
    grouped[key].totalAmount += Math.round(unitPrice * x.remainingQty);
    if (x.status === 'partial') grouped[key].hasPartial = true;
    if (!grouped[key].latestDate || p.date > grouped[key].latestDate) grouped[key].latestDate = p.date;
  });
  const alertsEl = document.getElementById('stock-alerts');
  const keys = Object.keys(grouped).sort((a, b) => grouped[b].latestDate.localeCompare(grouped[a].latestDate));
  if (keys.length === 0) {
    alertsEl.innerHTML = '<div class="alert alert-success">✅ 今月の入庫はすべて請求済みまたは対象外です</div>';
  } else {
    const totalCount = uninvoicedThisMonth.length;
    const totalAmount = keys.reduce((s, k) => s + grouped[k].totalAmount, 0);
    alertsEl.innerHTML = `
      <div style="margin-bottom:8px;font-size:0.9rem;color:#e74c3c;font-weight:bold;">⚠️ ${keys.length}商品 / ${totalCount}件の未請求残（残金額 ${formatCurrency(totalAmount)}）</div>
      ${keys.map(name => {
        const g = grouped[name];
        const partialTag = g.hasPartial ? ' <span style="background:#f39c12;color:#fff;padding:1px 6px;border-radius:8px;font-size:0.7rem;">一部済含む</span>' : '';
        return `<div class="alert alert-warning" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <strong>${escapeHtml(name)}</strong>${partialTag}
            <span style="font-size:0.85rem;color:var(--text-light);">— ${g.count}件 / 残数量 ${formatNumber(g.totalQty)} / 最終 ${escapeHtml(g.latestDate)}</span>
          </div>
          <span style="font-weight:bold;">${formatCurrency(g.totalAmount)}</span>
        </div>`;
      }).join('')}
      <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="showStockLogUnpaidOnly()">入庫ログを未請求のみで開く</button>
    `;
  }
}

function showStockLogUnpaidOnly() {
  showStockLog();
  const cb = document.getElementById('stock-log-unpaid-only');
  if (cb) { cb.checked = true; renderStockLog(); }
}

function showOlderMonth() {
  const sel = document.getElementById('older-month-select');
  const m = sel.value;
  const el = document.getElementById('older-month-detail');
  if (!m) { el.innerHTML = ''; return; }

  const invoices = getInvoices();
  const monthInvs = invoices.filter(inv => inv.invoiceDate && inv.invoiceDate.startsWith(m));
  const subtotal = monthInvs.reduce((s, inv) => s + (inv.subtotal || 0), 0);
  const tax = monthInvs.reduce((s, inv) => s + (inv.tax || 0), 0);
  const total = monthInvs.reduce((s, inv) => s + (inv.total || 0), 0);
  const label = m.replace('-', '年') + '月';

  let html = `<div style="margin-top:8px;padding:10px;background:#f5f5f5;border-radius:8px;">`;
  html += `<div style="font-weight:bold;margin-bottom:6px;">${label}　件数: ${monthInvs.length}　小計: ${formatCurrency(subtotal)}　消費税: ${formatCurrency(tax)}　売上合計: ${formatCurrency(total)}</div>`;
  if (monthInvs.length > 0) {
    html += '<div class="table-wrap"><table><thead><tr><th>日付</th><th>顧客名</th><th>商品名</th><th class="text-right">金額</th></tr></thead><tbody>';
    monthInvs.sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''));
    monthInvs.forEach(inv => {
      const items = inv.items || [];
      if (items.length === 0) {
        html += `<tr><td>${inv.invoiceDate}</td><td>${escapeHtml(inv.customerName)}</td><td>-</td><td class="text-right">${formatCurrency(inv.total)}</td></tr>`;
      } else {
        items.forEach((item, idx) => {
          html += '<tr>';
          if (idx === 0) {
            html += `<td rowspan="${items.length}">${inv.invoiceDate}</td><td rowspan="${items.length}">${escapeHtml(inv.customerName)}</td>`;
          }
          html += `<td>${escapeHtml(item.description || '')}</td><td class="text-right">${formatCurrency(item.amount || 0)}</td></tr>`;
        });
      }
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ===================================================
// INVENTORY MANAGEMENT
// ===================================================
// ---- カテゴリ関連 ----
function getCategories() {
  const inventory = getInventory();
  const inventoryCats = inventory.map(i => i.category || '').filter(c => c);
  const masterCats = (getSettings().masterCategories || []).filter(c => c);
  const cats = [...new Set([...masterCats, ...inventoryCats])];
  cats.sort((a, b) => a.localeCompare(b, 'ja'));
  return cats;
}

// マスターカテゴリの管理
function getMasterCategories() {
  return (getSettings().masterCategories || []).slice();
}
function setMasterCategories(cats) {
  const s = getSettings();
  s.masterCategories = cats;
  setSettings(s);
}
function addMasterCategory(name) {
  const cats = getMasterCategories();
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  if (cats.includes(trimmed)) { showToast('既に存在します', 'error'); return false; }
  cats.push(trimmed);
  setMasterCategories(cats);
  return true;
}
function removeMasterCategory(name) {
  setMasterCategories(getMasterCategories().filter(c => c !== name));
}

function updateCategoryFilter() {
  const select = document.getElementById('inventory-category-filter');
  const current = select.value;
  const cats = getCategories();
  let html = '<option value="">全カテゴリ</option>';
  html += cats.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  select.innerHTML = html;
  select.value = current;
}

function updateItemCategoryDropdown(selectedCat) {
  const select = document.getElementById('item-category-select');
  const cats = getCategories();
  let html = '<option value="">-- 未分類 --</option>';
  html += cats.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  html += '<option value="__new__">+ 新規カテゴリ</option>';
  select.innerHTML = html;
  if (selectedCat) select.value = selectedCat;
  document.getElementById('item-category-new').style.display = 'none';
  document.getElementById('item-category-new').value = '';
}

function onItemCategoryChange() {
  const select = document.getElementById('item-category-select');
  const input = document.getElementById('item-category-new');
  if (select.value === '__new__') {
    input.style.display = 'block';
    input.focus();
  } else {
    input.style.display = 'none';
    input.value = '';
  }
}

function getSelectedCategory() {
  const select = document.getElementById('item-category-select');
  if (select.value === '__new__') {
    return document.getElementById('item-category-new').value.trim();
  }
  return select.value;
}

function renderInventory(search = '') {
  const inventory = getInventory();
  const categoryFilter = document.getElementById('inventory-category-filter').value;

  let filtered = inventory;
  if (search) {
    filtered = filtered.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  }
  if (categoryFilter) {
    filtered = filtered.filter(i => (i.category || '') === categoryFilter);
  }

  const tbody = document.getElementById('inventory-table');
  const emptyEl = document.getElementById('inventory-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    updateCategoryFilter();
    return;
  }
  emptyEl.style.display = 'none';

  // カテゴリ別にグループ化し、カテゴリ名50音順、カテゴリ内も50音順
  const groups = {};
  filtered.forEach(item => {
    const cat = item.category || '未分類';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  const sortedCats = Object.keys(groups).sort((a, b) => {
    if (a === '未分類') return 1;
    if (b === '未分類') return -1;
    return a.localeCompare(b, 'ja');
  });

  let html = '';
  sortedCats.forEach(cat => {
    groups[cat].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    // カテゴリヘッダー行
    html += `<tr class="category-header"><td colspan="8">📁 ${escapeHtml(cat)}（${groups[cat].length}件）</td></tr>`;
    groups[cat].forEach(item => {
      html += `
        <tr>
          <td><input type="checkbox" class="inv-check" value="${item.id}" onchange="updateInventoryBulkBar()"></td>
          <td>${escapeHtml(item.category || '')}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="text-right">${formatNumber(item.quantity)}</td>
          <td>${escapeHtml(item.unit || '')}</td>
          <td class="text-right">${formatCurrency(item.unitPrice)}</td>
          <td class="text-right">${formatCurrency(item.retailPrice || 0)}</td>
          <td class="text-center" style="white-space:nowrap;">
            <button class="btn btn-outline btn-sm" onclick="quickAdjustStock('${item.id}')" title="数量調整（+5, -3, =10）" style="padding:4px 8px;">±</button>
            <button class="btn btn-outline btn-sm" onclick="editItem('${item.id}')" title="編集" style="padding:4px 8px;">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}')" title="削除" style="padding:4px 8px;">🗑</button>
          </td>
        </tr>`;
    });
  });

  tbody.innerHTML = html;
  const checkAll = document.getElementById('inventory-check-all');
  if (checkAll) checkAll.checked = false;
  updateInventoryBulkBar();
  updateCategoryFilter();
}

document.getElementById('inventory-search').addEventListener('input', function() {
  renderInventory(this.value);
});

function showAddItemModal() {
  document.getElementById('modal-item-title').textContent = '商品を追加';
  document.getElementById('edit-item-id').value = '';
  document.getElementById('item-name').value = '';
  document.getElementById('item-qty').value = '0';
  document.getElementById('item-unit').value = '';
  document.getElementById('item-price').value = '0';
  document.getElementById('item-retail-price').value = '0';
  updateItemCategoryDropdown('');
  openModal('modal-item');
}

function editItem(id) {
  const item = getInventory().find(i => i.id === id);
  if (!item) return;
  document.getElementById('modal-item-title').textContent = '商品を編集';
  document.getElementById('edit-item-id').value = id;
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-qty').value = item.quantity;
  document.getElementById('item-unit').value = item.unit || '';
  document.getElementById('item-price').value = item.unitPrice;
  document.getElementById('item-retail-price').value = item.retailPrice || 0;
  updateItemCategoryDropdown(item.category || '');
  openModal('modal-item');
}

function saveItem() {
  const id = document.getElementById('edit-item-id').value;
  const name = document.getElementById('item-name').value.trim();
  const category = getSelectedCategory();
  const quantity = parseInt(document.getElementById('item-qty').value, 10) || 0;
  const unit = document.getElementById('item-unit').value.trim();
  const unitPrice = parseInt(document.getElementById('item-price').value, 10) || 0;
  const retailPrice = parseInt(document.getElementById('item-retail-price').value, 10) || 0;

  if (!name) { showToast('商品名を入力してください', 'error'); return; }

  const inventory = getInventory();
  if (id) {
    const idx = inventory.findIndex(i => i.id === id);
    if (idx !== -1) {
      const oldQty = inventory[idx].quantity || 0;
      const addedQty = quantity - oldQty;
      // 数量が増えた場合は仕入れ履歴に記録
      if (addedQty > 0 && unitPrice > 0) {
        addPurchase(name, addedQty, unitPrice);
      }
      inventory[idx] = { ...inventory[idx], name, category, quantity, unit, unitPrice, retailPrice };
    }
    showToast('商品を更新しました');
  } else {
    inventory.push({ id: generateId(), name, category, quantity, unit, unitPrice, retailPrice });
    // 新規追加で数量があれば仕入れ履歴に記録
    if (quantity > 0 && unitPrice > 0) {
      addPurchase(name, quantity, unitPrice);
    }
    showToast('商品を追加しました');
  }
  setInventory(inventory);
  closeModal('modal-item');
  renderInventory(document.getElementById('inventory-search').value);
}

function deleteItem(id) {
  if (!confirm('この商品を削除しますか？')) return;
  setInventory(getInventory().filter(i => i.id !== id));
  showToast('商品を削除しました');
  renderInventory(document.getElementById('inventory-search').value);
}

// ---- 在庫 一括選択・削除 ----
function toggleAllInventory(checked) {
  document.querySelectorAll('.inv-check').forEach(cb => cb.checked = checked);
  updateInventoryBulkBar();
}

function updateInventoryBulkBar() {
  const checked = document.querySelectorAll('.inv-check:checked');
  const bar = document.getElementById('inventory-bulk-bar');
  const count = document.getElementById('inventory-checked-count');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    count.textContent = checked.length + '件選択中';
  } else {
    bar.style.display = 'none';
  }
}

// 在庫を全削除（入庫ログ・請求書・経費請求は残す）
function clearAllInventory() {
  const count = getInventory().length;
  if (count === 0) { showToast('在庫はすでに空です', 'info'); return; }
  const confirmMsg = `⚠️ 在庫商品を全て削除します\n\n` +
    `対象: 在庫管理の商品 ${count}件\n` +
    `保持: 入庫ログ・請求書・経費請求・仕入れ金額・売上データ\n\n` +
    `本当に削除しますか？（この操作は取り消せません）`;
  if (!confirm(confirmMsg)) return;
  // 二重確認
  const typed = prompt('確認のため「リセット」と入力してください');
  if (typed !== 'リセット') { showToast('キャンセルしました', 'info'); return; }
  setInventory([]);
  showToast(`在庫${count}件を削除しました。納品書から取込を始めましょう`);
  renderInventory();
}

// 在庫「その他」メニュー
function toggleInventoryMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('inventory-menu');
  if (!menu) return;
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => document.addEventListener('click', hideInventoryMenu, { once: true }), 0);
  }
}
function hideInventoryMenu() {
  const menu = document.getElementById('inventory-menu');
  if (menu) menu.style.display = 'none';
}

// 数量を相対値で調整（例: +5, -3, 10）
function quickAdjustStock(id) {
  const inventory = getInventory();
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  const input = prompt(
    `「${item.name}」の数量を調整\n現在の在庫: ${item.quantity}${item.unit || ''}\n\n` +
    `+5 で5増加 / -3 で3減少 / =10 で10にセット`,
    ''
  );
  if (input === null) return;
  const trimmed = input.trim();
  if (!trimmed) return;

  let newQty = item.quantity || 0;
  if (trimmed.startsWith('=')) {
    newQty = parseInt(trimmed.slice(1), 10);
  } else if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
    const delta = parseInt(trimmed, 10);
    if (isNaN(delta)) { showToast('数値を入力してください', 'error'); return; }
    newQty = (item.quantity || 0) + delta;
  } else {
    const n = parseInt(trimmed, 10);
    if (isNaN(n)) { showToast('数値を入力してください', 'error'); return; }
    newQty = (item.quantity || 0) + n;
  }
  if (isNaN(newQty)) { showToast('無効な値です', 'error'); return; }
  item.quantity = Math.max(0, newQty);
  setInventory(inventory);
  showToast(`${item.name}: ${item.quantity}${item.unit || ''} に更新`);
  renderInventory(document.getElementById('inventory-search').value);
}

// 選択商品のカテゴリを一括変更
function showBulkCategoryModal() {
  const checked = document.querySelectorAll('.inv-check:checked');
  if (checked.length === 0) { showToast('商品を選択してください', 'error'); return; }
  document.getElementById('bulk-category-count').textContent = `${checked.length}件を対象に変更します`;
  const select = document.getElementById('bulk-category-select');
  const cats = getCategories();
  select.innerHTML = '<option value="">-- 未分類にする --</option>'
    + cats.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')
    + '<option value="__new__">+ 新規カテゴリ</option>';
  select.value = '';
  const newInput = document.getElementById('bulk-category-new');
  newInput.value = '';
  newInput.style.display = 'none';
  openModal('modal-bulk-category');
}

function onBulkCategoryChange() {
  const select = document.getElementById('bulk-category-select');
  const input = document.getElementById('bulk-category-new');
  if (select.value === '__new__') {
    input.style.display = 'block';
    input.focus();
  } else {
    input.style.display = 'none';
    input.value = '';
  }
}

function applyBulkCategory() {
  const select = document.getElementById('bulk-category-select');
  let category = select.value;
  if (category === '__new__') {
    category = document.getElementById('bulk-category-new').value.trim();
    if (!category) { showToast('新規カテゴリ名を入力してください', 'error'); return; }
  }
  const checked = document.querySelectorAll('.inv-check:checked');
  if (checked.length === 0) return;
  const ids = new Set(Array.from(checked).map(cb => cb.value));
  const inventory = getInventory();
  let count = 0;
  inventory.forEach(item => {
    if (ids.has(item.id)) {
      item.category = category;
      count++;
    }
  });
  setInventory(inventory);
  // 新規カテゴリならマスターにも追加
  if (category && !getMasterCategories().includes(category)) {
    addMasterCategory(category);
  }
  closeModal('modal-bulk-category');
  const label = category || '未分類';
  showToast(`${count}件を「${label}」に変更しました`);
  renderInventory(document.getElementById('inventory-search').value);
}

function bulkDeleteInventory() {
  const checked = document.querySelectorAll('.inv-check:checked');
  if (checked.length === 0) return;
  if (!confirm(`${checked.length}件の商品を削除しますか？`)) return;
  const ids = Array.from(checked).map(cb => cb.value);
  setInventory(getInventory().filter(i => !ids.includes(i.id)));
  showToast(`${ids.length}件の商品を削除しました`);
  renderInventory(document.getElementById('inventory-search').value);
}

// ---- CSV Import ----
function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
    const inventory = getInventory();
    let count = 0;

    const firstLine = lines[0];
    const startIdx = /^商品名|^名前|^name|^品名/i.test(firstLine) ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 3) continue;
      const name = cols[0].trim();
      const quantity = parseInt(cols[1], 10) || 0;
      const unitPrice = parseInt(cols[2], 10) || 0;
      const retailPrice = cols[3] ? (parseInt(cols[3], 10) || 0) : 0;
      const unit = cols[4] ? cols[4].trim() : '';
      const category = cols[5] ? cols[5].trim() : '';
      if (!name) continue;

      const existing = inventory.find(item => item.name === name);
      if (existing) {
        existing.quantity += quantity;
        if (unitPrice > 0) existing.unitPrice = unitPrice;
        if (retailPrice > 0) existing.retailPrice = retailPrice;
        if (unit) existing.unit = unit;
        if (category) existing.category = category;
      } else {
        inventory.push({ id: generateId(), name, quantity, unit, unitPrice, retailPrice, category });
      }
      // 仕入れ履歴に記録
      if (quantity > 0 && unitPrice > 0) {
        addPurchase(name, quantity, unitPrice);
      }
      count++;
    }

    setInventory(inventory);
    showToast(`${count}件の商品をインポートしました`);
    renderInventory();
    event.target.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

// ===================================================
// INVOICE CREATION
// ===================================================
let currentInvoiceItems = [];

function refreshCreatePage() {
  const settings = getSettings();
  document.getElementById('inv-tax-rate-display').textContent = settings.taxRate || 10;
  if (!document.getElementById('inv-date').value) {
    document.getElementById('inv-date').value = new Date().toISOString().slice(0, 10);
  }
  updateCustomerDropdown();
  renderInvoiceItems();
}

// 'create' = 新規請求書, 'edit' = 修正モーダル
let selectItemContext = 'create';

function showSelectFromInventory() {
  selectItemContext = 'create';
  document.getElementById('modal-select-inventory').classList.remove('modal-top');
  renderInventorySelectList(getInventory());
  openModal('modal-select-inventory');
}

function showSelectFromInventoryForEdit() {
  selectItemContext = 'edit';
  document.getElementById('modal-select-inventory').classList.add('modal-top');
  renderInventorySelectList(getInventory());
  openModal('modal-select-inventory');
}

function filterInventorySelect() {
  const q = document.getElementById('select-inv-search').value.toLowerCase();
  renderInventorySelectList(getInventory().filter(i => i.name.toLowerCase().includes(q)));
}

function renderInventorySelectList(items) {
  const list = document.getElementById('select-inv-list');
  if (items.length === 0) {
    list.innerHTML = '<p style="color:var(--text-light);text-align:center;">該当する商品がありません</p>';
    return;
  }
  list.innerHTML = items.map(item => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-weight:500;">${escapeHtml(item.name)}</div>
        <div style="font-size:0.8rem;color:var(--text-light);">在庫: ${item.quantity}${item.unit || ''} / 仕入: ${formatCurrency(item.unitPrice)} / 定価: ${formatCurrency(item.retailPrice || 0)}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="addFromInventory('${item.id}')">追加</button>
    </div>
  `).join('');
}

function addFromInventory(itemId) {
  const item = getInventory().find(i => i.id === itemId);
  if (!item) return;
  const price = item.retailPrice || item.unitPrice;
  const newItem = {
    id: generateId(), description: item.name, quantity: 1,
    unit: item.unit || '', unitPrice: price,
    amount: price, inventoryItemId: item.id,
    costPrice: item.unitPrice
  };
  if (selectItemContext === 'edit') {
    editInvoiceItems.push(newItem);
    renderEditInvoiceItems();
  } else {
    currentInvoiceItems.push(newItem);
    renderInvoiceItems();
  }
  closeModal('modal-select-inventory');
  showToast(`${item.name}を追加しました`);
}

function addManualItem() {
  currentInvoiceItems.push({
    id: generateId(), description: '', quantity: 1,
    unit: '', unitPrice: 0, amount: 0, inventoryItemId: null
  });
  renderInvoiceItems();
}

function renderInvoiceItems() {
  const tbody = document.getElementById('invoice-items');
  const emptyEl = document.getElementById('items-empty');

  if (currentInvoiceItems.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    updateInvoiceTotals();
    return;
  }
  emptyEl.style.display = 'none';

  const len = currentInvoiceItems.length;
  tbody.innerHTML = currentInvoiceItems.map((item, idx) => `
    <tr class="item-row">
      <td><input type="text" value="${escapeAttr(item.description)}" onchange="updateItemField(${idx},'description',this.value)"></td>
      <td><input type="number" value="${item.quantity}" min="0" onchange="updateItemField(${idx},'quantity',this.value)"></td>
      <td><input type="text" value="${escapeAttr(item.unit)}" style="width:50px;" onchange="updateItemField(${idx},'unit',this.value)"></td>
      <td><input type="number" value="${item.unitPrice}" min="0" onchange="updateItemField(${idx},'unitPrice',this.value)"></td>
      <td class="text-right">${formatCurrency(item.amount)}</td>
      <td class="text-center"><div class="item-actions">
        ${idx > 0 ? `<button class="btn btn-outline btn-sm" onclick="moveItem(${idx},-1)" title="上へ">↑</button>` : ''}
        ${idx < len - 1 ? `<button class="btn btn-outline btn-sm" onclick="moveItem(${idx},1)" title="下へ">↓</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="insertItemAt(${idx})" title="上に挿入">＋</button>
        <button class="btn btn-danger btn-sm" onclick="removeItem(${idx})">×</button>
      </div></td>
    </tr>
  `).join('');

  updateInvoiceTotals();
}

function updateItemField(idx, field, value) {
  if (field === 'quantity' || field === 'unitPrice') value = parseInt(value, 10) || 0;
  currentInvoiceItems[idx][field] = value;
  currentInvoiceItems[idx].amount = (currentInvoiceItems[idx].quantity || 0) * (currentInvoiceItems[idx].unitPrice || 0);
  renderInvoiceItems();
}

function removeItem(idx) {
  currentInvoiceItems.splice(idx, 1);
  renderInvoiceItems();
}

function moveItem(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= currentInvoiceItems.length) return;
  const temp = currentInvoiceItems[idx];
  currentInvoiceItems[idx] = currentInvoiceItems[newIdx];
  currentInvoiceItems[newIdx] = temp;
  renderInvoiceItems();
}

function insertItemAt(idx) {
  currentInvoiceItems.splice(idx, 0, {
    id: generateId(), description: '', quantity: 1,
    unit: '', unitPrice: 0, amount: 0, inventoryItemId: null
  });
  renderInvoiceItems();
}

function updateInvoiceTotals() {
  const settings = getSettings();
  const taxRate = (settings.taxRate || 10) / 100;
  const subtotal = currentInvoiceItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const tax = Math.floor(subtotal * taxRate);
  const total = subtotal + tax;

  document.getElementById('inv-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('inv-tax').textContent = formatCurrency(tax);
  document.getElementById('inv-total').textContent = formatCurrency(total);
}

// ---- Issue Invoice ----
async function issueInvoice() {
  const customerName = getSelectedCustomerName();
  const honorific = document.getElementById('inv-honorific').value;
  const subject = document.getElementById('inv-subject').value.trim();
  const invoiceDate = document.getElementById('inv-date').value;
  const dueDate = document.getElementById('inv-due-date').value;
  const notes = document.getElementById('inv-notes').value.trim();

  if (!customerName) { showToast('顧客名を選択または入力してください', 'error'); return; }
  if (!invoiceDate) { showToast('請求日を入力してください', 'error'); return; }
  if (currentInvoiceItems.length === 0) { showToast('明細を追加してください', 'error'); return; }

  for (const item of currentInvoiceItems) {
    if (!item.description.trim()) { showToast('摘要が空の明細があります', 'error'); return; }
  }

  const settings = getSettings();
  const taxRate = (settings.taxRate || 10) / 100;
  const subtotal = currentInvoiceItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const tax = Math.floor(subtotal * taxRate);
  const total = subtotal + tax;
  const invoiceNumber = generateInvoiceNumber(invoiceDate);

  const totalCost = currentInvoiceItems.reduce((sum, item) => sum + ((item.costPrice || 0) * (item.quantity || 0)), 0);

  // 手入力でも在庫に同名商品があれば inventoryItemId を解決
  const inventory = getInventory();
  currentInvoiceItems.forEach(item => {
    if (!item.inventoryItemId && item.description.trim()) {
      const existing = inventory.find(i => i.name === item.description.trim());
      if (existing) item.inventoryItemId = existing.id;
    }
  });

  const invoice = {
    id: generateId(), invoiceNumber, customerName, honorific, subject, invoiceDate, dueDate,
    items: currentInvoiceItems.map(item => ({
      description: item.description, quantity: item.quantity,
      unit: item.unit, unitPrice: item.unitPrice, amount: item.amount,
      costPrice: item.costPrice || 0,
      inventoryItemId: item.inventoryItemId || null,
      sourcePurchaseId: item.sourcePurchaseId || null
    })),
    subtotal, taxRate, tax, total, totalCost, notes, createdAt: Date.now()
  };

  // Save
  const invoices = getInvoices();
  invoices.push(invoice);
  setInvoices(invoices);

  // Register customer
  addCustomerIfNew(customerName);

  // 入庫ログとの紐付け（入庫ログから追加した明細のみ）
  linkPurchasesToInvoice(currentInvoiceItems, invoice);

  // Deduct inventory & auto-register new items
  currentInvoiceItems.forEach(item => {
    if (item.inventoryItemId) {
      const invItem = inventory.find(i => i.id === item.inventoryItemId);
      if (invItem) {
        invItem.quantity = Math.max(0, invItem.quantity - item.quantity);
        if (item.unit) invItem.unit = item.unit;
        if (item.unitPrice > 0) invItem.retailPrice = item.unitPrice;
      }
    } else if (item.description.trim()) {
      // 在庫にも入庫ログにも無い完全新規 → 在庫に登録（数量0）
      inventory.push({
        id: generateId(),
        name: item.description.trim(),
        quantity: 0,
        unit: item.unit || '',
        unitPrice: 0,
        retailPrice: item.unitPrice || 0
      });
    }
  });
  setInventory(inventory);

  // Generate PDF
  try {
    await generateInvoicePDF(invoice, settings);
  } catch (err) {
    console.error('PDF generation error:', err);
    showToast('PDF生成中にエラーが発生しました', 'error');
  }

  // Reset form
  currentInvoiceItems = [];
  document.getElementById('inv-customer-select').value = '';
  document.getElementById('inv-customer-new').style.display = 'none';
  document.getElementById('inv-customer-new').value = '';
  document.getElementById('inv-subject').value = '';
  document.getElementById('inv-notes').value = '';
  document.getElementById('inv-due-date').value = '';
  renderInvoiceItems();

  showToast('請求書を発行しました');
}

// ===================================================
// INVOICE HISTORY
// ===================================================
function renderHistory(search = '') {
  const invoices = getInvoices();
  const filtered = search
    ? invoices.filter(inv =>
        inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
        inv.subject.toLowerCase().includes(search.toLowerCase()) ||
        inv.invoiceNumber.includes(search)
      )
    : invoices;

  const sorted = filtered.slice().sort((a, b) => b.createdAt - a.createdAt);
  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');

  if (sorted.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = sorted.map(inv => `
    <div class="history-card" style="display:flex;align-items:center;gap:10px;">
      <input type="checkbox" class="hist-check" value="${inv.id}" onchange="updateHistoryBulkBar()" onclick="event.stopPropagation()">
      <div style="flex:1;cursor:pointer;" onclick="showInvoiceDetail('${inv.id}')">
        <div class="hc-header">
          <span class="hc-customer">${escapeHtml(inv.customerName)} ${escapeHtml(inv.honorific || '様')}</span>
          <span class="hc-date">${inv.invoiceDate}</span>
        </div>
        <div class="hc-subject">${escapeHtml(inv.subject)} (${inv.invoiceNumber})</div>
        <div class="hc-total">${formatCurrency(inv.total)}</div>
      </div>
      <div class="hc-status" onclick="event.stopPropagation()">
        <label class="status-check"><input type="checkbox" ${inv.sent ? 'checked' : ''} onchange="toggleInvoiceFlag('${inv.id}','sent',this.checked)"><span>送付</span></label>
        <label class="status-check"><input type="checkbox" ${inv.paid ? 'checked' : ''} onchange="toggleInvoiceFlag('${inv.id}','paid',this.checked)"><span>入金</span></label>
      </div>
    </div>
  `).join('');
  updateHistoryBulkBar();
}

function toggleInvoiceFlag(id, flag, value) {
  const invoices = getInvoices();
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;
  inv[flag] = value;
  setInvoices(invoices);
}

document.getElementById('history-search').addEventListener('input', function() {
  renderHistory(this.value);
});

let currentDetailInvoiceId = null;

function showInvoiceDetail(id) {
  const inv = getInvoices().find(i => i.id === id);
  if (!inv) return;
  currentDetailInvoiceId = id;

  document.getElementById('invoice-detail-content').innerHTML = `
    <div class="detail-row"><div class="detail-label">請求書番号</div><div class="detail-value">${inv.invoiceNumber}</div></div>
    <div class="detail-row"><div class="detail-label">宛先</div><div class="detail-value">${escapeHtml(inv.customerName)} ${escapeHtml(inv.honorific || '様')}</div></div>
    <div class="detail-row"><div class="detail-label">件名</div><div class="detail-value">${escapeHtml(inv.subject)}</div></div>
    <div class="detail-row"><div class="detail-label">請求日</div><div class="detail-value">${inv.invoiceDate}</div></div>
    <div class="detail-row"><div class="detail-label">入金期日</div><div class="detail-value">${inv.dueDate || '未設定'}</div></div>
    <div style="margin-top:12px;">
      <table>
        <thead><tr><th>摘要</th><th class="text-right">数量</th><th>単位</th><th class="text-right">単価</th><th class="text-right">金額</th></tr></thead>
        <tbody>
          ${inv.items.map(item => `
            <tr><td>${escapeHtml(item.description)}</td><td class="text-right">${item.quantity}</td>
            <td>${escapeHtml(item.unit || '')}</td><td class="text-right">${formatCurrency(item.unitPrice)}</td>
            <td class="text-right">${formatCurrency(item.amount)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="summary-box" style="margin-top:12px;">
      <div class="summary-row"><span>小計</span><span>${formatCurrency(inv.subtotal)}</span></div>
      <div class="summary-row"><span>消費税</span><span>${formatCurrency(inv.tax)}</span></div>
      <div class="summary-row total"><span>請求金額</span><span>${formatCurrency(inv.total)}</span></div>
    </div>
    ${inv.notes ? `<div style="margin-top:12px;"><strong>備考:</strong><p style="margin-top:4px;font-size:0.9rem;">${escapeHtml(inv.notes)}</p></div>` : ''}
  `;
  openModal('modal-invoice-detail');
}

function deleteInvoice() {
  if (!currentDetailInvoiceId) return;
  const inv = getInvoices().find(i => i.id === currentDetailInvoiceId);
  if (!inv) return;
  const msg = `請求書「${inv.invoiceNumber}」（${inv.customerName} ${inv.honorific || '様'}）を削除しますか？\n\nこの操作は取り消せません。`;
  if (!confirm(msg)) return;
  const invoices = getInvoices().filter(i => i.id !== currentDetailInvoiceId);
  setInvoices(invoices);
  currentDetailInvoiceId = null;
  closeModal('modal-invoice-detail');
  renderHistory();
  renderSalesHistory();
  showToast('請求書を削除しました');
}

// ---- 請求書 一括選択・削除 ----
function updateHistoryBulkBar() {
  const checked = document.querySelectorAll('.hist-check:checked');
  const bar = document.getElementById('history-bulk-bar');
  const count = document.getElementById('history-checked-count');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    count.textContent = checked.length + '件選択中';
  } else {
    bar.style.display = 'none';
  }
}

function bulkDeleteInvoices() {
  const checked = document.querySelectorAll('.hist-check:checked');
  if (checked.length === 0) return;
  if (!confirm(`${checked.length}件の請求書を削除しますか？\n\nこの操作は取り消せません。`)) return;
  const ids = Array.from(checked).map(cb => cb.value);
  setInvoices(getInvoices().filter(i => !ids.includes(i.id)));
  showToast(`${ids.length}件の請求書を削除しました`);
  renderHistory();
  renderSalesHistory();
}

async function reissueInvoice() {
  if (!currentDetailInvoiceId) return;
  const inv = getInvoices().find(i => i.id === currentDetailInvoiceId);
  if (!inv) return;
  try {
    await generateInvoicePDF(inv, getSettings());
    showToast('PDFを再発行しました');
  } catch (err) {
    console.error('PDF reissue error:', err);
    showToast('PDF再発行中にエラーが発生しました', 'error');
  }
  closeModal('modal-invoice-detail');
}

// 請求書をコピーして「請求書作成」フォームに読み込む
function copyInvoice() {
  if (!currentDetailInvoiceId) return;
  const inv = getInvoices().find(i => i.id === currentDetailInvoiceId);
  if (!inv) return;

  // 請求書作成タブへ切り替え
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const createBtn = document.querySelector('.tab-btn[data-tab="create"]');
  if (createBtn) createBtn.classList.add('active');
  document.getElementById('page-create').classList.add('active');
  refreshCreatePage();

  // 明細をコピー（在庫リンクは商品名一致で復元）
  const inventory = getInventory();
  currentInvoiceItems = (inv.items || []).map(item => {
    let invId = item.inventoryItemId || null;
    if (!invId && item.description) {
      const matched = inventory.find(i => i.name === item.description);
      if (matched) invId = matched.id;
    }
    return {
      id: generateId(),
      description: item.description || '',
      quantity: item.quantity || 0,
      unit: item.unit || '',
      unitPrice: item.unitPrice || 0,
      amount: item.amount || 0,
      inventoryItemId: invId,
      costPrice: item.costPrice || 0
    };
  });

  // 顧客名: 既存リストにあれば選択、なければ新規入力欄に
  const customers = getCustomers();
  const customerSelect = document.getElementById('inv-customer-select');
  const customerNewInput = document.getElementById('inv-customer-new');
  if (inv.customerName && customers.includes(inv.customerName)) {
    customerSelect.value = inv.customerName;
    customerNewInput.style.display = 'none';
    customerNewInput.value = '';
  } else {
    customerSelect.value = '__new__';
    customerNewInput.style.display = 'block';
    customerNewInput.value = inv.customerName || '';
  }

  // 各種フィールドを反映
  document.getElementById('inv-honorific').value = inv.honorific || '様';
  document.getElementById('inv-subject').value = inv.subject || '';
  document.getElementById('inv-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('inv-due-date').value = '';
  document.getElementById('inv-notes').value = inv.notes || '';

  renderInvoiceItems();
  closeModal('modal-invoice-detail');
  showToast('請求書をコピーしました。顧客名を変更してください');
}

// ===================================================
// INVOICE EDIT (請求書修正)
// ===================================================
let editInvoiceItems = [];

function startEditInvoice() {
  if (!currentDetailInvoiceId) return;
  const inv = getInvoices().find(i => i.id === currentDetailInvoiceId);
  if (!inv) return;

  document.getElementById('edit-invoice-id').value = inv.id;
  document.getElementById('edit-inv-customer').value = inv.customerName || '';
  document.getElementById('edit-inv-honorific').value = inv.honorific || '様';
  document.getElementById('edit-inv-subject').value = inv.subject || '';
  document.getElementById('edit-inv-date').value = inv.invoiceDate || '';
  document.getElementById('edit-inv-due-date').value = inv.dueDate || '';
  document.getElementById('edit-inv-notes').value = inv.notes || '';

  // 既存請求書に inventoryItemId が無い場合は商品名一致で復元
  const inventory = getInventory();
  editInvoiceItems = (inv.items || []).map(item => {
    let invId = item.inventoryItemId || null;
    if (!invId && item.description) {
      const matched = inventory.find(i => i.name === item.description);
      if (matched) invId = matched.id;
    }
    return {
      description: item.description || '',
      quantity: item.quantity || 0,
      unit: item.unit || '',
      unitPrice: item.unitPrice || 0,
      amount: item.amount || 0,
      costPrice: item.costPrice || 0,
      inventoryItemId: invId,
      sourcePurchaseId: item.sourcePurchaseId || null
    };
  });

  renderEditInvoiceItems();
  closeModal('modal-invoice-detail');
  openModal('modal-invoice-edit');
}

function renderEditInvoiceItems() {
  const tbody = document.getElementById('edit-invoice-items');
  const len = editInvoiceItems.length;
  tbody.innerHTML = editInvoiceItems.map((item, idx) => `
    <tr>
      <td><input type="text" value="${escapeAttr(item.description)}" onchange="updateEditItemField(${idx},'description',this.value)"></td>
      <td><input type="number" value="${item.quantity}" min="0" onchange="updateEditItemField(${idx},'quantity',this.value)"></td>
      <td><input type="text" value="${escapeAttr(item.unit)}" style="width:50px;" onchange="updateEditItemField(${idx},'unit',this.value)"></td>
      <td><input type="number" value="${item.unitPrice}" min="0" onchange="updateEditItemField(${idx},'unitPrice',this.value)"></td>
      <td class="text-right">${formatCurrency(item.amount)}</td>
      <td class="text-center"><div class="item-actions">
        ${idx > 0 ? `<button class="btn btn-outline btn-sm" onclick="moveEditItem(${idx},-1)" title="上へ">↑</button>` : ''}
        ${idx < len - 1 ? `<button class="btn btn-outline btn-sm" onclick="moveEditItem(${idx},1)" title="下へ">↓</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="insertEditItemAt(${idx})" title="上に挿入">＋</button>
        <button class="btn btn-danger btn-sm" onclick="removeEditItem(${idx})">×</button>
      </div></td>
    </tr>
  `).join('');
  updateEditInvoiceTotals();
}

function updateEditItemField(idx, field, value) {
  if (field === 'quantity' || field === 'unitPrice') value = parseInt(value, 10) || 0;
  editInvoiceItems[idx][field] = value;
  editInvoiceItems[idx].amount = (editInvoiceItems[idx].quantity || 0) * (editInvoiceItems[idx].unitPrice || 0);
  renderEditInvoiceItems();
}

function removeEditItem(idx) {
  editInvoiceItems.splice(idx, 1);
  renderEditInvoiceItems();
}

function moveEditItem(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= editInvoiceItems.length) return;
  const temp = editInvoiceItems[idx];
  editInvoiceItems[idx] = editInvoiceItems[newIdx];
  editInvoiceItems[newIdx] = temp;
  renderEditInvoiceItems();
}

function insertEditItemAt(idx) {
  editInvoiceItems.splice(idx, 0, { description: '', quantity: 1, unit: '', unitPrice: 0, amount: 0, costPrice: 0 });
  renderEditInvoiceItems();
}

function addEditInvoiceItem() {
  editInvoiceItems.push({ description: '', quantity: 1, unit: '', unitPrice: 0, amount: 0, costPrice: 0 });
  renderEditInvoiceItems();
}

function updateEditInvoiceTotals() {
  const settings = getSettings();
  const taxRate = (settings.taxRate || 10) / 100;
  const subtotal = editInvoiceItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const tax = Math.floor(subtotal * taxRate);
  const total = subtotal + tax;
  document.getElementById('edit-inv-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('edit-inv-tax').textContent = formatCurrency(tax);
  document.getElementById('edit-inv-total').textContent = formatCurrency(total);
}

function saveEditedInvoice() {
  const id = document.getElementById('edit-invoice-id').value;
  const customerName = document.getElementById('edit-inv-customer').value.trim();
  const honorific = document.getElementById('edit-inv-honorific').value;
  const subject = document.getElementById('edit-inv-subject').value.trim();
  const invoiceDate = document.getElementById('edit-inv-date').value;
  const dueDate = document.getElementById('edit-inv-due-date').value;
  const notes = document.getElementById('edit-inv-notes').value.trim();

  if (!customerName) { showToast('顧客名を入力してください', 'error'); return; }
  if (!invoiceDate) { showToast('請求日を入力してください', 'error'); return; }
  if (editInvoiceItems.length === 0) { showToast('明細を追加してください', 'error'); return; }

  const settings = getSettings();
  const taxRate = (settings.taxRate || 10) / 100;
  const subtotal = editInvoiceItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const tax = Math.floor(subtotal * taxRate);
  const total = subtotal + tax;
  const totalCost = editInvoiceItems.reduce((sum, item) => sum + ((item.costPrice || 0) * (item.quantity || 0)), 0);

  const invoices = getInvoices();
  const idx = invoices.findIndex(i => i.id === id);
  if (idx === -1) { showToast('請求書が見つかりません', 'error'); return; }
  const oldItems = invoices[idx].items || [];

  // 手入力でも在庫に同名商品があれば inventoryItemId を解決
  const inventory = getInventory();
  editInvoiceItems.forEach(item => {
    if (!item.inventoryItemId && item.description.trim()) {
      const existing = inventory.find(i => i.name === item.description.trim());
      if (existing) item.inventoryItemId = existing.id;
    }
  });

  // 旧明細・新明細を inventoryItemId 別に集計
  const oldQtyById = {};
  oldItems.forEach(it => {
    let invId = it.inventoryItemId || null;
    if (!invId && it.description) {
      const matched = inventory.find(i => i.name === it.description);
      if (matched) invId = matched.id;
    }
    if (invId) oldQtyById[invId] = (oldQtyById[invId] || 0) + (it.quantity || 0);
  });
  const newQtyById = {};
  editInvoiceItems.forEach(it => {
    if (it.inventoryItemId) {
      newQtyById[it.inventoryItemId] = (newQtyById[it.inventoryItemId] || 0) + (it.quantity || 0);
    }
  });

  // 差分を在庫に反映: 旧 - 新 を在庫に加算（新>旧 なら減算、新<旧 なら戻す）
  const allIds = new Set([...Object.keys(oldQtyById), ...Object.keys(newQtyById)]);
  allIds.forEach(invId => {
    const delta = (oldQtyById[invId] || 0) - (newQtyById[invId] || 0);
    if (delta === 0) return;
    const invItem = inventory.find(i => i.id === invId);
    if (invItem) {
      invItem.quantity = Math.max(0, (invItem.quantity || 0) + delta);
    }
  });

  // 完全新規（在庫にも入庫ログにも無い）→ 在庫に登録
  editInvoiceItems.forEach(item => {
    if (!item.inventoryItemId && item.description.trim()) {
      inventory.push({
        id: generateId(),
        name: item.description.trim(),
        quantity: 0,
        unit: item.unit || '',
        unitPrice: 0,
        retailPrice: item.unitPrice || 0
      });
    }
  });
  setInventory(inventory);

  invoices[idx] = {
    ...invoices[idx],
    customerName, honorific, subject, invoiceDate, dueDate, notes,
    items: editInvoiceItems.map(item => ({
      description: item.description, quantity: item.quantity,
      unit: item.unit, unitPrice: item.unitPrice, amount: item.amount,
      costPrice: item.costPrice || 0,
      inventoryItemId: item.inventoryItemId || null,
      sourcePurchaseId: item.sourcePurchaseId || null
    })),
    subtotal, taxRate, tax, total, totalCost
  };

  setInvoices(invoices);
  addCustomerIfNew(customerName);
  // 入庫ログとの紐付け（新たに追加された sourcePurchaseId があれば）
  linkPurchasesToInvoice(editInvoiceItems, invoices[idx]);
  closeModal('modal-invoice-edit');
  renderHistory();
  renderSalesHistory();
  showToast('請求書を修正しました');
}

// 入庫ログに紐付いた請求書明細の合計数量を計算
function getPurchaseInvoicedQty(purchaseId, invoicesCache) {
  const invs = invoicesCache || getInvoices();
  let sum = 0;
  invs.forEach(inv => {
    (inv.items || []).forEach(item => {
      if (item.sourcePurchaseId === purchaseId) sum += (item.quantity || 0);
    });
  });
  return sum;
}

// 入庫ログの請求状況を返す: 'excluded' | 'paid' | 'partial' | 'unpaid'
function getPurchaseStatus(purchase, invoicesCache) {
  if (purchase.excluded) return 'excluded';
  const invoiced = getPurchaseInvoicedQty(purchase.id, invoicesCache);
  const total = purchase.quantity || 0;
  if (invoiced <= 0) return 'unpaid';
  if (invoiced >= total) return 'paid';
  return 'partial';
}

// items 内の sourcePurchaseId を持つ明細を入庫ログに紐付ける
function linkPurchasesToInvoice(items, invoice) {
  const purchases = getPurchases();
  let changed = false;
  items.forEach(item => {
    if (!item.sourcePurchaseId) return;
    const purchase = purchases.find(p => p.id === item.sourcePurchaseId);
    if (!purchase) return;
    purchase.invoicedInvoiceId = invoice.id;
    purchase.invoicedInvoiceNumber = invoice.invoiceNumber;
    purchase.invoicedAt = Date.now();
    changed = true;
  });
  if (changed) setPurchases(purchases);
}

// ===================================================
// STOCK LOG (入庫ログ)
// ===================================================
function showStockLog() {
  const checkAll = document.getElementById('stock-log-check-all');
  if (checkAll) checkAll.checked = false;
  renderStockLog();
  openModal('modal-stock-log');
}

function renderStockLog() {
  const purchases = getPurchases();
  const search = (document.getElementById('stock-log-search') || {}).value || '';
  const unpaidOnly = (document.getElementById('stock-log-unpaid-only') || {}).checked;

  let filtered = purchases.slice();
  if (search) {
    filtered = filtered.filter(p => p.itemName.toLowerCase().includes(search.toLowerCase()));
  }
  if (unpaidOnly) {
    const invs = getInvoices();
    filtered = filtered.filter(p => {
      const st = getPurchaseStatus(p, invs);
      return st === 'unpaid' || st === 'partial';
    });
  }

  // 新しい順
  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const tbody = document.getElementById('stock-log-table');
  const emptyEl = document.getElementById('stock-log-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    updateStockLogBulkBar();
    return;
  }
  emptyEl.style.display = 'none';

  const inventory = getInventory();
  const invoices = getInvoices();
  tbody.innerHTML = filtered.map(p => {
    const inv = inventory.find(i => i.name === p.itemName);
    const stockQty = inv ? inv.quantity : 0;
    const stockUnit = inv ? (inv.unit || '') : '';
    const stockColor = inv ? (stockQty < p.quantity ? 'color:#e67e22;' : '') : 'color:#999;';
    const stockDisplay = inv
      ? `${formatNumber(stockQty)}${escapeHtml(stockUnit)}`
      : '—';

    // 4状態: 済 / 一部済 / 対象外 / 未請求
    const status = getPurchaseStatus(p, invoices);
    const invoicedQty = getPurchaseInvoicedQty(p.id, invoices);
    const remainingQty = Math.max(0, (p.quantity || 0) - invoicedQty);
    let invoiceBadge, toggleBtn;
    if (status === 'paid') {
      invoiceBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#2ecc71;color:#fff;font-size:0.75rem;font-weight:bold;" title="請求書番号: ${escapeHtml(p.invoicedInvoiceNumber || '')}">✓ 済</span>`;
      toggleBtn = '';
    } else if (status === 'partial') {
      invoiceBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#f39c12;color:#fff;font-size:0.75rem;font-weight:bold;" title="請求済み ${invoicedQty} / ${p.quantity}">一部済 (残${remainingQty})</span>`;
      toggleBtn = '';
    } else if (status === 'excluded') {
      invoiceBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#95a5a6;color:#fff;font-size:0.75rem;font-weight:bold;">対象外</span>`;
      toggleBtn = `<button class="btn btn-outline btn-sm" onclick="togglePurchaseExcluded('${p.id}')" title="未請求に戻す">↩</button>`;
    } else {
      invoiceBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#e74c3c;color:#fff;font-size:0.75rem;font-weight:bold;">未請求</span>`;
      toggleBtn = `<button class="btn btn-outline btn-sm" onclick="togglePurchaseExcluded('${p.id}')" title="対象外にする（自社使用など）">除外</button>`;
    }

    return `
    <tr>
      <td><input type="checkbox" class="stock-log-check" value="${p.id}" onchange="updateStockLogBulkBar()"></td>
      <td>${escapeHtml(p.date || '')}</td>
      <td>${escapeHtml(p.itemName || '')}</td>
      <td class="text-right">${formatNumber(p.quantity)}</td>
      <td class="text-right" style="${stockColor}">${stockDisplay}</td>
      <td class="text-right">${formatCurrency(p.unitPrice)}</td>
      <td class="text-right">${formatCurrency(p.amount)}</td>
      <td class="text-center">${invoiceBadge}</td>
      <td class="text-center">${toggleBtn}<button class="btn btn-danger btn-sm" onclick="deleteStockLog('${p.id}')">×</button></td>
    </tr>`;
  }).join('');
  updateStockLogBulkBar();
}

function deleteStockLog(id) {
  if (!confirm('この入庫ログを削除しますか？')) return;
  setPurchases(getPurchases().filter(p => p.id !== id));
  showToast('入庫ログを削除しました');
  renderStockLog();
}

// 対象外フラグ切り替え（自社使用など請求しない入庫を除外）
function togglePurchaseExcluded(id) {
  const purchases = getPurchases();
  const p = purchases.find(x => x.id === id);
  if (!p) return;
  p.excluded = !p.excluded;
  setPurchases(purchases);
  showToast(p.excluded ? '対象外にしました' : '未請求に戻しました');
  renderStockLog();
}

function toggleAllStockLog(checked) {
  document.querySelectorAll('.stock-log-check').forEach(cb => cb.checked = checked);
  updateStockLogBulkBar();
}

function updateStockLogBulkBar() {
  const checked = document.querySelectorAll('.stock-log-check:checked');
  const bar = document.getElementById('stock-log-bulk-bar');
  const count = document.getElementById('stock-log-checked-count');
  if (!bar) return;
  if (checked.length > 0) {
    bar.style.display = 'flex';
    count.textContent = checked.length + '件選択中';
  } else {
    bar.style.display = 'none';
  }
}

function bulkDeleteStockLog() {
  const checked = document.querySelectorAll('.stock-log-check:checked');
  if (checked.length === 0) return;
  if (!confirm(`${checked.length}件の入庫ログを削除しますか？\n\nこの操作は取り消せません。`)) return;
  const ids = Array.from(checked).map(cb => cb.value);
  setPurchases(getPurchases().filter(p => !ids.includes(p.id)));
  const checkAll = document.getElementById('stock-log-check-all');
  if (checkAll) checkAll.checked = false;
  showToast(`${ids.length}件の入庫ログを削除しました`);
  renderStockLog();
}

// ===================================================
// SELECT FROM STOCK LOG (請求書作成/修正: 入庫ログから追加)
// ===================================================
// 入庫ログ選択モーダル: 選択された purchase ID を「選択順」で保持
let stockLogSelectionOrder = [];

function showSelectFromStockLog() {
  selectItemContext = 'create';
  document.getElementById('modal-select-stock-log').classList.remove('modal-top');
  const searchEl = document.getElementById('select-stock-log-search');
  if (searchEl) searchEl.value = '';
  stockLogSelectionOrder = [];
  renderStockLogSelectList(getPurchases().filter(p => !p.excluded));
  updateStockLogSelectButton();
  openModal('modal-select-stock-log');
}

function showSelectFromStockLogForEdit() {
  selectItemContext = 'edit';
  document.getElementById('modal-select-stock-log').classList.add('modal-top');
  const searchEl = document.getElementById('select-stock-log-search');
  if (searchEl) searchEl.value = '';
  stockLogSelectionOrder = [];
  renderStockLogSelectList(getPurchases().filter(p => !p.excluded));
  updateStockLogSelectButton();
  openModal('modal-select-stock-log');
}

function filterStockLogSelect() {
  const q = document.getElementById('select-stock-log-search').value.toLowerCase();
  const filtered = getPurchases().filter(p => !p.excluded && (p.itemName || '').toLowerCase().includes(q));
  renderStockLogSelectList(filtered);
}

function renderStockLogSelectList(purchases) {
  const list = document.getElementById('select-stock-log-list');
  if (!purchases || purchases.length === 0) {
    list.innerHTML = '<p style="color:var(--text-light);text-align:center;">該当する入庫ログがありません</p>';
    return;
  }
  // 新しい順
  const sorted = purchases.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const inventory = getInventory();
  const invoices = getInvoices();
  list.innerHTML = sorted.map(p => {
    const inv = inventory.find(i => i.name === p.itemName);
    const stockQty = inv ? inv.quantity : 0;
    const stockUnit = inv ? (inv.unit || '') : '';
    const orderIdx = stockLogSelectionOrder.indexOf(p.id);
    const isSelected = orderIdx >= 0;
    const badge = isSelected
      ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--primary,#3498db);color:#fff;font-weight:bold;font-size:0.85rem;">${orderIdx + 1}</span>`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#eee;color:#999;font-size:0.85rem;">＋</span>`;
    const status = getPurchaseStatus(p, invoices);
    const invoicedQty = getPurchaseInvoicedQty(p.id, invoices);
    const remainingQty = Math.max(0, (p.quantity || 0) - invoicedQty);
    let invoiceTag = '';
    if (status === 'paid') invoiceTag = `<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#2ecc71;color:#fff;font-size:0.7rem;margin-left:6px;">✓済</span>`;
    else if (status === 'partial') invoiceTag = `<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#f39c12;color:#fff;font-size:0.7rem;margin-left:6px;" title="残${remainingQty}">一部済</span>`;
    else if (status === 'excluded') invoiceTag = `<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#95a5a6;color:#fff;font-size:0.7rem;margin-left:6px;">対象外</span>`;
    else invoiceTag = `<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#e74c3c;color:#fff;font-size:0.7rem;margin-left:6px;">未</span>`;
    // 残数量の表示
    const remainInfo = status === 'partial' ? ` / 残${formatNumber(remainingQty)}` : '';
    return `
    <div onclick="toggleStockLogSelect('${p.id}')" style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);cursor:pointer;background:${isSelected ? 'rgba(52,152,219,0.08)' : 'transparent'};">
      <div style="flex:1;">
        <div style="font-weight:500;">${escapeHtml(p.itemName || '')}${invoiceTag}</div>
        <div style="font-size:0.8rem;color:var(--text-light);">${escapeHtml(p.date || '')} / 入庫: ${formatNumber(p.quantity)}${remainInfo} / 在庫: ${formatNumber(stockQty)}${escapeHtml(stockUnit)} / 仕入: ${formatCurrency(p.unitPrice)}</div>
      </div>
      ${badge}
    </div>`;
  }).join('');
}

function toggleStockLogSelect(purchaseId) {
  const idx = stockLogSelectionOrder.indexOf(purchaseId);
  if (idx >= 0) {
    stockLogSelectionOrder.splice(idx, 1);
  } else {
    stockLogSelectionOrder.push(purchaseId);
  }
  // 検索フィルタを維持したまま再描画
  const q = (document.getElementById('select-stock-log-search') || {}).value || '';
  const filtered = q
    ? getPurchases().filter(p => (p.itemName || '').toLowerCase().includes(q.toLowerCase()))
    : getPurchases();
  renderStockLogSelectList(filtered);
  updateStockLogSelectButton();
}

function updateStockLogSelectButton() {
  const btn = document.getElementById('btn-add-selected-stock-log');
  if (!btn) return;
  const n = stockLogSelectionOrder.length;
  btn.textContent = `選択を請求書に追加 (${n}件)`;
  btn.disabled = n === 0;
  btn.style.opacity = n === 0 ? '0.5' : '1';
}

function addSelectedStockLogToInvoice() {
  if (stockLogSelectionOrder.length === 0) return;
  const purchases = getPurchases();
  const inventory = getInventory();
  let addedCount = 0;
  stockLogSelectionOrder.forEach(pid => {
    const purchase = purchases.find(p => p.id === pid);
    if (!purchase) return;
    const inventoryItem = inventory.find(i => i.name === purchase.itemName);
    const price = inventoryItem ? (inventoryItem.retailPrice || purchase.unitPrice) : purchase.unitPrice;
    const unit = inventoryItem ? (inventoryItem.unit || '') : '';
    const newItem = {
      id: generateId(),
      description: purchase.itemName,
      quantity: purchase.quantity,
      unit: unit,
      unitPrice: price,
      amount: price * purchase.quantity,
      inventoryItemId: inventoryItem ? inventoryItem.id : null,
      costPrice: purchase.unitPrice,
      sourcePurchaseId: purchase.id
    };
    if (selectItemContext === 'edit') {
      editInvoiceItems.push(newItem);
    } else {
      currentInvoiceItems.push(newItem);
    }
    addedCount++;
  });
  if (selectItemContext === 'edit') {
    renderEditInvoiceItems();
  } else {
    renderInvoiceItems();
  }
  closeModal('modal-select-stock-log');
  stockLogSelectionOrder = [];
  showToast(`${addedCount}件を追加しました`);
}

// ===================================================
// SALES HISTORY (販売履歴 - 全体 + 顧客別)
// ===================================================
function renderSalesHistory() {
  const invoices = getInvoices();
  const customerFilter = document.getElementById('sales-customer-filter').value;
  const dateFrom = document.getElementById('sales-date-from').value;
  const dateTo = document.getElementById('sales-date-to').value;

  // Filter
  let filtered = invoices.slice();
  if (customerFilter) {
    filtered = filtered.filter(inv => inv.customerName === customerFilter);
  }
  if (dateFrom) {
    filtered = filtered.filter(inv => inv.invoiceDate >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter(inv => inv.invoiceDate <= dateTo);
  }

  // Sort by date desc
  filtered.sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));

  // Summary stats
  const totalAmount = filtered.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalTax = filtered.reduce((sum, inv) => sum + (inv.tax || 0), 0);
  const totalSubtotal = filtered.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);

  document.getElementById('sales-summary').innerHTML = `
    <div class="stats-grid" style="margin-bottom:12px;">
      <div class="stat-card"><div class="stat-value">${filtered.length}</div><div class="stat-label">件数</div></div>
      <div class="stat-card"><div class="stat-value">${formatCurrency(totalSubtotal)}</div><div class="stat-label">小計合計</div></div>
      <div class="stat-card"><div class="stat-value">${formatCurrency(totalTax)}</div><div class="stat-label">消費税合計</div></div>
      <div class="stat-card"><div class="stat-value">${formatCurrency(totalAmount)}</div><div class="stat-label">売上合計</div></div>
    </div>
  `;

  // Customer breakdown
  const customerBreakdown = {};
  filtered.forEach(inv => {
    if (!customerBreakdown[inv.customerName]) {
      customerBreakdown[inv.customerName] = { count: 0, total: 0 };
    }
    customerBreakdown[inv.customerName].count++;
    customerBreakdown[inv.customerName].total += (inv.total || 0);
  });

  let breakdownHtml = '';
  if (!customerFilter && Object.keys(customerBreakdown).length > 0) {
    breakdownHtml = '<div class="card" style="margin-bottom:12px;"><h3>顧客別集計</h3><div class="table-wrap"><table><thead><tr><th>顧客名</th><th class="text-right">件数</th><th class="text-right">売上合計</th></tr></thead><tbody>';
    const sorted = Object.entries(customerBreakdown).sort((a, b) => b[1].total - a[1].total);
    sorted.forEach(([name, data]) => {
      breakdownHtml += `<tr><td>${escapeHtml(name)} 様</td><td class="text-right">${data.count}</td><td class="text-right">${formatCurrency(data.total)}</td></tr>`;
    });
    breakdownHtml += '</tbody></table></div></div>';
  }
  document.getElementById('sales-breakdown').innerHTML = breakdownHtml;

  // Detail list — 商品名ごとに展開表示
  const listEl = document.getElementById('sales-list');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><p>該当する販売データがありません</p></div>';
  } else {
    let rows = '';
    filtered.forEach(inv => {
      const items = inv.items || [];
      if (items.length === 0) {
        rows += `<tr onclick="showInvoiceDetail('${inv.id}')" style="cursor:pointer;">
          <td>${inv.invoiceDate}</td><td>${escapeHtml(inv.customerName)}</td>
          <td>${escapeHtml(inv.subject)}</td><td>-</td>
          <td class="text-right">-</td><td class="text-right">-</td>
          <td class="text-right">${formatCurrency(inv.total)}</td></tr>`;
      } else {
        items.forEach((item, idx) => {
          rows += `<tr onclick="showInvoiceDetail('${inv.id}')" style="cursor:pointer;">`;
          if (idx === 0) {
            rows += `<td rowspan="${items.length}">${inv.invoiceDate}</td>`;
            rows += `<td rowspan="${items.length}">${escapeHtml(inv.customerName)}</td>`;
          }
          rows += `<td>${escapeHtml(item.description || '')}</td>`;
          rows += `<td class="text-right">${item.quantity || ''}</td>`;
          rows += `<td class="text-right">${formatCurrency(item.unitPrice || 0)}</td>`;
          rows += `<td class="text-right">${formatCurrency(item.amount || 0)}</td>`;
          if (idx === 0) {
            rows += `<td rowspan="${items.length}" class="text-right" style="font-weight:bold;">${formatCurrency(inv.total)}</td>`;
          }
          rows += '</tr>';
        });
      }
    });
    listEl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>日付</th><th>顧客名</th><th>商品名</th><th class="text-right">数量</th><th class="text-right">単価</th><th class="text-right">金額</th><th class="text-right">請求合計</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  // Update customer filter dropdown
  updateSalesCustomerFilter();
}

function updateSalesCustomerFilter() {
  const select = document.getElementById('sales-customer-filter');
  const currentVal = select.value;
  const customers = getCustomers();

  // Also collect customer names from invoices
  const invoices = getInvoices();
  const allCustomers = new Set(customers);
  invoices.forEach(inv => { if (inv.customerName) allCustomers.add(inv.customerName); });

  const sorted = Array.from(allCustomers).sort();
  let html = '<option value="">全ての顧客</option>';
  html += sorted.map(c => `<option value="${escapeAttr(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  select.innerHTML = html;
}

function onSalesFilterChange() {
  renderSalesHistory();
}

// ===================================================
// FREEE EXPORT (売上データCSVエクスポート)
// ===================================================
function exportFreeeCSV() {
  const invoices = getInvoices();
  const customerFilter = document.getElementById('sales-customer-filter').value;
  const dateFrom = document.getElementById('sales-date-from').value;
  const dateTo = document.getElementById('sales-date-to').value;

  let filtered = invoices.slice();
  if (customerFilter) filtered = filtered.filter(inv => inv.customerName === customerFilter);
  if (dateFrom) filtered = filtered.filter(inv => inv.invoiceDate >= dateFrom);
  if (dateTo) filtered = filtered.filter(inv => inv.invoiceDate <= dateTo);

  if (filtered.length === 0) {
    showToast('エクスポートするデータがありません', 'error');
    return;
  }

  filtered.sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''));

  // Freee CSV format
  // Headers: 収支区分,管理番号,発生日,決済期日,取引先,勘定科目,税区分,金額,税計算区分,税額,備考
  const header = '収支区分,管理番号,発生日,決済期日,取引先,勘定科目,税区分,金額,税計算区分,税額,備考';

  const rows = filtered.map(inv => {
    const cols = [
      '収入',                                    // 収支区分
      inv.invoiceNumber,                          // 管理番号
      inv.invoiceDate,                            // 発生日
      inv.dueDate || '',                          // 決済期日
      inv.customerName,                           // 取引先
      '売上高',                                   // 勘定科目
      '課税売上10%',                              // 税区分
      inv.subtotal,                               // 金額（税抜）
      '税込',                                     // 税計算区分
      inv.tax,                                    // 税額
      inv.subject || ''                           // 備考
    ];
    return cols.map(c => csvEscape(String(c))).join(',');
  });

  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateLabel = dateFrom && dateTo ? `_${dateFrom}_${dateTo}` : `_${new Date().toISOString().slice(0, 10)}`;
  a.download = `freee_売上データ${dateLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Freee用CSVをエクスポートしました');
}

function csvEscape(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ===================================================
// SETTINGS
// ===================================================
function loadSettingsForm() {
  const s = getSettings();
  document.getElementById('set-company').value = s.companyName || '';
  document.getElementById('set-representative').value = s.representativeName || '';
  document.getElementById('set-postal').value = s.postalCode || '';
  document.getElementById('set-address').value = s.address || '';
  document.getElementById('set-registration').value = s.registrationNumber || '';
  document.getElementById('set-tax-rate').value = s.taxRate || 10;

  if (s.logoImage) {
    document.getElementById('logo-preview').src = s.logoImage;
    document.getElementById('logo-preview').style.display = 'block';
    document.getElementById('logo-preview-text').textContent = '設定済み';
  } else {
    document.getElementById('logo-preview').style.display = 'none';
    document.getElementById('logo-preview-text').textContent = '未設定';
  }

  renderBankAccounts(s);
  renderCustomerList();
  renderMasterCategoriesList();
  refreshApiKeyStatus();
}

function renderMasterCategoriesList() {
  const list = document.getElementById('master-categories-list');
  if (!list) return;
  const cats = getMasterCategories();
  if (cats.length === 0) {
    list.innerHTML = '<p style="color:var(--text-light);font-size:0.9rem;">カテゴリが登録されていません。</p>';
    return;
  }
  list.innerHTML = cats.map(c => `
    <div class="bank-item">
      <div class="bank-info"><strong>${escapeHtml(c)}</strong></div>
      <button class="btn btn-danger btn-sm" onclick="deleteMasterCategoryFromUI('${escapeAttr(c)}')">削除</button>
    </div>
  `).join('');
}

function addMasterCategoryFromUI() {
  const input = document.getElementById('new-master-category');
  const name = input.value.trim();
  if (!name) { showToast('カテゴリ名を入力してください', 'error'); return; }
  if (addMasterCategory(name)) {
    input.value = '';
    renderMasterCategoriesList();
    showToast(`「${name}」を追加しました`);
  }
}

function deleteMasterCategoryFromUI(name) {
  if (!confirm(`カテゴリ「${name}」をマスターから削除しますか？\n\n※既存の商品のカテゴリ設定はそのまま残ります`)) return;
  removeMasterCategory(name);
  renderMasterCategoriesList();
  showToast(`「${name}」を削除しました`);
}

function refreshApiKeyStatus() {
  const s = getSettings();
  const input = document.getElementById('set-anthropic-key');
  const status = document.getElementById('anthropic-key-status');
  if (!input || !status) return;
  input.value = s.anthropicApiKey || '';
  if (s.anthropicApiKey) {
    const masked = s.anthropicApiKey.slice(0, 10) + '...' + s.anthropicApiKey.slice(-4);
    status.innerHTML = `✅ 設定済み（${masked}）`;
    status.style.color = '#27ae60';
  } else {
    status.textContent = '未設定 - AI機能は使えません';
    status.style.color = '#999';
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('set-anthropic-key');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function saveApiKey() {
  const key = document.getElementById('set-anthropic-key').value.trim();
  if (key && !key.startsWith('sk-ant-')) {
    if (!confirm('sk-ant-で始まっていませんが、このまま保存しますか？')) return;
  }
  const s = getSettings();
  s.anthropicApiKey = key;
  setSettings(s);
  refreshApiKeyStatus();
  showToast('APIキーを保存しました');
}

function clearApiKey() {
  if (!confirm('APIキーを削除しますか？AI機能が使えなくなります。')) return;
  const s = getSettings();
  s.anthropicApiKey = '';
  setSettings(s);
  refreshApiKeyStatus();
  showToast('APIキーを削除しました');
}

async function testApiKey() {
  const key = document.getElementById('set-anthropic-key').value.trim();
  if (!key) { showToast('APIキーを入力してください', 'error'); return; }
  showToast('接続テスト中...', 'info');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [{ role: 'user', content: 'ping' }]
      })
    });
    const data = await res.json();
    if (data.error) {
      showToast('エラー: ' + data.error.message, 'error');
    } else {
      showToast('✅ 接続OK！AI機能が使えます');
    }
  } catch (err) {
    showToast('通信エラー: ' + err.message, 'error');
  }
}

function saveSettings() {
  const s = getSettings();
  s.companyName = document.getElementById('set-company').value.trim();
  s.representativeName = document.getElementById('set-representative').value.trim();
  s.postalCode = document.getElementById('set-postal').value.trim();
  s.address = document.getElementById('set-address').value.trim();
  s.registrationNumber = document.getElementById('set-registration').value.trim();
  s.taxRate = parseInt(document.getElementById('set-tax-rate').value, 10) || 10;
  setSettings(s);
  showToast('設定を保存しました');
}

function uploadLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    // 画像を圧縮・リサイズ（最大300px、JPEG品質0.7）
    const img = new Image();
    img.onload = function() {
      const MAX_SIZE = 300;
      let w = img.width, h = img.height;
      if (w > MAX_SIZE || h > MAX_SIZE) {
        if (w > h) { h = Math.round(h * MAX_SIZE / w); w = MAX_SIZE; }
        else { w = Math.round(w * MAX_SIZE / h); h = MAX_SIZE; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/png');

      const s = getSettings();
      s.logoImage = compressed;
      setSettings(s);
      document.getElementById('logo-preview').src = compressed;
      document.getElementById('logo-preview').style.display = 'block';
      document.getElementById('logo-preview-text').textContent = '設定済み';
      showToast('ロゴを設定しました');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ---- Customer List in Settings ----
function renderCustomerList() {
  const customers = getCustomers();
  const listEl = document.getElementById('customer-list');
  if (!listEl) return;

  if (customers.length === 0) {
    listEl.innerHTML = '<p style="color:var(--text-light);font-size:0.9rem;">顧客が登録されていません。請求書を発行すると自動登録されます。</p>';
    return;
  }

  listEl.innerHTML = customers.map(name => `
    <div class="bank-item">
      <div class="bank-info"><strong>${escapeHtml(name)}</strong></div>
      <button class="btn btn-danger btn-sm" onclick="deleteCustomer('${escapeAttr(name)}')">削除</button>
    </div>
  `).join('');
}

function deleteCustomer(name) {
  if (!confirm(`「${name}」を顧客リストから削除しますか？`)) return;
  setCustomers(getCustomers().filter(c => c !== name));
  showToast('顧客を削除しました');
  renderCustomerList();
}

function addCustomerManual() {
  const name = prompt('顧客名を入力してください:');
  if (!name || !name.trim()) return;
  addCustomerIfNew(name.trim());
  showToast('顧客を追加しました');
  renderCustomerList();
}

// ---- Bank Accounts ----
function renderBankAccounts(settings) {
  const s = settings || getSettings();
  const list = document.getElementById('bank-accounts-list');
  if (!s.bankAccounts || s.bankAccounts.length === 0) {
    list.innerHTML = '<p style="color:var(--text-light);">振込先が登録されていません</p>';
    return;
  }
  list.innerHTML = s.bankAccounts.map(bank => `
    <div class="bank-item">
      <div class="bank-info">
        <strong>${escapeHtml(bank.bankName)}</strong> ${escapeHtml(bank.branchName)}<br>
        ${bank.accountType} ${bank.accountNumber} ${escapeHtml(bank.accountHolder)}
      </div>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-outline btn-sm" onclick="editBank('${bank.id}')">編集</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBank('${bank.id}')">削除</button>
      </div>
    </div>
  `).join('');
}

function showAddBankModal() {
  document.getElementById('modal-bank-title').textContent = '振込先を追加';
  document.getElementById('edit-bank-id').value = '';
  document.getElementById('bank-name').value = '';
  document.getElementById('bank-branch').value = '';
  document.getElementById('bank-type').value = '普通';
  document.getElementById('bank-number').value = '';
  document.getElementById('bank-holder').value = '';
  openModal('modal-bank');
}

function editBank(id) {
  const s = getSettings();
  const bank = s.bankAccounts.find(b => b.id === id);
  if (!bank) return;
  document.getElementById('modal-bank-title').textContent = '振込先を編集';
  document.getElementById('edit-bank-id').value = id;
  document.getElementById('bank-name').value = bank.bankName;
  document.getElementById('bank-branch').value = bank.branchName;
  document.getElementById('bank-type').value = bank.accountType;
  document.getElementById('bank-number').value = bank.accountNumber;
  document.getElementById('bank-holder').value = bank.accountHolder;
  openModal('modal-bank');
}

function saveBank() {
  const id = document.getElementById('edit-bank-id').value;
  const bankName = document.getElementById('bank-name').value.trim();
  const branchName = document.getElementById('bank-branch').value.trim();
  const accountType = document.getElementById('bank-type').value;
  const accountNumber = document.getElementById('bank-number').value.trim();
  const accountHolder = document.getElementById('bank-holder').value.trim();

  if (!bankName) { showToast('銀行名を入力してください', 'error'); return; }

  const s = getSettings();
  if (!s.bankAccounts) s.bankAccounts = [];

  if (id) {
    const idx = s.bankAccounts.findIndex(b => b.id === id);
    if (idx !== -1) s.bankAccounts[idx] = { id, bankName, branchName, accountType, accountNumber, accountHolder };
    showToast('振込先を更新しました');
  } else {
    s.bankAccounts.push({ id: generateId(), bankName, branchName, accountType, accountNumber, accountHolder });
    showToast('振込先を追加しました');
  }

  setSettings(s);
  closeModal('modal-bank');
  renderBankAccounts(s);
}

function deleteBank(id) {
  if (!confirm('この振込先を削除しますか？')) return;
  const s = getSettings();
  s.bankAccounts = s.bankAccounts.filter(b => b.id !== id);
  setSettings(s);
  showToast('振込先を削除しました');
  renderBankAccounts(s);
}

// ===================================================
// BACKUP / RESTORE
// ===================================================
function exportBackup() {
  const data = {
    version: 4,
    exportedAt: new Date().toISOString(),
    inventory: getInventory(),
    invoices: getInvoices(),
    settings: getSettings(),
    customers: getCustomers(),
    purchases: getPurchases(),
    expenses: getExpenses()
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('バックアップをエクスポートしました');
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm('現在のデータを上書きして復元しますか？\n（現在のデータは失われます）')) {
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.inventory || !data.invoices || !data.settings) {
        showToast('無効なバックアップファイルです', 'error');
        return;
      }
      setInventory(data.inventory);
      setInvoices(data.invoices);
      setSettings(data.settings);
      if (data.customers) setCustomers(data.customers);
      if (data.purchases) setPurchases(data.purchases);
      if (data.expenses) setExpenses(data.expenses);
      showToast('バックアップを復元しました');
      renderDashboard();
    } catch(e) {
      showToast('ファイルの読み込みに失敗しました', 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

// ===================================================
// UTILITIES
// ===================================================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===================================================
// DATA FILE (data.json) - 読込 / 保存
// ===================================================
let savedFileHandle = null; // File System Access API用

function buildDataObject() {
  return {
    version: 4,
    savedAt: new Date().toISOString(),
    inventory: getInventory(),
    invoices: getInvoices(),
    settings: getSettings(),
    customers: getCustomers(),
    purchases: getPurchases(),
    expenses: getExpenses()
  };
}

function applyLoadedData(data) {
  // localStorage に直接書き込み（markUnsavedを発火させない）
  if (data.inventory) localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(data.inventory));
  if (data.invoices) localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(data.invoices));
  if (data.settings) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data.settings));
  if (data.customers) localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(data.customers));
  if (data.purchases) localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(data.purchases));
  if (data.expenses) localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(data.expenses));
  markSaved();
  renderDashboard();
  refreshCreatePage();
}

// File System Access API が使えるか判定
function hasFileSystemAccess() {
  return typeof window.showOpenFilePicker === 'function';
}

// --- 読込 ---
async function loadDataFile(event) {
  // Chrome/Edge: File System Access API でハンドル取得 → 上書き保存対応
  if (hasFileSystemAccess()) {
    event.preventDefault();
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      savedFileHandle = handle;
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      applyLoadedData(data);
      showToast('データを読み込みました');
    } catch(e) {
      if (e.name !== 'AbortError') {
        showToast('ファイルの読み込みに失敗しました', 'error');
      }
    }
    const overlay = document.getElementById('data-load-overlay');
    if (overlay) overlay.style.display = 'none';
    return;
  }

  // Safari/iOS: input[type=file] フォールバック
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      applyLoadedData(data);
      showToast('データを読み込みました');
    } catch(e) {
      showToast('ファイルの読み込みに失敗しました', 'error');
    }
    event.target.value = '';
    const overlay = document.getElementById('data-load-overlay');
    if (overlay) overlay.style.display = 'none';
  };
  reader.readAsText(file, 'UTF-8');
}

// --- 保存 ---
async function saveDataFile() {
  const data = buildDataObject();
  const json = JSON.stringify(data, null, 2);

  // File System Access API: ハンドルがあれば直接上書き
  if (hasFileSystemAccess() && savedFileHandle) {
    try {
      const writable = await savedFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      markSaved();
      showToast('data.json に上書き保存しました');
      return;
    } catch (err) {
      console.warn('直接保存失敗、ダウンロードにフォールバック:', err);
    }
  }

  // File System Access API: ハンドルがなければ保存先を選択
  if (hasFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'data.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
      savedFileHandle = handle;
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      markSaved();
      showToast('data.json を保存しました（次回から上書き保存されます）');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // Safari/iOS: ダウンロード方式
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(url);
  markSaved();
  showToast('data.json をダウンロードしました');
}

function skipDataLoad() {
  document.getElementById('data-load-overlay').style.display = 'none';
}

// 未保存データがある状態でページを離れようとした時の警告（同期失敗時のみ）
window.addEventListener('beforeunload', function(e) {
  if (dataUnsaved && !(typeof syncEnabled !== 'undefined' && syncEnabled)) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ===================================================
// INITIALIZATION
// ===================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!loadData(STORAGE_KEYS.settings)) {
    setSettings(DEFAULT_SETTINGS);
  }

  // localStorageにデータがあればオーバーレイをスキップ
  const hasData = loadData(STORAGE_KEYS.inventory) || loadData(STORAGE_KEYS.invoices);
  if (hasData) {
    const overlay = document.getElementById('data-load-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // 既存ユーザーで masterCategories が未設定なら初期値を投入
  {
    const s = getSettings();
    if (!s.masterCategories || s.masterCategories.length === 0) {
      s.masterCategories = DEFAULT_SETTINGS.masterCategories.slice();
      setSettings(s);
    }
  }

  // 既存のlogoImageが大きすぎる場合、自動圧縮（Firestore 1MBフィールド制限対策）
  const currentSettings = getSettings();
  if (currentSettings.logoImage && currentSettings.logoImage.length > 100000) {
    const img = new Image();
    img.onload = function() {
      const MAX_SIZE = 300;
      let w = img.width, h = img.height;
      if (w > MAX_SIZE || h > MAX_SIZE) {
        if (w > h) { h = Math.round(h * MAX_SIZE / w); w = MAX_SIZE; }
        else { w = Math.round(w * MAX_SIZE / h); h = MAX_SIZE; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      currentSettings.logoImage = canvas.toDataURL('image/png');
      saveData(STORAGE_KEYS.settings, currentSettings);
      console.log('ロゴ画像を自動圧縮しました');
    };
    img.src = currentSettings.logoImage;
  }

  renderDashboard();
  refreshCreatePage();

  // Firebase同期開始（startRealtimeSyncでsyncEnabledをtrueにしてからinitialSync）
  if (typeof startRealtimeSync === 'function') {
    startRealtimeSync();
    await initialSync();
  }
});


// ===================================================
// EXPENSE REIMBURSEMENT (経費請求 / 立替明細書)
// ===================================================
let currentExpenseItems = [];

function refreshExpensePage() {
  // 顧客リスト更新
  const select = document.getElementById('exp-customer-select');
  const customers = getCustomers();
  let html = '<option value="">-- 顧客を選択 --</option>';
  html += customers.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  html += '<option value="__new__">+ 新規顧客を入力</option>';
  select.innerHTML = html;

  // 請求日デフォルト今日
  if (!document.getElementById('exp-date').value) {
    document.getElementById('exp-date').value = new Date().toISOString().slice(0, 10);
  }
  renderExpenseItems();
  renderExpenseHistory();
}

function onExpCustomerSelectChange() {
  const select = document.getElementById('exp-customer-select');
  const input = document.getElementById('exp-customer-new');
  if (select.value === '__new__') {
    input.style.display = 'block';
    input.focus();
  } else {
    input.style.display = 'none';
    input.value = '';
  }
}

function getSelectedExpCustomerName() {
  const select = document.getElementById('exp-customer-select');
  if (select.value === '__new__') return document.getElementById('exp-customer-new').value.trim();
  return select.value;
}

function addExpenseItem() {
  currentExpenseItems.push({
    id: generateId(),
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: 0,
    receiptImage: null,
    receiptFilename: null
  });
  renderExpenseItems();
}

function renderExpenseItems() {
  const list = document.getElementById('expense-items-list');
  const emptyEl = document.getElementById('expense-items-empty');
  if (currentExpenseItems.length === 0) {
    list.innerHTML = '';
    emptyEl.style.display = 'block';
    updateExpenseTotal();
    return;
  }
  emptyEl.style.display = 'none';

  const len = currentExpenseItems.length;
  list.innerHTML = currentExpenseItems.map((item, idx) => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
        <div style="font-weight:bold;color:var(--text-light);">#${idx + 1}</div>
        <input type="date" value="${item.date || ''}" onchange="updateExpenseItemField(${idx},'date',this.value)" style="width:140px;padding:6px;border:1px solid var(--border);border-radius:4px;">
        <input type="number" value="${item.amount}" min="0" placeholder="金額" onchange="updateExpenseItemField(${idx},'amount',this.value)" style="width:100px;padding:6px;border:1px solid var(--border);border-radius:4px;text-align:right;">
        <span>円</span>
        <div style="margin-left:auto;display:flex;gap:4px;">
          ${idx > 0 ? `<button class="btn btn-outline btn-sm" onclick="moveExpenseItem(${idx},-1)">↑</button>` : ''}
          ${idx < len - 1 ? `<button class="btn btn-outline btn-sm" onclick="moveExpenseItem(${idx},1)">↓</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="removeExpenseItem(${idx})">×</button>
        </div>
      </div>
      <input type="text" value="${escapeAttr(item.description)}" placeholder="内容（例: 東京→名古屋 新幹線）" onchange="updateExpenseItemField(${idx},'description',this.value)" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;margin-bottom:8px;">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label class="btn btn-outline btn-sm" style="margin:0;cursor:pointer;">
          ${item.receiptImage ? '📷 領収書を変更' : '📷 領収書を添付'}
          <input type="file" accept="image/*,application/pdf,.pdf" onchange="uploadReceiptImage(event, ${idx})" style="display:none;">
        </label>
        ${item.receiptImage ? `
          <img src="${item.receiptImage}" style="max-height:60px;border:1px solid var(--border);border-radius:4px;cursor:pointer;" onclick="showReceiptPreview('${item.id}')">
          <button class="btn btn-primary btn-sm" onclick="extractReceiptWithAI(${idx})" title="AIで金額・日付を自動抽出">🤖 AIで抽出</button>
          <button class="btn btn-outline btn-sm" onclick="removeReceiptImage(${idx})">画像削除</button>
        ` : ''}
      </div>
    </div>
  `).join('');
  updateExpenseTotal();
}

function updateExpenseItemField(idx, field, value) {
  if (field === 'amount') value = parseInt(value, 10) || 0;
  currentExpenseItems[idx][field] = value;
  updateExpenseTotal();
}

function removeExpenseItem(idx) {
  currentExpenseItems.splice(idx, 1);
  renderExpenseItems();
}

function moveExpenseItem(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= currentExpenseItems.length) return;
  const t = currentExpenseItems[idx];
  currentExpenseItems[idx] = currentExpenseItems[newIdx];
  currentExpenseItems[newIdx] = t;
  renderExpenseItems();
}

function uploadReceiptImage(event, idx) {
  const file = event.target.files[0];
  if (!file) return;

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    handlePdfReceipt(file, idx);
  } else {
    handleImageReceipt(file, idx);
  }
  event.target.value = '';
}

function handleImageReceipt(file, idx) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const compressed = compressImageDataURL(img, 1000, 0.75);
      currentExpenseItems[idx].receiptImage = compressed;
      currentExpenseItems[idx].receiptFilename = file.name;
      renderExpenseItems();
      showToast('領収書を添付しました');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function compressImageDataURL(img, maxSize, quality) {
  let w = img.width, h = img.height;
  if (w > maxSize || h > maxSize) {
    if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
    else { w = Math.round(w * maxSize / h); h = maxSize; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

async function handlePdfReceipt(file, idx) {
  showToast('PDFを読み込み中...', 'info');
  try {
    await loadPdfJsIfNeeded();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    // 高解像度でレンダリング
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    // 1000px以内に圧縮
    const img = new Image();
    img.onload = function() {
      const compressed = compressImageDataURL(img, 1000, 0.75);
      currentExpenseItems[idx].receiptImage = compressed;
      currentExpenseItems[idx].receiptFilename = file.name;
      const pages = pdf.numPages;
      renderExpenseItems();
      if (pages > 1) {
        showToast(`PDFの1ページ目を添付（${pages}ページ中）`, 'info');
      } else {
        showToast('領収書PDFを添付しました');
      }
    };
    img.src = canvas.toDataURL('image/jpeg', 0.9);
  } catch (err) {
    console.error('PDF読込エラー:', err);
    showToast('PDF読込に失敗しました: ' + err.message, 'error');
  }
}

let pdfJsLoadPromise = null;
function loadPdfJsIfNeeded() {
  if (window.pdfjsLib) return Promise.resolve();
  if (pdfJsLoadPromise) return pdfJsLoadPromise;
  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      } else {
        reject(new Error('pdf.js could not be loaded'));
      }
    };
    script.onerror = () => reject(new Error('pdf.js failed to load (ネット接続を確認してください)'));
    document.head.appendChild(script);
  });
  return pdfJsLoadPromise;
}

function removeReceiptImage(idx) {
  currentExpenseItems[idx].receiptImage = null;
  currentExpenseItems[idx].receiptFilename = null;
  renderExpenseItems();
}

function showReceiptPreview(itemId) {
  const item = currentExpenseItems.find(i => i.id === itemId);
  if (!item || !item.receiptImage) return;
  const w = window.open('');
  w.document.write(`<img src="${item.receiptImage}" style="max-width:100%;">`);
}

function updateExpenseTotal() {
  const total = currentExpenseItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  document.getElementById('exp-total').textContent = formatCurrency(total);
}

function generateExpenseNumber(dateStr) {
  const d = dateStr.replace(/-/g, '');
  const expenses = getExpenses();
  const sameDay = expenses.filter(e => (e.expenseNumber || '').startsWith('E' + d));
  const seq = String(sameDay.length + 1).padStart(3, '0');
  return 'E' + d + '-' + seq;
}

async function issueExpense() {
  const customerName = getSelectedExpCustomerName();
  const honorific = document.getElementById('exp-honorific').value;
  const subject = document.getElementById('exp-subject').value.trim();
  const expenseDate = document.getElementById('exp-date').value;
  const dueDate = document.getElementById('exp-due-date').value;
  const notes = document.getElementById('exp-notes').value.trim();

  if (!customerName) { showToast('顧客名を選択または入力してください', 'error'); return; }
  if (!expenseDate) { showToast('請求日を入力してください', 'error'); return; }
  if (currentExpenseItems.length === 0) { showToast('明細を追加してください', 'error'); return; }
  for (const item of currentExpenseItems) {
    if (!item.description.trim()) { showToast('内容が空の明細があります', 'error'); return; }
    if (!item.amount || item.amount <= 0) { showToast('金額が0円の明細があります', 'error'); return; }
  }

  const total = currentExpenseItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const expenseNumber = generateExpenseNumber(expenseDate);

  const expense = {
    id: generateId(),
    expenseNumber,
    customerName,
    honorific,
    subject,
    expenseDate,
    dueDate,
    items: currentExpenseItems.map(item => ({
      date: item.date,
      description: item.description,
      amount: item.amount,
      receiptImage: item.receiptImage || null,
      receiptFilename: item.receiptFilename || null
    })),
    total,
    notes,
    createdAt: Date.now()
  };

  const expenses = getExpenses();
  expenses.push(expense);
  setExpenses(expenses);
  addCustomerIfNew(customerName);

  try {
    await generateExpensePDF(expense, getSettings());
  } catch (err) {
    console.error('経費PDF生成エラー:', err);
    showToast('PDF生成中にエラーが発生しました', 'error');
  }

  // フォームリセット
  currentExpenseItems = [];
  document.getElementById('exp-customer-select').value = '';
  document.getElementById('exp-customer-new').style.display = 'none';
  document.getElementById('exp-customer-new').value = '';
  document.getElementById('exp-subject').value = '';
  document.getElementById('exp-notes').value = '';
  document.getElementById('exp-due-date').value = '';
  renderExpenseItems();
  renderExpenseHistory();
  showToast('経費請求を発行しました');
}

function renderExpenseHistory(search = '') {
  const expenses = getExpenses();
  const filtered = search
    ? expenses.filter(e =>
        (e.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.subject || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.expenseNumber || '').includes(search)
      )
    : expenses;
  const sorted = filtered.slice().sort((a, b) => b.createdAt - a.createdAt);
  const listEl = document.getElementById('expense-history-list');
  const emptyEl = document.getElementById('expense-history-empty');

  if (sorted.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = sorted.map(e => `
    <div class="history-card" style="display:flex;align-items:center;gap:10px;">
      <input type="checkbox" class="exp-check" value="${e.id}" onchange="updateExpenseBulkBar()" onclick="event.stopPropagation()">
      <div style="flex:1;cursor:pointer;" onclick="showExpenseDetail('${e.id}')">
        <div class="hc-header">
          <span class="hc-customer">${escapeHtml(e.customerName)} ${escapeHtml(e.honorific || '様')}</span>
          <span class="hc-date">${e.expenseDate}</span>
        </div>
        <div class="hc-subject">${escapeHtml(e.subject)} (${e.expenseNumber})</div>
        <div class="hc-total">${formatCurrency(e.total)}</div>
      </div>
      <div class="hc-status" onclick="event.stopPropagation()">
        <label class="status-check"><input type="checkbox" ${e.sent ? 'checked' : ''} onchange="toggleExpenseFlag('${e.id}','sent',this.checked)"><span>送付</span></label>
        <label class="status-check"><input type="checkbox" ${e.paid ? 'checked' : ''} onchange="toggleExpenseFlag('${e.id}','paid',this.checked)"><span>入金</span></label>
      </div>
    </div>
  `).join('');
  updateExpenseBulkBar();
}

function toggleExpenseFlag(id, flag, value) {
  const expenses = getExpenses();
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  e[flag] = value;
  setExpenses(expenses);
}

function updateExpenseBulkBar() {
  const checked = document.querySelectorAll('.exp-check:checked');
  const bar = document.getElementById('expense-bulk-bar');
  const count = document.getElementById('expense-checked-count');
  if (!bar) return;
  if (checked.length > 0) {
    bar.style.display = 'flex';
    count.textContent = checked.length + '件選択中';
  } else {
    bar.style.display = 'none';
  }
}

function bulkDeleteExpenses() {
  const checked = document.querySelectorAll('.exp-check:checked');
  if (checked.length === 0) return;
  if (!confirm(`${checked.length}件の経費請求を削除しますか？\n\nこの操作は取り消せません。`)) return;
  const ids = Array.from(checked).map(cb => cb.value);
  setExpenses(getExpenses().filter(e => !ids.includes(e.id)));
  showToast(`${ids.length}件の経費請求を削除しました`);
  renderExpenseHistory(document.getElementById('expense-history-search').value);
}

let currentDetailExpenseId = null;

function showExpenseDetail(id) {
  const e = getExpenses().find(x => x.id === id);
  if (!e) return;
  currentDetailExpenseId = id;
  document.getElementById('expense-detail-content').innerHTML = `
    <div class="detail-row"><div class="detail-label">経費請求番号</div><div class="detail-value">${e.expenseNumber}</div></div>
    <div class="detail-row"><div class="detail-label">宛先</div><div class="detail-value">${escapeHtml(e.customerName)} ${escapeHtml(e.honorific || '様')}</div></div>
    <div class="detail-row"><div class="detail-label">件名</div><div class="detail-value">${escapeHtml(e.subject)}</div></div>
    <div class="detail-row"><div class="detail-label">請求日</div><div class="detail-value">${e.expenseDate}</div></div>
    <div class="detail-row"><div class="detail-label">入金期日</div><div class="detail-value">${e.dueDate || '未設定'}</div></div>
    <div style="margin-top:12px;">
      <table>
        <thead><tr><th>日付</th><th>内容</th><th class="text-right">金額</th><th>領収書</th></tr></thead>
        <tbody>
          ${e.items.map((item, i) => `
            <tr>
              <td>${escapeHtml(item.date || '')}</td>
              <td>${escapeHtml(item.description || '')}</td>
              <td class="text-right">${formatCurrency(item.amount)}</td>
              <td>${item.receiptImage ? `<img src="${item.receiptImage}" style="max-height:40px;cursor:pointer;" onclick="viewExpenseReceipt('${e.id}',${i})">` : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="summary-box" style="margin-top:12px;">
      <div class="summary-row total"><span>請求金額</span><span>${formatCurrency(e.total)}</span></div>
    </div>
    ${e.notes ? `<div style="margin-top:12px;"><strong>備考:</strong><p style="margin-top:4px;font-size:0.9rem;">${escapeHtml(e.notes)}</p></div>` : ''}
  `;
  openModal('modal-expense-detail');
}

function viewExpenseReceipt(expenseId, itemIdx) {
  const e = getExpenses().find(x => x.id === expenseId);
  if (!e) return;
  const item = e.items[itemIdx];
  if (!item || !item.receiptImage) return;
  const w = window.open('');
  w.document.write(`<img src="${item.receiptImage}" style="max-width:100%;">`);
}

function deleteExpense() {
  if (!currentDetailExpenseId) return;
  const e = getExpenses().find(x => x.id === currentDetailExpenseId);
  if (!e) return;
  if (!confirm(`経費請求「${e.expenseNumber}」を削除しますか？\n\nこの操作は取り消せません。`)) return;
  setExpenses(getExpenses().filter(x => x.id !== currentDetailExpenseId));
  currentDetailExpenseId = null;
  closeModal('modal-expense-detail');
  renderExpenseHistory();
  showToast('経費請求を削除しました');
}

async function reissueExpense() {
  if (!currentDetailExpenseId) return;
  const e = getExpenses().find(x => x.id === currentDetailExpenseId);
  if (!e) return;
  try {
    await generateExpensePDF(e, getSettings());
    showToast('PDFを再発行しました');
  } catch (err) {
    console.error('経費PDF再発行エラー:', err);
    showToast('PDF再発行中にエラーが発生しました', 'error');
  }
  closeModal('modal-expense-detail');
}


// ===================================================
// AI VISION (Claude API 経由での領収書・納品書 OCR)
// ===================================================

// base64画像とプロンプトを送って構造化データを取得
async function callClaudeVision(dataUrl, prompt, maxTokens = 2048, model) {
  const settings = getSettings();
  if (!settings.anthropicApiKey) {
    throw new Error('APIキーが設定されていません（設定タブで登録してください）');
  }
  const commaIdx = dataUrl.indexOf(',');
  const mediaType = (dataUrl.match(/^data:(.+?);base64/) || [])[1] || 'image/jpeg';
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': settings.anthropicApiKey,
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'API error');
  const text = (data.content || []).map(c => c.text || '').join('');
  return text;
}

// JSON部分を抽出（コードフェンス除去）
function extractJson(text) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last >= 0) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

// 領収書からデータ抽出（金額・日付・内容）
async function extractReceiptWithAI(idx) {
  const item = currentExpenseItems[idx];
  if (!item || !item.receiptImage) {
    showToast('先に領収書を添付してください', 'error');
    return;
  }
  showToast('AIで抽出中...', 'info');
  const prompt = `この領収書の画像から以下をJSON形式で抽出してください。読み取れない項目は null にしてください。
{
  "amount": 合計金額（税込、数値のみ、円）,
  "date": "YYYY-MM-DD",
  "description": "店名または内容を短く（例: セブンイレブン 弁当）"
}
JSON以外の説明文は不要です。`;
  try {
    const text = await callClaudeVision(item.receiptImage, prompt, 512);
    const data = extractJson(text);
    if (typeof data.amount === 'number' && data.amount > 0) {
      currentExpenseItems[idx].amount = data.amount;
    }
    if (data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      currentExpenseItems[idx].date = data.date;
    }
    if (data.description && !currentExpenseItems[idx].description) {
      currentExpenseItems[idx].description = data.description;
    }
    renderExpenseItems();
    showToast('抽出完了！内容を確認してください');
  } catch (err) {
    console.error('AI抽出エラー:', err);
    showToast('抽出失敗: ' + err.message, 'error');
  }
}

// ===================================================
// DELIVERY SLIP SCAN (納品書から在庫取込)
// ===================================================
let deliverySlipItems = [];

async function scanDeliverySlip(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (files.length === 0) return;

  const settings = getSettings();
  if (!settings.anthropicApiKey) {
    showToast('APIキーが未設定です。設定タブで登録してください', 'error');
    return;
  }

  deliverySlipItems = [];
  let firstDate = null, firstSlipNumber = '';
  let successCount = 0, failCount = 0;

  const inventorySnapshot = getInventory();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    showToast(`納品書 ${i + 1}/${files.length} を高精度解析中: ${file.name}(20-40秒)`, 'info');
    try {
      const parsed = await scanOneDeliverySlip(file);
      // 誤読チェック: 5年以上前 or 未来すぎる日付は無効化
      const nowY = new Date().getFullYear();
      if (parsed && parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
        const y = parseInt(parsed.date.slice(0, 4), 10);
        if (y < nowY - 5 || y > nowY + 1) {
          console.warn(`AI が疑わしい年を返しました: ${parsed.date} → 破棄（現在${nowY}年）`);
          parsed.date = null;
        }
      }
      if (parsed && parsed.items && parsed.items.length > 0) {
        parsed.items.forEach(it => {
          const name = (it.name || '').trim();
          const existing = inventorySnapshot.find(x => x.name === name);
          // AIが定価を読み取った場合はそれを優先、無ければ既存商品の定価
          const aiRetail = Number(it.retailPrice) || 0;
          const retail = aiRetail > 0 ? aiRetail : (existing ? (existing.retailPrice || 0) : 0);
          deliverySlipItems.push({
            name,
            quantity: Number(it.quantity) || 0,
            unit: it.unit || '',
            unitPrice: Number(it.unitPrice) || 0,
            retailPrice: retail,
            sourceFile: file.name,
            sourceDate: parsed.date || null
          });
        });
        if (!firstDate && parsed.date) firstDate = parsed.date;
        if (!firstSlipNumber && parsed.slipNumber) firstSlipNumber = parsed.slipNumber;
        successCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      console.error(`${file.name}:`, err);
      failCount++;
      showToast(`${file.name} 解析失敗: ${err.message}`, 'error');
    }
  }

  if (deliverySlipItems.length === 0) {
    showToast('商品を検出できませんでした', 'error');
    return;
  }

  document.getElementById('ds-date').value = firstDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDate)
    ? firstDate : new Date().toISOString().slice(0, 10);
  document.getElementById('ds-slip-number').value = firstSlipNumber || '';
  populateDsCategoryDropdown();
  renderDeliverySlipItems();
  openModal('modal-delivery-slip');
  const summary = files.length > 1
    ? `${successCount}/${files.length}件の納品書から ${deliverySlipItems.length}商品を検出（失敗${failCount}件）`
    : `${deliverySlipItems.length}件の商品を検出しました`;
  showToast(summary);
}

// 1件の納品書ファイルを解析
async function scanOneDeliverySlip(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const dataUrl = isPdf
    ? await pdfFirstPageToDataUrl(file)
    : await fileToCompressedImage(file);
  const currentYear = new Date().getFullYear();
  const prompt = `この画像は納品書・発注書・請求書のいずれかです。**商品明細行のみ**をJSON形式で抽出してください。

【必ず除外するもの】絶対に items に含めないでください:
- 発行元/送付先の会社情報（会社名、住所、郵便番号）
- 電話番号（TEL）、FAX番号
- 見出し（例:「訂購票」「注文書」「納品書」「請求書」「明細書」）
- ラベル・項目タイトル（例:「商品名」「数量」「単価」）
- 合計、小計、消費税、送料、値引き
- 伝票番号・発注番号・受注番号などの書類自体の番号
- 郵便番号や住所番地（例: 810-0024, 〒xxx-xxxx）
- ページ番号、担当者名、日付欄そのもの

【抽出対象】
- 明細テーブルに並ぶ「実際の商品」の各行のみ
- 商品名・数量・単価が揃っている、または商品と判断できる行

【日付の注意（極めて重要）】
- **現在は${currentYear}年です**。納品書の年は原則 ${currentYear - 2} 〜 ${currentYear} 年の範囲内のはず
- **${currentYear - 5}年より前の日付が出る場合は必ず誤読**。もう一度画像を精査してください
  * 特に「2024」を「2014」「2004」と読み違えるケースが頻発しています
  * 桁の「2」と「1」「0」を混同しないよう慎重に
  * 判別に自信が持てない場合、または明らかに古すぎる場合は date: null を返す（適当な古い年を返さない）
- 令和6年=2024, 令和7年=2025, 令和8年=2026 と換算
- 平成/令和の年号は西暦に変換

【出力形式】
{
  "date": "納品日 YYYY-MM-DD（読めなければ null）",
  "slipNumber": "納品書番号（あれば、なければ null）",
  "items": [
    {
      "name": "商品名（型番があれば含める）",
      "quantity": 数量（整数）,
      "unit": "個/本/set等（あれば、無ければ空文字）",
      "unitPrice": 仕入単価/卸価格/仕切値（税抜、整数、円）,
      "retailPrice": 定価/希望小売価格/上代（同じ行に別列で記載されていれば整数、無ければ 0）
    }
  ]
}

【価格の見分け方】
- 「単価」「卸」「仕切」「原価」→ unitPrice
- 「定価」「上代」「小売」「税込価格」「参考価格」→ retailPrice
- 1つの価格しか無い納品書もあります。その場合は unitPrice に入れ、retailPrice は 0
- 「掛率」「掛」だけ書いてある場合は計算しない（0のまま）

明細行が本当に無ければ items: [] を返してください。JSON以外の説明は不要です。`;
  const text = await callClaudeVision(dataUrl, prompt, 4096, 'claude-sonnet-5');
  return extractJson(text);
}

function pdfFirstPageToDataUrl(file) {
  return loadPdfJsIfNeeded().then(async () => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    // 圧縮
    const tmp = new Image();
    return new Promise(resolve => {
      tmp.onload = () => resolve(compressImageDataURL(tmp, 1400, 0.85));
      tmp.src = canvas.toDataURL('image/jpeg', 0.95);
    });
  });
}

function fileToCompressedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(compressImageDataURL(img, 1400, 0.85));
      img.onerror = () => reject(new Error('画像読み込み失敗'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('ファイル読み込み失敗'));
    reader.readAsDataURL(file);
  });
}

function renderDeliverySlipItems() {
  const list = document.getElementById('ds-items-list');
  if (deliverySlipItems.length === 0) {
    list.innerHTML = '<p style="color:var(--text-light);text-align:center;">明細がありません</p>';
    return;
  }
  const inventory = getInventory();
  // 複数納品書からの取込の場合、取込元列を表示
  const uniqueSources = [...new Set(deliverySlipItems.map(it => it.sourceFile).filter(Boolean))];
  const showSource = uniqueSources.length > 1;
  list.innerHTML = `
    ${showSource ? `<p style="font-size:0.85rem;color:var(--text-light);">取込元: ${uniqueSources.length}ファイル / ${deliverySlipItems.length}件</p>` : ''}
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;font-size:0.85rem;">
      <span>定価を一括設定:</span>
      <button class="btn btn-outline btn-sm" onclick="setDsRetailFromCost(1.3)">単価×1.3</button>
      <button class="btn btn-outline btn-sm" onclick="setDsRetailFromCost(1.5)">単価×1.5</button>
      <button class="btn btn-outline btn-sm" onclick="setDsRetailFromCost(2.0)">単価×2.0</button>
      <span style="color:var(--text-light);">既存商品は変更なし</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        ${showSource ? '<th style="width:90px;">取込元</th>' : ''}
        <th>商品名</th>
        <th class="text-right" style="width:56px;">数量</th>
        <th style="width:48px;">単位</th>
        <th class="text-right" style="width:76px;">単価<br><span style="font-weight:normal;font-size:0.7rem;">(仕入)</span></th>
        <th class="text-right" style="width:76px;">定価<br><span style="font-weight:normal;font-size:0.7rem;">(販売)</span></th>
        <th style="width:60px;">状態</th>
        <th style="width:40px;"></th>
      </tr></thead>
      <tbody>
        ${deliverySlipItems.map((it, idx) => {
          const existing = inventory.find(i => i.name === it.name);
          const statusTag = existing
            ? `<span style="color:#3498db;font-size:0.75rem;">既存</span>`
            : `<span style="color:#e67e22;font-size:0.75rem;">新規</span>`;
          const sourceCell = showSource
            ? `<td style="font-size:0.75rem;color:var(--text-light);" title="${escapeAttr(it.sourceFile || '')}">${escapeHtml((it.sourceFile || '').slice(0, 12))}${it.sourceDate ? '<br>' + escapeHtml(it.sourceDate) : ''}</td>`
            : '';
          const retailNote = existing
            ? `<span style="font-size:0.7rem;color:var(--text-light);">現在: ${formatCurrency(existing.retailPrice || 0)}</span>`
            : '';
          return `
          <tr>
            ${sourceCell}
            <td><input type="text" value="${escapeAttr(it.name)}" onchange="updateDsField(${idx},'name',this.value)" style="width:100%;padding:4px;"></td>
            <td><input type="number" value="${it.quantity}" min="0" onchange="updateDsField(${idx},'quantity',this.value)" style="width:56px;padding:4px;text-align:right;"></td>
            <td><input type="text" value="${escapeAttr(it.unit)}" onchange="updateDsField(${idx},'unit',this.value)" style="width:48px;padding:4px;"></td>
            <td><input type="number" value="${it.unitPrice}" min="0" onchange="updateDsField(${idx},'unitPrice',this.value)" style="width:76px;padding:4px;text-align:right;"></td>
            <td>
              <input type="number" value="${it.retailPrice || 0}" min="0" onchange="updateDsField(${idx},'retailPrice',this.value)" style="width:76px;padding:4px;text-align:right;">
              ${retailNote}
            </td>
            <td>${statusTag}</td>
            <td><button class="btn btn-danger btn-sm" onclick="removeDsItem(${idx})">×</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

// 単価×倍率で定価を一括計算（既存商品はスキップ）
function setDsRetailFromCost(multiplier) {
  const inventory = getInventory();
  let count = 0;
  deliverySlipItems.forEach(it => {
    const existing = inventory.find(i => i.name === it.name);
    if (existing) return; // 既存はスキップ
    const price = it.unitPrice || 0;
    if (price > 0) {
      // 10円単位に切り上げ
      it.retailPrice = Math.ceil(price * multiplier / 10) * 10;
      count++;
    }
  });
  renderDeliverySlipItems();
  showToast(`新規${count}件の定価を単価×${multiplier}で設定`);
}

function updateDsField(idx, field, value) {
  if (field === 'quantity' || field === 'unitPrice' || field === 'retailPrice') value = parseInt(value, 10) || 0;
  deliverySlipItems[idx][field] = value;
  renderDeliverySlipItems();
}

function addDsItem() {
  deliverySlipItems.push({ name: '', quantity: 0, unit: '', unitPrice: 0, retailPrice: 0 });
  renderDeliverySlipItems();
}

function removeDsItem(idx) {
  deliverySlipItems.splice(idx, 1);
  renderDeliverySlipItems();
}

// 納品書取込モーダルのカテゴリ選択
function populateDsCategoryDropdown() {
  const select = document.getElementById('ds-category-select');
  if (!select) return;
  const categories = getCategories(); // マスター + 在庫由来 の統合
  select.innerHTML = '<option value="">-- 未分類のまま --</option>'
    + categories.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')
    + '<option value="__new__">+ 新規カテゴリ</option>';
  select.value = '';
  const newInput = document.getElementById('ds-category-new');
  if (newInput) { newInput.value = ''; newInput.style.display = 'none'; }
}

function onDsCategoryChange() {
  const select = document.getElementById('ds-category-select');
  const input = document.getElementById('ds-category-new');
  if (select.value === '__new__') {
    input.style.display = 'block';
    input.focus();
  } else {
    input.style.display = 'none';
    input.value = '';
  }
}

function getSelectedDsCategory() {
  const select = document.getElementById('ds-category-select');
  if (select.value === '__new__') {
    return (document.getElementById('ds-category-new').value || '').trim();
  }
  return select.value || '';
}

function applyDeliverySlip() {
  if (deliverySlipItems.length === 0) {
    showToast('明細がありません', 'error'); return;
  }
  const validItems = deliverySlipItems.filter(it => it.name.trim() && it.quantity > 0);
  if (validItems.length === 0) {
    showToast('有効な明細がありません（商品名と数量が必要）', 'error'); return;
  }
  const dateStr = document.getElementById('ds-date').value || new Date().toISOString().slice(0, 10);
  const chosenCategory = getSelectedDsCategory();
  const categoryLabel = chosenCategory || '未分類';
  if (!confirm(`${validItems.length}件を在庫に反映しますか？\n・カテゴリ: ${categoryLabel}\n・既存商品は数量を加算（カテゴリは変更なし）\n・新規商品はこのカテゴリで登録\n・入庫ログにも記録`)) return;

  // 新規カテゴリならマスターにも追加
  if (chosenCategory && !getMasterCategories().includes(chosenCategory)) {
    addMasterCategory(chosenCategory);
  }

  const inventory = getInventory();
  let addedCount = 0, updatedCount = 0;
  validItems.forEach(it => {
    const name = it.name.trim();
    const qty = it.quantity;
    const price = it.unitPrice || 0;
    const retail = it.retailPrice || 0;
    const unit = it.unit || '';
    const existing = inventory.find(i => i.name === name);
    if (existing) {
      existing.quantity = (existing.quantity || 0) + qty;
      if (price > 0) existing.unitPrice = price;
      if (unit) existing.unit = unit;
      // 定価: プレビューで既存値と異なる値が入力された場合のみ更新
      if (retail > 0 && retail !== (existing.retailPrice || 0)) {
        existing.retailPrice = retail;
      }
      updatedCount++;
    } else {
      inventory.push({
        id: generateId(),
        name,
        quantity: qty,
        unit,
        unitPrice: price,
        retailPrice: retail,
        category: chosenCategory
      });
      addedCount++;
    }
    // 入庫ログにも記録（各明細の元納品書日付があればそちら優先）
    if (qty > 0 && price > 0) {
      const purchaseDate = it.sourceDate && /^\d{4}-\d{2}-\d{2}$/.test(it.sourceDate) ? it.sourceDate : dateStr;
      addPurchase(name, qty, price, purchaseDate);
    }
  });
  setInventory(inventory);
  closeModal('modal-delivery-slip');
  renderInventory();
  showToast(`反映完了: 既存 ${updatedCount}件更新 / 新規 ${addedCount}件追加`);
  deliverySlipItems = [];
}
