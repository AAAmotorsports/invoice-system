/* ===================================================
   Firebase Firestore リアルタイム同期
   ---------------------------------------------------
   ドキュメント構造 (v6):
     appData/main       { version: 6, savedAt }         ← メタのみ
     appData/inventory  { savedAt, data }               ← 各データを別ドキュメント化
     appData/invoices   { savedAt, data }
     appData/settings   { savedAt, data }
     appData/customers  { savedAt, data }
     appData/purchases  { savedAt, data }
     appData/expenses   { savedAt, data }
   これにより1ドキュメント1MB制限を回避 (6倍容量に)。
   旧構造 (v5, main に *_json フィールド全部入り) からの自動移行も担当。
   =================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyCCUQwYVKvt4_5tHTxk4p-Cw_x8LKsUMBI",
  authDomain: "invoice-system-fe637.firebaseapp.com",
  projectId: "invoice-system-fe637",
  storageBucket: "invoice-system-fe637.firebasestorage.app",
  messagingSenderId: "590548355421",
  appId: "1:590548355421:web:7e0dfb1160b7a008e440b4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const DATA_KEYS = ['inventory', 'invoices', 'settings', 'customers', 'purchases', 'expenses'];
const META_DOC = db.collection('appData').doc('main');
const DATA_DOCS = {
  inventory: db.collection('appData').doc('inventory'),
  invoices:  db.collection('appData').doc('invoices'),
  settings:  db.collection('appData').doc('settings'),
  customers: db.collection('appData').doc('customers'),
  purchases: db.collection('appData').doc('purchases'),
  expenses:  db.collection('appData').doc('expenses')
};
const GETTERS = {
  inventory: () => getInventory(),
  invoices:  () => getInvoices(),
  settings:  () => getSettings(),
  customers: () => getCustomers(),
  purchases: () => getPurchases(),
  expenses:  () => getExpenses()
};

let isSyncingFromFirestore = false;
let syncEnabled = false;
let unsubscribeSnapshot = null;
let lastPushedAt = '';

// --- 6ドキュメントから localStorage へ取り込み ---
async function pullFromDataDocs(remoteSavedAt) {
  const snaps = await Promise.all(DATA_KEYS.map(k => DATA_DOCS[k].get()));
  isSyncingFromFirestore = true;
  DATA_KEYS.forEach((k, i) => {
    const s = snaps[i];
    if (s.exists && s.data().data) {
      localStorage.setItem(STORAGE_KEYS[k], s.data().data);
    }
  });
  localStorage.setItem('invoice_sys_savedAt', remoteSavedAt);
  isSyncingFromFirestore = false;
}

// --- 旧構造 (main に *_json 全部入り) から取り込み ---
function pullFromMainOldFormat(remoteData, remoteSavedAt) {
  isSyncingFromFirestore = true;
  const map = {
    inventory_json: STORAGE_KEYS.inventory,
    invoices_json:  STORAGE_KEYS.invoices,
    settings_json:  STORAGE_KEYS.settings,
    customers_json: STORAGE_KEYS.customers,
    purchases_json: STORAGE_KEYS.purchases,
    expenses_json:  STORAGE_KEYS.expenses
  };
  for (const [rk, lk] of Object.entries(map)) {
    if (remoteData[rk]) localStorage.setItem(lk, remoteData[rk]);
  }
  localStorage.setItem('invoice_sys_savedAt', remoteSavedAt);
  isSyncingFromFirestore = false;
}

// --- Firestore → localStorage 同期 (リアルタイム) ---
function startRealtimeSync() {
  if (unsubscribeSnapshot) return;
  syncEnabled = true;

  unsubscribeSnapshot = META_DOC.onSnapshot(
    async (doc) => {
      if (!doc.exists) return;
      const remoteData = doc.data();
      const localSavedAt = localStorage.getItem('invoice_sys_savedAt') || '';
      const remoteSavedAt = remoteData.savedAt || '';

      if (remoteSavedAt === lastPushedAt) return;
      if (remoteSavedAt <= localSavedAt) return;

      const version = remoteData.version || 5;
      if (version >= 6) {
        await pullFromDataDocs(remoteSavedAt);
      } else {
        pullFromMainOldFormat(remoteData, remoteSavedAt);
      }

      const overlay = document.getElementById('data-load-overlay');
      if (overlay) overlay.style.display = 'none';
      renderDashboard();
      refreshCreatePage();
      showToast('クラウドから同期しました', 'success');
    },
    (error) => {
      console.error('Firestore リアルタイム同期エラー:', error);
      updateSyncStatus(false, true);
    }
  );

  updateSyncStatus(true);
}

function stopRealtimeSync() {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
  syncEnabled = false;
  updateSyncStatus(false);
}

// --- localStorage → Firestore 同期 (6ドキュメント + main を1バッチで原子的書込) ---
async function pushToFirestore() {
  if (isSyncingFromFirestore) return;

  const savedAt = new Date().toISOString();
  const batch = db.batch();
  for (const k of DATA_KEYS) {
    batch.set(DATA_DOCS[k], { savedAt, data: JSON.stringify(GETTERS[k]()) });
  }
  batch.set(META_DOC, { version: 6, savedAt });

  try {
    await batch.commit();
    lastPushedAt = savedAt;
    localStorage.setItem('invoice_sys_savedAt', savedAt);
    updateSyncStatus(true);
  } catch (error) {
    console.error('Firestore 書き込みエラー:', error);
    showToast('クラウド同期に失敗しました', 'error');
    updateSyncStatus(false, true);
  }
}

let pushTimer = null;
function debouncedPush() {
  if (!syncEnabled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushToFirestore();
  }, 1500);
}

// --- 同期ステータス表示 ---
function updateSyncStatus(connected, error = false) {
  const el = document.getElementById('sync-status');
  if (!el) return;

  const ver = window.APP_VERSION ? ` <span style="opacity:0.7;">v${window.APP_VERSION}</span>` : '';
  if (error) {
    el.innerHTML = '<span style="color:#e74c3c;">同期エラー</span>' + ver;
  } else if (connected) {
    el.innerHTML = '<span style="color:#27ae60;">同期中</span>' + ver;
  } else {
    el.innerHTML = '<span style="color:#999;">オフライン</span>' + ver;
  }
}

// --- 初回同期 ---
async function initialSync() {
  try {
    const doc = await META_DOC.get();
    if (!doc.exists) {
      const hasLocalData = loadData(STORAGE_KEYS.inventory) || loadData(STORAGE_KEYS.invoices);
      if (hasLocalData) {
        await pushToFirestore();
        showToast('クラウドにデータをアップロードしました');
      }
      return;
    }

    const remoteData = doc.data();
    const localSavedAt = localStorage.getItem('invoice_sys_savedAt') || '';
    const remoteSavedAt = remoteData.savedAt || '';
    const version = remoteData.version || 5;

    if (remoteSavedAt > localSavedAt) {
      if (version >= 6) {
        await pullFromDataDocs(remoteSavedAt);
      } else {
        pullFromMainOldFormat(remoteData, remoteSavedAt);
      }
      const overlay = document.getElementById('data-load-overlay');
      if (overlay) overlay.style.display = 'none';
      renderDashboard();
      refreshCreatePage();
      showToast('クラウドからデータを復元しました');
    } else {
      await pushToFirestore();
    }
  } catch (error) {
    console.error('初回同期エラー:', error);
    showToast('クラウド接続に失敗しました（オフラインモード）', 'error');
  }
}
