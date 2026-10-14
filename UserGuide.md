# Agora 白標電話調查中心 — 使用指南
### Tokyo Energy Demo

---

> **語言選擇 / Language：**
> 　**中文（當前）**　｜　[日本語 →](UserGuide.ja.md)

---

## 目錄

1. [項目概述](#1-項目概述)
2. [整體架構](#2-整體架構)
3. [目錄結構](#3-目錄結構)
4. [數據庫表定義](#4-數據庫表定義)
5. [API 路由一覽](#5-api-路由一覽)
6. [環境變量配置](#6-環境變量配置)
7. [啟動指南](#7-啟動指南)
8. [核心業務流程](#8-核心業務流程)

---

## 1. 項目概述

本項目是一套基於 **Agora Conversational AI** 平台的 AI 電話調查（CATI）管理系統，專為 Tokyo Energy 客戶演示構建。系統支持：

- 創建和管理外呼調查活動（Campaign）
- 多維度配額管理（地區 × 性別 × 年齡）
- AI 語音坐席自動撥打電話並錄音轉錄
- 通話結構化輸出提取（問卷答案）
- 實時 Dashboard 監控與 WebSocket 推送
- 合同文件解析（PDF/DOCX）
- 4 語言支持（中 / 英 / 韓 / 日）

---

## 2. 整體架構

```
┌─────────────────────────────────────────────────────────┐
│                     前端 Frontend                        │
│         React 19 + Vite + TypeScript + Tailwind         │
│                   http://localhost:5173                  │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP REST + WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                     後端 Backend                         │
│              FastAPI + SQLAlchemy (Async)                │
│                   http://localhost:8000                  │
└──────────┬─────────────────────────┬────────────────────┘
           │                         │
┌──────────▼──────────┐   ┌──────────▼──────────────────┐
│   數據庫 Database    │   │   外部 AI / 平台服務         │
│                     │ ┌─────────────────────────┐ │
│ PostgreSQL (生產)    │   │ │ Agora Conversational AI │ │
└─────────────────────┘   │ │   外呼撥號 / 語音坐席    │ │
                           │ └─────────────────────────┘ │
                           │ ┌─────────────────────────┐ │
                           │ │ Anthropic Claude API    │ │
                           │ │  生成語音坐席系統提示    │ │
                           │ └─────────────────────────┘ │
                           │ ┌─────────────────────────┐ │
                           │ │ OpenAI GPT-4o mini      │ │
                           │ │  通話轉錄配額評估        │ │
                           │ └─────────────────────────┘ │
                           └─────────────────────────────┘
```

### 技術棧

| 層級 | 技術 | 版本 |
|------|------|------|
| 前端框架 | React | 19.2.4 |
| 前端構建 | Vite | 8.0.1 |
| 前端語言 | TypeScript | 5.9.3 |
| 前端路由 | React Router | 7.13.2 |
| 前端狀態 | TanStack Query | 5.96.0 |
| 前端樣式 | Tailwind CSS | 3.4.19 |
| 前端圖表 | Recharts | 2.13.3 |
| 前端 i18n | i18next | 26.0.3 |
| 後端框架 | FastAPI | 0.115.0 |
| 後端語言 | Python | 3.11+ |
| ASGI 服務器 | Uvicorn | 0.30.6 |
| ORM | SQLAlchemy | 2.0.35 |
| PostgreSQL 驅動 | AsyncPG | 0.30.0 |
| 數據校驗 | Pydantic | 2.5.2 |
| AI（提示生成） | Anthropic Claude | 0.34.2 |
| AI（配額評估） | OpenAI GPT-4o mini | 1.50.0+ |

---

## 3. 目錄結構

```
Agora-WhiteLabel-CallCenter_TokyoEnergy/
├── UserGuide.md                              # 本文件（中文）
├── UserGuide.ja.md                           # 日文版使用指南
├── agora-white-label-callcenter/             # 主應用目錄
│   ├── frontend/                             # React 前端
│   │   ├── src/
│   │   │   ├── App.tsx                       # 主路由
│   │   │   ├── main.tsx                      # 入口
│   │   │   ├── types/index.ts                # 全局 TypeScript 類型
│   │   │   ├── pages/                        # 頁面組件
│   │   │   │   ├── surveys/                  # 調查管理
│   │   │   │   ├── campaigns/                # 活動管理
│   │   │   │   ├── quotas/                   # 配額編輯
│   │   │   │   ├── dashboard/                # 實時監控
│   │   │   │   ├── agents/                   # 語音坐席管理
│   │   │   │   ├── phone-numbers/            # 電話號碼管理
│   │   │   │   ├── inbound-routing/          # IVR 路由配置
│   │   │   │   ├── contracts/                # 合同文件管理
│   │   │   │   ├── call-history/             # 通話記錄與轉錄
│   │   │   │   ├── analytics/                # 統計分析
│   │   │   │   ├── auth/                     # 登錄頁
│   │   │   │   └── settings/                 # 系統設置
│   │   │   ├── components/                   # 通用 UI 組件
│   │   │   ├── lib/                          # 工具函數
│   │   │   ├── i18n/                         # 多語言文件 (ko/en/zh/ja)
│   │   │   └── mocks/                        # 開發用 Mock 數據
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── backend/                              # FastAPI 後端
│       ├── app/
│       │   ├── main.py                       # 應用入口，路由注冊，生命周期
│       │   ├── core/
│       │   │   ├── config.py                 # 環境變量配置 (Pydantic Settings)
│       │   │   └── database.py               # 數據庫引擎，init_db()
│       │   ├── models/                       # SQLAlchemy ORM 模型 (數據表)
│       │   │   ├── campaign_v2.py            # campaigns_v2 表
│       │   │   ├── quota_v2.py               # quota_v2 表
│       │   │   ├── calls_v2.py               # calls_v2 表
│       │   │   ├── agent_v2.py               # agent_v2 表
│       │   │   ├── phone_number_v2.py        # phone_numbers_v2 表
│       │   │   ├── contract_v2.py            # contract_v2 表
│       │   │   └── calls_v2_sync_state.py    # calls_v2_sync_state 表
│       │   ├── schemas/                      # Pydantic 請求/響應模型
│       │   ├── api/                          # API 路由處理器
│       │   └── services/                     # 業務邏輯
│       │       ├── calls_structured_output_poll.py  # 結構化輸出輪詢
│       │       ├── quota_transcript_eval_poll.py     # 配額評估輪詢
│       │       ├── quota_transcript_eval.py          # LLM 配額評估
│       │       ├── voice_prompt_generator.py         # Claude 提示生成
│       │       └── ws_hub.py                         # WebSocket 連接管理
│       ├── .env.example                      # 環境變量模板
│       ├── requirements.txt                  # Python 依賴
│       └── dev.db                            
│
├── contract/                                 # Tokyo Energy 合同文件
└── Survey_doc/                               # 調查文件
```

---

## 4. 數據庫表定義

生產環境使用 PostgreSQL。

### 4.1 `campaigns_v2` — 調查活動

| 字段 | 類型 | 說明 |
|------|------|------|
| `id` | INTEGER PK | 自增主鍵 |
| `campaign_id` | VARCHAR UNIQUE | Agora 活動 ID |
| `campaign_name` | VARCHAR | 活動名稱 |
| `questionnaire_type` | VARCHAR | `create_agent_by_ai` / `existing_agent` |
| `quota_mode` | VARCHAR | `manual` / `ai_auto` |
| `total_numbers` | INTEGER | 撥打總號碼數 |
| `phone_number_id` | VARCHAR | 使用的電話號碼 ID |
| `phone_number` | VARCHAR | 外呼電話號碼 |
| `agent_id` | VARCHAR | 語音坐席 ID |
| `agent_name` | VARCHAR | 語音坐席名稱 |
| `start_immediately` | BOOLEAN | 是否立即開始 |
| `scheduled_start_time` | VARCHAR | 排期開始時間 |
| `max_call_duration_seconds` | INTEGER | 最大通話時長（默認 600 秒） |
| `silence_timeout_seconds` | INTEGER | 靜音超時（默認 30 秒） |
| `end_call_on_silence_timeout` | BOOLEAN | 靜音超時後掛斷 |
| `ring_timeout_seconds` | INTEGER | 振鈴超時 |
| `end_call_on_user_request` | BOOLEAN | 用戶要求後掛斷 |
| `end_call_on_ai_assistant` | BOOLEAN | AI 判斷後掛斷 |
| `structured_output` | TEXT | JSON 格式的結構化輸出 Schema |
| `enable_transcript` | BOOLEAN | 開啟轉錄 |
| `enable_recording` | BOOLEAN | 開啟錄音 |
| `status` | VARCHAR | `draft` / `running` / `completed` |
| `created_at` | VARCHAR | 創建時間 |
| `updated_at` | VARCHAR | 更新時間 |

---

### 4.2 `quota_v2` — 配額單元格

每行代表一個多維配額格（地區 × 性別 × 年齡）。

| 字段 | 類型 | 說明 |
|------|------|------|
| `id` | INTEGER PK | 自增主鍵 |
| `campaign_id` | VARCHAR (indexed) | 關聯活動 ID |
| `label` | VARCHAR | 如 `Region=首尔, Gender=Male, Age=19-29` |
| `filters` | TEXT | JSON 過濾條件，如 `{"Region": "首尔", "Gender": "Male", "Age": "19-29"}` |
| `target` | INTEGER | 目標完成數量 |
| `completed` | INTEGER | 已完成數量（由通話結果累加） |
| `hit_evidence` | TEXT | JSON 命中記錄數組 |
| `created_at` | DATETIME | 創建時間 |

---

### 4.3 `calls_v2` — 通話記錄

| 字段 | 類型 | 說明 |
|------|------|------|
| `id` | INTEGER PK | 自增主鍵 |
| `campaign_id` | VARCHAR (indexed) | 所屬活動 ID |
| `call_id` | VARCHAR UNIQUE | Agora 通話 ID |
| `sip_call_id` | VARCHAR | SIP 通話 ID |
| `agent_id` | VARCHAR | 語音坐席 ID |
| `agent_session_id` | VARCHAR | 坐席會話 ID |
| `agent_name` | VARCHAR | 坐席名稱 |
| `from_number` | VARCHAR | 主叫號碼 |
| `to_number` | VARCHAR | 被叫號碼 |
| `call_category` | VARCHAR | 通話分類，如 `SUCCESSFUL_CALL` |
| `hangup_reason` | VARCHAR | 掛斷原因 |
| `duration_seconds` | INTEGER | 通話時長（秒） |
| `answered_ts` | BIGINT | 接通時間戳（毫秒） |
| `call_ts` | BIGINT | 撥出時間戳（毫秒） |
| `start_ts` | BIGINT | 開始時間戳（毫秒） |
| `end_ts` | BIGINT | 結束時間戳（毫秒） |
| `channel_name` | VARCHAR | Agora 頻道名 |
| `transcript` | TEXT | JSON 轉錄記錄，格式：`[{"role": "agent", "content": "..."}]` |
| `record_file_url` | VARCHAR | 錄音文件 URL |
| `structured_output` | TEXT | JSON 結構化輸出（問卷答案） |
| `structured_output_status` | VARCHAR | `pending` / `completed` / `failed` |
| `quota_checked` | BOOLEAN | 是否已進行配額評估 |
| `quota_check_detail` | TEXT | JSON 配額評估詳情 `{status, llm, hits, error}` |

---

### 4.4 `agent_v2` — 語音坐席配置

| 字段 | 類型 | 說明 |
|------|------|------|
| `id` | INTEGER PK | 自增主鍵 |
| `agent_id` | VARCHAR UNIQUE | Agora 坐席 ID |
| `agent_name` | VARCHAR | 坐席名稱 |
| `app_id` | VARCHAR | Agora App ID |
| `system_content` | TEXT | 系統提示詞（System Prompt） |
| `greeting_message` | TEXT | 開場白 |
| `failure_message` | TEXT | 失敗提示語 |
| `voice_id` | VARCHAR | 語音 ID |
| `properties` | TEXT | JSON 格式的其他屬性 |
| `created_at` | VARCHAR | 創建時間 |
| `updated_at` | VARCHAR | 更新時間 |

---

### 4.5 `phone_numbers_v2` — 外呼電話號碼

| 字段 | 類型 | 說明 |
|------|------|------|
| `id` | INTEGER PK | 自增主鍵 |
| `number_id` | VARCHAR UNIQUE | 電話號碼 ID |
| `name` | VARCHAR | 號碼名稱/備注 |
| `phone_number` | VARCHAR | 電話號碼 |
| `type` | VARCHAR | 號碼類型 |
| `sip_gateway_host` | VARCHAR | SIP 網關主機 |
| `sip_signaling_port` | INTEGER | SIP 信令端口 |
| `outbound_protocol` | VARCHAR | 外呼協議 |
| `created_at` | VARCHAR | 創建時間 |
| `updated_at` | VARCHAR | 更新時間 |

---

### 4.6 `contract_v2` — 合同文件（Tokyo Energy 特有）

| 字段 | 類型 | 說明 |
|------|------|------|
| `id` | INTEGER PK | 自增主鍵 |
| `filename` | VARCHAR | 文件名 |
| `file_type` | VARCHAR | `pdf` / `docx` |
| `file_data` | BYTES | 二進制文件內容 |
| `kanrisha` | VARCHAR | 管理者 |
| `kaisha_mei` | VARCHAR | 会社名（公司名） |
| `shiyousha` | VARCHAR | 使用者 |
| `genjuusho` | VARCHAR | 現住所（現居地址） |
| `teiketsu_bi` | VARCHAR | 締結日（合同簽訂日） |
| `shiyou_address` | VARCHAR | 使用場所住所 |
| `tatemono_mei` | VARCHAR | 建物名（樓宇名稱） |
| `heya_bangou` | VARCHAR | 部屋番号（房間號） |
| `kaishi_bi` | VARCHAR | 使用開始日（用電開始日） |
| `keiyaku_plan` | VARCHAR | 契約プラン（合同套餐） |
| `shiharai_houhou` | VARCHAR | 支払方法（付款方式） |
| `denwa_bangou` | VARCHAR | 電話番号（聯系電話） |
| `created_at` | DATETIME | 上傳時間 |

---

### 4.7 `calls_v2_sync_state` — 同步狀態追蹤

記錄各活動與 Agora 平台的數據同步進度，避免重複處理。

---

## 5. API 路由一覽

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/health` | 健康檢查 |
| **活動管理** | | |
| POST | `/api/campaigns-v2` | 創建活動 |
| GET | `/api/campaigns-v2` | 活動列表 |
| GET | `/api/campaigns-v2/{id}` | 活動詳情 |
| PUT | `/api/campaigns-v2/{id}` | 更新活動 |
| DELETE | `/api/campaigns-v2/{id}` | 刪除活動 |
| POST | `/api/campaigns-v2/{id}/start` | 啟動活動 |
| POST | `/api/campaigns-v2/{id}/pause` | 暫停活動 |
| **配額管理** | | |
| POST | `/api/quota-v2/{id}/cells` | 創建/替換配額格 |
| GET | `/api/quota-v2/{id}/cells` | 配額格列表 |
| POST | `/api/quota-v2/{id}/hit` | 記錄命中（遞增） |
| DELETE | `/api/quota-v2/{id}/cells` | 刪除所有配額格 |
| **通話記錄** | | |
| GET | `/api/calls-v2` | 通話列表（分頁） |
| GET | `/api/calls-v2/{call_id}` | 通話詳情 |
| GET | `/api/calls-v2/{call_id}/transcript` | 通話轉錄 |
| POST | `/api/calls-v2/import` | 從 Agora 導入通話 |
| **語音坐席** | | |
| POST | `/api/agents` | 創建坐席 |
| GET | `/api/agents` | 坐席列表 |
| GET | `/api/agents/{id}` | 坐席詳情 |
| PUT | `/api/agents/{id}` | 更新坐席 |
| DELETE | `/api/agents/{id}` | 刪除坐席 |
| POST | `/api/agents/{id}/prompt` | 更新系統提示詞 |
| **電話號碼** | | |
| POST | `/api/phone-numbers` | 創建電話號碼 |
| GET | `/api/phone-numbers` | 電話號碼列表 |
| PUT | `/api/phone-numbers/{id}` | 更新電話號碼 |
| DELETE | `/api/phone-numbers/{id}` | 刪除電話號碼 |
| **合同文件** | | |
| POST | `/api/contracts/upload` | 上傳合同（PDF/DOCX） |
| GET | `/api/contracts` | 合同列表 |
| GET | `/api/contracts/{id}` | 合同詳情 |
| DELETE | `/api/contracts/{id}` | 刪除合同 |
| **其他** | | |
| GET | `/api/dashboard/{id}` | 實時活動統計 |
| GET/POST | `/api/inbound-routing` | IVR 路由配置 |
| GET/POST | `/api/settings` | 系統設置 |
| **WebSocket** | | |
| WS | `/ws/{campaign_id}` | 實時活動推送 |

### WebSocket 消息類型

| 類型 | 說明 |
|------|------|
| `quota_update` | 配額格進度更新 |
| `call_started` | 新通話開始 |
| `transcript_update` | 實時轉錄行 |
| `call_completed` | 通話結束及結果 |
| `campaign_completed` | 所有配額達成 |
| `campaign_status` | 活動狀態變更 |

---

## 6. 環境變量配置

在 `backend/` 目錄下複製 `.env.example` 為 `.env` 並填寫以下配置：

```bash
# ==============================
# 數據庫
# ==============================
# 生產環境（PostgreSQL）：
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/campaign_db

# ==============================
# AI 服務（必填）
# ==============================
ANTHROPIC_API_KEY=sk-ant-api03-...          # Claude API Key，用於生成語音坐席提示詞
OPENAI_API_KEY=sk-proj-...                  # OpenAI API Key，用於配額轉錄評估
QUOTA_TRANSCRIPT_MODEL=gpt-4o-mini          # 評估模型
QUOTA_TRANSCRIPT_MIN_CONFIDENCE=0.5         # 最低置信度閾值 (0~1)

# ==============================
# Agora 平台（必填）
# ==============================
AGORA_CONVERSATIONAL_API_KEY=your_base64_key
AGORA_PROJECT_ID=your_project_id
AGORA_CONVERSATIONAL_BASE_URL=https://api.agora.io/conversational-ai/v2

# ==============================
# 後台任務輪詢間隔（可選，有默認值）
# ==============================
STRUCTURED_OUTPUT_POLL_INTERVAL_SECONDS=20
STRUCTURED_OUTPUT_POLL_BATCH_SIZE=80
QUOTA_TRANSCRIPT_EVAL_POLL_INTERVAL_SECONDS=20
QUOTA_TRANSCRIPT_EVAL_POLL_BATCH_LIMIT=200

# ==============================
# Webhook 安全（可選）
# ==============================
WEBHOOK_SECRET=changeme
```

---

## 7. 啟動指南

### 7.1 後端啟動

```bash
# 進入後端目錄
cd agora-white-label-callcenter/backend

# 1. 安裝 Python 依賴（建議使用虛擬環境）
python -m venv venv
source venv/bin/activate       # macOS/Linux
# 或 Windows: venv\Scripts\activate

pip install -r requirements.txt

# 2. 配置環境變量
cp .env.example .env
# 用編輯器打開 .env，至少填入：
#   ANTHROPIC_API_KEY
#   OPENAI_API_KEY
#   AGORA_CONVERSATIONAL_API_KEY
#   AGORA_PROJECT_ID

# 3. 啟動開發服務器（含熱重載）
uvicorn app.main:app --reload

# 後端運行於 http://localhost:8000
# API 文檔（Swagger）：http://localhost:8000/docs
# 健康檢查：http://localhost:8000/health
```


---

### 7.2 前端啟動

```bash
# 進入前端目錄（新開一個終端）
cd agora-white-label-callcenter/frontend

# 1. 安裝 Node.js 依賴
npm install

# 2. 啟動開發服務器
npm run dev

# 前端運行於 http://localhost:5173
```

### 其他前端命令

```bash
npm run build     # 生產構建（輸出到 dist/）
npm run preview   # 預覽生產構建
npm run lint      # ESLint 代碼檢查
```

---

### 7.3 完整啟動流程（快速參考）

```bash
# 終端 1：啟動後端
cd agora-white-label-callcenter/backend
source venv/bin/activate
uvicorn app.main:app --reload

# 終端 2：啟動前端
cd agora-white-label-callcenter/frontend
npm run dev

# 瀏覽器訪問
open http://localhost:5173
```

---

### 7.4 環境要求

| 工具 | 最低版本 |
|------|---------|
| Python | 3.11+ |
| Node.js | 22+ |
| npm | 9+ |

---

## 8. 核心業務流程

### 8.1 創建調查活動

```
用戶 → 上傳合同（PDF/DOCX）
     → 系統解析日文合同字段（管理者、會社名、電話等）
     → 用戶創建活動（選擇語音坐席、電話號碼、問卷設置）
     → 系統調用 Agora API 創建活動和撥號任務
     → 活動存入 campaigns_v2，狀態 = "draft"
```

### 8.2 外呼執行流程

```
活動啟動
  → Agora 平台撥打電話
  → 語音坐席執行通話（System Prompt + 開場白）
  → 通話結束 → 錄音 + 轉錄生成
  → 後台任務輪詢提取結構化輸出（問卷答案）
  → GPT-4o mini 評估轉錄對比配額過濾條件
  → 命中的配額格 completed+1
  → WebSocket 推送實時更新到前端 Dashboard
```

### 8.3 通話結果分類

| 代碼 | 含義 |
|------|------|
| 0 | 調查成功 |
| 1 | 空號 |
| 2 | 企業/傳真 |
| 3 | 強烈拒絕 |
| 4 | 拒絕 |
| 5 | 無人接聽 |
| 6 | 占線 |
| 7 | 非目標人群 |
| 8 | 配額已滿 |
| 9 | 中途放棄 |
| 10 | 其他 |

### 8.4 配額系統說明

配額採用多維矩陣形式（地區 × 性別 × 年齡），每個格子有獨立的 `target`（目標數）和 `completed`（已完成數）。

每次通話完成後，系統使用 GPT-4o mini 分析轉錄記錄，判斷受訪者屬於哪個配額格，並自動遞增對應格子的 `completed` 計數。當所有格子的 `completed >= target` 時，活動自動標記為完成。

---

*對應代碼版本：`main` 分支　｜　最後更新：2026-06-15*
