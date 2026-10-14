# Smart Campaign Manager

韩国电话调查活动管理平台。支持 CATI 与 URL (OQD) 两种调查类型，通过 AI（Claude）自动生成 Voice Agent 访谈脚本与配额结构，并提供实时活动监控看板。

---

## 功能概览

| 模块 | 描述 |
|------|------|
| **问卷上传** | 支持 PDF（推荐）、DOCX、XLSX 三种格式 |
| **AI Prompt 生成** | Claude 读取问卷，以 JSON 格式输出 8 段（Greeting + 7 节）Voice Agent 系统提示词，生成时显示接收字节数 |
| **分区编辑** | Prompt 按段落独立显示，每段可折叠/展开、单独编辑；Greeting 单独存储供 Voice Agent 平台使用 |
| **Structured Output** | 自动提取变量 Schema（变量名 / 类型 / 答案编码），可手动编辑 |
| **模拟对话** | 在 Prompt 编辑页直接与 AI 对话，扮演受访者测试访谈流程；Greeting 在对话开始时直接显示 |
| **配额管理** | AI 自动推荐 + 自然语言需求调整 + 滑块/数字输入手动修改 |
| **实时看板** | WebSocket 推送配额进度、通话记录、实时对话转录 |
| **多语言** | 支持韩语 / 英语 / 中文 / 日语（i18next） |

---

## 技术栈

### 前端 (`frontend/`)

| 技术 | 版本 |
|------|------|
| React | 19 |
| Vite | 8 |
| TypeScript | 5.9 |
| React Router | 7 |
| TanStack Query | 5 |
| Tailwind CSS | 3 |
| i18next | 26 |

### 后端 (`backend/`)

| 技术 | 版本 |
|------|------|
| FastAPI | 0.115 |
| SQLAlchemy (async) | 2.0 |
| aiosqlite | 0.20 |
| Pydantic Settings | 2.5 |
| Anthropic SDK | 0.34 |
| httpx | 0.27 |
| pdfplumber | 0.11 |
| python-docx | 1.1 |
| openpyxl | 3.1 |

---

## 目录结构

```
smart_compain_manager/
├── frontend/
│   └── src/
│       ├── types/index.ts          # 全局 TypeScript 类型
│       ├── pages/
│       │   ├── surveys/            # 列表、新建向导、Prompt编辑
│       │   ├── quotas/             # 配额编辑
│       │   ├── dashboard/          # 实时看板
│       │   └── settings/           # 系统设置
│       ├── components/
│       │   ├── Layout.tsx          # 侧边栏导航
│       │   └── ui/                 # Badge, ProgressBar
│       ├── i18n/locales/           # ko / en / zh / ja
│       ├── mocks/                  # 开发用静态数据 & MockWebSocket
│       └── lib/utils.ts
├── backend/
│   └── app/
│       ├── main.py                 # FastAPI 入口 + CORS + lifespan
│       ├── core/
│       │   ├── config.py           # Pydantic Settings (.env)
│       │   └── database.py         # 异步 SQLAlchemy + init_db
│       ├── models/                 # Survey, QuotaCell, PhoneRecord, CallLog
│       ├── schemas/                # Pydantic I/O schemas
│       ├── api/
│       │   ├── surveys.py          # 调查 CRUD + 文件上传解析
│       │   ├── quotas.py           # 配额 CRUD + AI 推荐
│       │   ├── campaigns.py        # 活动 start / pause
│       │   ├── callbacks.py        # Voice Agent 回调接收
│       │   ├── websocket.py        # WS /ws/campaigns/{id}
│       │   └── voice_prompt.py     # Prompt 生成/保存/模拟
│       └── services/
│           ├── parsers/            # cati_parser, oqd_parser, docx_parser
│           ├── quota_ai.py         # Claude 配额推荐
│           ├── voice_prompt_generator.py  # Claude Prompt 流式生成 + Schema提取
│           ├── voice_agent.py      # Voice Agent REST 适配器（stub）
│           ├── campaign_runner.py  # asyncio 轮询任务
│           ├── ws_hub.py           # WebSocket 广播 Hub
│           └── webhook_dispatcher.py  # HMAC-SHA256 Webhook 推送
├── memory/                         # 项目笔记（非运行时）
└── CLAUDE.md                       # AI 辅助开发说明
```

