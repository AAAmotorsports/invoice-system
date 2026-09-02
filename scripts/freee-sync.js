/**
 * SHOPFLOW → freee 自動同期スクリプト (GitHub Actions 用)
 *
 * 流れ:
 * 1. Firestore の appData/main を読む
 * 2. freee アクセストークン取得 (refresh_token で更新)
 * 3. 未送信 (freeeDealId 無し) の請求書を抽出
 * 4. 各請求書について:
 *    - freee で ref_number 検索 (重複防止・冪等性)
 *    - なければ 取引先を find or create
 *    - freee に取引 (deal) 作成
 *    - freeeDealId を Firestore に書き戻す
 * 5. 新しい refresh_token を Firestore に保存 (ローテーション対応)
 */

const admin = require('firebase-admin');

const {
  FIREBASE_SERVICE_ACCOUNT,
  FIREBASE_PROJECT_ID,
  FREEE_CLIENT_ID,
  FREEE_CLIENT_SECRET,
  FREEE_REFRESH_TOKEN,
  FREEE_COMPANY_ID,
  FREEE_ACCOUNT_ITEM_ID,
  FREEE_TAX_CODE,
} = process.env;

for (const [k, v] of Object.entries({ FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID, FREEE_CLIENT_ID, FREEE_CLIENT_SECRET, FREEE_REFRESH_TOKEN, FREEE_COMPANY_ID, FREEE_ACCOUNT_ITEM_ID, FREEE_TAX_CODE })) {
  if (!v) { console.error(`❌ 環境変数 ${k} が設定されていません`); process.exit(1); }
}

const COMPANY_ID = parseInt(FREEE_COMPANY_ID, 10);
const ACCOUNT_ITEM_ID = parseInt(FREEE_ACCOUNT_ITEM_ID, 10);
const TAX_CODE = parseInt(FREEE_TAX_CODE, 10);

// --- Firebase 初期化 ---
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)),
  projectId: FIREBASE_PROJECT_ID,
});
const db = admin.firestore();
const mainDocRef = db.collection('appData').doc('main');
const freeeDocRef = db.collection('appData').doc('freeeState');

// --- refresh_token → access_token 交換 (単発) ---
async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://accounts.secure.freee.co.jp/public_api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: FREEE_CLIENT_ID,
      client_secret: FREEE_CLIENT_SECRET,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`freee token 更新失敗: ${res.status} ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return JSON.parse(text);
}

// --- freee OAuth: access_token 取得 (ローテーション対応 + フォールバック) ---
async function getFreeeAccessToken() {
  const stateSnap = await freeeDocRef.get();
  const firestoreToken = stateSnap.exists ? stateSnap.data().refresh_token : null;

  // 1st: Firestore に保存されたローテート後の refresh_token を優先
  if (firestoreToken) {
    try {
      console.log('  🔑 Firestore 保存の refresh_token を使用');
      const data = await refreshAccessToken(firestoreToken);
      // ローテートされた新しい refresh_token を保存
      await freeeDocRef.set({
        refresh_token: data.refresh_token,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return data.access_token;
    } catch (err) {
      const isInvalid = err.status === 401 && err.body && err.body.includes('invalid_grant');
      if (!isInvalid) throw err;
      console.warn('  ⚠️ Firestore の refresh_token が無効 → GitHub Secret にフォールバック');
      // Firestore の壊れた値をクリア
      await freeeDocRef.set({
        refresh_token: null,
        invalidated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  // 2nd: GitHub Secret の refresh_token (初期またはユーザーが更新した最新)
  console.log('  🔑 GitHub Secret の refresh_token を使用');
  const data = await refreshAccessToken(FREEE_REFRESH_TOKEN);
  // ローテートされた新しい refresh_token を Firestore に保存
  await freeeDocRef.set({
    refresh_token: data.refresh_token,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return data.access_token;
}

// --- freee API 呼び出しヘルパー ---
async function freeeApi(method, path, accessToken, body, query) {
  let url = `https://api.freee.co.jp${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Api-Version': '2020-06-15',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`freee API ${method} ${path} 失敗: ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

