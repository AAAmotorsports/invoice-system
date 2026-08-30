# SHOPFLOW 自動バックアップ設定手順

Firebase Firestore の `appData/main` ドキュメントを毎日 03:00 JST に Cloudflare R2 へ自動バックアップする仕組みです。

## 全体像

```
毎日 03:00 JST
  ↓
GitHub Actions cron
  ↓
Firebase Admin SDK で Firestore 読み込み
  ↓
JSON ダンプ
  ↓
Cloudflare R2 (shopflow-backup バケット) に保存
  ├── daily/shopflow-YYYYMMDD.json  (90日で自動削除)
  └── monthly/shopflow-YYYY-MM.json  (毎月1日・無期限)
```

## セットアップ（初回のみ・約20分）

### ステップ 1: Firebase サービスアカウントキーの取得

1. https://console.firebase.google.com/ にアクセス
2. プロジェクト **invoice-system-fe637** を選択
3. 左上の ⚙️ → **プロジェクトの設定**
4. **サービスアカウント** タブ
5. **「新しい秘密鍵を生成」** → **キーを生成**
6. JSON ファイルがダウンロードされる（大事に保管）

### ステップ 2: Cloudflare R2 バケット作成

⚠️ **予約システムの `kidskartasmsbuckup` とは別のバケットを新規作成**

1. Cloudflare ダッシュボード → **R2** → **バケットの作成**
2. バケット名: **`shopflow-backup`**
3. 場所: **APAC (自動)** 推奨
4. **作成**

### ステップ 3: R2 API トークン発行

1. R2 の管理画面 → **R2 API トークンの管理**
2. **「API トークンの作成」**
3. パーミッション: **オブジェクトの読み取りと書き込み**
4. 指定バケット: **`shopflow-backup`** に限定（セキュリティのため）
5. 発行された 3 つをメモ:
   - **アクセスキー ID**
   - **シークレットアクセスキー**
   - **アカウント ID**（URL に含まれる）

### ステップ 4: GitHub Secrets に登録

1. https://github.com/AAAmotorsports/invoice-system/settings/secrets/actions
2. **New repository secret** で以下 5 つを1つずつ登録:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | ステップ1で取得した JSON ファイルの中身全体 |
| `R2_ACCOUNT_ID` | Cloudflare アカウント ID |
| `R2_ACCESS_KEY_ID` | R2 のアクセスキー ID |
| `R2_SECRET_ACCESS_KEY` | R2 のシークレットキー |
| `R2_BUCKET` | `shopflow-backup` |

### ステップ 5: 手動実行テスト

1. https://github.com/AAAmotorsports/invoice-system/actions
2. 左側 **SHOPFLOW Firestore Backup** をクリック
3. 右上 **Run workflow** → **Run workflow** (main ブランチ)
4. 数十秒待つ → ✅ 緑チェックになれば成功
5. Cloudflare R2 の `shopflow-backup` バケットに `daily/shopflow-YYYYMMDD.json` が作られていることを確認

## 復元手順（必要になったら）

1. Cloudflare R2 から復元したい JSON をダウンロード
2. SHOPFLOW を開いて「バックアップ」タブ
3. **「バックアップを復元」** から JSON を選択
4. データが復元される

## 運用のコツ

- **月1回、復元テストを実施推奨**（バックアップは復元して初めて成立）
- GitHub Actions の cron 実行は数時間遅れることがある（GitHub 側の混雑）
- 失敗時は GitHub Actions の実行履歴で確認可能
- 通知が欲しい場合は workflow ファイルに Slack/Discord webhook を追加可

## トラブルシューティング

**「FIREBASE_SERVICE_ACCOUNT が設定されていません」**
→ GitHub Secrets に登録忘れ、または名前が違う

**「appData/main ドキュメントが存在しません」**
→ Firebase プロジェクト ID が間違っている、またはドキュメントパスが違う

**「AccessDenied」（R2 側エラー）**
→ R2 トークンの権限が不足、またはバケット名が違う

## コスト

- GitHub Actions: 無料枠内（月20分程度使用）
- Cloudflare R2: 無料枠 10GB / エグレス無料
- Firebase 読み取り: 無料枠内（1日 1回のみ）
- **合計: 月 ¥0**
