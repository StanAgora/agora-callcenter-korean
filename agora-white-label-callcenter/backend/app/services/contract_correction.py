"""
Post-call contract-field correction: read the call transcript with OpenAI and detect whether
the customer corrected any of the 5 confirmed contract fields (e.g. gave a different room
number than what's on file). Confirmed corrections are stored on contract_v2.corrections
alongside the original value so the UI can show both (original struck through, corrected below).
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.calls_v2 import CallV2
from app.models.contract_v2 import ContractV2
from app.services.quota_transcript_eval import transcript_to_text

logger = logging.getLogger(__name__)

# The 5 confirmed fields (excludes 電話番号: matching key, not something corrected mid-call)
CORRECTION_FIELD_KEYS = ['使用者', '使用場所住所', '部屋番号', '契約プラン', '支払方法']


def _contract_fields(contract: ContractV2) -> dict[str, str | None]:
    return {
        '使用者': contract.shiyousha,
        '使用場所住所': contract.shiyou_address,
        '部屋番号': contract.heya_bangou,
        '契約プラン': contract.keiyaku_plan,
        '支払方法': contract.shiharai_houhou,
    }


async def _extract_corrections(transcript_text: str, original_fields: dict[str, str | None]) -> dict:
    if not settings.openai_api_key:
        return {}

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=60.0, max_retries=1)
    prompt = (
        'あなたは通話内容の確認担当です。以下は顧客に契約情報を確認する通話の書き起こしです。\n'
        '現在登録されている契約情報（元の値）と対話内容を照らし合わせ、'
        '顧客が元の値と異なる内容を口頭で訂正・提供したフィールドのみを特定してください。\n\n'
        f'元の契約情報:\n{json.dumps(original_fields, ensure_ascii=False)}\n\n'
        f'通話書き起こし:\n{transcript_text}\n\n'
        '訂正が確認できたフィールドのみを含むJSONオブジェクトを返してください（キーはフィールド名、値は訂正後の新しい値）。\n'
        '訂正がない、または通話内容から明確に判断できない場合はそのフィールドを含めないでください。\n'
        '対象フィールド: 使用者, 使用場所住所, 部屋番号, 契約プラン, 支払方法\n'
        '必ずJSONのみで返答し、説明文は不要です。例: {"部屋番号": "203号室"}'
    )

    response = await client.chat.completions.create(
        model='gpt-5.4-nano',
        max_completion_tokens=512,
        messages=[{'role': 'user', 'content': prompt}],
    )

    raw = response.choices[0].message.content or ''
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group())
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {k: v for k, v in parsed.items() if k in CORRECTION_FIELD_KEYS and v}


def _apply_corrections(
    contract: ContractV2,
    corrections: dict[str, str],
    original_fields: dict[str, str | None],
    call_id: str,
) -> None:
    prev: dict = {}
    if contract.corrections:
        try:
            loaded = json.loads(contract.corrections)
            if isinstance(loaded, dict):
                prev = loaded
        except Exception:
            prev = {}

    now = datetime.now(timezone.utc).isoformat()
    for field, new_value in corrections.items():
        original_value = original_fields.get(field)
        if new_value == original_value:
            continue
        prev[field] = {
            'original': original_value,
            'corrected': new_value,
            'call_id': call_id,
            'corrected_at': now,
        }

    contract.corrections = json.dumps(prev, ensure_ascii=False)


async def process_pending_corrections(db: AsyncSession, *, limit: int = 100) -> dict:
    """Find calls with a linked contract whose transcript is ready but not yet checked for
    corrections; extract + persist any confirmed field corrections."""
    q = (
        select(CallV2)
        .where(
            CallV2.contract_id.is_not(None),
            CallV2.correction_checked.is_(False),
        )
        .order_by(CallV2.id.asc())
        .limit(limit)
    )
    pending = (await db.execute(q)).scalars().all()
    if not pending:
        return {'processed': 0, 'items': []}

    contract_ids = [c.contract_id for c in pending if c.contract_id is not None]
    contracts_result = await db.execute(select(ContractV2).where(ContractV2.id.in_(contract_ids)))
    contracts_by_id = {c.id: c for c in contracts_result.scalars().all()}

    items: list[dict] = []
    for call in pending:
        # Wait until the call has actually ended before checking — transcript may still be
        # arriving mid-call. No call_category is skipped: any call with a usable transcript
        # (regardless of how it ended) is checked for spoken corrections.
        if call.end_ts is None:
            continue

        contract = contracts_by_id.get(call.contract_id)
        if contract is None:
            call.correction_checked = True
            items.append({'call_id': call.call_id, 'result': 'skipped', 'reason': 'contract_not_found'})
            continue

        ttext = transcript_to_text(call.transcript)
        if not ttext.strip():
            call.correction_checked = True
            items.append({'call_id': call.call_id, 'result': 'skipped', 'reason': 'empty_transcript'})
            continue

        original_fields = _contract_fields(contract)
        try:
            corrections = await _extract_corrections(ttext, original_fields)
        except Exception as exc:  # noqa: BLE001
            logger.warning('contract correction extraction failed for %s: %s', call.call_id, exc)
            items.append({'call_id': call.call_id, 'result': 'error_retry', 'error': str(exc)[:500]})
            continue

        call.correction_checked = True
        if corrections:
            _apply_corrections(contract, corrections, original_fields, call.call_id)
            items.append({'call_id': call.call_id, 'result': 'corrected', 'fields': list(corrections.keys())})
        else:
            items.append({'call_id': call.call_id, 'result': 'no_correction'})

    await db.commit()
    return {'processed': len(items), 'items': items}
