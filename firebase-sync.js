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
let lastPushedAt = ''; // 自分がpushしたタイムスタンプを記憶

// --- Firestore → localStorage 同期 ---
function startRealtimeSync() {
  if (unsubscribeSnapshot) return; // 既にリスニング中

  syncEnabled = true; // ★ リスナー登録前に有効化

  unsubscribeSnapshot = SYNC_DOC.onSnapshot(
    (doc) => {
      if (!doc.exists) return;
      const remoteData = doc.data();
      const localSavedAt = localStorage.getItem('invoice_sys_savedAt') || '';
      const remoteSavedAt = remoteData.savedAt || '';

      // 自分がpushしたデータの場合はスキップ
      if (remoteSavedAt === lastPushedAt) return;

      // リモートの方が新しければローカルを更新
      if (remoteSavedAt > localSavedAt) {
        isSyncingFromFirestore = true;
        // JSON文字列で保存されているデータをそのままlocalStorageへ
        if (remoteData.inventory_json) localStorage.setItem(STORAGE_KEYS.inventory, remoteData.inventory_json);
        if (remoteData.invoices_json) localStorage.setItem(STORAGE_KEYS.invoices, remoteData.invoices_json);
        if (remoteData.settings_json) {
          // ローカルのlogoImageを保持（同期対象外のため）
          const localSettings = getSettings();
          const remoteSettings = JSON.parse(remoteData.settings_json);
          if (localSettings.logoImage) remoteSettings.logoImage = localSettings.logoImage;
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(remoteSettings));
        }
        if (remoteData.customers_json) localStorage.setItem(STORAGE_KEYS.customers, remoteData.customers_json);
        if (remoteData.purchases_json) localStorage.setItem(STORAGE_KEYS.purchases, remoteData.purchases_json);
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
      // ネットワーク一時切断等は自動復帰するためステータスだけ更新
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

// --- localStorage → Firestore 同期 ---
// ★ Firestoreはネストされたオブジェクト配列に制限があるため、
//    各データをJSON文字列として保存することで回避
async function pushToFirestore() {
  if (isSyncingFromFirestore) return;

  // settingsからlogoImage（Base64で巨大）を除外して同期
  const settings = getSettings();
  const settingsForSync = { ...settings };
  delete settingsForSync.logoImage;

  const savedAt = new Date().toISOString();
  const data = {
    version: 4,
    savedAt: savedAt,
    inventory_json: JSON.stringify(getInventory()),
    invoices_json: JSON.stringify(getInvoices()),
    settings_json: JSON.stringify(settingsForSync),
    customers_json: JSON.stringify(getCustomers()),
    purchases_json: JSON.stringify(getPurchases())
  };

  try {
    await SYNC_DOC.set(data);
    lastPushedAt = savedAt; // 自分がpushしたタイムスタンプを記憶
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
        // v4形式（JSON文字列）
        if (remoteData.inventory_json) {
          localStorage.setItem(STORAGE_KEYS.inventory, remoteData.inventory_json);
        } else if (remoteData.inventory) {
          localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(remoteData.inventory));
        }
        if (remoteData.invoices_json) {
          localStorage.setItem(STORAGE_KEYS.invoices, remoteData.invoices_json);
        } else if (remoteData.invoices) {
          localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(remoteData.invoices));
        }
        if (remoteData.settings_json) {
          // ローカルのlogoImageを保持（同期対象外のため）
          const localSettings = getSettings();
          const remoteSettings = JSON.parse(remoteData.settings_json);
          if (localSettings.logoImage) remoteSettings.logoImage = localSettings.logoImage;
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(remoteSettings));
        } else if (remoteData.settings) {
          const localSettings = getSettings();
          const rs = remoteData.settings;
          if (localSettings.logoImage) rs.logoImage = localSettings.logoImage;
          localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(rs));
        }
        if (remoteData.customers_json) {
          localStorage.setItem(STORAGE_KEYS.customers, remoteData.customers_json);
        } else if (remoteData.customers) {
          localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(remoteData.customers));
        }
        if (remoteData.purchases_json) {
          localStorage.setItem(STORAGE_KEYS.purchases, remoteData.purchases_json);
        } else if (remoteData.purchases) {
          localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(remoteData.purchases));
        }
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
