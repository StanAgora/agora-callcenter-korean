import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Radio, StopCircle, LayoutDashboard, PieChart, Bot, CalendarDays, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { campaignAgentSourceLabel, campaignQuotaModeLabel } from '../../lib/campaignDisplayLabels'
import { bcp47ForI18n } from '../../i18n'
import { API } from '../../lib/api'

interface CampaignV2Item {
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
  enable_transcript: boolean | null
  enable_recording: boolean | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

// Clean dark minimal status chips
const STATUS_STYLE: Record<string, { chip: string; dot?: string }> = {
  completed:   { chip: 'bg-[rgba(255,255,255,0.05)] text-st-txt3 border border-st-b-sub' },
  interrupted: { chip: 'bg-[rgba(252,165,165,0.08)] text-st-err border border-[rgba(252,165,165,0.22)]' },
  interrupt:   { chip: 'bg-[rgba(252,165,165,0.08)] text-st-err border border-[rgba(252,165,165,0.22)]' },
  running:     { chip: 'bg-[rgba(13,148,136,0.12)] text-st-ok border border-[rgba(13,148,136,0.25)]', dot: 'bg-st-ok' },
  scheduled:   { chip: 'bg-[rgba(255,255,255,0.05)] text-st-txt3 border border-st-b-sub' },
  paused:      { chip: 'bg-[rgba(251,191,36,0.08)] text-st-warn border border-[rgba(251,191,36,0.22)]' },
  pending:     { chip: 'bg-[rgba(255,255,255,0.04)] text-st-txt3 border border-st-b-sub' },
  failed:      { chip: 'bg-[rgba(252,165,165,0.08)] text-st-err border border-[rgba(252,165,165,0.22)]' },
}

type DateFilter = 'today' | 'week' | 'twoweeks' | 'month' | 'custom'

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function startOfWeek(d: Date) {
  const day = d.getDay()          // 0=Sun
  const diff = day === 0 ? -6 : 1 - day  // shift to Monday
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff))
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function CampaignsPage() {
  const { t, i18n } = useTranslation()
  const statusLabel = useMemo(() => ({
    completed:   t('agora.status_completed'),
    interrupted: t('agora.status_interrupted'),
    interrupt:   t('agora.status_interrupted'),
    running:     t('agora.status_running'),
    scheduled:   t('agora.status_scheduled'),
    paused:      t('agora.status_paused'),
    pending:     t('agora.status_pending'),
    failed:      t('agora.status_failed'),
  }), [t, i18n.language])
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState<CampaignV2Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [interruptingId, setInterruptingId] = useState<string | null>(null)

  // Date filter
  const [dateFilter, setDateFilter] = useState<DateFilter>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const customRef = useRef<HTMLDivElement>(null)

  const filteredCampaigns = useMemo(() => {
    const now = new Date()
    let from: Date | null = null
    let to: Date | null = null

    if (dateFilter === 'today') {
      from = startOfDay(now)
      to   = new Date(from.getTime() + 86400000)
    } else if (dateFilter === 'week') {
      from = startOfWeek(now)
      to   = new Date(from.getTime() + 7 * 86400000)
    } else if (dateFilter === 'twoweeks') {
      to   = new Date(startOfDay(now).getTime() + 86400000)
      from = new Date(to.getTime() - 14 * 86400000)
    } else if (dateFilter === 'month') {
      from = startOfMonth(now)
      to   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    } else if (dateFilter === 'custom') {
      from = customFrom ? new Date(customFrom) : null
      to   = customTo   ? new Date(new Date(customTo).getTime() + 86400000) : null
    }

    return campaigns.filter(c => {
      if (!c.created_at) return false
      const t = new Date(c.created_at).getTime()
      if (from && t < from.getTime()) return false
      if (to   && t >= to.getTime())  return false
      return true
    })
  }, [campaigns, dateFilter, customFrom, customTo])

  async function loadCampaigns() {
    try {
      const dbData = await fetch(`${API}/api/campaigns-v2`).then(r => r.json())
      setCampaigns(dbData)
      setLoading(false)
      const synced = await fetch(`${API}/api/campaigns-v2/sync`, { method: 'POST' }).then(r => r.json())
      setCampaigns(synced)
    } catch {
      setError(t('common.server_error'))
      setLoading(false)
    }
  }

  useEffect(() => { loadCampaigns() }, [])

  useEffect(() => {
    const shouldPoll = campaigns.some(c => {
      const s = (c.status ?? '').toLowerCase()
      return s === 'running' || s === 'scheduled'
    })
    if (!shouldPoll) return
    const timer = setInterval(async () => {
      try {
        const dbData = await fetch(`${API}/api/campaigns-v2`).then(r => r.json())
        setCampaigns(dbData)
        const synced = await fetch(`${API}/api/campaigns-v2/sync`, { method: 'POST' }).then(r => r.json())
        setCampaigns(synced)
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(timer)
  }, [campaigns])

  async function handleInterrupt(campaignId: string) {
    setInterruptingId(campaignId)
    try {
      const resp = await fetch(`${API}/api/campaigns-v2/${campaignId}/interrupt`, { method: 'POST' })
      if (!resp.ok) throw new Error()
      setCampaigns(prev =>
        prev.map(c => c.campaign_id === campaignId ? { ...c, status: 'interrupted' } : c)
      )
    } catch {
      alert(t('agora.interrupt_fail'))
    } finally {
      setInterruptingId(null)
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(bcp47ForI18n(i18n.language), {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="h-full flex flex-col bg-st-bg">
      {/* Page header */}
      <div className="bg-st-nav border-b border-st-b-div px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="animate-fade-in">
          <h1 className="text-lg font-medium text-st-txt1">{t('agora.list_title')}</h1>
          <p className="text-sm text-st-txt3 mt-0.5">{t('agora.list_subtitle')}</p>
        </div>
        <Link
          to="/surveys/new"
          className="inline-flex items-center gap-2 bg-st-teal hover:bg-st-teal-h text-white px-4 py-2 rounded-md text-sm font-medium border-0 transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} />
          {t('nav.new_campaign')}
        </Link>
      </div>

      {/* Date filter bar */}
      <div className="bg-st-nav border-b border-st-b-div px-6 py-2.5 flex items-center gap-2 flex-shrink-0 flex-wrap">
        {([
          { key: 'today',    label: t('agora.filter_today') },
          { key: 'week',     label: t('agora.filter_week') },
          { key: 'twoweeks', label: t('agora.filter_twoweeks') },
          { key: 'month',    label: t('agora.filter_month') },
        ] as { key: DateFilter; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setDateFilter(key); setShowCustom(false) }}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium transition-colors border',
              dateFilter === key
                ? 'bg-st-teal-bg border-st-b-teal text-st-teal-l'
                : 'border-st-b-sub text-st-txt3 hover:border-st-b-hover hover:text-st-txt2',
            )}
          >{label}</button>
        ))}

        {/* Custom range */}
        <div className="relative" ref={customRef}>
          <button
            onClick={() => { setDateFilter('custom'); setShowCustom(v => !v) }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors border',
              dateFilter === 'custom'
                ? 'bg-st-teal-bg border-st-b-teal text-st-teal-l'
                : 'border-st-b-sub text-st-txt3 hover:border-st-b-hover hover:text-st-txt2',
            )}
          >
            <CalendarDays size={12} />{t('agora.filter_custom')}
            {dateFilter === 'custom' && customFrom && (
              <span className="ml-1 text-st-txt2">{customFrom}{customTo ? ` → ${customTo}` : ''}</span>
            )}
          </button>

          {showCustom && (
            <div className="absolute top-full left-0 mt-1.5 z-30 bg-st-nav border border-st-b-sub rounded-lg shadow-xl p-4 flex items-center gap-3 whitespace-nowrap">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-st-txt4">{t('agora.date_from')}</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="px-2 py-1 rounded text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <span className="text-st-txt4 text-sm mt-4">–</span>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-st-txt4">{t('agora.date_to')}</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="px-2 py-1 rounded text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <button
                onClick={() => setShowCustom(false)}
                className="mt-4 p-1 rounded text-st-txt4 hover:text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
              ><X size={13} /></button>
            </div>
          )}
        </div>

        <span className="ml-auto text-xs text-st-txt4">{t('agora.count_n', { n: filteredCampaigns.length })}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center py-24 text-st-txt3">
            <Loader2 size={20} className="animate-spin mr-2 text-st-txt2" />
            <span className="text-sm">{t('agora.loading')}</span>
          </div>
        )}

        {error && (
          <div className="bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-md p-4 text-sm text-st-err">{error}</div>
        )}

        {!loading && !error && filteredCampaigns.length === 0 && (
          <div className="bg-st-card border border-st-b-sub rounded-md p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-[rgba(255,255,255,0.04)] flex items-center justify-center mx-auto mb-4">
              <Radio size={28} className="text-st-txt5" />
            </div>
            <p className="text-base font-medium text-st-txt1">{t('agora.empty')}</p>
            <p className="text-sm text-st-txt3 mt-1">{t('agora.empty_hint')}</p>
          </div>
        )}

        {!loading && !error && filteredCampaigns.length > 0 && (
          <div className="overflow-x-auto">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 min-w-[640px]">
            {filteredCampaigns.map((c, i) => {
              const status = c.status ?? 'pending'
              const isTerminal = status === 'completed' || status === 'interrupted' || status === 'interrupt' || status === 'failed'
              const total = Math.max(0, Number(c.total_numbers ?? 0))
              const done = Math.max(0, Number(c.calls_count ?? 0))
              const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
              const st = STATUS_STYLE[status] ?? STATUS_STYLE.pending

              return (
                <div
                  key={c.campaign_id}
                  className="bg-st-card border border-st-b-sub rounded-md transition-colors flex flex-col overflow-hidden animate-card-in"
                  style={{ animationDelay: `${Math.min(i * 55, 550)}ms` }}
                >
                  {/* Subtle top accent strip */}
                  <div className="h-px" style={{
                    backgroundColor:
                      status === 'running'     ? '#2DD4BF' :
                      status === 'completed'   ? '#0D9488' :
                      status === 'paused'      ? 'rgba(251,191,36,0.70)' :
                      (status === 'interrupted' || status === 'interrupt' || status === 'failed')
                                               ? 'rgba(252,165,165,0.70)' : 'rgba(13,148,136,0.25)',
                  }} />

                  {/* Card header */}
                  <div className="px-5 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      {/* Status chip */}
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium flex-shrink-0',
                        st.chip
                      )}>
                        {st.dot && <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', st.dot)} />}
                        {statusLabel[status] ?? status}
                      </span>
                      {/* Interrupt button */}
                      <button
                        onClick={() => handleInterrupt(c.campaign_id)}
                        disabled={isTerminal || interruptingId === c.campaign_id}
                        title="Interrupt"
                        className={cn(
                          'flex items-center justify-center w-7 h-7 rounded transition-colors',
                          isTerminal
                            ? 'text-st-txt4 cursor-not-allowed'
                            : 'text-st-err hover:bg-[rgba(252,165,165,0.08)]'
                        )}
                      >
                        {interruptingId === c.campaign_id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <StopCircle size={14} />}
                      </button>
                    </div>

                    <h2 className="font-medium text-st-txt1 text-sm leading-snug line-clamp-2 mb-0.5">
                      {c.campaign_name}
                    </h2>
                    <p className="text-xs font-mono text-st-txt3 truncate">{c.campaign_id}</p>
                  </div>

                  {/* Chips row */}
                  <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
                    {c.questionnaire_type && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-[rgba(255,255,255,0.04)] text-st-txt1 border border-st-b-sub">
                        {campaignAgentSourceLabel(t, c.questionnaire_type)}
                      </span>
                    )}
                    {c.quota_mode && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-[rgba(255,255,255,0.05)] text-st-txt3 border border-st-b-sub">
                        {campaignQuotaModeLabel(t, c.quota_mode)}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="px-5 pb-3 space-y-1 text-sm text-st-txt2">
                    {c.phone_number && (
                      <p className="flex items-center gap-2 text-xs">
                        <span className="text-st-txt3">Caller</span>
                        <span className="font-mono font-medium text-st-txt1">{c.phone_number}</span>
                      </p>
                    )}
                    {c.agent_name && (
                      <p className="flex items-center gap-2 text-xs">
                        <span className="text-st-txt3">Agent</span>
                        <span className="font-medium text-st-txt1">{c.agent_name}</span>
                      </p>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="px-5 pb-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-st-txt3">{t('agora.dial_progress')}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-st-txt2">{done} / {total}</span>
                        <span className={cn(
                          'font-medium',
                          pct >= 100 ? 'text-st-ok' : 'text-st-txt1'
                        )}>{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded overflow-hidden bg-[rgba(13,148,136,0.20)]">
                      <div
                        className="h-full rounded transition-all duration-300"
                        style={{
                          width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                          backgroundColor: pct >= 100 ? '#2DD4BF' : '#0D9488',
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-st-txt3 mt-2">{formatDate(c.created_at)}</p>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-auto border-t border-st-b-div grid grid-cols-3">
                    <button
                      onClick={() => navigate(`/campaigns/${c.campaign_id}`)}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-txt1 transition-colors border-r border-st-b-div"
                    >
                      <LayoutDashboard size={13} /> Dashboard
                    </button>
                    <button
                      onClick={() => navigate(`/campaigns/${c.campaign_id}/quota-insight`)}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-ok transition-colors border-r border-st-b-div"
                    >
                      <PieChart size={13} /> Quota
                    </button>
                    <button
                      onClick={() => navigate(`/campaigns/${c.campaign_id}/agent-prompt`)}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-txt1 transition-colors"
                    >
                      <Bot size={13} /> Prompt
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
