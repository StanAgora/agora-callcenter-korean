"""
임시 시드 데이터 생성 스크립트
실행: cd backend && python seed.py
"""
import asyncio, uuid, json
from datetime import datetime, timedelta
from app.core.database import async_session_factory, init_db
from app.models.survey import Survey, SurveyType, SurveyStatus, QuotaMode
from app.models.quota import QuotaCell, QuotaCellStatus

AREAS   = [(1,'서울'), (2,'경기'), (3,'인천'), (4,'부산')]
GENDERS = [(1,'남성'), (2,'여성')]
AGES    = [(1,'19-29세'), (2,'30-39세'), (3,'40-49세'), (4,'50-59세'), (5,'60세 이상')]

def make_cells(survey_id, target_per_cell, fill_ratio):
    cells = []
    for a_code, a_name in AREAS:
        for g_code, g_name in GENDERS:
            for age_code, age_name in AGES:
                completed = int(target_per_cell * fill_ratio)
                if fill_ratio >= 1.0:
                    completed = target_per_cell
                status = QuotaCellStatus.closed if completed >= target_per_cell else QuotaCellStatus.open
                cells.append(QuotaCell(
                    id=str(uuid.uuid4()),
                    survey_id=survey_id,
                    area=a_code, area_name=a_name,
                    gender=g_code, gender_name=g_name,
                    age_group=age_code, age_name=age_name,
                    target=target_per_cell,
                    completed=completed,
                    status=status,
                ))
    return cells


# ── Mock Voice Agent Prompts ──────────────────────────────────────────────────

PROMPT_POLITICS = """[시스템 역할]
당신은 전문 전화 여론조사 면접원 AI입니다. 아래 지침에 따라 응답자와 자연스럽게 대화하며 조사를 진행하세요.

[조사 기본 정보]
- 조사명: 2026 상반기 정치 현안 인식조사
- 의뢰기관: NBS 리서치
- 조사 목적: 국민의 정치 현안 인식 및 정당 지지도 파악

[면접 지침]
1. 항상 정중하고 중립적인 어조를 유지하세요.
2. 응답자가 모르겠다고 하면 "모르겠다"도 유효한 응답임을 안내하세요.
3. 유도 질문을 하지 마세요.
4. 한 번에 한 질문만 하세요.
5. 조사 소요 시간은 약 3분임을 안내하세요.

[스크리닝 질문]
SQ1. 안녕하세요. 저는 NBS 리서치 면접원입니다. 현재 대한민국에 거주하고 계십니까?
→ 아니오: 조사 종료 ("감사합니다. 조사 대상이 아니십니다.")

SQ2. 만 19세 이상이십니까?
→ 아니오: 조사 종료

SQ3. 현재 거주하시는 지역이 어디십니까? (서울/경기/인천/부산 중 선택)
→ 해당 없음: 조사 종료

[본 설문 진행]
Q1. 현재 대통령의 직무 수행에 대해 어떻게 평가하십니까?
    1) 매우 잘하고 있다  2) 잘하고 있는 편이다  3) 잘 못하고 있는 편이다  4) 매우 잘 못하고 있다  9) 모르겠다/무응답

Q2. 현재 가장 지지하는 정당은 어디입니까?
    1) 국민의힘  2) 더불어민주당  3) 조국혁신당  4) 개혁신당  5) 기타정당  6) 지지정당 없음  9) 모르겠다/무응답

Q3. 현재 우리나라에서 가장 시급하게 해결해야 할 문제는 무엇이라고 생각하십니까?
    1) 경제/물가  2) 일자리/취업  3) 주택/부동산  4) 의료/복지  5) 안보/외교  6) 정치개혁  7) 기타  9) 모르겠다/무응답

Q4. 다음 선거에서 반드시 투표할 의향이 있으십니까?
    1) 반드시 투표할 것이다  2) 투표할 것 같다  3) 투표 안 할 것 같다  4) 반드시 투표하지 않을 것이다  9) 모르겠다/무응답

[마무리]
"소중한 시간 내주셔서 감사합니다. 조사에 참여해 주셔서 감사합니다. 좋은 하루 되세요."
"""

SCHEMA_POLITICS = {
    "SQ3": {
        "type": "integer|null",
        "description": "응답자 거주 지역",
        "codes": {"1": "서울", "2": "경기", "3": "인천", "4": "부산", "9": "무응답"}
    },
    "Q1": {
        "type": "integer|null",
        "description": "대통령 직무수행 평가",
        "codes": {"1": "매우 잘하고 있다", "2": "잘하고 있는 편이다", "3": "잘 못하고 있는 편이다", "4": "매우 잘 못하고 있다", "9": "모르겠다/무응답"}
    },
    "Q2": {
        "type": "integer|null",
        "description": "지지 정당",
        "codes": {"1": "국민의힘", "2": "더불어민주당", "3": "조국혁신당", "4": "개혁신당", "5": "기타정당", "6": "지지정당 없음", "9": "모르겠다/무응답"}
    },
    "Q3": {
        "type": "integer|null",
        "description": "가장 시급한 국가 문제",
        "codes": {"1": "경제/물가", "2": "일자리/취업", "3": "주택/부동산", "4": "의료/복지", "5": "안보/외교", "6": "정치개혁", "7": "기타", "9": "모르겠다/무응답"}
    },
    "Q4": {
        "type": "integer|null",
        "description": "다음 선거 투표 의향",
        "codes": {"1": "반드시 투표", "2": "투표할 것 같다", "3": "투표 안 할 것 같다", "4": "반드시 투표 안 함", "9": "모르겠다/무응답"}
    },
}

