import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.campaign_v2 import CampaignV2
from app.models.calls_v2 import CallV2
from app.models.call_contract_link import CallContractLink
from app.models.phone_number_v2 import PhoneNumberV2
from app.services.kana_reading import convert_dial_tasks

router = APIRouter(prefix='/api/campaigns-v2', tags=['campaigns-v2'])

CAMPAIGN_BASE_URL = f'{settings.agora_conversational_base_url}/campaigns'
TERMINAL_STATUSES = {'completed', 'interrupted', 'interrupt', 'failed'}


def _headers() -> dict:
    return {
        'Authorization': f'Basic {settings.agora_conversational_api_key}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }


class EndCallConfig(BaseModel):
    max_call_duration_seconds: int = 600
    silence_timeout_seconds: int = 30
    end_call_on_silence_timeout: bool = True
    ring_timeout_seconds: int = 30
    end_call_on_user_request: bool = True
    end_call_on_ai_assistant: bool = True
    end_call_on_voicemail: bool = False


class DialTask(BaseModel):
    model_config = {'extra': 'allow'}
    phone_number: str


class TimeRange(BaseModel):
    start: str
    end: str


class WeekdayTimeRanges(BaseModel):
    weekday: int
    time_ranges: list[TimeRange]


class ScheduleOption(BaseModel):
    scheduled_start_time: str
    timezone: str
    allowed_time_ranges_config: list[WeekdayTimeRanges]


class CreateCampaignRequest(BaseModel):
    campaign_name: str
    phone_number_id: str
    agent_id: str
    questionnaire_type: str | None = None
    quota_mode: str | None = None
    dial_tasks: list[DialTask]
    start_immediately: bool = True
    end_call_config: EndCallConfig = EndCallConfig()
    enable_transcript: bool = True
    enable_recording: bool = True
    structured_output: dict | None = None
    schedule_option: ScheduleOption | None = None


def _serialize(c: CampaignV2) -> dict:
    return {
        'id': c.id,
        'campaign_id': c.campaign_id,
        'campaign_name': c.campaign_name,
        'questionnaire_type': c.questionnaire_type,
        'quota_mode': c.quota_mode,
        'total_numbers': c.total_numbers,
        'phone_number_id': c.phone_number_id,
        'phone_number': c.phone_number,
        'agent_id': c.agent_id,
        'agent_name': c.agent_name,
        'start_immediately': c.start_immediately,
        'scheduled_start_time': c.scheduled_start_time,
        'max_call_duration_seconds': c.max_call_duration_seconds,
        'silence_timeout_seconds': c.silence_timeout_seconds,
        'end_call_on_silence_timeout': c.end_call_on_silence_timeout,
        'ring_timeout_seconds': c.ring_timeout_seconds,
        'end_call_on_user_request': c.end_call_on_user_request,
        'end_call_on_ai_assistant': c.end_call_on_ai_assistant,
        'structured_output': json.loads(c.structured_output) if c.structured_output else None,
        'enable_transcript': c.enable_transcript,
        'enable_recording': c.enable_recording,
        'status': c.status,
        'created_at': c.created_at,
        'updated_at': c.updated_at,
    }

async def _calls_count_by_campaign_ids(db: AsyncSession, campaign_ids: list[str]) -> dict[str, int]:
    if not campaign_ids:
        return {}
    result = await db.execute(
        select(CallV2.campaign_id, func.count(CallV2.id))
        .where(CallV2.campaign_id.in_(campaign_ids))
        .group_by(CallV2.campaign_id)
    )
    return {cid: int(cnt) for cid, cnt in result.all()}


def _fields_from_detail(data: dict, local: dict | None = None) -> dict:
    end_call = data.get('end_call_config', {})
    features = data.get('features', {})
    dial_tasks = data.get('dial_tasks') or []
    total_numbers = len(dial_tasks) if isinstance(dial_tasks, list) and dial_tasks else data.get('total_numbers')

    fields: dict = {
        'campaign_id': data['campaign_id'],
        'campaign_name': data.get('campaign_name', ''),
        'total_numbers': total_numbers,
        'phone_number_id': str(data['phone_number_id']) if data.get('phone_number_id') is not None else None,
        'phone_number': data.get('phone_number'),
        'agent_id': data.get('agent_id'),
        'agent_name': data.get('agent_name'),
        'start_immediately': data.get('start_immediately'),
        'scheduled_start_time': (data.get('schedule_option') or {}).get('scheduled_start_time'),
        'max_call_duration_seconds': end_call.get('max_call_duration_seconds'),
        'silence_timeout_seconds': end_call.get('silence_timeout_seconds'),
        'end_call_on_silence_timeout': end_call.get('end_call_on_silence_timeout'),
        'ring_timeout_seconds': end_call.get('ring_timeout_seconds'),
        'end_call_on_user_request': end_call.get('end_call_on_user_request'),
        'end_call_on_ai_assistant': end_call.get('end_call_on_ai_assistant'),
        'structured_output': (
            json.dumps(data['structured_output'], ensure_ascii=False)
            if data.get('structured_output') else None
        ),
        'enable_transcript': features.get('enable_transcript', data.get('enable_transcript')),
        'enable_recording': features.get('enable_recording', data.get('enable_recording')),
        'status': data.get('status'),
        'created_at': data.get('created_at'),
        'updated_at': data.get('updated_at'),
    }

    if local:
        fields['questionnaire_type'] = local.get('questionnaire_type')
        fields['quota_mode'] = local.get('quota_mode')

    return fields


async def _fetch_detail(client: httpx.AsyncClient, campaign_id: str) -> dict | None:
    try:
        resp = await client.get(
            f'{CAMPAIGN_BASE_URL}/{campaign_id}',
            headers=_headers(),
            timeout=15,
        )
        if resp.status_code == 200:
            body = resp.json()
            data = body.get('data')
            return data if data else body
    except Exception:
        pass
    return None


# ── Endpoints ─────────────────────────────────────────────────────

@router.post('')
async def create_campaign(body: CreateCampaignRequest, db: AsyncSession = Depends(get_db)):
    # Look up local phone number string before calling Agora
    pn_row = (await db.execute(
        select(PhoneNumberV2).where(PhoneNumberV2.number_id == body.phone_number_id)
    )).scalar_one_or_none()
    local_phone_number = pn_row.phone_number if pn_row else None

    # dial_tasks の ASCII キーで渡される契約由来フィールド（service_address_reading・
    # room_number_reading など）は、契約書から抽出した raw 漢字のままだと通話中の
    # LLM/TTSが誤読しうるため、Agoraへ転送する直前に仮名読み上げ表現へ変換する
    # （隠しサービス。DBには保存しない）。
    converted_dial_tasks = await convert_dial_tasks([t.model_dump() for t in body.dial_tasks])

    payload: dict = {
        'campaign_name': body.campaign_name,
        'phone_number_id': body.phone_number_id,
        'agent_id': body.agent_id,
        'dial_tasks': converted_dial_tasks,
        'start_immediately': body.start_immediately,
        'end_call_config': body.end_call_config.model_dump(),
        'enable_transcript': body.enable_transcript,
        'enable_recording': body.enable_recording,
    }
    if body.structured_output:
        payload['structured_output'] = body.structured_output
    if body.schedule_option:
        payload['schedule_option'] = body.schedule_option.model_dump()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(CAMPAIGN_BASE_URL, json=payload, headers=_headers())

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    result = resp.json()
    data = result.get('data') or result
    campaign_id = data.get('campaign_id')
    if not campaign_id:
        raise HTTPException(status_code=400, detail=f'No campaign_id in response: {result}')

    local = {'questionnaire_type': body.questionnaire_type, 'quota_mode': body.quota_mode}
    total_numbers = len(body.dial_tasks)

    # Record phone_number -> contract_id so calls_v2 can resolve contract_id on sync
    # (Agora's dial API does not echo custom dial_task fields back on call records).
    for t in body.dial_tasks:
        extra = t.model_dump()
        contract_id = extra.get('contract_id')
        phone_number = (extra.get('phone_number') or '').strip()
        if contract_id is None or not phone_number:
            continue
        try:
            contract_id_int = int(contract_id)
        except (TypeError, ValueError):
            continue
        db.add(CallContractLink(
            campaign_id=campaign_id,
            phone_number=phone_number,
            contract_id=contract_id_int,
        ))

    async with httpx.AsyncClient(timeout=15) as client:
        detail = await _fetch_detail(client, campaign_id)

    if detail:
        fields = _fields_from_detail(detail, local)
        if not fields.get('phone_number') and local_phone_number:
            fields['phone_number'] = local_phone_number
    else:
        fields = {
            'campaign_id': campaign_id,
            'campaign_name': body.campaign_name,
            'questionnaire_type': body.questionnaire_type,
            'quota_mode': body.quota_mode,
            'total_numbers': total_numbers,
            'phone_number_id': body.phone_number_id,
            'phone_number': local_phone_number,
            'agent_id': body.agent_id,
            'start_immediately': body.start_immediately,
            'scheduled_start_time': None,  # populated on next sync from Agora detail API
            'enable_transcript': body.enable_transcript,
            'enable_recording': body.enable_recording,
            'status': data.get('status'),
            'created_at': data.get('created_at'),
            'updated_at': data.get('updated_at'),
        }
    fields['total_numbers'] = total_numbers

    record = CampaignV2(**fields)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    out = _serialize(record)
    out['calls_count'] = 0
    return out


@router.get('')
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CampaignV2).order_by(CampaignV2.id.desc()))
    rows = result.scalars().all()
    ids = [r.campaign_id for r in rows]
    counts = await _calls_count_by_campaign_ids(db, ids)
    return [{**_serialize(r), 'calls_count': counts.get(r.campaign_id, 0)} for r in rows]


