import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.phone_number_v2 import PhoneNumberV2

router = APIRouter(prefix='/api/phone-numbers', tags=['phone-numbers'])

PHONE_NUMBER_BASE_URL = f'{settings.agora_conversational_base_url}/phone-numbers'


def _headers() -> dict:
    return {
        'Authorization': f'Basic {settings.agora_conversational_api_key}',
        'Content-Type': 'application/json',
    }


def _extract_list(body: dict) -> list[dict]:
    """兼容 Agora 列表响应的多种 data 结构。"""
    data = body.get('data')
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        # { "list": [...], "total": N } 形式
        items = data.get('list') or data.get('items') or data.get('phone_numbers') or []
        if isinstance(items, list):
            return items
    return []


class CreatePhoneNumberRequest(BaseModel):
    name: str
    phone_number: str
    type: str = 'sip_trunk'
    sip_gateway_host: str | None = None
    sip_signaling_port: int | None = None
    outbound_protocol: str | None = None


def _serialize(p: PhoneNumberV2) -> dict:
    return {
        'id': p.id,
        'number_id': p.number_id,
        'name': p.name,
        'phone_number': p.phone_number,
        'type': p.type,
        'sip_gateway_host': p.sip_gateway_host,
        'sip_signaling_port': p.sip_signaling_port,
        'outbound_protocol': p.outbound_protocol,
        'created_at': p.created_at,
        'updated_at': p.updated_at,
    }


@router.post('')
async def create_phone_number(body: CreatePhoneNumberRequest, db: AsyncSession = Depends(get_db)):
    payload = body.model_dump(exclude_none=True)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(PHONE_NUMBER_BASE_URL, json=payload, headers=_headers())
    except httpx.ConnectTimeout:
        raise HTTPException(status_code=504, detail='Connection to Agora API timed out. Check network / VPN.')
    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail=f'Agora API request timed out: {e}')
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f'Failed to reach Agora API: {e}')

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    result = resp.json()
    code = result.get('code') if 'code' in result else result.get('reason')
    if code not in (0, '0'):
        raise HTTPException(status_code=400, detail=result.get('message', result.get('detail', 'Agora API error')))

    data = result['data']
    record = PhoneNumberV2(
        number_id=str(data['number_id']),
        name=data['name'],
        phone_number=data['phone_number'],
        type=data['type'],
        sip_gateway_host=data.get('sip_gateway_host'),
        sip_signaling_port=data.get('sip_signaling_port'),
        outbound_protocol=data.get('outbound_protocol'),
        created_at=data.get('created_at'),
        updated_at=data.get('updated_at'),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _serialize(record)


@router.get('')
async def list_phone_numbers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PhoneNumberV2).order_by(PhoneNumberV2.id.desc()))
    records = result.scalars().all()
    return [_serialize(r) for r in records]


@router.post('/sync')
async def sync_phone_numbers(db: AsyncSession = Depends(get_db)):
    """从 Agora API 拉取全量列表，把数据库中没有的记录写入，返回合并后的完整列表。"""
    agora_items: list[dict] = []
    page = 1
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            try:
                resp = await client.get(
                    PHONE_NUMBER_BASE_URL,
                    params={'page': page, 'page_size': 100},
                    headers=_headers(),
                )
                if resp.status_code != 200:
                    break
                body = resp.json()
                items = _extract_list(body)
                agora_items.extend(items)
                if len(items) < 100:
                    break
                page += 1
            except Exception:
                break

    if agora_items:
        for item in agora_items:
            nid = str(item.get('number_id', '')) if item.get('number_id') is not None else None
            if not nid:
                continue
            stmt = pg_insert(PhoneNumberV2).values(
                number_id=nid,
                name=item.get('name', ''),
                phone_number=item.get('phone_number', ''),
                type=item.get('type', ''),
                sip_gateway_host=item.get('sip_gateway_host'),
                sip_signaling_port=item.get('sip_signaling_port'),
                outbound_protocol=item.get('outbound_protocol'),
                created_at=item.get('created_at'),
                updated_at=item.get('updated_at'),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=['number_id'],
                set_={k: stmt.excluded[k] for k in (
                    'name', 'phone_number', 'type', 'sip_gateway_host',
                    'sip_signaling_port', 'outbound_protocol', 'updated_at',
                )},
            )
            await db.execute(stmt)
        await db.commit()

    result = await db.execute(select(PhoneNumberV2).order_by(PhoneNumberV2.id.desc()))
    return [_serialize(r) for r in result.scalars().all()]


@router.get('/{number_id}')
async def get_phone_number(number_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PhoneNumberV2).where(PhoneNumberV2.number_id == number_id)
    )
    record = result.scalar_one_or_none()

    if record:
        return _serialize(record)

    # 数据库没有则请求 Agora API
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f'{PHONE_NUMBER_BASE_URL}/{number_id}', headers=_headers())

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail='Phone number not found')
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    result_json = resp.json()
    data = result_json.get('data', {})
    new_record = PhoneNumberV2(
        number_id=str(data['number_id']),
        name=data['name'],
        phone_number=data['phone_number'],
        type=data['type'],
        sip_gateway_host=data.get('sip_gateway_host'),
        sip_signaling_port=data.get('sip_signaling_port'),
        outbound_protocol=data.get('outbound_protocol'),
        created_at=data.get('created_at'),
        updated_at=data.get('updated_at'),
    )
    db.add(new_record)
    await db.commit()
    await db.refresh(new_record)
    return _serialize(new_record)


@router.get('/debug/agora-raw')
async def debug_agora_raw():
    """直接返回 Agora API 的原始响应，用于排查 sync 问题。"""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            PHONE_NUMBER_BASE_URL,
            params={'page': 1, 'page_size': 20},
            headers=_headers(),
        )
    return {'status_code': resp.status_code, 'body': resp.json() if resp.content else None}


@router.delete('/{number_id}')
async def delete_phone_number(number_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PhoneNumberV2).where(PhoneNumberV2.number_id == number_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail='Phone number not found')

    # 调用 Agora API 删除远端记录
    async with httpx.AsyncClient(timeout=15) as client:
        agora_resp = await client.delete(
            f'{PHONE_NUMBER_BASE_URL}/{number_id}',
            headers=_headers(),
        )
    if agora_resp.status_code not in (200, 204, 404):
        raise HTTPException(
            status_code=agora_resp.status_code,
            detail=f'Agora API error: {agora_resp.text}',
        )

    await db.delete(record)
    await db.commit()
    return {'detail': 'deleted'}
