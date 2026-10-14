import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation, type TFunction } from 'react-i18next'
import {
  ArrowLeft, Loader2, StopCircle, RefreshCw, Phone, MessageSquare, Database, Download, X,
  PhoneCall, PhoneOutgoing, Voicemail, PhoneMissed, CircleAlert, Timer,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { campaignAgentSourceLabel, campaignQuotaModeLabel } from '../../lib/campaignDisplayLabels'
import { bcp47ForI18n } from '../../i18n'
import { API } from '../../lib/api'
import { ContractFieldValue, type Corrections } from '../../lib/contractFieldDiff'

const CONTRACT_FIELD_LABELS: [string, string][] = [
  ['使用者', '使用者'],
  ['使用場所住所', '使用場所住所'],
  ['部屋番号', '部屋番号'],
  ['契約プラン', '契約プラン'],
  ['支払方法', '支払方法'],
]

interface ContractInfo {
  id: number
  fields: Record<string, string | null>
  corrections: Corrections
}

interface CampaignV2Detail {
  id: number
  campaign_id: string
  campaign_name: string
  questionnaire_type: string | null
  quota_mode: string | null
  total_numbers: number | null
  calls_count: number | null
  phone_number_id: string | null
  phone_number: string | null
  agent_id: string | null
  agent_name: string | null
  start_immediately: boolean | null
  scheduled_start_time: string | null
  max_call_duration_seconds: number | null
  silence_timeout_seconds: number | null
  end_call_on_silence_timeout: boolean | null
  ring_timeout_seconds: number | null
  end_call_on_user_request: boolean | null
  end_call_on_ai_assistant: boolean | null
  structured_output: unknown | null
  enable_transcript: boolean | null
  enable_recording: boolean | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

interface CallV2ListItem {
  sip_call_id: string | null
  call_id: string
  campaign_id: string
  agent_id: string | null
  agent_session_id: string | null
  agent_name: string | null
  from_number: string | null
  to_number: string | null
  call_category: string | null
  hangup_reason: string | null
  duration_seconds: number | null
  answered_ts: number | null
  call_ts: number | null
  channel_name: string | null
  record_file_url: string | null
  has_transcript: boolean
  has_structured_output: boolean
}

interface CallV2Stats {
  campaign_id: string
  total_dialed: number
  answered: number
  voicemail: number
  no_answer: number
  failed: number
  total_duration_seconds: number
}

type CallListCategory = 'all' | 'answered' | 'voicemail' | 'no_answer' | 'failed'
type CallListSort = 'time_desc' | 'duration_asc' | 'duration_desc'

interface CallV2Detail {
  sip_call_id: string | null
  call_id: string
  campaign_id: string
  agent_id: string | null
  agent_session_id: string | null
  agent_name: string | null
  from_number: string | null
  to_number: string | null
  call_category: string | null
  hangup_reason: string | null
  duration_seconds: number | null
  answered_ts: number | null
  call_ts: number | null
  channel_name: string | null
  transcript: { role: string; content: string }[]
  record_file_url: string | null
  has_structured_output?: boolean
  structured_output: unknown[] | null
  contract?: ContractInfo | null
}

const STATUS_STYLE: Record<string, string> = {
  completed:   'bg-[rgba(255,255,255,0.04)] text-st-txt2',
  interrupted: 'bg-[rgba(252,165,165,0.08)] text-st-err',
  interrupt:   'bg-[rgba(252,165,165,0.08)] text-st-err',
  running:     'bg-[rgba(13,148,136,0.12)] text-st-ok',
  scheduled:   'bg-[rgba(255,255,255,0.04)] text-st-txt1',
  paused:      'bg-[rgba(251,191,36,0.08)] text-st-warn',
  pending:     'bg-[rgba(255,255,255,0.04)] text-st-txt3',
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-st-b-div last:border-0">
      <span className="w-36 flex-shrink-0 text-xs text-st-txt3 pt-0.5">{label}</span>
      <span className="text-sm text-st-txt1 font-mono break-all">{value ?? '—'}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-st-nav border border-st-b-sub rounded-lg p-4">
      <h3 className="text-sm font-medium text-st-txt1 mb-3 pb-2 border-b border-st-b-div">{title}</h3>
      {children}
    </div>
  )
}

function fmtSecondsI18n(t: TFunction, s: number | null) {
  if (s == null) return '—'
  if (s >= 3600) {
    return t('agora.time_h', { n: s / 3600 })
  }
  if (s >= 60) {
    return t('agora.time_m_s', { m: Math.floor(s / 60), s: s % 60 })
  }
  return t('agora.time_s', { n: s })
}

function fmtDurationHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
}

function fmtDateLocale(s: string | null, lng: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString(bcp47ForI18n(lng))
}

