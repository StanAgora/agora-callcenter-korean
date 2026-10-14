import base64
import io
import json
import re
from datetime import datetime

from openai import AsyncOpenAI
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.contract_v2 import ContractV2
from app.services.parsers.docx_parser import extract_docx_text

router = APIRouter(prefix='/api/contracts', tags=['contracts'])

FIELD_KEYS = [
    '使用者', '使用場所住所', '部屋番号', '契約プラン', '支払方法', '電話番号',
]


def _extract_pdf_text(file_bytes: bytes, max_chars: int = 8000) -> str:
    import pdfplumber
    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
    return '\n'.join(parts)[:max_chars]


async def _extract_fields(text: str) -> dict:
    if not settings.openai_api_key:
        return {k: None for k in FIELD_KEYS}

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    prompt = (
        '以下の契約書テキストから指定されたフィールドを抽出してください。\n'
        'フィールドが見つからない場合は null を返してください。\n'
        '必ずJSONのみで返答し、説明文は不要です。\n\n'
        f'契約書テキスト:\n{text}\n\n'
        '以下のフィールドを含むJSONを返してください:\n'
        '{\n'
        '  "使用者": "...",\n'
        '  "使用場所住所": "...",\n'
        '  "部屋番号": "...",\n'
        '  "契約プラン": "...",\n'
        '  "支払方法": "...",\n'
        '  "電話番号": "..."\n'
        '}'
    )

    response = await client.chat.completions.create(
        model='gpt-5.4-nano',
        max_completion_tokens=1024,
        messages=[{'role': 'user', 'content': prompt}],
    )

    raw = response.choices[0].message.content or ''
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {k: None for k in FIELD_KEYS}


def _to_db_fields(fields: dict) -> dict:
    return {
        'shiyousha': fields.get('使用者'),
        'shiyou_address': fields.get('使用場所住所'),
        'heya_bangou': fields.get('部屋番号'),
        'keiyaku_plan': fields.get('契約プラン'),
        'shiharai_houhou': fields.get('支払方法'),
        'denwa_bangou': fields.get('電話番号'),
    }


def _serialize(c: ContractV2) -> dict:
    corrections = None
    if c.corrections:
        try:
            corrections = json.loads(c.corrections)
        except json.JSONDecodeError:
            corrections = None
    return {
        'id': c.id,
        'filename': c.filename,
        'file_type': c.file_type,
        'fields': {
            '使用者': c.shiyousha,
            '使用場所住所': c.shiyou_address,
            '部屋番号': c.heya_bangou,
            '契約プラン': c.keiyaku_plan,
            '支払方法': c.shiharai_houhou,
            '電話番号': c.denwa_bangou,
        },
        'corrections': corrections or {},
        'created_at': c.created_at.isoformat() if c.created_at else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post('/parse')
async def parse_contract(file: UploadFile = File(...)):
    """Upload and parse a contract file. Returns extracted fields + file b64 for preview. Does NOT save to DB."""
    filename = file.filename or 'contract'
    lower = filename.lower()

    if lower.endswith('.pdf'):
        file_type = 'pdf'
    elif lower.endswith(('.doc', '.docx')):
        file_type = 'docx'
    else:
        raise HTTPException(status_code=400, detail='PDF または DOC/DOCX ファイルのみ対応しています')

    file_bytes = await file.read()

    if file_type == 'pdf':
        text = _extract_pdf_text(file_bytes)
    else:
        text = extract_docx_text(file_bytes)

    fields = await _extract_fields(text)
    file_b64 = base64.b64encode(file_bytes).decode()

    return {
        'filename': filename,
        'file_type': file_type,
        'file_b64': file_b64,
        'fields': fields,
        'preview_text': text if file_type == 'docx' else None,
    }


class ConfirmRequest(BaseModel):
    filename: str
    file_type: str
    file_b64: str
    fields: dict


@router.post('')
async def confirm_contract(body: ConfirmRequest, db: AsyncSession = Depends(get_db)):
    """Confirm and save a parsed contract to the database."""
    try:
        file_data = base64.b64decode(body.file_b64)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid file data')

    record = ContractV2(
        filename=body.filename,
        file_type=body.file_type,
        file_data=file_data,
        created_at=datetime.utcnow(),
        **_to_db_fields(body.fields),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _serialize(record)


@router.get('')
async def list_contracts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContractV2).order_by(ContractV2.id.desc()))
    return [_serialize(r) for r in result.scalars().all()]


@router.delete('/{contract_id}')
async def delete_contract(contract_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContractV2).where(ContractV2.id == contract_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail='Contract not found')
    await db.delete(record)
    await db.commit()
    return {'detail': 'deleted'}


@router.get('/{contract_id}/file')
async def download_contract(contract_id: int, db: AsyncSession = Depends(get_db)):
    """Return file as base64 for in-browser preview of saved contracts."""
    from fastapi.responses import Response
    result = await db.execute(select(ContractV2).where(ContractV2.id == contract_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail='Contract not found')
    mime = 'application/pdf' if record.file_type == 'pdf' else 'application/octet-stream'
    return Response(content=record.file_data, media_type=mime)
