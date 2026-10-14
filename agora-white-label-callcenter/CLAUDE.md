# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Smart Campaign Manager** — a platform for managing Korean telephone survey campaigns. Supports two survey types:
- **CATI**: operator-assisted calls via cati.panel.co.kr; upload `.xlsx` with quota + phone list sheets
- **URL (OQD)**: operator-fills browser form; upload `.html` variable guide (EUC-KR encoded) for AI quota extraction

## Development Commands

### Frontend (`frontend/`)
```bash
npm run dev      # Vite dev server on :5173
npm run build    # Production build
npx tsc --noEmit # Type-check without building
```

### Backend (`backend/`)
```bash
cp .env.example .env          # Fill in API keys first
pip install -r requirements.txt
uvicorn app.main:app --reload  # Dev server on :8000
```
SQLite is used in dev (`dev.db` created automatically on first run). Switch `DATABASE_URL` to PostgreSQL for production.

## Architecture

```
frontend/src/
├── types/index.ts          # All shared TS types (Survey, QuotaCell, WsMessage, etc.)
├── mocks/
│   ├── data.ts             # Static mock data (4 surveys, 36 quota cells, transcripts)
│   └── ws-mock.ts          # MockWebSocket — emits events on setInterval for dev
├── pages/
│   ├── surveys/            # SurveyListPage, NewSurveyPage (3-step wizard)
│   ├── quotas/             # QuotaEditorPage — area×gender×age matrix
│   ├── dashboard/          # DashboardPage — 3-column real-time view
│   └── settings/           # SettingsPage — Voice Agent / Anthropic / webhook config
└── components/
    ├── Layout.tsx           # Sidebar nav shell
    └── ui/                  # Badge, ProgressBar

backend/app/
├── main.py                  # FastAPI + CORS + lifespan (init_db)
├── core/
│   ├── config.py            # Pydantic Settings from .env
│   └── database.py          # Async SQLAlchemy engine, Base, get_db, init_db
├── models/                  # SQLAlchemy ORM: Survey, QuotaCell, PhoneRecord, CallLog
├── schemas/                 # Pydantic I/O: survey.py, quota.py, callback.py
├── api/
│   ├── surveys.py           # GET/POST /api/surveys + /upload (parses CATI xlsx or OQD html)
│   ├── quotas.py            # GET/PUT /api/surveys/:id/quotas + /ai-suggest (Claude API)
│   ├── campaigns.py         # POST /api/surveys/:id/campaign/start|pause
│   ├── callbacks.py         # POST /api/callbacks/call-result (Voice Agent callback)
│   └── websocket.py         # WS /ws/campaigns/:id
└── services/
    ├── parsers/
    │   ├── cati_parser.py   # openpyxl: reads 쿼터샘플데이타 + 리스트샘플데이타 sheets
    │   └── oqd_parser.py    # chardet + BeautifulSoup: EUC-KR HTML, extracts variables + routing
    ├── quota_ai.py          # Claude claude-sonnet-4-6: returns JSON quota config from questionnaire text
    ├── voice_agent.py       # httpx adapter: initiate_call / get_call_status / cancel_call
    ├── campaign_runner.py   # asyncio task per survey: poll VA → update DB → broadcast WS
    ├── ws_hub.py            # ConnectionHub: per-survey WebSocket subscriber sets
    └── webhook_dispatcher.py # HMAC-SHA256 signed POST to client webhook URL
```

## Key Data Flows

**Upload CATI file** → `cati_parser.py` → QuotaCells + PhoneRecords in DB
**Upload OQD file** → `oqd_parser.py` → `survey.questionnaire_raw` (text for AI)
**AI suggest** → `quota_ai.py` calls Claude → QuotaCells created from JSON response
**Start campaign** → `campaign_runner.start_campaign()` spawns asyncio task → polls Voice Agent every N seconds → updates DB + broadcasts via `ws_hub`
**Voice Agent callback** → `POST /api/callbacks/call-result` → `_handle_call_result()` → increments QuotaCell.completed, broadcasts WS
**Frontend dashboard** → subscribes to `WS /ws/campaigns/:id` → renders real-time quota grid + transcript + call log

## WebSocket Message Types

```typescript
{ type: 'quota_update'; cell: QuotaCell; overallStats: CampaignStats }
{ type: 'call_started'; call: ActiveCall }
{ type: 'transcript_update'; callId: string; line: TranscriptLine }
{ type: 'call_completed'; callId: string; resultCode: CallResultCode; responses: Record<string, string|number> }
{ type: 'campaign_completed' }
{ type: 'campaign_status'; status: SurveyStatus }
```

## Call Result Codes
0=조사성공 1=결번 2=기업체/FAX 3=강력거절 4=거절 5=비수신 6=통화중 7=대상아님 8=쿼터오버 9=중도포기 10=기타

## Environment Variables (backend/.env)
- `DATABASE_URL` — async SQLAlchemy URL (default: `sqlite+aiosqlite:///./dev.db`)
- `ANTHROPIC_API_KEY` — for AI quota suggestion feature
- `VOICE_AGENT_BASE_URL` / `VOICE_AGENT_API_KEY` — Voice Agent REST adapter
- `WEBHOOK_SECRET` — HMAC key for result delivery
- `POLL_INTERVAL_SECONDS` — how often to poll Voice Agent (default: 5)
- `MAX_CONCURRENT_CALLS` — concurrent call dispatch limit (default: 10)