PROMPT_INCHEON = """[시스템 역할]
당신은 전문 전화 여론조사 면접원 AI입니다. 인천 서구 분구 관련 주민 인식 조사를 수행합니다.

[조사 기본 정보]
- 조사명: 인천 서구 지역 여론조사
- 의뢰기관: 인천광역시
- 조사 목적: 서구-검단구 분구에 대한 주민 인식 및 명칭 선호도 파악

[스크리닝 질문]
SQ1. 안녕하세요. 현재 인천광역시 서구에 거주하고 계십니까?
→ 아니오: 조사 종료

SQ2. 혹시 검단구로 편입 예정인 동(원당동, 당하동, 마전동, 불로동, 모래내로 등)에 거주하고 계십니까?
→ 예: 조사 종료 (검단구 예정 지역 제외)

SQ3. 만 18세 이상이십니까?
→ 아니오: 조사 종료

[본 설문 진행]
Q1. 인천 서구와 검단구로 분구된다는 사실을 알고 계십니까?
    1) 잘 알고 있다  2) 들어본 적 있다  3) 처음 듣는다  9) 무응답

Q2. 분구 이후 서구가 새로운 명칭으로 바뀌어야 한다고 생각하십니까?
    1) 반드시 바뀌어야 한다  2) 바뀌는 것이 좋다  3) 현재 명칭 유지  4) 잘 모르겠다  9) 무응답

Q3. 새 명칭으로 어느 것이 가장 적합하다고 생각하십니까?
    1) 서인천구  2) 서해구  3) 미추홀서구  4) 기타  9) 무응답/해당없음

Q4. 현재 서구의 행정 서비스(민원, 복지, 교통 등)에 전반적으로 얼마나 만족하십니까?
    1) 매우 만족  2) 만족  3) 보통  4) 불만족  5) 매우 불만족  9) 무응답

Q5. 분구 후 행정 서비스가 개선될 것이라고 기대하십니까?
    1) 매우 기대된다  2) 기대되는 편이다  3) 별로 기대되지 않는다  4) 전혀 기대되지 않는다  9) 무응답

[마무리]
"인천 서구 발전을 위한 소중한 의견 감사합니다."
"""

SCHEMA_INCHEON = {
    "Q1": {
        "type": "integer|null",
        "description": "분구 사실 인지도",
        "codes": {"1": "잘 알고 있다", "2": "들어본 적 있다", "3": "처음 듣는다", "9": "무응답"}
    },
    "Q2": {
        "type": "integer|null",
        "description": "분구 후 명칭 변경 필요성",
        "codes": {"1": "반드시 바뀌어야 한다", "2": "바뀌는 것이 좋다", "3": "현재 명칭 유지", "4": "잘 모르겠다", "9": "무응답"}
    },
    "Q3": {
        "type": "integer|null",
        "description": "선호하는 새 명칭",
        "codes": {"1": "서인천구", "2": "서해구", "3": "미추홀서구", "4": "기타", "9": "무응답/해당없음"}
    },
    "Q4": {
        "type": "integer|null",
        "description": "현재 행정 서비스 만족도",
        "codes": {"1": "매우 만족", "2": "만족", "3": "보통", "4": "불만족", "5": "매우 불만족", "9": "무응답"}
    },
    "Q5": {
        "type": "integer|null",
        "description": "분구 후 행정 서비스 개선 기대",
        "codes": {"1": "매우 기대된다", "2": "기대되는 편이다", "3": "별로 기대되지 않는다", "4": "전혀 기대되지 않는다", "9": "무응답"}
    },
}