// --- 取引先を find or create ---
async function findOrCreatePartner(name, honorific, accessToken, cache) {
  if (cache[name]) return cache[name];

  // 既存検索
  const listRes = await freeeApi('GET', '/api/1/partners', accessToken, null, {
    company_id: COMPANY_ID,
    keyword: name,
    limit: 20,
  });
  // 名前完全一致を優先、なければ名前を含むものの最初
  let match = (listRes.partners || []).find(p => p.name === name);
  if (!match) {
    match = (listRes.partners || []).find(p => p.name && p.name.includes(name));
  }
  if (match) {
    console.log(`    取引先: ${name} → 既存 id=${match.id}`);
    cache[name] = match.id;
    return match.id;
  }

  // 新規作成
  const createRes = await freeeApi('POST', '/api/1/partners', accessToken, {
    company_id: COMPANY_ID,
    name,
    default_title: honorific || '様',
  });
  const newId = createRes.partner.id;
  console.log(`    取引先: ${name} → 新規作成 id=${newId}`);
  cache[name] = newId;
  return newId;
}

// --- ref_number で freee 既存取引をチェック (冪等性) ---
async function findDealByRefNumber(refNumber, issueDate, accessToken) {
  // 発行日の前後7日で検索して ref_number 一致を探す
  const d = new Date(issueDate + 'T00:00:00Z');
  const from = new Date(d.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const to = new Date(d.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const res = await freeeApi('GET', '/api/1/deals', accessToken, null, {
    company_id: COMPANY_ID,
    type: 'income',
    start_issue_date: from,
    end_issue_date: to,
    limit: 100,
  });
  return (res.deals || []).find(d => d.ref_number === refNumber);
}

// マイナス金額 (返金) 用の勘定科目
const REFUND_ACCOUNT_ITEM_ID = 4366960;  // 売上戻り高
const REFUND_TAX_CODE = 26;  // 課税売上返還10%

// --- SHOPFLOW invoice → freee deal 登録 ---
async function registerInvoice(inv, accessToken, partnerCache) {
  const isRefund = inv.total < 0;
  const absAmount = Math.abs(inv.total);
  // ref_number 衝突対策: 通常は請求書番号そのまま、衝突検出後は SF- プレフィックス
  let refNumber = inv.invoiceNumber;

  // 既存チェック (元番号)
  const existing = await findDealByRefNumber(refNumber, inv.invoiceDate, accessToken);
  if (existing) {
    if (existing.amount === absAmount) {
      console.log(`    ⚠️  既に freee に登録済み (id=${existing.id}, 金額一致) → スキップ`);
      return { skipped: true, freeeDealId: existing.id };
    } else {
      // ref衝突 → SF- プレフィックス版で再チェック
      const altRef = `SF-${refNumber}`;
      const altExisting = await findDealByRefNumber(altRef, inv.invoiceDate, accessToken);
      if (altExisting && altExisting.amount === absAmount) {
        console.log(`    ⚠️  ${altRef} で既に登録済み (id=${altExisting.id}) → スキップ`);
        return { skipped: true, freeeDealId: altExisting.id };
      }
      console.log(`    ↩️  ref_number 衝突 → ${altRef} で登録し直します`);
      refNumber = altRef;
    }
  }

  // 取引先解決
  const partnerId = await findOrCreatePartner(inv.customerName, inv.honorific, accessToken, partnerCache);

  // 摘要生成
  const items = inv.items || [];
  const top = items[0]?.description || '';
  const extra = items.length > 1 ? ` 他${items.length - 1}件` : '';
  const prefix = isRefund ? '【返金】' : '';
  let desc = `${prefix}${inv.subject || ''} / ${top}${extra}`;
  if (desc.length > 60) desc = desc.slice(0, 57) + '...';

  // 取引作成 (通常 or 返金)
  const details = isRefund
    ? [{ account_item_id: REFUND_ACCOUNT_ITEM_ID, tax_code: REFUND_TAX_CODE, amount: absAmount, description: desc }]
    : [{ account_item_id: ACCOUNT_ITEM_ID, tax_code: TAX_CODE, amount: absAmount, description: desc }];

  const createRes = await freeeApi('POST', '/api/1/deals', accessToken, {
    company_id: COMPANY_ID,
    issue_date: inv.invoiceDate,
    type: 'income',
    ref_number: refNumber,
    partner_id: partnerId,
    details,
  });
  const dealId = createRes.deal.id;
  const label = isRefund ? '返金取引' : '取引';
  console.log(`    ✅ freee ${label} 登録成功: deal_id=${dealId} ref=${refNumber}`);
  return { skipped: false, freeeDealId: dealId };
}

async function main() {
  console.log('🚀 SHOPFLOW → freee 同期開始');
  console.log(`   会社: company_id=${COMPANY_ID}`);
  console.log('');

  // 1. Firestore 読込
  console.log('📥 Firestore 読込中...');
  const snap = await mainDocRef.get();
  if (!snap.exists) throw new Error('appData/main が存在しません');
  const remote = snap.data();
  const invoicesJson = remote.invoices_json || '[]';
  const invoices = JSON.parse(invoicesJson);
  console.log(`   請求書 ${invoices.length} 件`);

  // 2. freee アクセストークン取得
  console.log('🔐 freee アクセストークン取得中...');
  const accessToken = await getFreeeAccessToken();
  console.log('   OK');

  // 3. 未送信 & 通常請求書 (合計請求書 type='combined' は除く) を抽出
  //    金額 0 は対象外、マイナス金額 (返金) は別処理で対応
  const targets = invoices.filter(inv =>
    !inv.freeeDealId &&
    (!inv.type || inv.type === 'sale') &&
    inv.total &&
    inv.total !== 0
  );
  console.log(`\n📋 未送信の請求書: ${targets.length} 件\n`);

  if (targets.length === 0) {
    console.log('✅ 送信対象なし、終了');
    process.exit(0);
  }

  // 4. 各請求書を登録
  const partnerCache = {};
  let successCount = 0, skipCount = 0, failCount = 0;
  const updated = [];  // freeeDealId 更新すべき請求書

  for (const inv of targets) {
    console.log(`  [${inv.invoiceNumber}] ${inv.invoiceDate} ${inv.customerName} ¥${inv.total.toLocaleString()}`);
    try {
      const result = await registerInvoice(inv, accessToken, partnerCache);
      if (result.skipped) {
        skipCount++;
        if (result.freeeDealId) updated.push({ id: inv.id, freeeDealId: result.freeeDealId });
      } else {
        successCount++;
        updated.push({ id: inv.id, freeeDealId: result.freeeDealId });
      }
    } catch (err) {
      failCount++;
      console.error(`    ❌ エラー: ${err.message}`);
    }
    // API rate limit 対策
    await new Promise(r => setTimeout(r, 500));
  }

  // 5. Firestore に freeeDealId を書き戻し
  if (updated.length > 0) {
    console.log(`\n💾 Firestore に freeeDealId を書き戻し (${updated.length}件)...`);
    const updatedInvoices = invoices.map(inv => {
      const u = updated.find(x => x.id === inv.id);
      return u ? { ...inv, freeeDealId: u.freeeDealId } : inv;
    });
    const savedAt = new Date().toISOString();
    await mainDocRef.update({
      invoices_json: JSON.stringify(updatedInvoices),
      savedAt,
    });
    console.log('   OK');
  }

  console.log(`\n✅ 完了: 成功 ${successCount} / スキップ ${skipCount} / 失敗 ${failCount}`);
}

main().catch(err => {
  console.error('❌ 致命的エラー:', err);
  process.exit(1);
});