function fmtTsLocale(ts: number | null, lng: string) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString(bcp47ForI18n(lng))
}

function isCampaignTerminalStatus(status: string | null | undefined) {
  const st = (status ?? '').toLowerCase()
  return st === 'completed' || st === 'interrupted' || st === 'interrupt' || st === 'failed'
}

const TERMINAL_SYNC_GRACE_MS = 3 * 60 * 1000

/**
 * 终态时是否在「允许 sync 通话」的宽限内。取 min(服务端 updated_at, 进页/观察终态的 terminalAt) 为锚点：
 * 老数据 completed 的 updated_at 通常很早，进页时虽会写 terminalAt=now，但 min 仍偏早，超过 3 分钟即停 sync。
 * running / scheduled 始终允许 sync。
 */
function shouldSyncCallsNow(
  status: string | null | undefined,
  terminalAtMs: number | null,
  serverUpdatedAt: string | null | undefined,
) {
  const st = (status ?? '').toLowerCase()
  if (st === 'running' || st === 'scheduled') return true
  if (!isCampaignTerminalStatus(status)) return false
  const times: number[] = []
  if (serverUpdatedAt) {
    const u = new Date(serverUpdatedAt).getTime()
    if (!Number.isNaN(u)) {
      times.push(u)
    }
  }
  if (terminalAtMs != null) {
    times.push(terminalAtMs)
  }
  if (times.length === 0) {
    return false
  }
  const anchor = Math.min(...times)
  return Date.now() - anchor <= TERMINAL_SYNC_GRACE_MS
}

