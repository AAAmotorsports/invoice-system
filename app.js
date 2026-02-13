/* ===================================================
   請求書発行システム - メインアプリケーション
   =================================================== */

// ---- Data Store ----
const STORAGE_KEYS = {
  inventory: 'invoice_sys_inventory',
  invoices: 'invoice_sys_invoices',
  settings: 'invoice_sys_settings',
  customers: 'invoice_sys_customers',
  purchases: 'invoice_sys_purchases'
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
  logoImage: ''
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
  });
});

// ===================================================
// DASHBOARD
// ===================================================
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

  // 月別売上履歴
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
  // 仕入れ履歴から月別仕入れを集計
  purchases.forEach(p => {
    if (!p.date) return;
    const m = p.date.slice(0, 7);
    if (!monthlyMap[m]) monthlyMap[m] = { count: 0, subtotal: 0, tax: 0, total: 0, cost: 0 };
    monthlyMap[m].cost += (p.amount || 0);
  });
  const monthlyEl = document.getElementById('monthly-sales-history');
  const monthKeys = Object.keys(monthlyMap).sort().reverse();
  if (monthKeys.length === 0) {
    monthlyEl.innerHTML = '<div class="empty-state"><p>売上データがありません</p></div>';
  } else {
    const recent6 = monthKeys.slice(0, 6);
    const older = monthKeys.slice(6);

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

    let html = '<div class="table-wrap"><table><thead><tr><th>年月</th><th class="text-right">件数</th><th class="text-right">小計</th><th class="text-right">消費税</th><th class="text-right">売上合計</th><th class="text-right">仕入合計</th><th class="text-right">粗利</th></tr></thead><tbody>';
    html += recent6.map(m => monthRow(m)).join('');
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

  // Stock alerts
  const lowStock = inventory.filter(i => i.quantity <= 3);
  const alertsEl = document.getElementById('stock-alerts');
  if (lowStock.length === 0) {
    alertsEl.innerHTML = '<div class="alert alert-success">在庫は十分です</div>';
  } else {
    alertsEl.innerHTML = lowStock.map(item =>
      `<div class="alert alert-warning">${escapeHtml(item.name)} — 残り ${item.quantity}${item.unit || '個'}</div>`
    ).join('');
  }
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
  const cats = [...new Set(inventory.map(i => i.category || '').filter(c => c))];
  cats.sort((a, b) => a.localeCompare(b, 'ja'));
  return cats;
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
          <td class="text-center">
            <button class="btn btn-outline btn-sm" onclick="editItem('${item.id}')">編集</button>
            <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}')">削除</button>
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

function showSelectFromInventory() {
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
  currentInvoiceItems.push({
    id: generateId(), description: item.name, quantity: 1,
    unit: item.unit || '', unitPrice: price,
    amount: price, inventoryItemId: item.id,
    costPrice: item.unitPrice
  });
  renderInvoiceItems();
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

  tbody.innerHTML = currentInvoiceItems.map((item, idx) => `
    <tr class="item-row">
      <td><input type="text" value="${escapeAttr(item.description)}" onchange="updateItemField(${idx},'description',this.value)"></td>
      <td><input type="number" value="${item.quantity}" min="0" onchange="updateItemField(${idx},'quantity',this.value)"></td>
      <td><input type="text" value="${escapeAttr(item.unit)}" style="width:50px;" onchange="updateItemField(${idx},'unit',this.value)"></td>
      <td><input type="number" value="${item.unitPrice}" min="0" onchange="updateItemField(${idx},'unitPrice',this.value)"></td>
      <td class="text-right">${formatCurrency(item.amount)}</td>
      <td class="text-center"><button class="btn btn-danger btn-sm" onclick="removeItem(${idx})">×</button></td>
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

  const invoice = {
    id: generateId(), invoiceNumber, customerName, honorific, subject, invoiceDate, dueDate,
    items: currentInvoiceItems.map(item => ({
      description: item.description, quantity: item.quantity,
      unit: item.unit, unitPrice: item.unitPrice, amount: item.amount,
      costPrice: item.costPrice || 0
    })),
    subtotal, taxRate, tax, total, totalCost, notes, createdAt: Date.now()
  };

  // Save
  const invoices = getInvoices();
  invoices.push(invoice);
  setInvoices(invoices);

  // Register customer
  addCustomerIfNew(customerName);

  // Deduct inventory & auto-register new items
  const inventory = getInventory();
  currentInvoiceItems.forEach(item => {
    if (item.inventoryItemId) {
      // 在庫から選んだ商品 → 数量を引く
      const invItem = inventory.find(i => i.id === item.inventoryItemId);
      if (invItem) {
        invItem.quantity = Math.max(0, invItem.quantity - item.quantity);
        if (item.unit) invItem.unit = item.unit;
        // 定価を更新（請求書の単価 = 定価）
        if (item.unitPrice > 0) invItem.retailPrice = item.unitPrice;
      }
    } else if (item.description.trim()) {
      // 手入力の商品 → 在庫に自動追加
      const existing = inventory.find(i => i.name === item.description.trim());
      if (existing) {
        if (item.unitPrice > 0) existing.retailPrice = item.unitPrice;
        if (item.unit) existing.unit = item.unit;
      } else {
        inventory.push({
          id: generateId(),
          name: item.description.trim(),
          quantity: 0,
          unit: item.unit || '',
          unitPrice: 0,
          retailPrice: item.unitPrice || 0
        });
      }
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
    </div>
  `).join('');
  updateHistoryBulkBar();
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
    version: 3,
    exportedAt: new Date().toISOString(),
    inventory: getInventory(),
    invoices: getInvoices(),
    settings: getSettings(),
    customers: getCustomers(),
    purchases: getPurchases()
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
    version: 3,
    savedAt: new Date().toISOString(),
    inventory: getInventory(),
    invoices: getInvoices(),
    settings: getSettings(),
    customers: getCustomers(),
    purchases: getPurchases()
  };
}

function applyLoadedData(data) {
  // localStorage に直接書き込み（markUnsavedを発火させない）
  if (data.inventory) localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(data.inventory));
  if (data.invoices) localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(data.invoices));
  if (data.settings) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data.settings));
  if (data.customers) localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(data.customers));
  if (data.purchases) localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(data.purchases));
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