@router.post('/sync')
async def sync_campaigns(db: AsyncSession = Depends(get_db)):
    """
    列表接口已包含完整字段（end_call_config、structured_output 等），
    直接用列表数据写库，无需再并发拉详情。
    响应结构：{ data: { list: [...] } }
    """
    agora_items: list[dict] = []
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                CAMPAIGN_BASE_URL,
                params={'page': 1, 'page_size': 100},
                headers=_headers(),
            )
            if resp.status_code == 200:
                body = resp.json()
                data = body.get('data', {})
                agora_items = data.get('list', [])
        except Exception:
            pass

    if not agora_items:
        result = await db.execute(select(CampaignV2).order_by(CampaignV2.id.desc()))
        rows = result.scalars().all()
        ids = [r.campaign_id for r in rows]
        counts = await _calls_count_by_campaign_ids(db, ids)
        return [{**_serialize(r), 'calls_count': counts.get(r.campaign_id, 0)} for r in rows]

    existing_result = await db.execute(select(CampaignV2))
    existing: dict[str, CampaignV2] = {r.campaign_id: r for r in existing_result.scalars().all()}

    for item in agora_items:
        cid = item.get('campaign_id')
        if not cid:
            continue
        if cid not in existing:
            db.add(CampaignV2(**_fields_from_detail(item)))
        else:
            rec = existing[cid]
            # 全量更新：列表已有完整字段
            fields = _fields_from_detail(item)
            rec.campaign_name = fields.get('campaign_name') or rec.campaign_name
            if fields.get('total_numbers') is not None:
                rec.total_numbers = fields['total_numbers']
            rec.phone_number_id = fields.get('phone_number_id') or rec.phone_number_id
            rec.phone_number = fields.get('phone_number') or rec.phone_number
            rec.agent_id = fields.get('agent_id') or rec.agent_id
            rec.agent_name = fields.get('agent_name') or rec.agent_name
            rec.start_immediately = fields.get('start_immediately') if fields.get('start_immediately') is not None else rec.start_immediately
            rec.max_call_duration_seconds = fields.get('max_call_duration_seconds') or rec.max_call_duration_seconds
            rec.silence_timeout_seconds = fields.get('silence_timeout_seconds') or rec.silence_timeout_seconds
            rec.end_call_on_silence_timeout = fields.get('end_call_on_silence_timeout') if fields.get('end_call_on_silence_timeout') is not None else rec.end_call_on_silence_timeout
            rec.ring_timeout_seconds = fields.get('ring_timeout_seconds') or rec.ring_timeout_seconds
            rec.end_call_on_user_request = fields.get('end_call_on_user_request') if fields.get('end_call_on_user_request') is not None else rec.end_call_on_user_request
            rec.end_call_on_ai_assistant = fields.get('end_call_on_ai_assistant') if fields.get('end_call_on_ai_assistant') is not None else rec.end_call_on_ai_assistant
            rec.structured_output = fields.get('structured_output') or rec.structured_output
            rec.enable_transcript = fields.get('enable_transcript') if fields.get('enable_transcript') is not None else rec.enable_transcript
            rec.enable_recording = fields.get('enable_recording') if fields.get('enable_recording') is not None else rec.enable_recording
            rec.status = fields.get('status') or rec.status
            rec.updated_at = fields.get('updated_at') or rec.updated_at

    await db.commit()
    result = await db.execute(select(CampaignV2).order_by(CampaignV2.id.desc()))
    rows = result.scalars().all()
    ids = [r.campaign_id for r in rows]
    counts = await _calls_count_by_campaign_ids(db, ids)
    return [{**_serialize(r), 'calls_count': counts.get(r.campaign_id, 0)} for r in rows]


