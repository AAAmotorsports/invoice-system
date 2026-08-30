/**
 * SHOPFLOW Firestore バックアップ
 * - Firestore の appData/main ドキュメント全体を JSON で取得
 * - Cloudflare R2 に保存
 *   daily/shopflow-YYYYMMDD.json  (90日で自動削除)
 *   monthly/shopflow-YYYY-MM.json (毎月1日、無期限保持)
 */

const admin = require('firebase-admin');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const {
  FIREBASE_SERVICE_ACCOUNT,
  FIREBASE_PROJECT_ID,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
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

// --- Firebase 初期化 ---
const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: FIREBASE_PROJECT_ID,
});
const db = admin.firestore();

// --- R2 (S3 互換) 初期化 ---
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// JST 日付ヘルパー
function jstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
}
function fmtMonth(d) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

async function fetchFirestoreData() {
  console.log('📥 Firestore から appData/main を取得中...');
  const docRef = db.collection('appData').doc('main');
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error('appData/main ドキュメントが存在しません');
  }
  const data = snap.data();
  console.log(`✅ 取得完了: ${Object.keys(data).length} フィールド, savedAt=${data.savedAt || '(なし)'}`);
  return data;
}

async function uploadToR2(key, body, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/json',
  }));
  console.log(`  ⬆️  ${key} (${(Buffer.byteLength(body) / 1024).toFixed(1)} KB)`);
}

async function cleanupOldDaily() {
  console.log('🗑️  90日超の daily バックアップを削除中...');
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: R2_BUCKET,
    Prefix: 'daily/',
  }));
  const toDelete = (list.Contents || []).filter(o => o.LastModified && o.LastModified < cutoff);
  if (toDelete.length === 0) {
    console.log('  該当なし');
    return;
  }
  await s3.send(new DeleteObjectsCommand({
    Bucket: R2_BUCKET,
    Delete: { Objects: toDelete.map(o => ({ Key: o.Key })) },
  }));
  console.log(`  ${toDelete.length}件削除`);
}

async function main() {
  console.log('🚀 SHOPFLOW Firestore バックアップ開始');
  console.log(`   プロジェクト: ${FIREBASE_PROJECT_ID}`);
  console.log(`   R2 バケット: ${R2_BUCKET}`);
  console.log('');

  // 1. Firestore データ取得
  const data = await fetchFirestoreData();
  const json = JSON.stringify(data, null, 2);
  const jstDate = jstNow();

  // 2. daily に保存
  const dailyKey = `daily/shopflow-${fmtDate(jstDate)}.json`;
  await uploadToR2(dailyKey, json);

  // 3. 毎月1日 なら monthly にも保存
  if (jstDate.getDate() === 1) {
    const monthlyKey = `monthly/shopflow-${fmtMonth(jstDate)}.json`;
    await uploadToR2(monthlyKey, json);
    console.log('  (月次バックアップも保存)');
  }

  // 4. 古い daily を削除
  await cleanupOldDaily();

  console.log('');
  console.log('✅ バックアップ完了');
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
