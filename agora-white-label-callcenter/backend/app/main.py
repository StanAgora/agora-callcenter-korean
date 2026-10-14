from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import init_db
from app.api import websocket, settings_api, phone_numbers, agents, campaigns_v2, quota_v2, calls_v2, agora_campaigns, inbound_routing, dashboard, contracts
from app.services.calls_structured_output_poll import start_structured_output_poll
from app.services.quota_transcript_eval_poll import start_quota_transcript_eval_poll
from app.services.contract_correction_poll import start_contract_correction_poll


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_structured_output_poll()
    start_quota_transcript_eval_poll()
    start_contract_correction_poll()
    yield


app = FastAPI(title='Campaign Manager API', lifespan=lifespan)

import os as _os
_cors_origins = _os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(websocket.router)
app.include_router(settings_api.router)
app.include_router(phone_numbers.router)
app.include_router(agents.router)
app.include_router(campaigns_v2.router)
app.include_router(quota_v2.router)
app.include_router(calls_v2.router)
app.include_router(agora_campaigns.router)
app.include_router(inbound_routing.router)
app.include_router(dashboard.router)
app.include_router(contracts.router)


@app.get('/health')
async def health():
    return {'status': 'ok'}
