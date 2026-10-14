import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  Upload, FileSpreadsheet, Globe, Brain, Pencil, Plus, Trash2, Bot,
  CheckCircle2, Phone, AlertCircle, Download, Loader2, Sparkles,
  RefreshCw, AlignJustify, LayoutList, ChevronDown, Mic, VolumeX,
  Wand2, Info, X, Settings2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { API } from '../../lib/api'

type UploadMethod = 'file_upload' | 'url_load'
type QuotaMethod  = 'ai_auto' | 'manual'

interface PhoneNumberOption { number_id: string; name: string; phone_number: string }
interface AgentOption { agent_id: string; agent_name: string }
type GenState     = 'idle' | 'generating' | 'done' | 'error'
type ViewMode     = 'sections' | 'raw'

interface DialTask { phone_number: string }
interface CsvResult { valid: boolean; tasks: DialTask[]; errors: string[] }
interface PromptSection { key: string; content: string; collapsed: boolean }

// ── Structured output types ───────────────────────────────────────────────────
type CustomEvalType = 'string' | 'number' | 'boolean'
interface CustomEvalSOEval {
  variable_name: string
  type: CustomEvalType
  criteria: string
  enums: string[]
  _draft: string
}

// ── Quota setup types ─────────────────────────────────────────────────────────
type QuotaSetupMode = 'ai_auto' | 'manual' | null
type QuotaAIState   = 'idle' | 'analyzing' | 'done' | 'no_quota' | 'error'
interface QCell { id: string; label: string; filters: Record<string, string>; target: number }
interface QVar  { id: string; name: string; valuesRaw: string; aiPrompt: string }

// ── Section metadata ──────────────────────────────────────────────────────────
// New Campaign → Create Agent by AI uses the simplified 5-key output:
// greeting + failure_message + 3 system modules.
const SECTION_KEYS = [
  'core_guidelines',
  'global_execution_logic',
  'question_sop',
] as const
const GREETING_KEY = 'greeting'
const FAILURE_MESSAGE_KEY = 'failure_message'

const SECTION_COLORS: Record<string, { header: string; border: string; badge: string }> = {
  greeting:        { header: 'bg-st-card hover:bg-[rgba(255,255,255,0.04)]', border: 'border-st-teal-l', badge: 'bg-st-teal-bg text-st-teal-l' },
  failure_message: { header: 'bg-st-card hover:bg-[rgba(255,255,255,0.04)]', border: 'border-st-b-sub',   badge: 'bg-[rgba(255,255,255,0.05)] text-st-txt2' },
  core_guidelines:        { header: 'bg-st-card hover:bg-[rgba(255,255,255,0.04)]', border: 'border-st-teal-l', badge: 'bg-st-teal-bg text-st-teal-l' },
  global_execution_logic: { header: 'bg-st-card hover:bg-[rgba(255,255,255,0.04)]', border: 'border-st-teal-l', badge: 'bg-st-teal-bg text-st-teal-l' },
  question_sop:           { header: 'bg-st-card hover:bg-[rgba(255,255,255,0.04)]', border: 'border-st-teal-l', badge: 'bg-st-teal-bg text-st-teal-l' },
}

// Section labels keyed by TTS language — shown in the sections accordion header
const SECTION_LABELS_BY_LANG: Record<string, Record<string, string>> = {
  zh: {
    greeting:        '开场白',
    failure_message: '识别失败提示',
    core_guidelines:        '核心指导原则',
    global_execution_logic: '全局执行逻辑',
    question_sop:           '各题追问SOP',
  },
  en: {
    greeting:        'Greeting',
    failure_message: 'Failure Message',
    core_guidelines:        'Core Guidelines',
    global_execution_logic: 'Global Execution Logic',
    question_sop:           'Question-specific SOP',
  },
  ja: {
    greeting:        'グリーティング',
    failure_message: '認識失敗メッセージ',
    core_guidelines:        'コアガイドライン',
    global_execution_logic: 'グローバル実行ロジック',
    question_sop:           '質問別SOP',
  },
  ko: {
    greeting:        '오프닝 발화',
    failure_message: '인식 실패 메시지',
    core_guidelines:        '핵심 지침',
    global_execution_logic: '전역 실행 로직',
    question_sop:           '질문별 추가 질문 SOP',
  },
}

function normalizeSectionKeys(input: Record<string, unknown>): Record<string, string | null> {
  const koToEn: Record<string, string> = {
    greeting: 'greeting',
    failure_message: 'failure_message',
    핵심지침: 'core_guidelines',
    무작위순서규칙: 'randomization_rules',
    전역실행로직: 'global_execution_logic',
    질문별SOP: 'question_sop',
    면접스크립트: 'interview_script',
    종료멘트: 'closing_remarks',
    데이터매핑: 'data_mapping',
  }
  const out: Record<string, string | null> = {}
  for (const [k0, v] of Object.entries(input)) {
    const k = koToEn[k0] ?? k0
    out[k] = typeof v === 'string' ? v : v === null ? null : JSON.stringify(v, null, 2)
  }
  return out
}

function extractFirstJsonObject(textRaw: string): string | null {
  let text = textRaw.trim()
  if (text.startsWith('```')) {
    const nl = text.indexOf('\n')
    const last = text.lastIndexOf('```')
    if (nl !== -1 && last > nl) text = text.slice(nl + 1, last).trim()
  }
  const start = text.indexOf('{')
  if (start === -1) return null
  let inStr = false
  let escaped = false
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inStr = false
      }
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth === 0) return text.slice(start, i + 1)
  }
  return null
}

function extractJsonStringAt(text: string, startIdx: number): { value: string; endIdx: number } | null {
  if (text[startIdx] !== '"') return null
  let i = startIdx + 1
  let escaped = false
  while (i < text.length) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      i++
      continue
    }
    if (ch === '\\') {
      escaped = true
      i++
      continue
    }
    if (ch === '"') {
      const quoted = text.slice(startIdx, i + 1)
      try {
        const decoded = JSON.parse(quoted)
        return { value: String(decoded), endIdx: i + 1 }
      } catch {
        return null
      }
    }
    i++
  }
  return null
}

function bestEffortExtractSections(textRaw: string): Record<string, string | null> | null {
  const keys = [GREETING_KEY, FAILURE_MESSAGE_KEY, ...SECTION_KEYS]
  const out: Record<string, string | null> = {}
  let foundAny = false
  for (const key of keys) {
    const patterns = [
      `"${key}"`,
      `'${key}'`,
      `"${key[0].toUpperCase()}${key.slice(1)}"`,
      `"${key.replace('_', '')}"`,
    ]
    let idx = -1
    let matched = ''
    for (const p of patterns) {
      idx = textRaw.indexOf(p)
      if (idx !== -1) { matched = p; break }
    }
    if (idx === -1) continue
    const colon = textRaw.indexOf(':', idx + matched.length)
    if (colon === -1) continue
    let j = colon + 1
    while (j < textRaw.length && /\s/.test(textRaw[j])) j++
    if (textRaw.slice(j, j + 4).toLowerCase() === 'null') {
      out[key] = null
      foundAny = true
      continue
    }
    if (textRaw[j] === '"') {
      const r = extractJsonStringAt(textRaw, j)
      if (r) {
        out[key] = r.value
        foundAny = true
      }
      continue
    }
  }
  return foundAny ? out : null
}

function sectionsFromJson(data: Record<string, string | null>): PromptSection[] {
  const result: PromptSection[] = []
  const greeting = (data[GREETING_KEY] ?? '') as string
  result.push({ key: GREETING_KEY, content: greeting.trim(), collapsed: false })
  const failureMsg = (data[FAILURE_MESSAGE_KEY] ?? '') as string
  result.push({ key: FAILURE_MESSAGE_KEY, content: failureMsg.trim(), collapsed: false })
  for (const key of SECTION_KEYS) {
    const val = (data[key] ?? '') as string
    result.push({ key, content: val.trim(), collapsed: false })
  }
  return result
}

