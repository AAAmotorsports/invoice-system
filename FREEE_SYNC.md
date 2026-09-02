# SHOPFLOW → freee 自動同期 セットアップ

SHOPFLOW で発行した請求書を、毎日 04:00 JST に freee へ自動登録します。

## 全体像

```
毎日 04:00 JST (バックアップの1時間後)
  ↓
GitHub Actions cron
  ↓
Firestore から未送信の請求書を取得
  ↓
各請求書について:
  1. freee で 取引先 を検索 or 新規作成
  2. freee に取引 (deal) を作成 (未決済=売掛金)
  3. freeeDealId を Firestore に書き戻す
  ↓
翌日以降: 送信済みはスキップ (冪等性)
```

## セットアップ (初回のみ・約20分)

### ステップ 1: freee アプリを登録

1. https://app.secure.freee.co.jp/developers/applications
2. **「新しいアプリケーションを作成」** をクリック
3. 設定:
   | 項目 | 値 |
   |---|---|
   | アプリ名 | `SHOPFLOW Auto Sync` (任意) |
   | 概要 | `SHOPFLOW から取引を自動同期` (任意) |
   | Callback URL | `urn:ietf:wg:oauth:2.0:oob` |
4. **作成**
5. アプリの詳細画面で **Client ID** と **Client Secret** を控える（Secret は初回のみ表示）

### ステップ 2: OAuth で refresh_token を取得

以下のURLをブラウザで開く（Client ID を置き換え）：

```
https://accounts.secure.freee.co.jp/public_api/authorize?client_id=<CLIENT_ID>&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code
```

1. freee にログイン (kidskart1177@gmail.com)
2. アプリ承認画面で **「許可する」**
3. 表示される **認可コード** をコピー (例: `abc123xyz...`)

その認可コードを使って refresh_token を取得。ターミナルで:

```bash
curl -X POST https://accounts.secure.freee.co.jp/public_api/token \
  -d grant_type=authorization_code \
  -d client_id=<CLIENT_ID> \
  -d client_secret=<CLIENT_SECRET> \
  -d redirect_uri=urn:ietf:wg:oauth:2.0:oob \
  -d code=<認可コード>
```

レスポンスに `refresh_token` が含まれる。これを控える。

**難しい場合**: Claude に「認可コード送るので refresh_token 取って」と依頼してください。私が上記 curl を実行します。

### ステップ 3: GitHub Secrets に登録

https://github.com/AAAmotorsports/invoice-system/settings/secrets/actions

3つ追加:

| Name | Value |
|---|---|
| `FREEE_CLIENT_ID` | ステップ1の Client ID |
| `FREEE_CLIENT_SECRET` | ステップ1の Client Secret |
| `FREEE_REFRESH_TOKEN` | ステップ2の refresh_token |

（既存の `FIREBASE_SERVICE_ACCOUNT` は流用するので追加不要）

### ステップ 4: 手動実行テスト

1. https://github.com/AAAmotorsports/invoice-system/actions
2. **SHOPFLOW → freee Auto Sync** を選択
3. **Run workflow** → main → **Run workflow**
4. 数十秒待って ✅ 緑チェック

初回実行時:
- 既に登録済みの8月分7件 → 「既存あり」でスキップされ、freeeDealId が Firestore に書き戻される
- 未送信の分（今後発行する分）→ 新規登録される

## 運用

- 何もしなくてOK。毎日 04:00 JST に自動実行
- SHOPFLOW の請求書履歴で **「📤 freee済」バッジ** が付けば送信完了
- 失敗すれば GitHub Actions に通知される

## トラブルシューティング

**「freee token 更新失敗: 401」**
→ refresh_token 期限切れ or 無効。ステップ2からやり直す

**「取引先が別人になった」**
→ 「井上」で検索すると「井上千恵」「井上瑞基」「井上」の3人ヒットする状況。既存の「井上」を優先する仕様。もし異なる井上さんを別で登録したければ SHOPFLOW 側で顧客名を「井上 太郎」等区別する

**「ref_number 衝突」警告**
→ freee 側に SHOPFLOW とは別に同じ番号の取引がある場合。手動確認必要。当該請求書は自動送信されない

## セキュリティ

- refresh_token は Firestore と GitHub Secrets 両方に保存 (ローテーション対応)
- Firestore は書き込み時に自動ローテートされる (使うたびに新しい refresh_token に更新)
- 万一 refresh_token が漏れても、freee 管理画面から連携解除で無効化可

## コスト

- GitHub Actions: 無料枠内 (月2-3分)
- freee API: **無料** (freee のプランがスタンダード以上なら API 使用可)
- **合計: ¥0/月**
