# Agora ホワイトラベルコールセンター — ユーザーガイド
### Tokyo Energy デモ

---

> **言語選択 / Language：**
> 　[← 中文](UserGuide.md)　｜　**日本語（現在）**

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [全体アーキテクチャ](#2-全体アーキテクチャ)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [データベーステーブル定義](#4-データベーステーブル定義)
5. [API ルート一覧](#5-api-ルート一覧)
6. [環境変数の設定](#6-環境変数の設定)
7. [起動ガイド](#7-起動ガイド)
8. [主要ビジネスフロー](#8-主要ビジネスフロー)

---

## 1. プロジェクト概要

本プロジェクトは、**Agora Conversational AI** プラットフォームを基盤とした AI 電話調査（CATI）管理システムです。Tokyo Energy のデモとして構築されており、以下の機能を提供します。

- アウトバウンド調査キャンペーンの作成・管理
- 多次元クォータ管理（エリア × 性別 × 年齢）
- AI ボイスエージェントによる自動発信・録音・文字起こし
- 通話の構造化出力抽出（アンケート回答）
- WebSocket によるリアルタイムダッシュボード監視
- 契約書ファイルの自動解析（PDF/DOCX）
- 4言語対応（中国語 / 英語 / 韓国語 / 日本語）

---

## 2. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                   フロントエンド                          │
│         React 19 + Vite + TypeScript + Tailwind         │
│                   http://localhost:5173                  │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP REST + WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                    バックエンド                            │
│              FastAPI + SQLAlchemy (Async)                │
│                   http://localhost:8000                  │
└──────────┬─────────────────────────┬────────────────────┘
           │                         │
┌──────────▼──────────┐   ┌──────────▼──────────────────┐
│      データベース     │   │  外部 AI / プラットフォーム  │
│                     │ ┌─────────────────────────┐ │
│ PostgreSQL（本番）   │   │ │ Agora Conversational AI │ │
└─────────────────────┘   │ │  アウトバウンド発信        │ │
                           │ └─────────────────────────┘ │
                           │ ┌─────────────────────────┐ │
                           │ │ Anthropic Claude API    │ │
                           │ │  ボイスエージェント       │ │
                           │ │  プロンプト生成           │ │
                           │ └─────────────────────────┘ │
                           │ ┌─────────────────────────┐ │
                           │ │ OpenAI GPT-4o mini      │ │
                           │ │  文字起こしクォータ評価   │ │
                           │ └─────────────────────────┘ │
                           └─────────────────────────────┘
```

### 技術スタック

| 層 | 技術 | バージョン |
|----|------|-----------|
| フロントエンドフレームワーク | React | 19.2.4 |
| フロントエンドビルド | Vite | 8.0.1 |
| フロントエンド言語 | TypeScript | 5.9.3 |
| フロントエンドルーティング | React Router | 7.13.2 |
| フロントエンド状態管理 | TanStack Query | 5.96.0 |
| フロントエンドスタイル | Tailwind CSS | 3.4.19 |
| フロントエンドグラフ | Recharts | 2.13.3 |
| フロントエンド多言語 | i18next | 26.0.3 |
| バックエンドフレームワーク | FastAPI | 0.115.0 |
| バックエンド言語 | Python | 3.11+ |
| ASGI サーバー | Uvicorn | 0.30.6 |
| ORM | SQLAlchemy | 2.0.35 |
| PostgreSQL ドライバー | AsyncPG | 0.30.0 |
| データバリデーション | Pydantic | 2.5.2 |
| AI（プロンプト生成） | Anthropic Claude | 0.34.2 |
| AI（クォータ評価） | OpenAI GPT-4o mini | 1.50.0+ |

---

## 3. ディレクトリ構成

```
Agora-WhiteLabel-CallCenter_TokyoEnergy/
├── UserGuide.md                              # 中文版ユーザーガイド
├── UserGuide.ja.md                           # 本ドキュメント（日本語）
├── agora-white-label-callcenter/             # メインアプリケーション
│   ├── frontend/                             # React フロントエンド
│   │   ├── src/
│   │   │   ├── App.tsx                       # メインルーター
│   │   │   ├── main.tsx                      # エントリーポイント
│   │   │   ├── types/index.ts                # グローバル TypeScript 型定義
│   │   │   ├── pages/                        # ページコンポーネント
│   │   │   │   ├── surveys/                  # 調査管理
│   │   │   │   ├── campaigns/                # キャンペーン管理
│   │   │   │   ├── quotas/                   # クォータ編集
│   │   │   │   ├── dashboard/                # リアルタイム監視
│   │   │   │   ├── agents/                   # ボイスエージェント管理
│   │   │   │   ├── phone-numbers/            # 電話番号管理
│   │   │   │   ├── inbound-routing/          # IVR ルーティング設定
│   │   │   │   ├── contracts/                # 契約書ファイル管理
│   │   │   │   ├── call-history/             # 通話履歴・文字起こし
│   │   │   │   ├── analytics/                # 統計分析
│   │   │   │   ├── auth/                     # ログインページ
│   │   │   │   └── settings/                 # システム設定
│   │   │   ├── components/                   # 共通 UI コンポーネント
│   │   │   ├── lib/                          # ユーティリティ関数
│   │   │   ├── i18n/                         # 多言語ファイル (ko/en/zh/ja)
│   │   │   └── mocks/                        # 開発用モックデータ
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── backend/                              # FastAPI バックエンド
│       ├── app/
│       │   ├── main.py                       # アプリエントリー・ルーター登録・ライフサイクル
│       │   ├── core/
│       │   │   ├── config.py                 # 環境変数設定 (Pydantic Settings)
│       │   │   └── database.py               # DB エンジン・init_db()
│       │   ├── models/                       # SQLAlchemy ORM モデル（テーブル定義）
│       │   │   ├── campaign_v2.py            # campaigns_v2 テーブル
│       │   │   ├── quota_v2.py               # quota_v2 テーブル
│       │   │   ├── calls_v2.py               # calls_v2 テーブル
│       │   │   ├── agent_v2.py               # agent_v2 テーブル
│       │   │   ├── phone_number_v2.py        # phone_numbers_v2 テーブル
│       │   │   ├── contract_v2.py            # contract_v2 テーブル
│       │   │   └── calls_v2_sync_state.py    # calls_v2_sync_state テーブル
│       │   ├── schemas/                      # Pydantic リクエスト/レスポンスモデル
│       │   ├── api/                          # API ルートハンドラー
│       │   └── services/                     # ビジネスロジック
│       │       ├── calls_structured_output_poll.py  # 構造化出力ポーリング
│       │       ├── quota_transcript_eval_poll.py     # クォータ評価ポーリング
│       │       ├── quota_transcript_eval.py          # LLM クォータ評価
│       │       ├── voice_prompt_generator.py         # Claude プロンプト生成
│       │       └── ws_hub.py                         # WebSocket 接続管理
│       ├── .env.example                      # 環境変数テンプレート
│       ├── requirements.txt                  # Python 依存パッケージ
│       └── dev.db                            
│
├── contract/                                 # Tokyo Energy 契約書ファイル
└── Survey_doc/                               # 調査ドキュメント
```

---

## 4. データベーステーブル定義

本番環境では PostgreSQL を使用します。

### 4.1 `campaigns_v2` — 調査キャンペーン

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | INTEGER PK | 自動増分主キー |
| `campaign_id` | VARCHAR UNIQUE | Agora キャンペーン ID |
| `campaign_name` | VARCHAR | キャンペーン名 |
| `questionnaire_type` | VARCHAR | `create_agent_by_ai` / `existing_agent` |
| `quota_mode` | VARCHAR | `manual` / `ai_auto` |
| `total_numbers` | INTEGER | 発信対象の総電話番号数 |
| `phone_number_id` | VARCHAR | 使用する電話番号 ID |
| `phone_number` | VARCHAR | アウトバウンド電話番号 |
| `agent_id` | VARCHAR | ボイスエージェント ID |
| `agent_name` | VARCHAR | ボイスエージェント名 |
| `start_immediately` | BOOLEAN | 即時開始フラグ |
| `scheduled_start_time` | VARCHAR | スケジュール開始時刻 |
| `max_call_duration_seconds` | INTEGER | 最大通話時間（デフォルト 600 秒） |
| `silence_timeout_seconds` | INTEGER | 無音タイムアウト（デフォルト 30 秒） |
| `end_call_on_silence_timeout` | BOOLEAN | 無音タイムアウト時に切断 |
| `ring_timeout_seconds` | INTEGER | 呼出タイムアウト |
| `end_call_on_user_request` | BOOLEAN | ユーザー要求時に切断 |
| `end_call_on_ai_assistant` | BOOLEAN | AI 判断時に切断 |
| `structured_output` | TEXT | 構造化出力スキーマ（JSON） |
| `enable_transcript` | BOOLEAN | 文字起こし有効フラグ |
| `enable_recording` | BOOLEAN | 録音有効フラグ |
| `status` | VARCHAR | `draft` / `running` / `completed` |
| `created_at` | VARCHAR | 作成日時 |
| `updated_at` | VARCHAR | 更新日時 |

---

### 4.2 `quota_v2` — クォータセル

各行はエリア × 性別 × 年齢の多次元クォータセルを表します。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | INTEGER PK | 自動増分主キー |
| `campaign_id` | VARCHAR (indexed) | 関連キャンペーン ID |
| `label` | VARCHAR | 例: `Region=東京, Gender=Male, Age=19-29` |
| `filters` | TEXT | JSON フィルター条件（例: `{"Region": "東京", "Gender": "Male", "Age": "19-29"}`） |
| `target` | INTEGER | 目標完了数 |
| `completed` | INTEGER | 達成済み数（通話結果により加算） |
| `hit_evidence` | TEXT | 命中記録の JSON 配列 |
| `created_at` | DATETIME | 作成日時 |

---

### 4.3 `calls_v2` — 通話レコード

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | INTEGER PK | 自動増分主キー |
| `campaign_id` | VARCHAR (indexed) | 所属キャンペーン ID |
| `call_id` | VARCHAR UNIQUE | Agora 通話 ID |
| `sip_call_id` | VARCHAR | SIP 通話 ID |
| `agent_id` | VARCHAR | ボイスエージェント ID |
| `agent_session_id` | VARCHAR | エージェントセッション ID |
| `agent_name` | VARCHAR | エージェント名 |
| `from_number` | VARCHAR | 発信者番号 |
| `to_number` | VARCHAR | 着信者番号 |
| `call_category` | VARCHAR | 通話カテゴリ（例: `SUCCESSFUL_CALL`） |
| `hangup_reason` | VARCHAR | 切断理由 |
| `duration_seconds` | INTEGER | 通話時間（秒） |
| `answered_ts` | BIGINT | 応答タイムスタンプ（ミリ秒） |
| `call_ts` | BIGINT | 発信タイムスタンプ（ミリ秒） |
| `start_ts` | BIGINT | 開始タイムスタンプ（ミリ秒） |
| `end_ts` | BIGINT | 終了タイムスタンプ（ミリ秒） |
| `channel_name` | VARCHAR | Agora チャンネル名 |
| `transcript` | TEXT | 文字起こし JSON（例: `[{"role": "agent", "content": "..."}]`） |
| `record_file_url` | VARCHAR | 録音ファイル URL |
| `structured_output` | TEXT | 構造化出力 JSON（アンケート回答） |
| `structured_output_status` | VARCHAR | `pending` / `completed` / `failed` |
| `quota_checked` | BOOLEAN | クォータ評価済みフラグ |
| `quota_check_detail` | TEXT | クォータ評価詳細 JSON（`{status, llm, hits, error}`） |

---

### 4.4 `agent_v2` — ボイスエージェント設定

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | INTEGER PK | 自動増分主キー |
| `agent_id` | VARCHAR UNIQUE | Agora エージェント ID |
| `agent_name` | VARCHAR | エージェント名 |
| `app_id` | VARCHAR | Agora App ID |
| `system_content` | TEXT | システムプロンプト |
| `greeting_message` | TEXT | 開始挨拶メッセージ |
| `failure_message` | TEXT | エラー時メッセージ |
| `voice_id` | VARCHAR | 音声 ID |
| `properties` | TEXT | その他プロパティ（JSON） |
| `created_at` | VARCHAR | 作成日時 |
| `updated_at` | VARCHAR | 更新日時 |

---

### 4.5 `phone_numbers_v2` — アウトバウンド電話番号

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | INTEGER PK | 自動増分主キー |
| `number_id` | VARCHAR UNIQUE | 電話番号 ID |
| `name` | VARCHAR | 番号名・メモ |
| `phone_number` | VARCHAR | 電話番号 |
| `type` | VARCHAR | 番号タイプ |
| `sip_gateway_host` | VARCHAR | SIP ゲートウェイホスト |
| `sip_signaling_port` | INTEGER | SIP シグナリングポート |
| `outbound_protocol` | VARCHAR | アウトバウンドプロトコル |
| `created_at` | VARCHAR | 作成日時 |
| `updated_at` | VARCHAR | 更新日時 |

---

### 4.6 `contract_v2` — 契約書ファイル（Tokyo Energy 専用）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | INTEGER PK | 自動増分主キー |
| `filename` | VARCHAR | ファイル名 |
| `file_type` | VARCHAR | `pdf` / `docx` |
| `file_data` | BYTES | バイナリファイルデータ |
| `kanrisha` | VARCHAR | 管理者 |
| `kaisha_mei` | VARCHAR | 会社名 |
| `shiyousha` | VARCHAR | 使用者 |
| `genjuusho` | VARCHAR | 現住所 |
| `teiketsu_bi` | VARCHAR | 締結日 |
| `shiyou_address` | VARCHAR | 使用場所住所 |
| `tatemono_mei` | VARCHAR | 建物名 |
| `heya_bangou` | VARCHAR | 部屋番号 |
| `kaishi_bi` | VARCHAR | 使用開始日 |
| `keiyaku_plan` | VARCHAR | 契約プラン |
| `shiharai_houhou` | VARCHAR | 支払方法 |
| `denwa_bangou` | VARCHAR | 電話番号 |
| `created_at` | DATETIME | アップロード日時 |

---

### 4.7 `calls_v2_sync_state` — 同期状態追跡

各キャンペーンと Agora プラットフォーム間のデータ同期進捗を記録し、重複処理を防止します。

---

## 5. API ルート一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック |
| **キャンペーン管理** | | |
| POST | `/api/campaigns-v2` | キャンペーン作成 |
| GET | `/api/campaigns-v2` | キャンペーン一覧 |
| GET | `/api/campaigns-v2/{id}` | キャンペーン詳細 |
| PUT | `/api/campaigns-v2/{id}` | キャンペーン更新 |
| DELETE | `/api/campaigns-v2/{id}` | キャンペーン削除 |
| POST | `/api/campaigns-v2/{id}/start` | キャンペーン開始 |
| POST | `/api/campaigns-v2/{id}/pause` | キャンペーン一時停止 |
| **クォータ管理** | | |
| POST | `/api/quota-v2/{id}/cells` | クォータセル作成/置換 |
| GET | `/api/quota-v2/{id}/cells` | クォータセル一覧 |
| POST | `/api/quota-v2/{id}/hit` | 命中記録（カウント増加） |
| DELETE | `/api/quota-v2/{id}/cells` | 全クォータセル削除 |
| **通話記録** | | |
| GET | `/api/calls-v2` | 通話一覧（ページング） |
| GET | `/api/calls-v2/{call_id}` | 通話詳細 |
| GET | `/api/calls-v2/{call_id}/transcript` | 通話文字起こし |
| POST | `/api/calls-v2/import` | Agora から通話データをインポート |
| **ボイスエージェント** | | |
| POST | `/api/agents` | エージェント作成 |
| GET | `/api/agents` | エージェント一覧 |
| GET | `/api/agents/{id}` | エージェント詳細 |
| PUT | `/api/agents/{id}` | エージェント更新 |
| DELETE | `/api/agents/{id}` | エージェント削除 |
| POST | `/api/agents/{id}/prompt` | システムプロンプト更新 |
| **電話番号** | | |
| POST | `/api/phone-numbers` | 電話番号追加 |
| GET | `/api/phone-numbers` | 電話番号一覧 |
| PUT | `/api/phone-numbers/{id}` | 電話番号更新 |
| DELETE | `/api/phone-numbers/{id}` | 電話番号削除 |
| **契約書** | | |
| POST | `/api/contracts/upload` | 契約書アップロード（PDF/DOCX） |
| GET | `/api/contracts` | 契約書一覧 |
| GET | `/api/contracts/{id}` | 契約書詳細 |
| DELETE | `/api/contracts/{id}` | 契約書削除 |
| **その他** | | |
| GET | `/api/dashboard/{id}` | リアルタイムキャンペーン統計 |
| GET/POST | `/api/inbound-routing` | IVR ルーティング設定 |
| GET/POST | `/api/settings` | システム設定 |
| **WebSocket** | | |
| WS | `/ws/{campaign_id}` | リアルタイムキャンペーン配信 |

### WebSocket メッセージタイプ

| タイプ | 説明 |
|--------|------|
| `quota_update` | クォータセル進捗更新 |
| `call_started` | 新規通話開始 |
| `transcript_update` | リアルタイム文字起こし行 |
| `call_completed` | 通話終了・結果 |
| `campaign_completed` | 全クォータ達成 |
| `campaign_status` | キャンペーン状態変更 |

---

## 6. 環境変数の設定

`backend/` ディレクトリで `.env.example` を `.env` にコピーし、以下の項目を設定してください。

```bash
# ==============================
# データベース
# ==============================
# 本番環境（PostgreSQL）：
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/campaign_db

# ==============================
# AI サービス（必須）
# ==============================
ANTHROPIC_API_KEY=sk-ant-api03-...          # Claude API Key（ボイスエージェントプロンプト生成）
OPENAI_API_KEY=sk-proj-...                  # OpenAI API Key（文字起こしクォータ評価）
QUOTA_TRANSCRIPT_MODEL=gpt-4o-mini          # 評価モデル
QUOTA_TRANSCRIPT_MIN_CONFIDENCE=0.5         # 最低信頼度しきい値（0〜1）

# ==============================
# Agora プラットフォーム（必須）
# ==============================
AGORA_CONVERSATIONAL_API_KEY=your_base64_key
AGORA_PROJECT_ID=your_project_id
AGORA_CONVERSATIONAL_BASE_URL=https://api.agora.io/conversational-ai/v2

# ==============================
# バックグラウンドタスクポーリング間隔（任意、デフォルト値あり）
# ==============================
STRUCTURED_OUTPUT_POLL_INTERVAL_SECONDS=20
STRUCTURED_OUTPUT_POLL_BATCH_SIZE=80
QUOTA_TRANSCRIPT_EVAL_POLL_INTERVAL_SECONDS=20
QUOTA_TRANSCRIPT_EVAL_POLL_BATCH_LIMIT=200

# ==============================
# Webhook セキュリティ（任意）
# ==============================
WEBHOOK_SECRET=changeme
```

---

## 7. 起動ガイド

### 7.1 バックエンドの起動

```bash
# バックエンドディレクトリへ移動
cd agora-white-label-callcenter/backend

# 1. Python 依存パッケージのインストール（仮想環境推奨）
python -m venv venv
source venv/bin/activate       # macOS/Linux
# または Windows: venv\Scripts\activate

pip install -r requirements.txt

# 2. 環境変数の設定
cp .env.example .env
# .env を編集し、以下を最低限入力：
#   ANTHROPIC_API_KEY
#   OPENAI_API_KEY
#   AGORA_CONVERSATIONAL_API_KEY
#   AGORA_PROJECT_ID

# 3. 開発サーバー起動（ホットリロード付き）
uvicorn app.main:app --reload

# バックエンド: http://localhost:8000
# API ドキュメント（Swagger）: http://localhost:8000/docs
# ヘルスチェック: http://localhost:8000/health
```


---

### 7.2 フロントエンドの起動

```bash
# フロントエンドディレクトリへ移動（別ターミナルで）
cd agora-white-label-callcenter/frontend

# 1. Node.js 依存パッケージのインストール
npm install

# 2. 開発サーバー起動
npm run dev

# フロントエンド: http://localhost:5173
```

### その他のフロントエンドコマンド

```bash
npm run build     # 本番ビルド（dist/ に出力）
npm run preview   # 本番ビルドのプレビュー
npm run lint      # ESLint コード検査
```

---

### 7.3 完全な起動手順（クイックリファレンス）

```bash
# ターミナル 1：バックエンド起動
cd agora-white-label-callcenter/backend
source venv/bin/activate
uvicorn app.main:app --reload

# ターミナル 2：フロントエンド起動
cd agora-white-label-callcenter/frontend
npm run dev

# ブラウザでアクセス
open http://localhost:5173
```

---

### 7.4 動作環境要件

| ツール | 最低バージョン |
|--------|--------------|
| Python | 3.11+ |
| Node.js | 22+ |
| npm | 9+ |

---

## 8. 主要ビジネスフロー

### 8.1 調査キャンペーンの作成

```
ユーザー → 契約書アップロード（PDF/DOCX）
        → システムが日本語契約フィールドを自動解析
          （管理者・会社名・使用場所・支払方法など）
        → ユーザーがキャンペーンを作成
          （ボイスエージェント・電話番号・アンケート設定を選択）
        → システムが Agora API を呼び出しキャンペーンと発信タスクを作成
        → campaigns_v2 に保存、status = "draft"
```

### 8.2 アウトバウンド通話フロー

```
キャンペーン開始
  → Agora プラットフォームが電話を発信
  → ボイスエージェントが通話を実行
    （システムプロンプト + 開始挨拶メッセージ）
  → 通話終了 → 録音 + 文字起こし生成
  → バックグラウンドタスクが構造化出力を抽出（アンケート回答）
  → GPT-4o mini が文字起こしをクォータフィルターと照合評価
  → 命中したクォータセルの completed を +1
  → WebSocket でフロントエンドダッシュボードにリアルタイム配信
```

### 8.3 通話結果コード

| コード | 意味 |
|--------|------|
| 0 | 調査成功 |
| 1 | 欠番（存在しない番号） |
| 2 | 企業・FAX |
| 3 | 強い拒否 |
| 4 | 拒否 |
| 5 | 不在・応答なし |
| 6 | 話し中 |
| 7 | 対象外 |
| 8 | クォータ満了 |
| 9 | 途中放棄 |
| 10 | その他 |

### 8.4 クォータシステムの説明

クォータはエリア × 性別 × 年齢の多次元マトリクスで管理されます。各セルに独立した `target`（目標数）と `completed`（達成数）が設定されます。

通話完了ごとに、GPT-4o mini が文字起こしを分析し、回答者がどのクォータセルに属するかを判定して、対応セルの `completed` を自動加算します。全セルで `completed >= target` になると、キャンペーンは自動的に完了としてマークされます。

---

*対応コードバージョン：`main` ブランチ　｜　最終更新：2026-06-15*