function assemblePrompt(sections: PromptSection[]): string {
  return sections
    .filter(s => s.key !== GREETING_KEY && s.key !== FAILURE_MESSAGE_KEY)
    .map(s => s.content.trim())
    .filter(Boolean)
    .join('\n\n---\n\n')
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsv(text: string, t: TFunction): CsvResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) {
    return { valid: false, tasks: [], errors: [t('nc_wiz.csv_empty')] }
  }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^﻿/, '').toLowerCase())
  const phoneIdx  = headers.indexOf('phone_number')
  if (phoneIdx === -1) {
    return { valid: false, tasks: [], errors: [t('nc_wiz.csv_missing_col')] }
  }
  const errors: string[] = []
  const tasks: DialTask[] = []
  const seen = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols   = line.split(',')
    const phone  = (cols[phoneIdx] ?? '').trim()
    if (!phone) {
      errors.push(t('nc_wiz.csv_row_empty', { n: i + 1 }))
      continue
    }
    if (seen.has(phone)) {
      errors.push(t('nc_wiz.csv_row_dup', { n: i + 1, phone }))
      continue
    }
    seen.add(phone)
    tasks.push({ phone_number: phone })
  }
  return { valid: errors.length === 0 && tasks.length > 0, tasks, errors }
}

// ── Step indicator config ─────────────────────────────────────────────────────
// Internal steps: 1=Basic Info, 2=Questionnaire, 3=AI Prompt (file only), 4=Quota Setup, 5=Call Analysis, 6=Phone List
const FILE_STEPS  = [1, 2, 3, 4, 5, 6] as const
const URL_STEPS   = [1, 2, 4, 5, 6]    as const