---

## 快速开始

### 1. 克隆仓库

```bash
git clone <repo-url>
cd smart_compain_manager
```

### 2. 后端

```bash
cd backend
cp .env.example .env        # 填写 API Key 等配置
pip install -r requirements.txt
uvicorn app.main:app --reload
# 后端运行于 http://localhost:8000
```

#### 填充测试数据（可选）

```bash
cd backend
python seed.py
# 写入 4 条示例调查（含完整 Prompt + Schema）
```

### 3. 前端

```bash
cd frontend
npm install                  # 或 pnpm install
npm run dev
# 前端运行于 http://localhost:5173
```

---

## 环境变量（`backend/.env`）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./dev.db` | 数据库连接（生产换 PostgreSQL） |
| `ANTHROPIC_API_KEY` | — | Claude API 密钥（必填） |
| `VOICE_AGENT_BASE_URL` | `http://localhost:9000` | Voice Agent REST 基础地址 |
| `VOICE_AGENT_API_KEY` | — | Voice Agent 认证密钥 |
| `WEBHOOK_SECRET` | `changeme` | Webhook HMAC 签名密钥 |
| `POLL_INTERVAL_SECONDS` | `5` | 轮询 Voice Agent 的间隔（秒） |
| `MAX_CONCURRENT_CALLS` | `10` | 最大并发外呼数 |

---

## 主要数据流

```
上传 PDF/DOCX  → 解析文本 → 存入 questionnaire_raw / file_data
AI 生成 Prompt → 流式输出 JSON（8段）→ 前端解析为分区 → 后台提取 structured_output_schema
               → voice_agent_prompt（7段拼接）+ voice_agent_greeting 分别存储
AI 配额推荐   → Claude 分析问卷 → 生成 QuotaCell 列表
启动活动       → campaign_runner 读取 prompt + greeting → 每次外呼附带到 context
               → 轮询 Voice Agent → WS 广播实时进度
VA 回调        → POST /api/callbacks/call-result → 更新 QuotaCell.completed
活动完成       → survey.status = completed → 触发 Webhook 推送
```

---

## WebSocket 消息类型

| type | 数据字段 | 说明 |
|------|---------|------|
| `quota_update` | `cell`, `overallStats` | 配额格完成数更新 |
| `call_started` | `call` | 新通话开始 |
| `transcript_update` | `callId`, `line` | 实时转录行 |
| `call_completed` | `callId`, `resultCode`, `responses` | 通话结束 |
| `campaign_completed` | — | 所有配额满额 |
| `campaign_status` | `status` | 活动状态变更 |

---

## 通话结果编码

| 代码 | 含义 |
|------|------|
| 0 | 조사성공（调查成功） |
| 1 | 결번（空号） |
| 2 | 기업체/FAX |
| 3 | 강력거절（强烈拒绝） |
| 4 | 거절（拒绝） |
| 5 | 비수신（无人接听） |
| 6 | 통화중（占线） |
| 7 | 대상아님（不符条件） |
| 8 | 쿼터오버（配额满） |
| 9 | 중도포기（中途放弃） |
| 10 | 기타（其他） |

---

## 开发命令速查

```bash
# 后端类型检查（无需构建）
cd backend && python -m py_compile app/main.py

# 前端类型检查
cd frontend && npx tsc --noEmit

# 前端构建
cd frontend && npm run build
```

---

## 待办 / 已知问题

- [ ] **DashboardPage** 目前使用 Mock 数据，待对接真实后端 API + WebSocket
- [ ] **SettingsPage** 保存功能待对接后端配置接口
- [ ] **Voice Agent** 真实接口规范待确定（当前为 httpx stub）
- [ ] URL (OQD) 类型上传流程待完善（后端需补充 survey_url 参数处理）
- [ ] 生产环境数据库切换 PostgreSQL + Alembic 迁移

---

## License

MIT
