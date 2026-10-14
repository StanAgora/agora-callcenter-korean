"""
契約変数（漢字）を TTS 向けの仮名読み上げ表現へ変換する隠しサービス。

Campaign 作成時に dial_tasks の room_number_reading・service_address_reading のみを
ここで仮名化してから Agora へ転送する（誤読リスクが高い数字・地名に限定。
user_name・plan_name・payment_method などは対象外）。

Agora Engine は template_variables のキーを ASCII に限定するため、dial_task の
フィールド名は日本語ではなく ASCII のキー（user_name, service_address_reading,
room_number_reading, plan_name, payment_method）で渡される。
"""
from __future__ import annotations

import asyncio
import logging

from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

# 東京都23区の読み（強制変換表。推測に頼らない）
TOKYO_WARD_READINGS: dict[str, str] = {
    '千代田区': 'ちよだく', '中央区': 'ちゅうおうく', '港区': 'みなとく',
    '新宿区': 'しんじゅくく', '文京区': 'ぶんきょうく', '台東区': 'たいとうく',
    '墨田区': 'すみだく', '江東区': 'こうとうく', '品川区': 'しながわく',
    '目黒区': 'めぐろく', '大田区': 'おおたく', '世田谷区': 'せたがやく',
    '渋谷区': 'しぶやく', '中野区': 'なかのく', '杉並区': 'すぎなみく',
    '豊島区': 'としまく', '北区': 'きたく', '荒川区': 'あらかわく',
    '板橋区': 'いたばしく', '練馬区': 'ねりまく', '足立区': 'あだちく',
    '葛飾区': 'かつしかく', '江戸川区': 'えどがわく',
}

_ROOM_DIGIT_READINGS = {
    '0': 'まる', '1': 'いち', '2': 'に', '3': 'さん', '4': 'よん',
    '5': 'ご', '6': 'ろく', '7': 'なな', '8': 'はち', '9': 'きゅう',
}

# dial_task の中で仮名変換の対象になるフィールド（room_number_reading・service_address_reading のみ）
ADDRESS_KEY = 'service_address_reading'
ROOM_KEY = 'room_number_reading'

_ADDRESS_REMAINDER_SYSTEM_PROMPT = """あなたは日本語住所の読み上げ変換器です。
入力される文字列は、東京都の区名より後ろの「町名・丁目・番地・号」部分です。これをTTS向けの自然な読み上げ仮名表現に変換してください。

ルール：
- 出力は仮名（ひらがな）のみ。漢字を残さない。
- 単位の境目には読点（、）を入れる。
- ハイフンは記号として読まず、番地の区切りとして「の」と読む。例: 「5丁目14-7」→「ごちょうめ、じゅうよんのなな」
- 丁目の数字は文脈に合わせて自然に読む（1丁目は「いっちょうめ」など促音に注意）。
- 既知の誤読に注意する。例: 桜新町は「さくらしんまち」（「さくらしんちょう」ではない）。
- 説明・漢字・括弧書きを一切出力せず、仮名の読み上げ文字列だけを返す。
"""


def _client() -> AsyncOpenAI | None:
    if not settings.openai_api_key:
        return None
    return AsyncOpenAI(api_key=settings.openai_api_key)


def convert_room_number(raw: str | None) -> str | None:
    """部屋番号は各桁を1文字ずつ仮名へ変換する。0は常に「まる」。桁数・先頭ゼロは保持する。"""
    if not raw:
        return raw
    body = raw.strip()
    suffix = ''
    if body.endswith('号室'):
        body = body[:-2]
        suffix = 'ごうしつ'
    digits = [c for c in body if c.isdigit()]
    if not digits:
        return raw
    reading = '、'.join(_ROOM_DIGIT_READINGS[d] for d in digits)
    return f'{reading}、{suffix}' if suffix else reading


def _split_tokyo_ward(address: str) -> tuple[str, str] | None:
    """「東京都+23区名+残り」を検出し、(区の読み, 残り) を返す。該当しなければ None。"""
    if not address.startswith('東京都'):
        return None
    rest = address[len('東京都'):]
    for ward, reading in TOKYO_WARD_READINGS.items():
        if rest.startswith(ward):
            return reading, rest[len(ward):]
    return None


async def _chat_text(system_prompt: str, user_content: str) -> str | None:
    client = _client()
    if client is None:
        return None
    try:
        response = await client.chat.completions.create(
            model='gpt-5.4-nano',
            max_completion_tokens=256,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_content},
            ],
        )
        text = (response.choices[0].message.content or '').strip()
        return text or None
    except Exception:
        logger.exception('kana reading LLM call failed')
        return None


async def convert_address(raw: str | None) -> str | None:
    """使用場所住所を仮名読みへ変換する。東京都23区名は強制変換表を使い、
    町名・丁目・番地・号はLLMで生成する。"""
    if not raw:
        return raw
    split = _split_tokyo_ward(raw)
    if split is None:
        reading = await _chat_text(_ADDRESS_REMAINDER_SYSTEM_PROMPT, raw)
        return reading or raw
    ward_reading, remainder = split
    if not remainder:
        return f'とうきょうと、{ward_reading}'
    remainder_reading = await _chat_text(_ADDRESS_REMAINDER_SYSTEM_PROMPT, remainder)
    if not remainder_reading:
        return f'とうきょうと、{ward_reading}'
    return f'とうきょうと、{ward_reading}、{remainder_reading}'


async def convert_dial_task_fields(fields: dict) -> dict:
    """dial_task のフィールドを仮名読みへ置き換える。対象は room_number_reading・service_address_reading のみ。
    user_name・plan_name・payment_method など他のフィールドや phone_number・contract_id は変更しない。"""
    out = dict(fields)

    if ROOM_KEY in out:
        out[ROOM_KEY] = convert_room_number(out.get(ROOM_KEY))

    if ADDRESS_KEY in out:
        out[ADDRESS_KEY] = await convert_address(out[ADDRESS_KEY])

    return out


async def convert_dial_tasks(tasks: list[dict]) -> list[dict]:
    """複数の dial_task を並行して仮名変換する。"""
    return list(await asyncio.gather(*(convert_dial_task_fields(t) for t in tasks)))