export function CampaignDetailPage() {
  const { t, i18n } = useTranslation()
  const statusLabel = useMemo(() => ({
    completed: t('agora.status_completed'),
    interrupted: t('agora.status_interrupted'),
    interrupt: t('agora.status_interrupted'),
    running: t('agora.status_running'),
    scheduled: t('agora.status_scheduled'),
    paused: t('agora.status_paused'),
    pending: t('agora.status_pending'),
    failed: t('agora.status_failed'),
  }), [t, i18n.language])
  const featureKeys = useMemo((): { key: keyof CampaignV2Detail; label: string }[] => [
    { key: 'enable_transcript', label: t('agora.feature_transcript') },
    { key: 'enable_recording', label: t('agora.feature_recording') },
    { key: 'end_call_on_silence_timeout', label: t('agora.end_silence') },
    { key: 'end_call_on_user_request', label: t('agora.end_user') },
    { key: 'end_call_on_ai_assistant', label: t('agora.end_ai') },
  ], [t, i18n.language])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState<CampaignV2Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [interrupting, setInterrupting] = useState(false)
  const statusRef = useRef<string | null>(null)
  const serverUpdatedAtRef = useRef<string | null>(null)
  const terminalAtRef = useRef<number | null>(null)
  const callsSyncingRef = useRef(false)
  const lastCampaignUpstreamAtRef = useRef(0)

  const [calls, setCalls] = useState<CallV2ListItem[]>([])
  const [callsTotal, setCallsTotal] = useState(0)
  const [callsLoading, setCallsLoading] = useState(false)
  const [callsError, setCallsError] = useState('')
  const [callStats, setCallStats] = useState<CallV2Stats | null>(null)
  const PAGE_SIZE = 50
  const [page, setPage] = useState(1)
  const [callCategoryFilter, setCallCategoryFilter] = useState<CallListCategory>('all')
  const [callListSort, setCallListSort] = useState<CallListSort>('time_desc')
  const [activeTranscript, setActiveTranscript] = useState<CallV2Detail | null>(null)
  const [activeStructured, setActiveStructured] = useState<CallV2Detail | null>(null)

  useEffect(() => {
    setPage(1)
    setCallStats(null)
    setCallCategoryFilter('all')
    setCallListSort('time_desc')
    statusRef.current = null
    serverUpdatedAtRef.current = null
    terminalAtRef.current = null
  }, [id])

  function callListQueryString(pageOverride?: number) {
    return new URLSearchParams({
      page: String(pageOverride ?? page),
      page_size: String(PAGE_SIZE),
      category: callCategoryFilter,
      sort: callListSort,
    }).toString()
  }

  function onStatFilterClick(next: CallListCategory) {
    setCallCategoryFilter(prev => (prev === next && next !== 'all' ? 'all' : next))
    setPage(1)
  }

  function applyCallsListPayload(body: {
    items?: CallV2ListItem[]
    total?: number
    stats?: CallV2Stats
  }) {
    setCalls((body.items ?? []) as CallV2ListItem[])
    setCallsTotal(Number(body.total ?? 0))
    if (body.stats) {
      setCallStats(body.stats)
    }
  }

  useEffect(() => {
    if (!id) return
    fetch(`${API}/api/campaigns-v2/${id}`)
      .then(r => r.json())
      .then(data => {
        setCampaign(data)
        statusRef.current = data.status ?? null
        serverUpdatedAtRef.current = data.updated_at ?? null
        const TERMINAL = new Set(['completed', 'interrupted', 'interrupt', 'failed'])
        if (TERMINAL.has((data.status ?? '').toLowerCase()) && !terminalAtRef.current) {
          terminalAtRef.current = Date.now()
        }
      })
      .catch(() => setError(t('agora.load_fail')))
      .finally(() => setLoading(false))
  }, [id, t])

  async function fetchCallsPage() {
    if (!id) throw new Error(t('agora.load_calls_fail'))
    const dbResp = await fetch(`${API}/api/calls-v2/${id}?${callListQueryString()}`)
    if (!dbResp.ok) {
      const errText = await dbResp.text()
      throw new Error(errText || t('agora.load_calls_fail'))
    }
    const dbBody = await dbResp.json()
    applyCallsListPayload(dbBody as { items?: CallV2ListItem[]; total?: number; stats?: CallV2Stats })
  }

  async function loadCalls(preferDbOnly: boolean) {
    if (!id) return
    if (!preferDbOnly) {
      setCallsLoading(true)
    }
    setCallsError('')
    try {
      await fetchCallsPage()
      if (preferDbOnly) return

      const syncResp = await fetch(`${API}/api/calls-v2/${id}/sync`, { method: 'POST' })
      if (syncResp.ok) {
        await syncResp.json()
        const refreshed = await fetch(`${API}/api/calls-v2/${id}?${callListQueryString()}`)
        if (refreshed.ok) {
          const refreshedBody = await refreshed.json()
          applyCallsListPayload(refreshedBody as { items?: CallV2ListItem[]; total?: number; stats?: CallV2Stats })
        }
      }
    } catch (e) {
      setCallsError(e instanceof Error ? e.message : t('agora.load_calls_fail'))
    } finally {
      if (!preferDbOnly) {
        setCallsLoading(false)
      }
    }
  }

  async function syncCalls() {
    await loadCalls(false)
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const run = async () => {
      setCallsError('')
      try {
        await fetchCallsPage()
      } catch (e) {
        if (!cancelled) {
          setCallsError(e instanceof Error ? e.message : t('agora.load_calls_fail'))
        }
        return
      }
      if (cancelled) return
      if (!shouldSyncCallsNow(statusRef.current, terminalAtRef.current, serverUpdatedAtRef.current)) {
        return
      }
      setCallsLoading(true)
      try {
        const syncResp = await fetch(`${API}/api/calls-v2/${id}/sync`, { method: 'POST' })
        if (syncResp.ok) {
          await syncResp.json()
          const refreshed = await fetch(`${API}/api/calls-v2/${id}?${callListQueryString()}`)
          if (refreshed.ok) {
            const refreshedBody = await refreshed.json()
            if (!cancelled) {
              applyCallsListPayload(refreshedBody as { items?: CallV2ListItem[]; total?: number; stats?: CallV2Stats })
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setCallsError(e instanceof Error ? e.message : t('agora.sync_calls_fail'))
        }
      } finally {
        if (!cancelled) {
          setCallsLoading(false)
        }
      }
    }
    run().catch(() => {})
    return () => { cancelled = true }
  }, [id, page, callCategoryFilter, callListSort, t])

  // Auto-refresh: DB every tick. Upstream Agora while scheduled or running (scheduled→running needs upstream).
  useEffect(() => {
    if (!id) return
    lastCampaignUpstreamAtRef.current = 0
    const TERMINAL = new Set(['completed', 'interrupted', 'interrupt', 'failed'])
    const UPSTREAM_COOLDOWN_MS = 10_000
    const tickCampaign = async () => {
      try {
        const st = (statusRef.current ?? '').toLowerCase()
        const now = Date.now()
        const useUpstream =
          (st === 'running' || st === 'scheduled') &&
          now - lastCampaignUpstreamAtRef.current >= UPSTREAM_COOLDOWN_MS
        const q = useUpstream ? '?refresh_from_upstream=true' : ''
        const r = await fetch(`${API}/api/campaigns-v2/${id}${q}`)
        if (!r.ok) return
        const data = await r.json()
        if (useUpstream) {
          lastCampaignUpstreamAtRef.current = Date.now()
        }
        setCampaign(data)
        statusRef.current = data.status ?? null
        serverUpdatedAtRef.current = data.updated_at ?? null
        if (TERMINAL.has((data.status ?? '').toLowerCase()) && !terminalAtRef.current) {
          terminalAtRef.current = Date.now()
        }
      } catch { /* ignore */ }
    }
    void tickCampaign()
    const timer = setInterval(() => { void tickCampaign() }, 10_000)
    return () => clearInterval(timer)
  }, [id])

  // Auto-refresh calls: running / scheduled; terminal + 3 minutes grace period.
  useEffect(() => {
    if (!id) return
    const tick = async () => {
      if (!shouldSyncCallsNow(statusRef.current, terminalAtRef.current, serverUpdatedAtRef.current)) {
        return
      }
      if (callsSyncingRef.current) return
      callsSyncingRef.current = true
      try {
        const resp = await fetch(`${API}/api/calls-v2/${id}/sync`, { method: 'POST' })
        if (resp.ok) {
          await resp.json()
          const refreshed = await fetch(`${API}/api/calls-v2/${id}?${callListQueryString()}`)
          if (refreshed.ok) {
            const refreshedBody = await refreshed.json()
            applyCallsListPayload(refreshedBody as { items?: CallV2ListItem[]; total?: number; stats?: CallV2Stats })
          }
        }
      } catch { /* ignore */ }
      finally {
        callsSyncingRef.current = false
      }
    }
    const timer = setInterval(() => { tick().catch(() => {}) }, 10_000)
    tick().catch(() => {})
    return () => clearInterval(timer)
  }, [id, page, callCategoryFilter, callListSort])

  async function handleInterrupt() {
    if (!id || !campaign) return
    setInterrupting(true)
    try {
      const resp = await fetch(`${API}/api/campaigns-v2/${id}/interrupt`, { method: 'POST' })
      if (!resp.ok) throw new Error()
      setCampaign(prev => prev ? { ...prev, status: 'interrupted' } : prev)
      statusRef.current = 'interrupted'
      if (!terminalAtRef.current) {
        terminalAtRef.current = Date.now()
      }
      serverUpdatedAtRef.current = new Date().toISOString()
    } catch {
      alert(t('agora.interrupt_fail'))
    } finally {
      setInterrupting(false)
    }
  }

  function categoryStyle(cat: string | null): { dot: string; text: string } {
    const c = (cat ?? '').toLowerCase()
    if (c.includes('answered')) return { dot: 'bg-st-ok', text: 'text-st-ok' }
    if (c.includes('transferred_success') || c.includes('transfer_success')) return { dot: 'bg-st-ok', text: 'text-st-ok' }
    if (c.includes('transferred_failed') || c.includes('transfer_failed')) return { dot: 'bg-st-err', text: 'text-st-err' }
    if (c.includes('voicemail')) return { dot: 'bg-st-teal', text: 'text-st-txt2' }
    if (c.includes('no_answer') || c === 'no-answer') return { dot: 'bg-st-warn', text: 'text-st-warn' }
    if (c.includes('failed') || c.includes('error')) return { dot: 'bg-st-err', text: 'text-st-err' }
    if (c.includes('ai_assistant') || c.includes('ai-assistant')) return { dot: 'bg-st-teal', text: 'text-st-txt2' }
    return { dot: 'bg-[rgba(255,255,255,0.20)]', text: 'text-st-txt3' }
  }

  function closeModals() {
    setActiveTranscript(null)
    setActiveStructured(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32 text-st-txt3">
      <Loader2 size={20} className="animate-spin mr-2" />
      <span className="text-sm">{t('agora.loading')}</span>
    </div>
  )

  if (error || !campaign) return (
    <div className="p-8">
      <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm text-st-txt3 hover:text-st-txt2 mb-6">
        <ArrowLeft size={15} /> {t('agora.back')}
      </button>
      <div className="bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg p-4 text-sm text-st-err">
        {error || t('agora.not_found')}
      </div>
    </div>
  )

  const status = campaign.status ?? 'pending'
  const isTerminal = status === 'completed' || status === 'interrupted' || status === 'interrupt' || status === 'failed'
  const totalNumbers = Math.max(0, Number(campaign.total_numbers ?? 0))
  const dialedNumbers = Math.max(0, Number(campaign.calls_count ?? 0))
  const pct = totalNumbers > 0 ? Math.min(100, Math.round((dialedNumbers / totalNumbers) * 100)) : 0

  const totalPages = Math.max(1, Math.ceil(callsTotal / PAGE_SIZE))
  const pageItems = calls

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 bg-st-nav border-b border-st-b-div px-6 py-4 flex-shrink-0">
          <div className="min-w-0 animate-fade-in">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm text-st-txt3 hover:text-st-txt2 mb-2">
              <ArrowLeft size={15} /> {t('agora.back_list')}
            </button>
            <h1 className="text-lg font-medium text-st-txt1 truncate">{campaign.campaign_name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={cn('inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[status] ?? 'bg-[rgba(255,255,255,0.04)] text-st-txt3')}>
                {statusLabel[status] ?? status}
              </span>
              {campaign.questionnaire_type && (
                <span className="inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium bg-[rgba(255,255,255,0.04)] text-st-txt1">
                  {campaignAgentSourceLabel(t, campaign.questionnaire_type)}
                </span>
              )}
              {campaign.quota_mode && (
                <span className="inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium bg-[rgba(255,255,255,0.04)] text-st-txt2">
                  {campaignQuotaModeLabel(t, campaign.quota_mode)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                syncCalls()
              }}
              disabled={callsLoading}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                callsLoading
                  ? 'bg-[rgba(255,255,255,0.02)] text-st-txt4 border-st-b-sub cursor-not-allowed'
                  : 'border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal'
              )}
            >
              <RefreshCw size={13} className={cn(callsLoading && 'animate-spin')} />
              {shouldSyncCallsNow(statusRef.current, terminalAtRef.current, serverUpdatedAtRef.current)
                ? t('agora.refresh_calls')
                : t('agora.refresh_list')}
            </button>
            <button
              onClick={handleInterrupt}
              disabled={isTerminal || interrupting}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                isTerminal
                  ? 'bg-[rgba(255,255,255,0.02)] text-st-txt4 cursor-not-allowed border border-st-b-sub'
                  : 'border border-[rgba(252,165,165,0.22)] text-st-err hover:bg-[rgba(252,165,165,0.08)]'
              )}
            >
              {interrupting ? <Loader2 size={13} className="animate-spin" /> : <StopCircle size={13} />}
              Interrupt
            </button>
          </div>
        </div>

        {/* Call overview stats */}
        <div className="flex-shrink-0 border-b border-st-b-div bg-st-bg px-6 py-3">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <button
              type="button"
              onClick={() => onStatFilterClick('all')}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer animate-slide-up',
                callCategoryFilter === 'all'
                  ? 'border-st-b-teal bg-[rgba(255,255,255,0.04)]'
                  : 'border-st-b-sub hover:bg-[rgba(255,255,255,0.04)]',
              )}
              style={{ animationDelay: '0ms' }}
            >
              <div className="mt-0.5 rounded-lg bg-[rgba(255,255,255,0.04)] p-1.5 text-st-txt2">
                <PhoneOutgoing size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-st-txt3">{t('agora.stat_total_dialed')}</p>
                <p className="text-lg font-normal tabular-nums tracking-tight text-st-txt1">
                  {callStats != null ? callStats.total_dialed : '—'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onStatFilterClick('answered')}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer animate-slide-up',
                callCategoryFilter === 'answered'
                  ? 'border-st-b-teal bg-[rgba(255,255,255,0.04)]'
                  : 'border-st-b-sub hover:bg-[rgba(255,255,255,0.04)]',
              )}
              style={{ animationDelay: '60ms' }}
            >
              <div className="mt-0.5 rounded-lg bg-[rgba(13,148,136,0.10)] p-1.5 text-st-ok">
                <PhoneCall size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-st-txt3">{t('agora.stat_answered')}</p>
                <p className="text-lg font-normal tabular-nums tracking-tight text-st-txt1">
                  {callStats != null ? callStats.answered : '—'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onStatFilterClick('voicemail')}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer animate-slide-up',
                callCategoryFilter === 'voicemail'
                  ? 'border-st-b-teal bg-[rgba(255,255,255,0.04)]'
                  : 'border-st-b-sub hover:bg-[rgba(255,255,255,0.04)]',
              )}
              style={{ animationDelay: '120ms' }}
            >
              <div className="mt-0.5 rounded-lg bg-[rgba(255,255,255,0.04)] p-1.5 text-st-txt2">
                <Voicemail size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-st-txt3">{t('agora.stat_voicemail')}</p>
                <p className="text-lg font-normal tabular-nums tracking-tight text-st-txt1">
                  {callStats != null ? callStats.voicemail : '—'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onStatFilterClick('no_answer')}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer animate-slide-up',
                callCategoryFilter === 'no_answer'
                  ? 'border-st-b-teal bg-[rgba(255,255,255,0.04)]'
                  : 'border-st-b-sub hover:bg-[rgba(255,255,255,0.04)]',
              )}
              style={{ animationDelay: '180ms' }}
            >
              <div className="mt-0.5 rounded-lg bg-[rgba(251,191,36,0.08)] p-1.5 text-st-warn">
                <PhoneMissed size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-st-txt3">{t('agora.stat_no_answer')}</p>
                <p className="text-lg font-normal tabular-nums tracking-tight text-st-txt1">
                  {callStats != null ? callStats.no_answer : '—'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onStatFilterClick('failed')}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer animate-slide-up',
                callCategoryFilter === 'failed'
                  ? 'border-st-b-teal bg-[rgba(255,255,255,0.04)]'
                  : 'border-st-b-sub hover:bg-[rgba(255,255,255,0.04)]',
              )}
              style={{ animationDelay: '240ms' }}
            >
              <div className="mt-0.5 rounded-lg bg-[rgba(252,165,165,0.08)] p-1.5 text-st-err">
                <CircleAlert size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-st-txt3">{t('agora.stat_failed')}</p>
                <p className="text-lg font-normal tabular-nums tracking-tight text-st-txt1">
                  {callStats != null ? callStats.failed : '—'}
                </p>
              </div>
            </button>
            <div className="flex items-start gap-2 rounded-lg border border-st-b-sub px-3 py-2.5 animate-slide-up" style={{ animationDelay: '300ms' }}>
              <div className="mt-0.5 rounded-lg bg-[rgba(255,255,255,0.04)] p-1.5 text-st-txt2">
                <Timer size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-st-txt3">{t('agora.stat_total_duration')}</p>
                <p className="text-lg font-normal tabular-nums tracking-tight text-st-txt1">
                  {callStats != null ? fmtDurationHms(callStats.total_duration_seconds) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Body split */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: campaign detail */}
          <div className="w-[30%] min-w-[360px] overflow-y-auto p-6 bg-st-bg">
            <div className="space-y-3">
              <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
              <Card title={t('agora.card_basic')}>
                <div className="py-2.5 border-b border-st-b-div">
                  <div className="flex items-center justify-between text-[11px] text-st-txt3">
                    <span>{t('agora.dial_progress')}</span>
                    <span className="font-mono">{dialedNumbers}/{totalNumbers}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded bg-[rgba(13,148,136,0.20)] overflow-hidden">
                    <div
                      className="h-full bg-st-teal rounded transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <InfoRow label="Campaign ID"   value={campaign.campaign_id} />
                <InfoRow label="Campaign Name" value={<span className="font-sans">{campaign.campaign_name}</span>} />
                <InfoRow label={t('agora.caller_id')}     value={campaign.phone_number} />
                <InfoRow label="Agent ID"      value={campaign.agent_id} />
                <InfoRow
                  label={t('agora.task_start_time')}
                  value={
                    campaign.start_immediately == null ? null :
                    campaign.start_immediately
                      ? t('agora.start_immediately_label')
                      : (campaign.scheduled_start_time
                          ? fmtDateLocale(campaign.scheduled_start_time, i18n.language)
                          : t('agora.start_immediately_label'))
                  }
                />
                <InfoRow label={t('agora.created_at')}    value={fmtDateLocale(campaign.created_at, i18n.language)} />
                <InfoRow label={t('agora.updated_at')}   value={fmtDateLocale(campaign.updated_at, i18n.language)} />
              </Card>
              </div>

              <div className="animate-slide-up" style={{ animationDelay: '60ms' }}>
              <Card title={t('agora.card_features')}>
                {featureKeys.map(({ key, label }) => {
                  const enabled = campaign[key] as boolean | null
                  return (
                    <div
                      key={key}
                      className="flex items-start gap-3 py-2.5 border-b border-st-b-div last:border-0"
                    >
                      <span className="w-36 flex-shrink-0 text-xs text-st-txt3 pt-0.5">{label}</span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium tracking-tight',
                          'border',
                          enabled
                            ? 'bg-[rgba(13,148,136,0.12)] text-st-ok border-[rgba(13,148,136,0.25)]'
                            : 'bg-[rgba(255,255,255,0.04)] text-st-txt3 border-st-b-sub',
                        )}
                      >
                        {enabled ? t('agora.feature_enabled') : t('agora.feature_disabled')}
                      </span>
                    </div>
                  )
                })}
              </Card>
              </div>

              <div className="animate-slide-up" style={{ animationDelay: '120ms' }}>
              <Card title={t('agora.card_hangup')}>
                <InfoRow label={t('agora.label_max_call')} value={fmtSecondsI18n(t, campaign.max_call_duration_seconds)} />
                <InfoRow
                  label={t('agora.label_silence_timeout')}
                  value={fmtSecondsI18n(t, campaign.silence_timeout_seconds)}
                />
                <InfoRow label={t('agora.label_max_ring')} value={fmtSecondsI18n(t, campaign.ring_timeout_seconds)} />
              </Card>
              </div>

              {campaign.structured_output && (
                <div className="animate-slide-up" style={{ animationDelay: '180ms' }}>
                <Card title="Structured Output">
                  <pre className="text-xs text-st-txt2 bg-st-bg rounded-lg p-3 overflow-x-auto leading-relaxed border border-st-b-sub">
                    {JSON.stringify(campaign.structured_output, null, 2)}
                  </pre>
                </Card>
                </div>
              )}
            </div>
          </div>

          {/* Right: call records list */}
          <div className="flex-1 overflow-y-auto bg-st-bg">
            <div className="px-4 py-3 border-b border-st-b-div flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Phone size={16} className="text-st-txt2 flex-shrink-0" />
                <h2 className="text-sm font-medium text-st-txt1">{t('agora.call_log')}</h2>
                <span className="text-xs text-st-txt3">{t('agora.calls_n', { n: callsTotal })}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <label className="flex items-center gap-1.5 text-xs text-st-txt3">
                  <span className="whitespace-nowrap">{t('agora.sort_label')}</span>
                  <select
                    value={callListSort}
                    onChange={e => {
                      setCallListSort(e.target.value as CallListSort)
                      setPage(1)
                    }}
                    className="text-xs border border-st-b-sub rounded-lg px-2 py-1.5 bg-transparent text-st-txt2 min-w-0 max-w-[min(100%,220px)]"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="time_desc">{t('agora.sort_time_desc')}</option>
                    <option value="duration_asc">{t('agora.sort_duration_asc')}</option>
                    <option value="duration_desc">{t('agora.sort_duration_desc')}</option>
                  </select>
                </label>
                {callsTotal > 0 && (
                  <div className="flex items-center gap-2 text-xs text-st-txt3">
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className={cn(
                        'px-2 py-1 rounded border',
                        page <= 1 ? 'text-st-txt4 border-st-b-sub cursor-not-allowed' : 'border-st-b-sub hover:bg-[rgba(255,255,255,0.04)]',
                      )}
                    >
                      {t('agora.prev_page')}
                    </button>
                    <span className="font-mono">{page}/{totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className={cn(
                        'px-2 py-1 rounded border',
                        page >= totalPages ? 'text-st-txt4 border-st-b-sub cursor-not-allowed' : 'border-st-b-sub hover:bg-[rgba(255,255,255,0.04)]',
                      )}
                    >
                      {t('agora.next_page')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {callsError && (
              <div className="px-4 py-2 text-xs text-st-err bg-[rgba(252,165,165,0.08)] border-b border-[rgba(252,165,165,0.22)]">
                {callsError}
              </div>
            )}

            {callsLoading && callsTotal === 0 && (
              <div className="flex items-center justify-center py-16 text-st-txt3">
                <Loader2 size={18} className="animate-spin mr-2" />
                <span className="text-sm">{t('agora.fetching_calls')}</span>
              </div>
            )}

            {!callsLoading && callsTotal === 0 && (
              <div className="px-4 py-16 text-center text-st-txt3">
                <p className="text-sm">
                  {(callStats?.total_dialed ?? 0) > 0 && callCategoryFilter !== 'all'
                    ? t('agora.no_calls_in_filter')
                    : t('agora.no_calls')}
                </p>
                {((callStats?.total_dialed ?? 0) === 0 || callCategoryFilter === 'all') && (
                  <p className="text-xs mt-1">{t('agora.no_calls_hint')}</p>
                )}
              </div>
            )}

            {callsTotal > 0 && (
              <div className="overflow-x-auto">
                <div className="min-w-[980px] divide-y divide-st-b-div">
                  <div className="px-4 py-2 bg-st-nav border-b border-st-b-div text-[11px] text-st-txt3 font-medium grid grid-cols-[18px_160px_140px_1fr_70px_1fr_92px] gap-2">
                  <span>{t('agora.th_status')}</span>
                  <span>{t('agora.th_to')}</span>
                  <span>{t('agora.th_type')}</span>
                  <span>{t('agora.th_hangup')}</span>
                  <span>{t('agora.th_duration')}</span>
                  <span>{t('agora.th_session')}</span>
                  <span className="text-right pr-1">{t('agora.th_actions')}</span>
                </div>
                {pageItems.map((c, i) => {
                  const st = categoryStyle(c.call_category)
                  return (
                    <div key={c.call_id} className="px-4 py-2 hover:bg-[rgba(255,255,255,0.02)] transition-colors grid grid-cols-[18px_160px_140px_1fr_70px_1fr_92px] gap-2 items-center animate-row-in" style={{ animationDelay: `${Math.min(i * 35, 550)}ms` }}>
                      <div className="flex items-center justify-start">
                        <span className={cn('w-2.5 h-2.5 rounded-full', st.dot)} title={c.call_category ?? 'unknown'} />
                      </div>
                      <span className={cn('text-[11px] font-mono truncate', st.text)} title={c.to_number ?? ''}>
                        {c.to_number ?? '—'}
                      </span>
                      <span className={cn('text-[11px] font-mono truncate', st.text)} title={c.call_category ?? ''}>
                        {c.call_category ?? '—'}
                      </span>
                      <span className="text-[11px] text-st-txt2 font-mono truncate" title={c.hangup_reason ?? ''}>
                        {c.hangup_reason ?? '—'}
                      </span>
                      <span className="text-[11px] text-st-txt2 font-mono">
                        {c.duration_seconds ?? 0}s
                      </span>
                      <span className="text-[11px] text-st-txt2 font-mono truncate" title={c.agent_session_id ?? ''}>
                          {c.agent_session_id ?? '—'}
                      </span>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={!c.has_transcript}
                          onClick={async () => {
                            if (!c.has_transcript) return
                            try {
                              const r = await fetch(`${API}/api/calls-v2/call/${c.call_id}`)
                              if (!r.ok) return
                              setActiveTranscript((await r.json()) as CallV2Detail)
                            } catch { /* ignore */ }
                          }}
                          className={cn(
                            'w-6 h-6 inline-flex items-center justify-center rounded-lg border',
                            c.has_transcript
                              ? 'border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)]'
                              : 'border-st-b-div text-st-txt5 cursor-not-allowed',
                          )}
                          title={
                            c.has_transcript
                              ? t('agora.tt_transcript')
                              : t('agora.no_transcript')
                          }
                        >
                          <MessageSquare size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={!c.has_structured_output}
                          onClick={async () => {
                            if (!c.has_structured_output) return
                            try {
                              const r = await fetch(`${API}/api/calls-v2/call/${c.call_id}`)
                              if (!r.ok) return
                              setActiveStructured((await r.json()) as CallV2Detail)
                            } catch { /* ignore */ }
                          }}
                          className={cn(
                            'w-6 h-6 inline-flex items-center justify-center rounded-lg border',
                            c.has_structured_output
                              ? 'border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)]'
                              : 'border-st-b-div text-st-txt5 cursor-not-allowed',
                          )}
                          title={
                            c.has_structured_output
                              ? t('agora.tt_structured')
                              : t('agora.no_structured_output')
                          }
                        >
                          <Database size={13} />
                        </button>
                        <a
                          href={c.record_file_url ?? undefined}
                          className={cn(
                            'w-6 h-6 inline-flex items-center justify-center rounded-lg border',
                            c.record_file_url
                              ? 'border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)]'
                              : 'border-st-b-div text-st-txt5 cursor-not-allowed pointer-events-none'
                          )}
                          title={t('agora.tt_recording')}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={13} />
                        </a>
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcript modal */}
      {activeTranscript && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={closeModals}>
          <div className="bg-st-nav border border-st-b-sub rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-st-b-div">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-st-txt2" />
                <span className="text-sm font-medium text-st-txt1">{t('agora.modal_transcript')}</span>
                <span className="text-xs text-st-txt3 font-mono">{activeTranscript.call_id}</span>
              </div>
              <button onClick={closeModals} className="text-st-txt3 hover:text-st-txt2">
                <X size={16} />
              </button>
            </div>
            {activeTranscript.contract && (
              <div className="mx-3 mt-3 border border-st-b-sub rounded-lg p-4 bg-st-bg">
                <p className="text-xs font-medium text-st-txt4 uppercase tracking-[0.1em] mb-3">{t('contracts.extracted_fields')}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {CONTRACT_FIELD_LABELS.map(([key, label]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-[10px] text-st-txt4">{label}</span>
                      <ContractFieldValue
                        value={activeTranscript.contract!.fields[key] ?? null}
                        correction={activeTranscript.contract!.corrections?.[key]}
                        className="text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="p-5 overflow-y-auto space-y-2 bg-st-bg rounded-lg border border-st-b-div m-3">
              {(activeTranscript.transcript ?? []).length === 0 && (
                <p className="text-sm text-st-txt3">{t('agora.no_transcript')}</p>
              )}
              {(activeTranscript.transcript ?? []).filter(m => (m.content ?? '').trim()).map((m, idx) => (
                <div key={idx} className={cn('flex', m.role === 'assistant' ? 'justify-start' : 'justify-end')}>
                  <div className={cn(
                    'max-w-[78%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap',
                    m.role === 'assistant'
                      ? 'bg-st-nav text-st-txt1 border border-st-b-sub rounded-tl-sm'
                      : 'bg-[rgba(255,255,255,0.05)] text-st-txt1 border border-st-b-sub rounded-tr-sm'
                  )}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Structured output modal */}
      {activeStructured && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={closeModals}>
          <div className="bg-st-nav border border-st-b-sub rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-st-b-div">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-st-ok" />
                <span className="text-sm font-medium text-st-txt1">Structured Output</span>
                <span className="text-xs text-st-txt3 font-mono">{activeStructured.call_id}</span>
              </div>
              <button onClick={closeModals} className="text-st-txt3 hover:text-st-txt2">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto bg-st-nav">
              {activeStructured.structured_output == null ? (
                <p className="text-sm text-st-txt3">{t('agora.no_structured_output')}</p>
              ) : (
                <pre className="text-xs text-st-txt2 bg-st-bg rounded-lg p-4 overflow-x-auto border border-st-b-sub">
                  {JSON.stringify(activeStructured.structured_output, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