// ── QuotaCellTable sub-component ─────────────────────────────────────────────
function QuotaCellTable({
  cells, onAdd, onRemove, onUpdate,
}: {
  cells: QCell[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: 'label' | 'target', val: string | number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="border border-st-b-sub rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_90px_36px] gap-0 bg-st-nav border-b border-st-b-sub">
        <div className="px-4 py-2 text-xs font-medium text-st-txt3">{t('nc_wiz.quota_dim')}</div>
        <div className="px-3 py-2 text-xs font-medium text-st-txt3 text-center border-l border-st-b-sub">
          {t('nc_wiz.quota_target')}
        </div>
        <div />
      </div>
      {/* Rows */}
      <div className="divide-y divide-st-b-div max-h-96 overflow-y-auto">
        {cells.map((cell, idx) => {
          const isManualRow = Object.keys(cell.filters).length === 0
          return (
            <div key={cell.id} className={cn(
              'grid grid-cols-[1fr_90px_36px] items-center hover:bg-[rgba(255,255,255,0.04)]',
              idx % 2 === 0 ? 'bg-st-card' : 'bg-[rgba(255,255,255,0.04)]'
            )}>
              {/* Condition label */}
              <div className="px-4 py-2.5">
                {isManualRow ? (
                  <input
                    type="text"
                    value={cell.label}
                    onChange={e => onUpdate(cell.id, 'label', e.target.value)}
                    placeholder={t('nc_wiz.filter_ph')}
                    className="w-full text-sm text-st-txt2 border border-st-b-sub rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent"
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {Object.entries(cell.filters).map(([k, v], i, arr) => (
                      <span key={k} className="inline-flex items-baseline gap-0.5 text-xs">
                        <span className="text-st-txt3">{k}</span>
                        <span className="text-st-txt4 mx-0.5">=</span>
                        <span className="text-st-txt1 font-medium">{v}</span>
                        {i < arr.length - 1 && <span className="text-st-txt4 ml-2">·</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* Target count */}
              <div className="px-3 py-2.5 border-l border-st-b-div">
                <input
                  type="number"
                  min={0}
                  value={cell.target}
                  onChange={e => onUpdate(cell.id, 'target', Number(e.target.value))}
                  className="w-full text-sm text-st-txt2 text-center border border-st-b-sub rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent"
                />
              </div>
              {/* Delete */}
              <div className="flex items-center justify-center">
                <button
                  onClick={() => onRemove(cell.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(252,165,165,0.08)] text-st-txt4 hover:text-st-err transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {/* Add row + total */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-st-b-sub bg-st-nav">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs text-st-teal-l hover:text-st-ok transition-colors"
        >
          <Plus size={12} /> {t('nc_wiz.add_row')}
        </button>
        <span className="text-xs text-st-txt3">
          {t('nc_wiz.n_total', {
            n: cells.length,
            t: cells.reduce((s, c) => s + (Number(c.target) || 0), 0),
          })}
        </span>
      </div>
    </div>
  )
}

export function NewSurveyPage() {
  const { t, i18n } = useTranslation()
  const navigate   = useNavigate()
  const stepName = useCallback((s: 1 | 2 | 3 | 4 | 5 | 6) => {
    const m = { 1: 'nc_wiz.step_1', 2: 'nc_wiz.step_2', 3: 'nc_wiz.step_3', 4: 'nc_wiz.step_4', 5: 'nc_wiz.step_5', 6: 'nc_wiz.step_6' } as const
    return t(m[s])
  }, [t, i18n.language])
  const [step, setStep]         = useState<1 | 2 | 3 | 4 | 5 | 6>(1)
  const [campaignName, setCampaignName] = useState('')
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>('file_upload')

  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberOption[]>([])
  const [agents, setAgents]             = useState<AgentOption[]>([])
  const [selectedPhoneId, setSelectedPhoneId] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [agentPath, setAgentPath] = useState<'new' | 'existing' | null>(null)

  useEffect(() => {
    fetch(`${API}/api/phone-numbers`).then(r => r.json()).then(setPhoneNumbers).catch(() => {})
    fetch(`${API}/api/agents`).then(r => r.json()).then(setAgents).catch(() => {})
  }, [])

  // Keep agentPath aligned with selectedAgentId so the Next guard cannot block when id is set
  // (e.g. async batching or future code paths that only touch selectedAgentId).
  useEffect(() => {
    if (selectedAgentId === '__new__') {
      setAgentPath('new')
    } else if (
      selectedAgentId
      && selectedAgentId !== '__new__'
      && agents.some(a => a.agent_id === selectedAgentId)
    ) {
      setAgentPath('existing')
    }
  }, [selectedAgentId, agents])
  const [csvResult,    setCsvResult]    = useState<CsvResult | null>(null)
  const [phoneFile,    setPhoneFile]    = useState<File | null>(null)
  const [phoneDragging, setPhoneDragging] = useState(false)
  const [surveyFile,   setSurveyFile]   = useState<File | null>(null)
  const [surveyFileDragging, setSurveyFileDragging] = useState(false)
  const [surveyUrl,    setSurveyUrl]    = useState('')
  const [creating,     setCreating]     = useState(false)
  const [createError,  setCreateError]  = useState('')
  const phoneInputRef = useRef<HTMLInputElement>(null)

  // TTS 语言/音色选择
  const TTS_OPTIONS = [
    { lang: 'zh', label: '中文 (Chinese)',    boost: 'Chinese',  voices: ['ai_assistant_007', 'ai_assistant_009', 'ai_assistant_018'] },
    { lang: 'ko', label: '韩语 (Korean)',     boost: 'Korean',   voices: ['Korean_ReliableYouth'] },
    { lang: 'ja', label: '日文 (Japanese)',   boost: 'Japanese', voices: ['jap_female_1222_1'] },
    { lang: 'en', label: '英文 (English)',    boost: 'English',  voices: ['English_female_calling_0710_12'] },
  ]
  const DEFAULT_FAILURE: Record<string, string> = {
    zh: '抱歉，我暂时无法回答您的问题，请稍后再试。',
    ko: '죄송합니다. 현재 답변을 드리기 어렵습니다.',
    ja: '申し訳ありません。現在回答できません。',
    en: "I'm sorry, I'm unable to respond at the moment.",
  }

  const [ttsLang,    setTtsLang]    = useState('zh')
  const [ttsVoiceId, setTtsVoiceId] = useState('ai_assistant_007')
  const [failureMessage, setFailureMessage] = useState(DEFAULT_FAILURE['zh'])
  const [creatingAgent,  setCreatingAgent]  = useState(false)
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null)

  // Quota setup state
  const [quotaSetupMode, setQuotaSetupMode] = useState<QuotaSetupMode>('manual')
  const [quotaAIState,   setQuotaAIState]   = useState<QuotaAIState>('idle')
  const [quotaAIError,   setQuotaAIError]   = useState('')
  const [noQuotaMsg,     setNoQuotaMsg]     = useState('')
  const [quotaCells,     setQuotaCells]     = useState<QCell[]>([])
  const [quotaVars,      setQuotaVars]      = useState<QVar[]>([
    { id: 'v0', name: '', valuesRaw: '', aiPrompt: '' },
  ])

  // Structured output (Step 5 – Call Analysis)
  const [soEnabled,    setSoEnabled]    = useState(true)
  const [soCriteria,   setSoCriteria]   = useState('')
  const [customEvals,  setCustomEvals]  = useState<CustomEvalSOEval[]>([])

  function addCustomEval() {
    setCustomEvals(prev => [...prev, { variable_name: '', type: 'string', criteria: '', enums: [], _draft: '' }])
  }
  function removeCustomEval(idx: number) {
    setCustomEvals(prev => prev.filter((_, i) => i !== idx))
  }
  function updateCustomEval(idx: number, field: keyof CustomEvalSOEval, val: string) {
    setCustomEvals(prev => prev.map((ev, i) => {
      if (i !== idx) return ev
      if (field === 'type') {
        return { ...ev, type: val as CustomEvalType, enums: [], _draft: '' }
      }
      return { ...ev, [field]: val }
    }))
  }
  function addEnum(idx: number, val: string) {
    setCustomEvals(prev => prev.map((ev, i) =>
      i === idx ? { ...ev, enums: [...ev.enums, val], _draft: '' } : ev
    ))
  }
  function removeEnum(idx: number, ei: number) {
    setCustomEvals(prev => prev.map((ev, i) =>
      i === idx ? { ...ev, enums: ev.enums.filter((_, j) => j !== ei) } : ev
    ))
  }

  function handleTtsLangChange(lang: string) {
    const opt = TTS_OPTIONS.find(o => o.lang === lang)
    setTtsLang(lang)
    setTtsVoiceId(opt?.voices[0] ?? '')
    setFailureMessage(DEFAULT_FAILURE[lang] ?? '')
  }

  // AI Prompt step state
  const [genState,          setGenState]          = useState<GenState>('idle')
  const [sections,          setSections]          = useState<PromptSection[]>([])
  const [rawPrompt,         setRawPrompt]         = useState('')
  const [viewMode,          setViewMode]          = useState<ViewMode>('sections')
  const [byteCount,         setByteCount]         = useState(0)
  const [genError,          setGenError]          = useState('')
  const [questionnaireText, setQuestionnaireText] = useState<string | null>(null)
  const [textLoading,       setTextLoading]       = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Section labels follow UI language (left sidebar)
  const uiLangBase = (i18n.language || 'en').split('-')[0]
  const sectionLabels = SECTION_LABELS_BY_LANG[uiLangBase] ?? SECTION_LABELS_BY_LANG['en']

  const acceptedExt = '.pdf,.docx,.xlsx'

  const isNewAgent = selectedAgentId === '__new__'

  // Navigation helpers
  const visibleSteps = isNewAgent
    ? (uploadMethod === 'file_upload' ? FILE_STEPS : URL_STEPS)
    : ([1, 4, 5, 6] as const)

  const nextFromStep1 = () => isNewAgent ? setStep(2) : setStep(4)

  const nextFromStep2 = () => {
    if (uploadMethod === 'file_upload') {
      setStep(3)
      if (surveyFile && questionnaireText === null && !textLoading) {
        extractQuestionnaireText(surveyFile)
      }
    } else {
      setStep(4)
    }
  }
  const backFromStep4 = () => {
    if (!isNewAgent) { setStep(1); return }
    setStep(uploadMethod === 'file_upload' ? 3 : 2)
  }

  async function extractQuestionnaireText(file: File) {
    setTextLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch(`${API}/api/agora-campaigns/voice-prompt/extract-text`, { method: 'POST', body: fd })
      const data = await resp.json()
      setQuestionnaireText(data.text ?? null)
    } catch {
      setQuestionnaireText(null)
    } finally {
      setTextLoading(false)
    }
  }

  async function handlePhoneFile(f: File) {
    setPhoneFile(f)
    setCsvResult(parseCsv(await f.text(), t))
  }

  function downloadTemplate() {
    const csv  = 'phone_number\n+8613811112222\n+8618860027209\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'phone_list_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Quota setup handlers ─────────────────────────────────────────────────────
  async function handleSelectQuotaMode(mode: QuotaSetupMode) {
    setQuotaSetupMode(mode)
    if (mode === 'ai_auto') {
      setQuotaAIState('analyzing'); setQuotaAIError(''); setNoQuotaMsg(''); setQuotaCells([])
      try {
        const fd = new FormData()
        if (surveyFile) fd.append('file', surveyFile)
        if (questionnaireText) fd.append('text', questionnaireText)
        fd.append('language', ttsLang)
        const resp = await fetch(`${API}/api/agora-campaigns/quota-suggest`, { method: 'POST', body: fd })
        if (!resp.ok) throw new Error(t('nc_wiz.err_analyze'))
        const data = await resp.json()
        if (!data.has_quota) {
          setNoQuotaMsg(data.message || t('nc_wiz.err_no_quota'))
          setQuotaAIState('no_quota')
        } else {
          setQuotaCells((data.cells as Omit<QCell, 'id'>[]).map(c => ({ ...c, id: crypto.randomUUID() })))
          setQuotaAIState('done')
        }
      } catch (e) {
        setQuotaAIError(e instanceof Error ? e.message : t('nc_wiz.err_analyze'))
        setQuotaAIState('error')
      }
    }
  }

  function addQuotaCell() {
    // Empty filters signals a manually-added row (renders as editable text input in the table)
    setQuotaCells(prev => [...prev, { id: crypto.randomUUID(), label: '', filters: {}, target: 30 }])
  }
  function removeQuotaCell(id: string) {
    setQuotaCells(prev => prev.filter(c => c.id !== id))
  }
  function updateQuotaCell(id: string, field: 'label' | 'target', val: string | number) {
    setQuotaCells(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))
  }

  function addQuotaVar() {
    setQuotaVars(prev => [...prev, { id: crypto.randomUUID(), name: '', valuesRaw: '', aiPrompt: '' }])
  }
  function removeQuotaVar(id: string) {
    setQuotaVars(prev => prev.filter(v => v.id !== id))
  }
  function updateQuotaVar(id: string, field: 'name' | 'valuesRaw' | 'aiPrompt', val: string) {
    setQuotaVars(prev => prev.map(v => v.id === id ? { ...v, [field]: val } : v))
  }

  function handleGenerateCombinations() {
    const valid = quotaVars.filter(v => v.name.trim() && v.valuesRaw.trim())
    if (!valid.length) return
    const parsed = valid.map(v => ({
      name: v.name.trim(),
      values: v.valuesRaw.split(/[,，、\n]+/).map(s => s.trim()).filter(Boolean),
    }))
    // Cartesian product
    const combos: Record<string, string>[] = parsed.reduce<Record<string, string>[]>(
      (acc, { name, values }) =>
        acc.length === 0
          ? values.map(val => ({ [name]: val }))
          : acc.flatMap(combo => values.map(val => ({ ...combo, [name]: val }))),
      []
    )
    setQuotaCells(combos.map(filters => ({
      id: crypto.randomUUID(),
      label: Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(', '),
      filters,
      target: 30,
    })))
  }

  // ── AI Prompt generation ────────────────────────────────────────────────────
  const handleGeneratePrompt = useCallback(async () => {
    if (!surveyFile) return
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setSections([]); setRawPrompt(''); setGenState('generating'); setGenError(''); setByteCount(0)

    const formData = new FormData()
    formData.append('file', surveyFile)
    formData.append('language', ttsLang)
    formData.append('simplified', 'true')

    try {
      const resp = await fetch(`${API}/api/agora-campaigns/voice-prompt/generate`, {
        method: 'POST', body: formData, signal: ctrl.signal,
      })
      if (!resp.ok) throw new Error(t('nc_wiz.err_gen'))

      const reader  = resp.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setByteCount(accumulated.length)
      }

      let parsed: Record<string, string | null> | null = null
      try {
        const jsonText = extractFirstJsonObject(accumulated)
        if (jsonText) parsed = JSON.parse(jsonText)
      } catch { /* fall through to raw */ }

      if (parsed) {
        const normalized = normalizeSectionKeys(parsed)
        const newSections = sectionsFromJson(normalized)
        setSections(newSections)
        setRawPrompt(JSON.stringify(normalized, null, 2))
        setViewMode('sections')
      } else {
        // Even if the overall JSON is invalid, still try to extract the 5 modules and render sections view.
        const extracted = bestEffortExtractSections(accumulated)
        const normalized = extracted ? normalizeSectionKeys(extracted) : null
        if (normalized) {
          const newSections = sectionsFromJson(normalized)
          setSections(newSections)
          setRawPrompt(JSON.stringify(normalized, null, 2))
          setViewMode('sections')
        } else {
          // Last resort: keep raw text, but still show empty 5-module editor instead of raw JSON view.
          const empty: Record<string, string | null> = {
            greeting: '',
            failure_message: failureMessage,
            core_guidelines: '',
            global_execution_logic: '',
            question_sop: '',
          }
          setSections(sectionsFromJson(empty))
          setRawPrompt(accumulated)
          setViewMode('sections')
        }
      }
      setGenState('done')
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setGenError(e instanceof Error ? e.message : t('nc_wiz.err_gen'))
      setGenState('error')
    }
  }, [surveyFile, ttsLang, t])

  function handleSectionChange(idx: number, newContent: string) {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, content: newContent } : s))
  }
  function toggleSection(idx: number) {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, collapsed: !s.collapsed } : s))
  }

  async function handleGenerateAgent() {
    setCreatingAgent(true); setCreateError('')
    try {
      // When sections is populated (JSON parse succeeded), extract each field directly.
      // Fallback to rawPrompt as system content when JSON parsing failed (sections is empty).
      const greetingMsg = sections.find(s => s.key === GREETING_KEY)?.content.trim() || ''
      const failureMsgFromSections = sections.find(s => s.key === FAILURE_MESSAGE_KEY)?.content.trim() || failureMessage
      const systemContent = sections.length > 0 ? assemblePrompt(sections) : rawPrompt
      const ttsOpt = TTS_OPTIONS.find(o => o.lang === ttsLang)

      const resp = await fetch(`${API}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name:       campaignName || 'Campaign',
          system_content:   systemContent,
          greeting_message: greetingMsg,
          failure_message:  failureMsgFromSections,
          voice_id:         ttsVoiceId,
          language_boost:   ttsOpt?.boost || 'Chinese',
        }),
      })
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || t('nc_wiz.err_create_agent')) }
      const agent = await resp.json()
      setCreatedAgentId(agent.agent_id)
      setStep(4)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t('nc_wiz.err_create_agent'))
    } finally {
      setCreatingAgent(false)
    }
  }

  async function handleCreate() {
    if (!csvResult?.valid) return
    if (!selectedPhoneId) { setCreateError(t('nc_wiz.need_phone')); return }
    const agentIdToUse = createdAgentId || selectedAgentId
    if (!agentIdToUse) { setCreateError(t('nc_wiz.need_agent')); return }
    setCreating(true); setCreateError('')
    try {
      const validCustomEvals = customEvals
        .filter(e => e.variable_name.trim() && e.criteria.trim())
        .map(({ variable_name, type, criteria, enums }) => ({
          variable_name: variable_name.trim(),
          type,
          criteria: criteria.trim(),
          ...(type !== 'boolean' && enums.length > 0 ? { enums } : {}),
        }))
      const structuredOutput = {
        enable_structured_output: soEnabled,
        ...(soEnabled ? {
          call_success_evaluation: { criteria: soCriteria.trim() || t('nc_wiz.start_criteria') },
          ...(validCustomEvals.length > 0 ? { custom_evaluations: validCustomEvals } : {}),
        } : {}),
      }

      const resp = await fetch(`${API}/api/campaigns-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name:      campaignName,
          phone_number_id:    selectedPhoneId,
          agent_id:           agentIdToUse,
          questionnaire_type: isNewAgent ? 'create_agent_by_ai' : 'existing_agent',
          quota_mode:         quotaSetupMode ?? 'manual',
          dial_tasks:         csvResult.tasks.map(row => ({ phone_number: row.phone_number })),
          start_immediately:  true,
          end_call_config: {
            max_call_duration_seconds:    600,
            silence_timeout_seconds:      600,
            end_call_on_silence_timeout:  true,
            ring_timeout_seconds:         30,
            end_call_on_user_request:     true,
            end_call_on_ai_assistant:     true,
          },
          structured_output: structuredOutput,
          enable_transcript: true,
          enable_recording:  true,
        }),
      })
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail ?? t('nc_wiz.err_create')) }
      const campaign = await resp.json()

      // Persist quota cells to quota_v2 if any were configured
      if (quotaCells.length > 0 && campaign.campaign_id) {
        await fetch(`${API}/api/quota-v2/${campaign.campaign_id}/cells`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cells: quotaCells.map(c => ({
              label:   c.label,
              filters: c.filters,
              target:  c.target,
            })),
          }),
        })
      }

      navigate('/')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t('nc_wiz.err_create'))
      setCreating(false)
    }
  }

  // ── Step indicator ──────────────────────────────────────────────────────────
  const displayStep = visibleSteps.indexOf(step) + 1  // 1-based display position

  return (
    <div className={cn('p-8 mx-auto bg-st-bg min-h-screen',
      step === 3 ? 'max-w-6xl' :
      (step === 4 && quotaCells.length > 0) ? 'max-w-4xl' :
      'max-w-2xl'
    )}>

      {/* ── Wizard header with step indicator ──────────────────────────────── */}
      <div className="bg-st-nav border border-st-b-sub rounded-lg mb-6 px-6 py-4">
        <div className="flex items-start">
          {visibleSteps.map((s, i) => {
            const done    = displayStep > i + 1
            const current = step === s
            return (
              <div key={s} className="flex items-start flex-1 min-w-0">
                {/* Circle + label */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium',
                    current ? 'bg-st-teal text-white' :
                    done    ? 'bg-st-teal-bg text-st-teal-l' :
                              'bg-[rgba(255,255,255,0.05)] text-st-txt3'
                  )}>
                    {done ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={cn(
                    'mt-1.5 text-[11px] text-center leading-tight w-14 break-words',
                    current ? 'text-st-txt1 font-medium' : 'text-st-txt3'
                  )}>
                    {stepName(s as 1 | 2 | 3 | 4 | 5 | 6)}
                  </span>
                </div>
                {/* Connector line (not after last item) */}
                {i < visibleSteps.length - 1 && (
                  <div className={cn('flex-1 h-px mt-3.5 mx-1', displayStep > i + 1 ? 'bg-st-teal' : 'bg-st-b-sub')} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Step 1: Basic Info ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-st-nav border border-st-b-sub rounded-lg p-6 space-y-5">
          <h2 className="font-medium text-st-txt1">{t('nc_wiz.step_1')}</h2>

          <div>
            <label className="block text-sm font-medium text-st-txt2 mb-1.5">Campaign Name</label>
            <input
              type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)}
              placeholder={t('nc_wiz.campaign_name_ph')}
              className="w-full border border-st-b-sub rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent text-st-txt1"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-st-txt2 mb-1.5">
              {t('nc_wiz.phone_lbl')} <span className="text-st-err">*</span>
            </label>
            <select
              value={selectedPhoneId}
              onChange={e => setSelectedPhoneId(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full border border-st-b-sub rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent text-st-txt2"
            >
              <option value="">{t('nc_wiz.select_phone')}</option>
              {phoneNumbers.map(p => (
                <option key={p.number_id} value={p.number_id}>
                  {p.name} ({p.phone_number})
                </option>
              ))}
            </select>
          </div>

          {/* Agent: two cards — same behavior as former single select (__new__ vs id) */}
          <div>
            <p className="block text-sm font-medium text-st-txt2 mb-2">
              Agent <span className="text-st-err">*</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setAgentPath('new')
                  setSelectedAgentId('__new__')
                }}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all',
                  agentPath === 'new'
                    ? 'border-st-b-teal bg-st-teal-bg'
                    : 'border-st-b-sub hover:border-st-b-hover hover:bg-[rgba(255,255,255,0.04)]',
                )}
              >
                <div className="flex w-full items-start gap-3">
                  <div className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    agentPath === 'new' ? 'bg-st-teal-bg' : 'bg-[rgba(255,255,255,0.05)]'
                  )}>
                    <Sparkles size={20} className={agentPath === 'new' ? 'text-st-teal-l' : 'text-st-txt3'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-st-txt1">
                      {t('nc_wiz.agent_mode_new_title')}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-st-txt3">
                      {t('nc_wiz.agent_mode_new_sub')}
                    </p>
                  </div>
                </div>
              </button>

              <div
                className={cn(
                  'flex flex-col rounded-lg border-2 p-4 transition-all',
                  agentPath === 'existing' || (selectedAgentId && selectedAgentId !== '__new__')
                    ? 'border-st-b-teal bg-st-teal-bg'
                    : 'border-st-b-sub',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAgentPath('existing');
                    setSelectedAgentId(prev => {
                      if (prev === '__new__') {
                        return '';
                      }
                      return agents.some(a => a.agent_id === prev) ? prev : '';
                    });
                  }}
                  className="w-full text-left"
                >
                  <div className="flex w-full items-start gap-3">
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      agentPath === 'existing' ? 'bg-st-teal-bg' : 'bg-[rgba(255,255,255,0.05)]'
                    )}>
                      <Bot size={20} className={agentPath === 'existing' ? 'text-st-teal-l' : 'text-st-txt3'} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-st-txt1">
                        {t('nc_wiz.agent_mode_existing_title')}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-st-txt3">
                        {t('nc_wiz.agent_mode_existing_sub')}
                      </p>
                    </div>
                  </div>
                </button>
                <div className="mt-4 border-t border-st-b-div pt-3" onClick={e => e.stopPropagation()}>
                  <label className="mb-1.5 block text-xs font-medium text-st-txt2">
                    {t('nc_wiz.existing_agent_label')}
                  </label>
                  <select
                    value={selectedAgentId === '__new__' ? '' : selectedAgentId}
                    onChange={e => {
                      const v = e.target.value
                      setSelectedAgentId(v)
                      if (v) {
                        setAgentPath('existing')
                      }
                    }}
                    disabled={selectedAgentId === '__new__'}
                    style={{ colorScheme: 'dark' }}
                    className={cn(
                      'w-full rounded-lg border border-st-b-sub bg-transparent px-3 py-2 text-sm text-st-txt2',
                      'focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent',
                      selectedAgentId === '__new__' && 'cursor-not-allowed bg-[rgba(255,255,255,0.04)] text-st-txt3',
                    )}
                  >
                    <option value="">{t('nc_wiz.select_agent')}</option>
                    {agents.map(a => (
                      <option key={a.agent_id} value={a.agent_id}>
                        {a.agent_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* TTS 语言 + 音色：仅在新建 Agent 时显示 */}
          {isNewAgent && (
            <div className="space-y-3 p-4 bg-st-card rounded-lg border border-st-b-sub">
              <p className="text-sm font-medium text-st-txt2">{t('nc_wiz.tts_block')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-st-txt3 mb-1">{t('nc_wiz.lang')}</label>
                  <select
                    value={ttsLang}
                    onChange={e => handleTtsLangChange(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full border border-st-b-sub rounded-lg px-3 py-2 text-sm bg-transparent text-st-txt2 focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent"
                  >
                    {TTS_OPTIONS.map(o => (
                      <option key={o.lang} value={o.lang}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-st-txt3 mb-1">{t('nc_wiz.voice')}</label>
                  <select
                    value={ttsVoiceId}
                    onChange={e => setTtsVoiceId(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full border border-st-b-sub rounded-lg px-3 py-2 text-sm bg-transparent text-st-txt2 focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent"
                  >
                    {(TTS_OPTIONS.find(o => o.lang === ttsLang)?.voices ?? []).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 问卷加载方式：仅在新建 Agent 时显示 */}
          {isNewAgent && (
            <div>
              <label className="block text-sm font-medium text-st-txt2 mb-2">
                {t('nc_wiz.method_label')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  {
                    value: 'file_upload' as UploadMethod,
                    label: t('new_survey.file_upload'),
                    desc: t('new_survey.file_upload_desc'),
                    icon: FileSpreadsheet,
                  },
                  {
                    value: 'url_load'   as UploadMethod,
                    label: t('new_survey.url_load'),
                    desc: t('new_survey.url_load_desc'),
                    icon: Globe,
                  },
                ]).map(({ value, label, desc, icon: Icon }) => (
                  <button key={value} onClick={() => setUploadMethod(value)}
                    className={cn('flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-colors',
                      uploadMethod === value
                        ? 'border-st-b-teal bg-st-teal-bg'
                        : 'border-st-b-sub hover:border-st-b-hover hover:bg-[rgba(255,255,255,0.04)]'
                    )}>
                    <Icon size={20} className={uploadMethod === value ? 'text-st-teal-l' : 'text-st-txt3'} />
                    <div>
                      <p className={cn('text-sm font-medium', uploadMethod === value ? 'text-st-teal-l' : 'text-st-txt2')}>{label}</p>
                      <p className="text-xs text-st-txt3 mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={nextFromStep1}
            disabled={!campaignName.trim() || !selectedPhoneId || !selectedAgentId}
            className="w-full py-2 bg-st-teal text-white rounded-lg text-sm font-medium hover:bg-st-teal-h disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('common.next')}
          </button>
        </div>
      )}

      {/* ── Step 2: Questionnaire ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="bg-st-nav border border-st-b-sub rounded-lg p-6 space-y-5">
          <h2 className="font-medium text-st-txt1">
            {uploadMethod === 'url_load' ? 'Load Questionnaire via URL' : 'Upload Questionnaire File'}
          </h2>

          {uploadMethod === 'url_load' ? (
            <div>
              <label className="block text-sm font-medium text-st-txt2 mb-1.5">
                {t('new_survey.label_oqd_url')}
              </label>
              <input type="url" value={surveyUrl} onChange={e => setSurveyUrl(e.target.value)} placeholder="https://..."
                className="w-full border border-st-b-sub rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent text-st-txt1" />
              <p className="text-xs text-st-txt3 mt-1.5">{t('nc_wiz.oqd_euc')}</p>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setSurveyFileDragging(true) }}
              onDragLeave={() => setSurveyFileDragging(false)}
              onDrop={e => { e.preventDefault(); setSurveyFileDragging(false); const f = e.dataTransfer.files[0]; if (f) setSurveyFile(f) }}
              onClick={() => document.getElementById('survey-file-input')?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer',
                surveyFileDragging
                  ? 'border-st-b-teal bg-st-teal-bg'
                  : surveyFile
                    ? 'border-st-b-teal bg-st-teal-bg'
                    : 'border-st-b-sub bg-st-card hover:border-st-b-hover hover:bg-[rgba(255,255,255,0.04)]'
              )}>
              <Upload size={28} className={cn('mx-auto mb-3', surveyFile ? 'text-st-teal-l' : 'text-st-txt3')} />
              {surveyFile ? (
                <div>
                  <span className="inline-flex items-center gap-2 bg-st-teal-bg text-st-teal-l border border-st-b-teal rounded-lg px-3 py-1.5 text-sm font-medium">
                    <FileSpreadsheet size={14} />
                    {surveyFile.name}
                  </span>
                  <p className="text-xs text-st-txt3 mt-2">{(surveyFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-st-txt2">{t('nc_wiz.drop_here')}</p>
                  <p className="text-xs text-st-txt3 mt-1">{t('nc_wiz.file_types_short')}</p>
                </div>
              )}
              <input id="survey-file-input" type="file" accept={acceptedExt} className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setSurveyFile(f) }} />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="flex-1 py-2 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
              {t('common.prev')}
            </button>
            <button onClick={nextFromStep2}
              className="flex-1 py-2 bg-st-teal text-white rounded-lg text-sm font-medium hover:bg-st-teal-h transition-colors">
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: AI Prompt (file_upload only) — two-column layout ──────── */}
      {step === 3 && (
        <div className="bg-st-nav border border-st-b-sub rounded-lg overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: 520 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-st-b-sub bg-st-nav flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-st-teal-l" />
              <h2 className="font-medium text-st-txt1">{t('nc_wiz.title_ai_prompt')}</h2>
              {surveyFile && (
                <span className="text-xs text-st-txt3 font-normal ml-1">— {surveyFile.name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {genState === 'done' && sections.length > 0 && (
                <div className="flex items-center bg-[rgba(255,255,255,0.05)] rounded-md p-0.5 mr-1">
                  <button onClick={() => setViewMode('sections')}
                    className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                      viewMode === 'sections' ? 'bg-[rgba(255,255,255,0.08)] text-st-txt2' : 'text-st-txt3 hover:text-st-txt2')}>
                    <LayoutList size={11} /> Sections
                  </button>
                  <button onClick={() => setViewMode('raw')}
                    className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                      viewMode === 'raw' ? 'bg-[rgba(255,255,255,0.08)] text-st-txt2' : 'text-st-txt3 hover:text-st-txt2')}>
                    <AlignJustify size={11} /> Raw
                  </button>
                </div>
              )}
              {genState === 'done' && (
                <button onClick={handleGeneratePrompt}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-xs font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
                  <RefreshCw size={12} /> {t('nc_wiz.regen')}
                </button>
              )}
              {(genState === 'idle' || genState === 'error') && (
                <button onClick={handleGeneratePrompt} disabled={!surveyFile}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-st-teal text-white rounded-lg text-sm font-medium hover:bg-st-teal-h disabled:opacity-40 transition-colors">
                  <Sparkles size={14} /> {t('nc_wiz.gen_prompt')}
                </button>
              )}
              {genState === 'generating' && (
                <button onClick={() => { abortRef.current?.abort(); setGenState('error') }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(255,255,255,0.05)] text-st-txt2 rounded-lg text-xs font-medium hover:bg-[rgba(255,255,255,0.08)] transition-colors">
                  {t('nc_wiz.stop')}
                </button>
              )}
            </div>
          </div>

          {genError && (
            <div className="flex items-center gap-2 px-5 py-2 bg-[rgba(252,165,165,0.08)] border-b border-[rgba(252,165,165,0.22)] text-st-err text-sm flex-shrink-0">
              <AlertCircle size={14} /> {genError}
            </div>
          )}

          {/* Two-column body */}
          <div className="flex flex-1 overflow-hidden">

            {/* LEFT: questionnaire original text */}
            <div className="w-[38%] border-r border-st-b-sub flex flex-col overflow-hidden">
              <div className="px-4 py-2 bg-st-card border-b border-st-b-sub flex-shrink-0 flex items-center gap-2">
                <span className="text-[11px] font-medium text-st-txt3 uppercase tracking-wide">
                  {t('nc_wiz.orig_doc')}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {textLoading ? (
                  <div className="flex items-center gap-2 text-st-txt3 text-sm">
                    <Loader2 size={14} className="animate-spin" /> {t('nc_wiz.extract_txt')}
                  </div>
                ) : questionnaireText ? (
                  <pre className="text-xs text-st-txt2 whitespace-pre-wrap font-mono leading-relaxed">
                    {questionnaireText}
                  </pre>
                ) : (
                  <div className="text-center py-12 text-st-txt3">
                    <p className="text-sm">{t('nc_wiz.no_doc_preview')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: AI generated prompt */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2 bg-st-card border-b border-st-b-sub flex-shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-st-teal-l" />
                  <span className="text-[11px] font-medium text-st-txt3 uppercase tracking-wide">
                    {t('nc_wiz.gen_out')}
                  </span>
                </div>
                {genState === 'done' && (
                  <span className="text-[10px] text-st-txt3">
                    {(viewMode === 'sections' ? assemblePrompt(sections) : rawPrompt).length.toLocaleString()}{' '}
                    {t('nc_wiz.chars')}
                  </span>
                )}
              </div>

              {/* Idle state */}
              {(genState === 'idle' || genState === 'error') && !sections.length && !rawPrompt && (
                <div className="flex flex-col items-center justify-center flex-1 text-st-txt3 gap-3">
                  <Sparkles size={40} className="opacity-30" />
                  <p className="text-sm text-st-txt3">
                    {surveyFile ? t('nc_wiz.gen_hint') : t('nc_wiz.need_upload')}
                  </p>
                </div>
              )}

              {/* Generating — teal streaming indicator */}
              {genState === 'generating' && (
                <div className="flex flex-col items-center justify-center flex-1 gap-4">
                  <div className="flex items-center gap-2 text-st-teal-l">
                    <span className="w-2 h-2 bg-st-teal rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-st-teal rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-st-teal rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="ml-2 text-sm font-medium">{t('nc_wiz.streaming')}</span>
                  </div>
                  <div className="text-center">
                    <span className="font-mono text-2xl font-medium text-st-txt1">{byteCount.toLocaleString()}</span>
                    <p className="text-xs text-st-txt3 mt-1">{t('nc_wiz.received')}</p>
                  </div>
                </div>
              )}

              {/* Sections view — clean cards with colored left border */}
              {genState === 'done' && viewMode === 'sections' && sections.length > 0 && (
                <div className="flex-1 overflow-y-auto">
                  {sections.map((section, idx) => {
                    const c = SECTION_COLORS[section.key] ?? SECTION_COLORS['core_guidelines']
                    const isGreeting = section.key === GREETING_KEY
                    const isFailureMsg = section.key === FAILURE_MESSAGE_KEY
                    const isSpecial = isGreeting || isFailureMsg
                    const label = sectionLabels[section.key] ?? section.key
                    const rowCount = isSpecial
                      ? Math.min(6, Math.max(2, section.content.split('\n').length + 1))
                      : Math.min(30, Math.max(3, section.content.split('\n').length + 1))
                    return (
                      <div key={section.key} className={cn('border-b border-st-b-div border-l-4', c.border)}>
                        <button onClick={() => toggleSection(idx)}
                          className={cn('w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors', c.header)}>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', c.badge)}>
                              {isGreeting
                                ? <Mic size={10} className="inline" />
                                : isFailureMsg
                                  ? <VolumeX size={10} className="inline" />
                                  : idx + 1}
                            </span>
                            <span className="text-xs font-medium text-st-txt2">{label}</span>
                          </div>
                          <ChevronDown size={13} className={cn('text-st-txt3 transition-transform flex-shrink-0', section.collapsed && '-rotate-90')} />
                        </button>
                        {!section.collapsed && (
                          <div className="px-4 pb-4 pt-2 bg-st-card">
                            <textarea value={section.content} onChange={e => handleSectionChange(idx, e.target.value)}
                              rows={rowCount} spellCheck={false}
                              className="w-full resize-none p-3 font-mono text-xs text-st-txt2 leading-relaxed focus:outline-none bg-[rgba(255,255,255,0.04)] rounded-lg border border-st-b-sub focus:ring-2 focus:ring-st-teal focus:border-transparent transition-all" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Raw view */}
              {genState === 'done' && viewMode === 'raw' && (
                <textarea value={rawPrompt} onChange={e => setRawPrompt(e.target.value)}
                  className="flex-1 resize-none p-4 font-mono text-xs text-st-txt2 leading-relaxed focus:outline-none bg-[rgba(255,255,255,0.04)] border-0"
                  spellCheck={false} />
              )}
            </div>
          </div>

          {/* Navigation */}
          {createError && (
            <div className="px-5 py-2 bg-[rgba(252,165,165,0.08)] border-t border-[rgba(252,165,165,0.22)] text-sm text-st-err flex-shrink-0">{createError}</div>
          )}
          <div className="flex gap-3 px-5 py-3 border-t border-st-b-sub bg-st-card flex-shrink-0">
            <button onClick={() => setStep(2)}
              className="flex-1 py-2 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
              {t('common.prev')}
            </button>
            {genState === 'done' ? (
              <button
                onClick={handleGenerateAgent}
                disabled={creatingAgent}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white transition-colors',
                  creatingAgent ? 'bg-st-teal opacity-60 cursor-not-allowed' : 'bg-st-teal hover:bg-st-teal-h'
                )}
              >
                {creatingAgent && <Loader2 size={14} className="animate-spin" />}
                {creatingAgent ? t('nc_wiz.gen_agent_working') : t('nc_wiz.gen_agent_next')}
              </button>
            ) : (
              <button onClick={() => setStep(4)}
                className="flex-1 py-2 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
                {t('nc_wiz.skip')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Quota Setup ────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="bg-st-nav border border-st-b-sub rounded-lg overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-st-b-sub flex items-center justify-between">
            <div>
              <h2 className="font-medium text-st-txt1">{t('nc_wiz.step_4')}</h2>
              {quotaSetupMode && (
                <p className="text-xs text-st-txt3 mt-0.5">
                  {quotaSetupMode === 'ai_auto' ? t('nc_wiz.mode_badge_ai') : t('nc_wiz.mode_badge_manual')}
                </p>
              )}
            </div>
            {quotaSetupMode && (
              <button
                onClick={() => { setQuotaSetupMode(null); setQuotaCells([]); setQuotaAIState('idle') }}
                className="text-xs text-st-txt3 hover:text-st-txt2 border border-st-b-sub rounded-lg px-2.5 py-1 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors"
              >
                {t('nc_wiz.mode_switch')}
              </button>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* ── Mode selector (no mode selected yet) ── */}
            {!quotaSetupMode && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-st-txt2">{t('nc_wiz.choose_quota')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleSelectQuotaMode('ai_auto')}
                    disabled={!surveyFile}
                    className="flex flex-col gap-1 rounded-lg border-2 border-st-b-sub p-4 text-left hover:border-st-b-teal hover:bg-st-teal-bg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="text-sm font-medium text-st-txt1">{t('nc_wiz.mode_ai')}</span>
                    <span className="text-xs text-st-txt3">{t('nc_wiz.mode_ai_d')}</span>
                    {!surveyFile && <span className="text-xs text-st-warn mt-1">{t('nc_wiz.need_file')}</span>}
                  </button>
                  <button
                    onClick={() => handleSelectQuotaMode('manual')}
                    className="flex flex-col gap-1 rounded-lg border-2 border-st-b-sub p-4 text-left hover:border-st-b-teal hover:bg-st-teal-bg transition-colors"
                  >
                    <span className="text-sm font-medium text-st-txt1">{t('nc_wiz.mode_manual')}</span>
                    <span className="text-xs text-st-txt3">{t('nc_wiz.mode_manual_d')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── AI auto mode ── */}
            {quotaSetupMode === 'ai_auto' && (
              <div className="space-y-4">
                {/* Analyzing */}
                {quotaAIState === 'analyzing' && (
                  <div className="flex items-center gap-3 py-10 justify-center text-st-txt3">
                    <Loader2 size={20} className="animate-spin text-st-teal-l" />
                    <span className="text-sm">{t('nc_wiz.claude_working')}</span>
                  </div>
                )}

                {/* Error */}
                {quotaAIState === 'error' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg px-4 py-3 text-sm text-st-err">
                      <AlertCircle size={14} className="flex-shrink-0" />
                      {quotaAIError || t('nc_wiz.err_analyze')}
                    </div>
                    <button
                      onClick={() => handleSelectQuotaMode('ai_auto')}
                      disabled={!surveyFile}
                      className="w-full py-2 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={13} /> {t('nc_wiz.retry')}
                    </button>
                  </div>
                )}

                {/* No quota found */}
                {quotaAIState === 'no_quota' && (
                  <div className="flex items-start gap-2 bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.22)] rounded-lg px-4 py-3 text-sm text-st-warn">
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{noQuotaMsg || t('nc_wiz.err_no_quota')}</span>
                  </div>
                )}

                {/* Done — show editable cell table */}
                {quotaAIState === 'done' && quotaCells.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-st-txt2">
                        {t('nc_wiz.q_list')}
                        <span className="ml-2 text-xs font-normal text-st-txt3">
                          {t('nc_wiz.n_conds2', { n: quotaCells.length })}
                        </span>
                      </p>
                      <span className="text-xs text-st-txt3">
                        {t('nc_wiz.total_target_2', { n: quotaCells.reduce((s, c) => s + (Number(c.target) || 0), 0) })}
                      </span>
                    </div>
                    <QuotaCellTable cells={quotaCells} onAdd={addQuotaCell} onRemove={removeQuotaCell} onUpdate={updateQuotaCell} />
                  </div>
                )}
              </div>
            )}

            {/* ── Manual mode ── */}
            {quotaSetupMode === 'manual' && (
              <div className="space-y-5">
                {/* Variable definition */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-st-txt2">{t('nc_wiz.var_def')}</p>
                  <div className="space-y-2">
                    {/* Column headers */}
                    <div className="grid grid-cols-[140px_1fr_1fr_32px] gap-2 px-1">
                      <span className="text-xs text-st-txt3">{t('nc_wiz.v_name')}</span>
                      <span className="text-xs text-st-txt3">{t('nc_wiz.v_values')}</span>
                      <span className="text-xs text-st-txt3">{t('nc_wiz.v_ai')}</span>
                      <span />
                    </div>
                    {quotaVars.map((v, i) => (
                      <div key={v.id} className="grid grid-cols-[140px_1fr_1fr_32px] gap-2 items-center">
                        <input
                          type="text"
                          value={v.name}
                          onChange={e => updateQuotaVar(v.id, 'name', e.target.value)}
                          placeholder={[
                            t('nc_wiz.ex_n0'), t('nc_wiz.ex_n1'), t('nc_wiz.ex_n2'),
                          ][i] ?? t('nc_wiz.ex_n0')}
                          className="border border-st-b-sub rounded-lg px-3 py-1.5 text-sm text-st-txt2 focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent"
                        />
                        <input
                          type="text"
                          value={v.valuesRaw}
                          onChange={e => updateQuotaVar(v.id, 'valuesRaw', e.target.value)}
                          placeholder={[
                            t('nc_wiz.ex_v0'), t('nc_wiz.ex_v1'), t('nc_wiz.ex_v2'),
                          ][i] ?? t('nc_wiz.ex_v0')}
                          className="border border-st-b-sub rounded-lg px-3 py-1.5 text-sm text-st-txt2 focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent"
                        />
                        <input
                          type="text"
                          value={v.aiPrompt}
                          onChange={e => updateQuotaVar(v.id, 'aiPrompt', e.target.value)}
                          placeholder={t('nc_wiz.ex_note')}
                          className="border border-st-b-sub rounded-lg px-3 py-1.5 text-sm text-st-txt2 focus:outline-none focus:ring-2 focus:ring-st-teal focus:border-transparent bg-transparent"
                        />
                        <button
                          onClick={() => removeQuotaVar(v.id)}
                          disabled={quotaVars.length === 1}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[rgba(252,165,165,0.08)] text-st-txt3 hover:text-st-err transition-colors disabled:opacity-30"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addQuotaVar}
                    className="flex items-center gap-1.5 text-xs text-st-teal-l hover:text-st-ok transition-colors"
                  >
                    <Plus size={12} /> {t('nc_wiz.add_var')}
                  </button>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerateCombinations}
                  disabled={!quotaVars.some(v => v.name.trim() && v.valuesRaw.trim())}
                  className="w-full py-2.5 bg-st-teal text-white rounded-lg text-sm font-medium hover:bg-st-teal-h disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles size={14} /> {t('nc_wiz.gen_cells')}
                </button>

                {/* Generated cells */}
                {quotaCells.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-st-txt2">
                        {t('nc_wiz.q_list')}
                        <span className="ml-2 text-xs font-normal text-st-txt3">
                          {t('nc_wiz.n_conds2', { n: quotaCells.length })}
                        </span>
                      </p>
                      <span className="text-xs text-st-txt3">
                        {t('nc_wiz.total_target_2', { n: quotaCells.reduce((s, c) => s + (Number(c.target) || 0), 0) })}
                      </span>
                    </div>
                    <QuotaCellTable cells={quotaCells} onAdd={addQuotaCell} onRemove={removeQuotaCell} onUpdate={updateQuotaCell} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <div className="flex gap-3 px-6 py-4 border-t border-st-b-sub bg-st-card">
            <button onClick={backFromStep4}
              className="flex-1 py-2 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
              {t('common.prev')}
            </button>
            <button
              onClick={() => setStep(5)}
              disabled={!quotaSetupMode}
              className="flex-1 py-2 bg-st-teal text-white rounded-lg text-sm font-medium hover:bg-st-teal-h disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {quotaCells.length > 0
                ? t('nc_wiz.confirm_next', { n: quotaCells.length })
                : t('nc_wiz.skip_next')
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Call Analysis ──────────────────────────────────────────── */}
      {step === 5 && (
        <div className="bg-st-nav border border-st-b-sub rounded-lg overflow-hidden">
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-center gap-2">
              <Settings2 size={18} className="text-st-teal-l" />
              <h2 className="font-medium text-st-txt1">{t('nc_wiz.step_5')}</h2>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-st-txt4 uppercase tracking-[0.1em] flex items-center gap-1.5">
                <Settings2 size={12} />{t('contracts.so_section')}
              </p>
              <button
                onClick={() => setSoEnabled(v => !v)}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
                  soEnabled ? 'bg-st-teal' : 'bg-[rgba(255,255,255,0.1)]',
                )}
              >
                <span className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                  soEnabled ? 'translate-x-[18px]' : 'translate-x-0.5',
                )} />
              </button>
            </div>

            {soEnabled && (
              <div className="space-y-4">
                {/* Call success criteria */}
                <div>
                  <label className="text-[11px] text-st-txt3 mb-1.5 block">{t('contracts.so_criteria_label')}</label>
                  <input
                    type="text"
                    value={soCriteria}
                    onChange={e => setSoCriteria(e.target.value)}
                    placeholder={t('contracts.so_criteria_ph')}
                    className="w-full px-3 py-1.5 rounded-lg text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors placeholder:text-st-txt4"
                  />
                </div>

                {/* Custom evaluations */}
                <div>
                  <label className="text-[11px] text-st-txt3 mb-2 block">{t('contracts.so_custom_evals_label')}</label>
                  <div className="space-y-2">
                    {customEvals.map((ev, idx) => (
                      <div key={idx} className="flex gap-2 items-start p-3 rounded-lg bg-st-bg border border-st-b-sub">
                        <input
                          type="text"
                          value={ev.variable_name}
                          onChange={e => updateCustomEval(idx, 'variable_name', e.target.value)}
                          placeholder={t('contracts.so_var_name_ph')}
                          className="w-28 flex-shrink-0 px-2 py-1 rounded text-xs text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors placeholder:text-st-txt4 font-mono"
                        />
                        <select
                          value={ev.type}
                          onChange={e => updateCustomEval(idx, 'type', e.target.value)}
                          className="w-24 flex-shrink-0 px-2 py-1 rounded text-xs text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors"
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                        </select>
                        <input
                          type="text"
                          value={ev.criteria}
                          onChange={e => updateCustomEval(idx, 'criteria', e.target.value)}
                          placeholder={t('contracts.so_eval_criteria_ph')}
                          className="flex-1 min-w-0 px-2 py-1 rounded text-xs text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors placeholder:text-st-txt4"
                        />
                        {ev.type !== 'boolean' && (
                          <div className="flex flex-col gap-1.5 w-40 flex-shrink-0">
                            {ev.enums.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {ev.enums.map((en, ei) => (
                                  <span key={ei} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[rgba(20,184,166,0.15)] text-st-teal text-[10px]">
                                    {en}
                                    <button onClick={() => removeEnum(idx, ei)} className="hover:text-white transition-colors">
                                      <X size={9} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <input
                              type="text"
                              value={ev._draft}
                              onChange={e => updateCustomEval(idx, '_draft', e.target.value)}
                              onKeyDown={e => {
                                if ((e.key === 'Enter' || e.key === ',') && ev._draft.trim()) {
                                  e.preventDefault()
                                  addEnum(idx, ev._draft.trim())
                                }
                              }}
                              placeholder={t('contracts.so_enum_ph')}
                              className="w-full px-2 py-0.5 rounded text-[11px] text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors placeholder:text-st-txt4"
                            />
                          </div>
                        )}
                        <button
                          onClick={() => removeCustomEval(idx)}
                          className="flex-shrink-0 p-1 rounded text-st-txt4 hover:text-st-err hover:bg-[rgba(252,165,165,0.08)] transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addCustomEval}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-st-txt3 hover:text-st-txt1 border border-dashed border-st-b-sub hover:border-st-b-teal transition-colors"
                    >
                      <Plus size={12} />{t('contracts.so_add_eval')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <div className="flex gap-3 px-6 py-4 border-t border-st-b-sub bg-st-card">
            <button onClick={() => setStep(4)}
              className="flex-1 py-2 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
              {t('common.prev')}
            </button>
            <button onClick={() => setStep(6)}
              className="flex-1 py-2 bg-st-teal text-white rounded-lg text-sm font-medium hover:bg-st-teal-h transition-colors">
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 6: Phone List ─────────────────────────────────────────────── */}
      {step === 6 && (
        <div className="bg-st-nav border border-st-b-sub rounded-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone size={18} className="text-st-teal-l" />
              <h2 className="font-medium text-st-txt1">{t('nc_wiz.step_6')}</h2>
            </div>
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs text-st-teal-l hover:text-st-ok border border-st-b-teal rounded-lg px-3 py-1.5 hover:bg-st-teal-bg transition-colors">
              <Download size={13} /> {t('new_survey.phone_download_template')}
            </button>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setPhoneDragging(true) }}
            onDragLeave={() => setPhoneDragging(false)}
            onDrop={e => { e.preventDefault(); setPhoneDragging(false); const f = e.dataTransfer.files[0]; if (f) handlePhoneFile(f) }}
            onClick={() => phoneInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
              phoneDragging
                ? 'border-st-b-teal bg-st-teal-bg'
                : csvResult?.valid
                  ? 'border-st-b-teal bg-st-teal-bg'
                  : csvResult && !csvResult.valid
                    ? 'border-[rgba(252,165,165,0.22)] bg-[rgba(252,165,165,0.08)]'
                    : 'border-st-b-sub bg-st-card hover:border-st-b-hover hover:bg-[rgba(255,255,255,0.04)]'
            )}>
            <Upload size={24} className={cn('mx-auto mb-2',
              csvResult?.valid           ? 'text-st-teal-l' :
              csvResult && !csvResult.valid ? 'text-st-err' : 'text-st-txt3'
            )} />
            {phoneFile ? (
              <div>
                <span className="inline-flex items-center gap-2 bg-st-teal-bg text-st-teal-l border border-st-b-teal rounded-lg px-3 py-1.5 text-sm font-medium">
                  <Phone size={13} />
                  {phoneFile.name}
                </span>
                <p className="text-xs text-st-txt3 mt-2">{(phoneFile.size / 1024).toFixed(1)} KB</p>
                {csvResult?.valid && (
                  <p className="text-xs text-st-teal-l font-medium mt-1.5">
                    {t('nc_wiz.n_lines', { n: csvResult.tasks.length })}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-st-txt2">{t('new_survey.phone_drag_drop')}</p>
                <p className="text-xs text-st-txt3 mt-1">{t('new_survey.phone_file_hint')}</p>
              </div>
            )}
            <input ref={phoneInputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoneFile(f) }} />
          </div>

          {csvResult && !csvResult.valid && (
            <div className="bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-st-err flex-shrink-0" />
                <span className="text-sm font-medium text-st-err">
                  {t('nc_wiz.n_errs', { n: csvResult.errors.length })}
                </span>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {csvResult.errors.map((err, i) => (
                  <li key={i} className="text-xs text-st-err font-mono bg-[rgba(252,165,165,0.08)] rounded px-2 py-1">{err}</li>
                ))}
              </ul>
            </div>
          )}

          {createError && (
            <div className="bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg p-3 text-sm text-st-err">{createError}</div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(5)}
              className="flex-1 py-2 bg-transparent border border-st-b-sub text-st-txt2 rounded-lg text-sm font-medium hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
              {t('common.prev')}
            </button>
            <button onClick={handleCreate} disabled={!csvResult?.valid || creating}
              className="flex-1 py-2 bg-st-teal text-white rounded-lg text-sm font-medium hover:bg-st-teal-h disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {creating && <Loader2 size={14} className="animate-spin" />}
              {creating ? t('nc_wiz.creating_campaign') : t('nc_wiz.create_campaign')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
