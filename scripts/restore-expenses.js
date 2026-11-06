/**
 * R2 の shopflow-20261008.json から経費請求データを読んで Firestore に復元する。
 * - appData/expenses を上書き
 * - appData/main.savedAt を今の時刻にして、次回リロード時に全端末が pull するように
 *
 * Firestore の他のドキュメント (invoices, inventory, customers, purchases, settings) は触らない。
 */

const admin = require('firebase-admin');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const {
  FIREBASE_SERVICE_ACCOUNT,
  FIREBASE_PROJECT_ID,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  BACKUP_KEY,  // 例: "daily/shopflow-20261008.json"
} = process.env;

function req(name, val) {
  if (!val) { console.error(`❌ 環境変数 ${name} が設定されていません`); process.exit(1); }
}
req('FIREBASE_SERVICE_ACCOUNT', FIREBASE_SERVICE_ACCOUNT);
req('FIREBASE_PROJECT_ID', FIREBASE_PROJECT_ID);
req('R2_ACCOUNT_ID', R2_ACCOUNT_ID);
req('R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID);
req('R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY);
req('R2_BUCKET', R2_BUCKET);
req('BACKUP_KEY', BACKUP_KEY);

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)),
  projectId: FIREBASE_PROJECT_ID,
});
const db = admin.firestore();

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function streamToString(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  console.log(`📥 R2 から ${BACKUP_KEY} を取得中...`);
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: BACKUP_KEY }));
  const body = await streamToString(res.Body);
  const data = JSON.parse(body);
  const expensesJson = data.expenses_json;
  if (!expensesJson) {
    console.error('❌ バックアップに expenses_json がありません');
    process.exit(1);
  }
  const arr = JSON.parse(expensesJson);
  console.log(`   復元対象: ${arr.length}件 ¥${arr.reduce((s,e)=>s+(e.total||0),0).toLocaleString()}`);
  arr.forEach(e => console.log(`     - ${e.expenseNumber} ${e.expenseDate} ${e.customerName} ¥${e.total}`));

  console.log('');
  console.log('📊 現在の Firestore 状態を確認中...');
  const mainSnap = await db.collection('appData').doc('main').get();
  const expSnap = await db.collection('appData').doc('expenses').get();
  const currentMain = mainSnap.exists ? mainSnap.data() : null;
  const currentExp = expSnap.exists ? expSnap.data() : null;
  const currentExpCount = currentExp && currentExp.data ? JSON.parse(currentExp.data).length : 0;
  console.log(`   現在の main.savedAt = ${currentMain?.savedAt || '(なし)'}`);
  console.log(`   現在の main.version = ${currentMain?.version || '(なし)'}`);
  console.log(`   現在の appData/expenses 件数 = ${currentExpCount}`);

  if (currentExpCount > 0) {
    console.error(`❌ 現在 Firestore に ${currentExpCount}件 経費がある。上書き保護のため中止。`);
    console.error('   本当に上書きするなら FORCE=1 で再実行');
    if (!process.env.FORCE) process.exit(2);
  }

  console.log('');
  console.log('💾 Firestore に書き込み中 (batch)...');
  const newSavedAt = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.collection('appData').doc('expenses'), { savedAt: newSavedAt, data: expensesJson });
  batch.set(db.collection('appData').doc('main'), { version: 6, savedAt: newSavedAt });
  await batch.commit();
  console.log(`✅ 完了: main.savedAt = ${newSavedAt}`);
  console.log('');
  console.log('次のステップ:');
  console.log('  1. PC で SHOPFLOW をリロード (Cmd+Shift+R)');
  console.log('  2. 経費請求タブに1件 (¥146,340 茂木メカニック経費) が復活しているか確認');
  console.log('  3. iPhone 等の他端末も開けば自動 pull される');
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
