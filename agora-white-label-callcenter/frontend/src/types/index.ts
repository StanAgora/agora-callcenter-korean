// ── Survey ──────────────────────────────────────────────────────
export type SurveyType = 'CATI' | 'URL'
export type SurveyStatus = 'draft' | 'running' | 'paused' | 'completed'
export type QuotaMode = 'manual' | 'ai' | 'hybrid'

export interface Survey {
  id: string
  name: string
  type: SurveyType
  status: SurveyStatus
  quotaMode: QuotaMode
  totalTarget: number
  totalCompleted: number
  createdAt: string
  updatedAt: string
}

// ── Quota ────────────────────────────────────────────────────────
export type QuotaCellStatus = 'open' | 'closed'

export interface QuotaCell {
  id: string
  surveyId: string
  area: number
  areaName: string
  gender: 1 | 2
  genderName: string
  ageGroup: number
  ageName: string
  target: number
  completed: number
  status: QuotaCellStatus
}

export interface QuotaAiSuggestion {
  targetPopulation: string
  dimensions: {
    area: { code: number; name: string }[]
    gender: { code: number; name: string }[]
    ageGroup: { code: number; name: string; min: number; max: number }[]
  }
  suggestedQuotaPerCell: number
  screeningRules: string[]
  notes: string
}

// ── Call ─────────────────────────────────────────────────────────
export type CallResultCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export type CallStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'quota_full' | 'ineligible'

export const CALL_RESULT_LABELS: Record<number, string> = {
  0: '조사성공',
  1: '결번',
  2: '기업체/FAX',
  3: '강력거절',
  4: '거절',
  5: '비수신',
  6: '통화중',
  7: '대상아님',
  8: '쿼터오버',
  9: '중도포기',
  10: '기타',
}

export interface TranscriptLine {
  speaker: 'agent' | 'respondent'
  text: string
  timestamp: string
}

export interface ActiveCall {
  callId: string
  phone: string
  quotaCell: Pick<QuotaCell, 'areaName' | 'genderName' | 'ageName'>
  startedAt: string
  transcript: TranscriptLine[]
}

export interface CallLog {
  id: string
  phone: string
  quotaCell: Pick<QuotaCell, 'areaName' | 'genderName' | 'ageName'>
  startedAt: string
  endedAt: string
  duration: number // seconds
  resultCode: CallResultCode
  responses?: Record<string, string | number>
}

// ── Stats ────────────────────────────────────────────────────────
export interface CampaignStats {
  totalCalled: number
  totalSuccess: number
  totalRefused: number
  totalNoAnswer: number
  totalOther: number
  successRate: number
  avgDuration: number // seconds
  estimatedRemaining: number // minutes
}

// ── Voice Prompt ─────────────────────────────────────────────
export interface StructuredOutputVariable {
  type: string          // e.g. "integer|null", "boolean|null", "string|null"
  description: string
  codes: Record<string, string>  // e.g. { "1": "잘하고 있다", "9": "무응답" }
}

export type StructuredOutputSchema = Record<string, StructuredOutputVariable>

export interface VoicePromptData {
  voice_agent_prompt: string | null
  voice_agent_greeting: string | null
  voice_agent_failure_message: string | null
  voice_agent_prompt_sections: Record<string, string | null> | null
  questionnaire_raw: string | null
  has_file: boolean
  structured_output_schema: StructuredOutputSchema | null  // null while extracting
}

// ── Agora Campaign ───────────────────────────────────────────────
export interface AgoraCampaign {
  id: number
  campaign_id: string
  campaign_name: string
  ts: number
  upload_method: string | null
  quota_method: string | null
  created_at: string
  // 从 Agora 同步
  status: string | null
  phone_number: string | null
  pipeline_id: string | null
  agent_name: string | null
  start_immediately: boolean | null
  scheduled_start_time_input: string | null
  scheduled_start_time: string | null
  timezone: string | null
  scheduled_time_ranges_config: unknown[]
  max_duration_seconds: number | null
  max_silence_duration_seconds: number | null
  max_ring_duration_seconds: number | null
  enable_transcript: boolean | null
  enable_recording: boolean | null
  enable_voice_assistant_hangup: boolean | null
  enable_voicemail: boolean | null
  enable_user_auto_hangup: boolean | null
  enable_max_silence_duration_hangup: boolean | null
  enable_fax_tone_auto_hangup: boolean | null
  already_dialed_count: number
  total_calls: number
  agora_created_at: string | null
  agora_updated_at: string | null
}

// ── Campaign Call ────────────────────────────────────────────────
export interface LlmEvalResult {
  call_success_evaluation_result: boolean | null
  raw_evaluation_results: unknown
  raw_system_evaluation_results: { call_success: boolean | null }
  raw_custom_evaluation_results: Record<string, unknown>
}

export interface CampaignCallRecord {
  call_id: string
  from_number: string | null
  to_number: string | null
  call_ts: number | null
  duration_seconds: number | null
  call_category: string | null
  transcript: { role: string; content: string }[]
  llm_call_evaluation_status: string | null
  llm_call_evaluation_result: LlmEvalResult | null
}

export interface CampaignCallsPage {
  total: number
  page: number
  page_size: number
  items: CampaignCallRecord[]
}

// ── WebSocket messages ───────────────────────────────────────────
export type WsMessage =
  | { type: 'quota_update'; cell: QuotaCell; overallStats: CampaignStats }
  | { type: 'call_started'; call: ActiveCall }
  | { type: 'transcript_update'; callId: string; line: TranscriptLine }
  | { type: 'call_completed'; callId: string; resultCode: CallResultCode; responses: Record<string, string | number> }
  | { type: 'campaign_completed' }
  | { type: 'campaign_status'; status: SurveyStatus }