PROMPT_CONSUMER = """[시스템 역할]
당신은 전문 전화 여론조사 면접원 AI입니다. 수도권 소비자 신뢰지수 조사를 수행합니다.

[조사 기본 정보]
- 조사명: 수도권 소비자 신뢰지수 조사
- 의뢰기관: 한국경제연구원
- 조사 목적: 수도권 소비자의 경기 인식 및 소비 심리 파악

[스크리닝 질문]
SQ1. 안녕하세요. 현재 서울, 경기, 인천 중 한 곳에 거주하고 계십니까?
→ 아니오: 조사 종료

SQ2. 만 19세 이상이십니까?
→ 아니오: 조사 종료

[본 설문 진행]
Q1. 현재 우리나라 전반적인 경기 상황을 어떻게 평가하십니까?
    1) 매우 좋다  2) 좋은 편이다  3) 보통이다  4) 나쁜 편이다  5) 매우 나쁘다  9) 모르겠다/무응답

Q2. 6개월 후 경기 상황은 지금보다 어떻게 변할 것이라고 생각하십니까?
    1) 크게 좋아질 것이다  2) 다소 좋아질 것이다  3) 비슷할 것이다  4) 다소 나빠질 것이다  5) 크게 나빠질 것이다  9) 모르겠다/무응답

Q3. 앞으로 3개월간 가구의 소비 지출은 현재 대비 어떻게 하실 계획입니까?
    1) 크게 늘릴 것이다  2) 다소 늘릴 것이다  3) 비슷하게 유지  4) 다소 줄일 것이다  5) 크게 줄일 것이다  9) 무응답

Q4. 현재 가계 경제에 가장 큰 부담 요인은 무엇입니까?
    1) 물가 상승  2) 금리/대출 이자  3) 주거비  4) 의료비  5) 교육비  6) 기타  9) 무응답

Q5. 현재 가구의 월 평균 소득 구간은 어디에 해당하십니까?
    1) 200만원 미만  2) 200~400만원  3) 400~600만원  4) 600~800만원  5) 800만원 이상  9) 응답 거부

[마무리]
"귀중한 의견 주셔서 감사합니다. 조사 결과는 정책 연구에 활용됩니다."
"""

SCHEMA_CONSUMER = {
    "Q1": {
        "type": "integer|null",
        "description": "현재 경기 상황 평가",
        "codes": {"1": "매우 좋다", "2": "좋은 편이다", "3": "보통이다", "4": "나쁜 편이다", "5": "매우 나쁘다", "9": "모르겠다/무응답"}
    },
    "Q2": {
        "type": "integer|null",
        "description": "6개월 후 경기 전망",
        "codes": {"1": "크게 좋아질 것", "2": "다소 좋아질 것", "3": "비슷할 것", "4": "다소 나빠질 것", "5": "크게 나빠질 것", "9": "모르겠다/무응답"}
    },
    "Q3": {
        "type": "integer|null",
        "description": "향후 3개월 소비 지출 계획",
        "codes": {"1": "크게 늘림", "2": "다소 늘림", "3": "비슷하게 유지", "4": "다소 줄임", "5": "크게 줄임", "9": "무응답"}
    },
    "Q4": {
        "type": "integer|null",
        "description": "가계 경제 최대 부담 요인",
        "codes": {"1": "물가 상승", "2": "금리/대출 이자", "3": "주거비", "4": "의료비", "5": "교육비", "6": "기타", "9": "무응답"}
    },
    "Q5": {
        "type": "integer|null",
        "description": "월 평균 가구 소득 구간",
        "codes": {"1": "200만원 미만", "2": "200~400만원", "3": "400~600만원", "4": "600~800만원", "5": "800만원 이상", "9": "응답 거부"}
    },
}


SEEDS = [
    dict(
        name='[완료] 2026 상반기 정치 현안 인식조사',
        type=SurveyType.CATI,
        status=SurveyStatus.completed,
        quota_mode=QuotaMode.hybrid,
        target=30, fill=1.0,
        offset_days=10,
        prompt=PROMPT_POLITICS,
        schema=SCHEMA_POLITICS,
    ),
    dict(
        name='[진행중] 인천 서구 지역 여론조사',
        type=SurveyType.CATI,
        status=SurveyStatus.running,
        quota_mode=QuotaMode.ai,
        target=25, fill=0.62,
        offset_days=2,
        prompt=PROMPT_INCHEON,
        schema=SCHEMA_INCHEON,
    ),
    dict(
        name='[일시정지] 수도권 소비자 신뢰지수 조사',
        type=SurveyType.CATI,
        status=SurveyStatus.paused,
        quota_mode=QuotaMode.hybrid,
        target=20, fill=0.35,
        offset_days=5,
        prompt=PROMPT_CONSUMER,
        schema=SCHEMA_CONSUMER,
    ),
    dict(
        name='[초안] 부산 광역시 행정 만족도 조사',
        type=SurveyType.CATI,
        status=SurveyStatus.draft,
        quota_mode=QuotaMode.manual,
        target=30, fill=0.0,
        offset_days=1,
        prompt=None,
        schema=None,
    ),
]

async def main():
    await init_db()
    async with async_session_factory() as db:
        async with db.begin():
            for s in SEEDS:
                sid = str(uuid.uuid4())
                survey = Survey(
                    id=sid,
                    name=s['name'],
                    type=s['type'],
                    status=s['status'],
                    quota_mode=s['quota_mode'],
                    created_at=datetime.utcnow() - timedelta(days=s['offset_days']),
                    updated_at=datetime.utcnow(),
                    voice_agent_prompt=s['prompt'],
                    structured_output_schema=json.dumps(s['schema'], ensure_ascii=False) if s['schema'] else None,
                )
                db.add(survey)
                for cell in make_cells(sid, s['target'], s['fill']):
                    db.add(cell)
    print(f'✓ {len(SEEDS)}개 시드 데이터 생성 완료 (prompt + schema 포함)')

asyncio.run(main())
