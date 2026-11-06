/**
 * R2 バックアップから経費請求データを探す (調査専用)
 * - daily/ と monthly/ のバックアップを全部走査
 * - 各バックアップの expenses_json 件数を記録
 * - 経費が入っていた最新のバックアップを artifact として出力
 */

const fs = require('fs');
const path = require('path');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
} = process.env;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function streamToString(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf-8');
}

async function listAll(prefix) {
  const out = [];
  let ContinuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      ContinuationToken,
    }));
    for (const o of res.Contents || []) out.push(o);
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

async function fetchBackup(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const body = await streamToString(res.Body);
  return JSON.parse(body);
}

function expensesInfo(data) {
  let expensesArr = [];
  if (data.expenses_json) {
    try { expensesArr = JSON.parse(data.expenses_json); } catch(e) {}
  } else if (data.expenses) {
    expensesArr = data.expenses;
  }
  return {
    count: Array.isArray(expensesArr) ? expensesArr.length : 0,
    totalYen: Array.isArray(expensesArr) ? expensesArr.reduce((s, e) => s + (e.total || 0), 0) : 0,
    expenses: expensesArr,
  };
}

async function main() {
  console.log('🔍 R2 バックアップを走査中...');
  const dailies = await listAll('daily/');
  const monthlies = await listAll('monthly/');
  const all = [...dailies, ...monthlies]
    .filter(o => o.Key.endsWith('.json'))
    .sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0)); // 新しい順

  console.log(`  daily:   ${dailies.length} 件`);
  console.log(`  monthly: ${monthlies.length} 件`);
  console.log('');

  const report = [];
  let bestBackup = null;   // 経費が最大件数のもの (最新)
  let bestKey = null;

  for (const obj of all) {
    try {
      const data = await fetchBackup(obj.Key);
      const info = expensesInfo(data);
      const savedAt = data.savedAt || '(なし)';
      const line = `  ${obj.Key}  savedAt=${savedAt}  経費=${info.count}件  ¥${info.totalYen.toLocaleString()}`;
      console.log(line);
      report.push({ key: obj.Key, lastModified: obj.LastModified, savedAt, expenseCount: info.count, expenseTotalYen: info.totalYen });

      if (info.count > 0 && !bestBackup) {
        bestBackup = data;
        bestKey = obj.Key;
      }
    } catch (e) {
      console.log(`  ⚠️  ${obj.Key} 読取失敗: ${e.message}`);
    }
  }

  const outDir = path.join(__dirname, '..', 'restore-out');
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'backup-inventory.json'), JSON.stringify(report, null, 2));
  console.log(`\n📄 全バックアップ一覧: restore-out/backup-inventory.json`);

  if (bestBackup) {
    const info = expensesInfo(bestBackup);
    const expensesPath = path.join(outDir, 'expenses-recovered.json');
    fs.writeFileSync(expensesPath, JSON.stringify(info.expenses, null, 2));
    console.log(`\n✅ 経費データを含む最新バックアップ: ${bestKey}`);
    console.log(`   savedAt=${bestBackup.savedAt}`);
    console.log(`   件数=${info.count}  合計=¥${info.totalYen.toLocaleString()}`);
    console.log(`   復元用 JSON: restore-out/expenses-recovered.json (${(fs.statSync(expensesPath).size / 1024).toFixed(1)} KB)`);
  } else {
    console.log('\n❌ 全バックアップで経費データが見つかりませんでした (すべて空)。');
    process.exit(2);
  }
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
