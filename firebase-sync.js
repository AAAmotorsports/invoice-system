/* ===================================================
   Firebase Firestore リアルタイム同期
   =================================================== */

// Firebase CDN (compat) で読み込み済み前提
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

// Firestore のドキュメントパス（1ドキュメントに全データを格納）
const SYNC_DOC = db.collection('appData').doc('main');

// 同期制御フラグ
let isSyncingFromFirestore = false;
let syncEnabled = false;
let unsubscribeSnapshot = null;

// --- Firestore → localStorage 同期 ---
function startRealtimeSync() {
  if (unsubscribeSnapshot) return; // 既にリスニング中

  unsubscribeSnapshot = SYNC_DOC.onSnapshot(
    (doc) => {
      if (!doc.exists) return;
      const remoteData = doc.data();
      const localSavedAt = localStorage.getItem('invoice_sys_savedAt') || '';
      const remoteSavedAt = remoteData.savedAt || '';

      // リモートの方が新しければローカルを更新
      if (remoteSavedAt > localSavedAt) {
        isSyncingFromFirestore = true;
        if (remoteData.inventory) localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(remoteData.inventory));
        if (remoteData.invoices) localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(remoteData.invoices));
        if (remoteData.settings) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(remoteData.settings));
        if (remoteData.customers) localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(remoteData.customers));
        if (remoteData.purchases) localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(remoteData.purchases));
        localStorage.setItem('invoice_sys_savedAt', remoteSavedAt);
        // オーバーレイを閉じる
        const overlay = document.getElementById('data-load-overlay');
        if (overlay) overlay.style.display = 'none';
        // UI更新
        renderDashboard();
        refreshCreatePage();
        showToast('クラウドから同期しました', 'success');
        isSyncingFromFirestore = false;
      }
    },
    (error) => {
      console.error('Firestore リアルタイム同期エラー:', error);
      showToast('同期エラーが発生しました', 'error');
    }
  );

  syncEnabled = true;
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

// --- localStorage → Firestore 同期 ---
async function pushToFirestore() {
  if (!syncEnabled || isSyncingFromFirestore) return;

  const savedAt = new Date().toISOString();
  const data = {
    version: 3,
    savedAt: savedAt,
    inventory: getInventory(),
    invoices: getInvoices(),
    settings: getSettings(),
    customers: getCustomers(),
    purchases: getPurchases()
  };

  try {
    await SYNC_DOC.set(data);
    localStorage.setItem('invoice_sys_savedAt', savedAt);
    updateSyncStatus(true);
  } catch (error) {
    console.error('Firestore 書き込みエラー:', error);
    showToast('クラウド同期に失敗しました', 'error');
    updateSyncStatus(false, true);
  }
}

// デバウンス: 連続変更時に短時間で何度もFirestoreに書き込まない
let pushTimer = null;
function debouncedPush() {
  if (!syncEnabled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushToFirestore();
  }, 1500); // 1.5秒待って書き込み
}

// --- 同期ステータス表示 ---
function updateSyncStatus(connected, error = false) {
  const el = document.getElementById('sync-status');
  if (!el) return;

  if (error) {
    el.innerHTML = '<span style="color:#e74c3c;">同期エラー</span>';
  } else if (connected) {
    el.innerHTML = '<span style="color:#27ae60;">同期中</span>';
  } else {
    el.innerHTML = '<span style="color:#999;">オフライン</span>';
  }
}

// --- 初回同期（ローカルデータをFirestoreにアップロード or Firestoreからダウンロード）---
async function initialSync() {
  try {
    const doc = await SYNC_DOC.get();
    if (doc.exists) {
      const remoteData = doc.data();
      const localSavedAt = localStorage.getItem('invoice_sys_savedAt') || '';
      const remoteSavedAt = remoteData.savedAt || '';

      if (remoteSavedAt > localSavedAt) {
        // リモートの方が新しい → ダウンロード
        if (remoteData.inventory) localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(remoteData.inventory));
        if (remoteData.invoices) localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(remoteData.invoices));
        if (remoteData.settings) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(remoteData.settings));
        if (remoteData.customers) localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(remoteData.customers));
        if (remoteData.purchases) localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(remoteData.purchases));
        localStorage.setItem('invoice_sys_savedAt', remoteSavedAt);
        // オーバーレイを閉じる
        const overlay = document.getElementById('data-load-overlay');
        if (overlay) overlay.style.display = 'none';
        renderDashboard();
        refreshCreatePage();
        showToast('クラウドからデータを復元しました');
      } else {
        // ローカルの方が新しい → アップロード
        await pushToFirestore();
      }
    } else {
      // Firestoreにデータがない → ローカルデータをアップロード
      const hasLocalData = loadData(STORAGE_KEYS.inventory) || loadData(STORAGE_KEYS.invoices);
      if (hasLocalData) {
        await pushToFirestore();
        showToast('クラウドにデータをアップロードしました');
      }
    }
  } catch (error) {
    console.error('初回同期エラー:', error);
    showToast('クラウド接続に失敗しました（オフラインモード）', 'error');
  }
}