@router.get('/{campaign_id}')
async def get_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    refresh_from_upstream: bool = Query(
        False,
        description='If true, fetch latest fields from Agora then merge into DB (adds ~network RTT).',
    ),
):
    db_result = await db.execute(select(CampaignV2).where(CampaignV2.campaign_id == campaign_id))
    record = db_result.scalar_one_or_none()
    counts = await _calls_count_by_campaign_ids(db, [campaign_id])

    if not refresh_from_upstream:
        if not record:
            raise HTTPException(status_code=404, detail='Campaign not found')
        return {**_serialize(record), 'calls_count': counts.get(campaign_id, 0)}

    async with httpx.AsyncClient(timeout=15) as client:
        detail = await _fetch_detail(client, campaign_id)

    if detail:
        if record:
            fields = _fields_from_detail(detail)
            record.status = fields.get('status') or record.status
            record.updated_at = fields.get('updated_at') or record.updated_at
            record.phone_number = fields.get('phone_number') or record.phone_number
            record.phone_number_id = fields.get('phone_number_id') or record.phone_number_id
            record.agent_id = fields.get('agent_id') or record.agent_id
            record.agent_name = fields.get('agent_name') or record.agent_name
            await db.commit()
            await db.refresh(record)
            return {**_serialize(record), 'calls_count': counts.get(campaign_id, 0)}
        else:
            new_record = CampaignV2(**_fields_from_detail(detail))
            db.add(new_record)
            await db.commit()
            await db.refresh(new_record)
            return {**_serialize(new_record), 'calls_count': counts.get(campaign_id, 0)}

    if not record:
        raise HTTPException(status_code=404, detail='Campaign not found')
    return {**_serialize(record), 'calls_count': counts.get(campaign_id, 0)}


@router.post('/{campaign_id}/interrupt')
async def interrupt_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            f'{CAMPAIGN_BASE_URL}/{campaign_id}',
            json={'status': 'interrupted'},
            headers=_headers(),
        )

    if resp.status_code not in (200, 201, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    db_result = await db.execute(select(CampaignV2).where(CampaignV2.campaign_id == campaign_id))
    record = db_result.scalar_one_or_none()
    if record:
        record.status = 'interrupted'
        await db.commit()

    return {'detail': 'interrupted'}
