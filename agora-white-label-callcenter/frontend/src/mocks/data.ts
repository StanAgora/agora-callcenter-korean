import type { Survey, QuotaCell, CallLog, CampaignStats, ActiveCall, QuotaAiSuggestion } from '../types'

export const MOCK_SURVEYS: Survey[] = [
  {
    id: 'survey-001',
    name: 'NBS 113차 기준지표조사',
    type: 'URL',
    status: 'running',
    quotaMode: 'hybrid',
    totalTarget: 1001,
    totalCompleted: 423,
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-10T14:32:00Z',
  },
  {
    id: 'survey-002',
    name: '인천 서구 명칭 변경 인식 조사',
    type: 'CATI',
    status: 'paused',
    quotaMode: 'ai',
    totalTarget: 720,
    totalCompleted: 312,
    createdAt: '2024-03-31T10:00:00Z',
    updatedAt: '2024-03-31T16:20:00Z',
  },
  {
    id: 'survey-003',
    name: '2024 Q1 정치 여론조사',
    type: 'URL',
    status: 'completed',
    quotaMode: 'manual',
    totalTarget: 500,
    totalCompleted: 500,
    createdAt: '2024-01-02T09:00:00Z',
    updatedAt: '2024-01-03T18:00:00Z',
  },
  {
    id: 'survey-004',
    name: '신규 지역 민원 인식 조사',
    type: 'CATI',
    status: 'draft',
    quotaMode: 'manual',
    totalTarget: 300,
    totalCompleted: 0,
    createdAt: '2024-04-01T08:00:00Z',
    updatedAt: '2024-04-01T08:00:00Z',
  },
]

const AREAS = [
  { code: 1, name: '1지역' },
  { code: 2, name: '2지역' },
  { code: 3, name: '3지역' },
]
const GENDERS = [
  { code: 1 as const, name: '남자' },
  { code: 2 as const, name: '여자' },
]
const AGE_GROUPS = [
  { code: 1, name: '18~29세' },
  { code: 2, name: '30~39세' },
  { code: 3, name: '40~49세' },
  { code: 4, name: '50~59세' },
  { code: 5, name: '60~69세' },
  { code: 6, name: '70세 이상' },
]

let cellIdCounter = 1
export const MOCK_QUOTA_CELLS: QuotaCell[] = AREAS.flatMap(area =>
  GENDERS.flatMap(gender =>
    AGE_GROUPS.map(age => {
      const completed = Math.floor(Math.random() * 22)
      const target = 20
      return {
        id: `cell-${cellIdCounter++}`,
        surveyId: 'survey-002',
        area: area.code,
        areaName: area.name,
        gender: gender.code,
        genderName: gender.name,
        ageGroup: age.code,
        ageName: age.name,
        target,
        completed: Math.min(completed, target),
        status: completed >= target ? 'closed' : 'open',
      } as QuotaCell
    })
  )
)

export const MOCK_AI_SUGGESTION: QuotaAiSuggestion = {
  targetPopulation: '인천광역시 서구 거주 만 18세 이상 주민',
  dimensions: {
    area: [
      { code: 1, name: '1지역 (가정동, 신현동, 석남동)' },
      { code: 2, name: '2지역 (연희동, 청라동, 심곡동)' },
      { code: 3, name: '3지역 (원당동, 당하동, 마전동)' },
    ],
    gender: [
      { code: 1, name: '남자' },
      { code: 2, name: '여자' },
    ],
    ageGroup: [
      { code: 1, name: '18~29세', min: 18, max: 29 },
      { code: 2, name: '30~39세', min: 30, max: 39 },
      { code: 3, name: '40~49세', min: 40, max: 49 },
      { code: 4, name: '50~59세', min: 50, max: 59 },
      { code: 5, name: '60~69세', min: 60, max: 69 },
      { code: 6, name: '70세 이상', min: 70, max: 99 },
    ],
  },
  suggestedQuotaPerCell: 20,
  screeningRules: [
    'SQ1: 인천시 서구 거주 여부 확인 (아니오 → 조사 종료)',
    'SQ1-1: 거주 동 확인 (검단구 소속 동 → 조사 종료)',
    'SQ3: 만 18세 미만 → 조사 종료',
  ],
  notes: '분구 후 검단구에 편입될 동 거주자 제외 필요',
}

export const MOCK_STATS: CampaignStats = {
  totalCalled: 487,
  totalSuccess: 312,
  totalRefused: 89,
  totalNoAnswer: 64,
  totalOther: 22,
  successRate: 64.1,
  avgDuration: 187,
  estimatedRemaining: 43,
}

export const MOCK_CALL_LOGS: CallLog[] = Array.from({ length: 20 }, (_, i) => {
  const codes = [0, 0, 0, 4, 5, 0, 8, 0, 4, 0, 0, 5, 0, 3, 0, 0, 9, 0, 5, 0] as const
  const cell = MOCK_QUOTA_CELLS[i % MOCK_QUOTA_CELLS.length]
  const started = new Date(Date.now() - (20 - i) * 90_000)
  const duration = 120 + Math.floor(Math.random() * 180)
  return {
    id: `log-${i + 1}`,
    phone: `070${Math.floor(1000_0000 + Math.random() * 9000_0000)}`,
    quotaCell: { areaName: cell.areaName, genderName: cell.genderName, ageName: cell.ageName },
    startedAt: started.toISOString(),
    endedAt: new Date(started.getTime() + duration * 1000).toISOString(),
    duration,
    resultCode: codes[i],
    responses: codes[i] === 0 ? { Q1: 3, Q2: 2, Q3: 1 } : undefined,
  }
})

export const MOCK_ACTIVE_CALLS: ActiveCall[] = [
  {
    callId: 'call-live-1',
    phone: '07012345678',
    quotaCell: { areaName: '2지역', genderName: '여자', ageName: '40~49세' },
    startedAt: new Date(Date.now() - 95_000).toISOString(),
    transcript: [
      { speaker: 'agent', text: '안녕하세요. 엠브레인리서치 면접원입니다. 잠시 여론조사에 참여해 주시겠습니까?', timestamp: new Date(Date.now() - 94_000).toISOString() },
      { speaker: 'respondent', text: '네, 말씀하세요.', timestamp: new Date(Date.now() - 88_000).toISOString() },
      { speaker: 'agent', text: '현재 인천시 서구에 거주하고 계십니까?', timestamp: new Date(Date.now() - 85_000).toISOString() },
      { speaker: 'respondent', text: '네, 연희동에 살고 있어요.', timestamp: new Date(Date.now() - 78_000).toISOString() },
      { speaker: 'agent', text: '서구와 검단구로 분구된다는 내용 들어보신 적 있으십니까?', timestamp: new Date(Date.now() - 72_000).toISOString() },
      { speaker: 'respondent', text: '아, 뉴스에서 본 것 같아요. 자세히는 모르겠어요.', timestamp: new Date(Date.now() - 60_000).toISOString() },
    ],
  },
  {
    callId: 'call-live-2',
    phone: '07087654321',
    quotaCell: { areaName: '1지역', genderName: '남자', ageName: '30~39세' },
    startedAt: new Date(Date.now() - 42_000).toISOString(),
    transcript: [
      { speaker: 'agent', text: '안녕하세요. 여론조사 협조 부탁드립니다.', timestamp: new Date(Date.now() - 41_000).toISOString() },
      { speaker: 'respondent', text: '얼마나 걸려요?', timestamp: new Date(Date.now() - 35_000).toISOString() },
      { speaker: 'agent', text: '약 3분 정도입니다.', timestamp: new Date(Date.now() - 30_000).toISOString() },
    ],
  },
]
