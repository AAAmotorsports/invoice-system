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

// --- freee OAuth: access_token 取得 (refresh_token ローテーション対応) ---
async function getFreeeAccessToken() {
  // Firestore に保存されたローテート後の refresh_token を優先
  let refreshToken = FREEE_REFRESH_TOKEN;
  const stateSnap = await freeeDocRef.get();
  if (stateSnap.exists && stateSnap.data().refresh_token) {
    refreshToken = stateSnap.data().refresh_token;
    console.log('  🔑 Firestore 保存の refresh_token を使用');
  } else {
    console.log('  🔑 GitHub Secret の初期 refresh_token を使用');
  }

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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`freee token 更新失敗: ${res.status} ${err}`);
  }
  const data = await res.json();

  // 新しい refresh_token を Firestore に保存 (ローテーション)
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

// --- SHOPFLOW invoice → freee deal 登録 ---
async function registerInvoice(inv, accessToken, partnerCache) {
  // 既存チェック
  const existing = await findDealByRefNumber(inv.invoiceNumber, inv.invoiceDate, accessToken);
  if (existing) {
    // ref_number 一致でも中身違いの可能性 (前回の 20260731002 みたいなケース)
    // 金額とパートナー名で厳密チェック
    const partnerName = inv.customerName;
    const partnerMatch = existing.partner_id
      ? true  // 既に partner_id ある = 別の同ref番号取引の可能性、保守的にスキップ
      : false;
    if (existing.amount === inv.total) {
      console.log(`    ⚠️  既に freee に登録済み (id=${existing.id}, 金額一致) → スキップ`);
      return { skipped: true, freeeDealId: existing.id };
    } else {
      console.log(`    ⚠️  ref_number 衝突 (freee側は別取引 id=${existing.id} ¥${existing.amount}) → スキップ、要手動確認`);
      return { skipped: true, conflict: true, freeeDealId: null };
    }
  }

  // 取引先解決
  const partnerId = await findOrCreatePartner(inv.customerName, inv.honorific, accessToken, partnerCache);

  // 摘要生成
  const items = inv.items || [];
  const top = items[0]?.description || '';
  const extra = items.length > 1 ? ` 他${items.length - 1}件` : '';
  let desc = `${inv.subject || ''} / ${top}${extra}`;
  if (desc.length > 60) desc = desc.slice(0, 57) + '...';

  // 取引作成
  const createRes = await freeeApi('POST', '/api/1/deals', accessToken, {
    company_id: COMPANY_ID,
    issue_date: inv.invoiceDate,
    type: 'income',
    ref_number: inv.invoiceNumber,
    partner_id: partnerId,
    details: [{
      account_item_id: ACCOUNT_ITEM_ID,
      tax_code: TAX_CODE,
      amount: inv.total,
      description: desc,
    }],
  });
  const dealId = createRes.deal.id;
  console.log(`    ✅ freee 登録成功: deal_id=${dealId}`);
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
  const targets = invoices.filter(inv =>
    !inv.freeeDealId &&
    (!inv.type || inv.type === 'sale') &&
    inv.total &&
    inv.total > 0
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
