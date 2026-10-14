import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'
import { Loader2, PhoneCall, PhoneIncoming, Clock, RefreshCw, Radio, LayoutDashboard, PieChart as PieChartIcon, Bot, StopCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { API } from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DailyStats {
  date: string
  total_calls: number
  answered_calls: number
  answer_rate: number
  total_duration_seconds: number
}

interface CategoryEntry {
  category: string
  count: number
}

interface Totals {
  total_calls: number
  total_answered: number
  overall_answer_rate: number
  total_duration_seconds: number
}

interface StatsData {
  daily_stats: DailyStats[]
  category_distribution: CategoryEntry[]
  totals: Totals
}

interface CampaignV2Item {
  id: number
  campaign_id: string
  campaign_name: string
  questionnaire_type: string | null
  quota_mode: string | null
  total_numbers: number | null
  calls_count: number | null
  phone_number: string | null
  agent_name: string | null
  status: string | null
  created_at: string | null
}

const CAMPAIGN_STATUS_STYLE: Record<string, { chip: string; dot?: string }> = {
  running:     { chip: 'bg-st-teal-bg text-st-teal-l border border-st-b-teal', dot: 'bg-st-teal-l' },
  paused:      { chip: 'bg-[rgba(251,191,36,0.08)] text-st-warn border border-[rgba(251,191,36,0.22)]' },
  completed:   { chip: 'bg-[rgba(255,255,255,0.05)] text-st-txt3 border border-st-b-sub' },
  interrupted: { chip: 'bg-[rgba(252,165,165,0.08)] text-st-err border border-[rgba(252,165,165,0.22)]' },
  pending:     { chip: 'bg-[rgba(255,255,255,0.04)] text-st-txt3 border border-st-b-sub' },
}

// Teal-based pie chart colours (brightest = most data)
const PIE_COLORS = [
  '#0D9488',
  '#2DD4BF',
  'rgba(13,148,136,0.65)',
  'rgba(45,212,191,0.50)',
  'rgba(13,148,136,0.38)',
  'rgba(45,212,191,0.28)',
  'rgba(148,163,184,0.30)',
  'rgba(148,163,184,0.18)',
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const RANGE_OPTIONS = [
  { label: '7d',  value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: 'All', value: 0 },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, iconBg, highlight = false,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  iconBg: string
  highlight?: boolean
}) {
  return (
    <div className="bg-st-card rounded-lg border border-st-b-sub hover:border-st-b-hover transition-colors px-5 py-4 flex items-center gap-4">
      <div className={cn('p-2.5 rounded-md flex-shrink-0', iconBg)}>
        <Icon size={18} className={highlight ? 'text-st-teal-l' : 'text-st-txt2'} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] text-st-txt4 uppercase tracking-[0.06em] mb-1">{label}</p>
        <p className={cn('text-[26px] font-medium tracking-tight leading-none', highlight ? 'text-st-teal-l' : 'text-st-txt1')}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-st-txt3 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-st-card rounded-lg border border-st-b-sub p-5">
      <h3 className="text-[11px] font-medium text-st-txt2 uppercase tracking-[0.06em] mb-4">{title}</h3>
      {children}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-40 text-st-txt4 text-xs">
      No data available
    </div>
  )
}

function DarkTooltip({ active, payload, label, formatter }: {
  active?: boolean
  payload?: { value: number; payload: DailyStats }[]
  label?: string
  formatter?: (val: number, p: { payload: DailyStats }) => string
}) {
  if (!active || !payload?.length) return null
  const displayVal = formatter
    ? formatter(payload[0].value, payload[0])
    : String(payload[0].value)
  return (
    <div style={{ background: '#0B1120', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
      <p style={{ color: 'rgba(148,163,184,0.50)', marginBottom: 2 }}>{label}</p>
      <p style={{ color: '#2DD4BF', fontWeight: 500 }}>{displayVal}</p>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState(30)
  const [runningCampaigns, setRunningCampaigns] = useState<CampaignV2Item[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [interruptingId, setInterruptingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data: StatsData = await fetch(`${API}/api/dashboard/stats`).then(r => {
        if (!r.ok) throw new Error(r.statusText)
        return r.json()
      })
      setStats(data)
    } catch (e) {
      setError(`Failed to load data: ${e instanceof Error ? e.message : e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadCampaigns = useCallback(async () => {
    try {
      const data: CampaignV2Item[] = await fetch(`${API}/api/campaigns-v2`).then(r => r.json())
      setRunningCampaigns(data.filter(c => (c.status ?? '').toLowerCase() === 'running'))
    } catch { /* ignore */ } finally {
      setCampaignsLoading(false)
    }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  useEffect(() => {
    if (runningCampaigns.length === 0) return
    const timer = setInterval(loadCampaigns, 5000)
    return () => clearInterval(timer)
  }, [runningCampaigns.length, loadCampaigns])

  async function handleInterrupt(campaignId: string) {
    setInterruptingId(campaignId)
    try {
      const resp = await fetch(`${API}/api/campaigns-v2/${campaignId}/interrupt`, { method: 'POST' })
      if (!resp.ok) throw new Error()
      setRunningCampaigns(prev => prev.filter(c => c.campaign_id !== campaignId))
    } catch {
      alert('Failed to interrupt campaign.')
    } finally {
      setInterruptingId(null)
    }
  }

  const filteredDaily = (() => {
    if (!stats) return []
    if (range === 0) return stats.daily_stats
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - range)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return stats.daily_stats.filter(d => d.date >= cutoffStr)
  })()

  const ft = (() => {
    if (!filteredDaily.length) return stats?.totals ?? null
    const total_calls    = filteredDaily.reduce((s, d) => s + d.total_calls, 0)
    const total_answered = filteredDaily.reduce((s, d) => s + d.answered_calls, 0)
    const total_duration = filteredDaily.reduce((s, d) => s + d.total_duration_seconds, 0)
    return {
      total_calls,
      total_answered,
      overall_answer_rate: total_calls > 0
        ? Math.round(total_answered / total_calls * 1000) / 10
        : 0,
      total_duration_seconds: total_duration,
    }
  })()

  const chartData = filteredDaily.map(d => ({
    ...d,
    dateLabel: shortDate(d.date),
    duration_minutes: Math.round(d.total_duration_seconds / 60),
  }))

  const axisProps = {
    tick: { fontSize: 9, fill: 'rgba(148,163,184,0.35)' },
    tickLine: false,
    axisLine: false,
  }

  return (
    <div className="p-6 bg-st-bg min-h-full space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-base font-medium text-st-txt1">Dashboard</h1>
          <p className="text-[11px] text-st-txt3 mt-0.5">Call analytics overview</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Range pills */}
          <div className="flex items-center gap-px bg-[rgba(255,255,255,0.04)] rounded-md p-[3px] border border-st-b-sub">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={cn(
                  'px-3 py-1 rounded text-[11px] font-medium transition-colors',
                  range === opt.value
                    ? 'bg-st-teal-bg border border-st-b-teal text-st-teal-l'
                    : 'text-st-txt3 hover:text-st-txt2',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] border border-st-b-sub text-st-txt2 hover:border-st-b-teal hover:text-st-teal-l transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Loading / Error ─────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24 text-st-txt3">
          <Loader2 size={18} className="animate-spin mr-2 text-st-teal" />
          <span className="text-[13px]">Loading…</span>
        </div>
      )}
      {error && (
        <div className="bg-[rgba(252,165,165,0.06)] border border-[rgba(252,165,165,0.20)] rounded-lg p-3 text-[12px] text-st-err">{error}</div>
      )}

      {!loading && !error && ft && (
        <>
          {/* ── KPI Cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
              <StatCard
                icon={PhoneCall}
                label="Total Calls"
                value={ft.total_calls.toLocaleString()}
                sub={range > 0 ? `Last ${range} days` : 'All time'}
                iconBg="bg-st-teal-bg"
                highlight
              />
            </div>
            <div className="animate-slide-up" style={{ animationDelay: '60ms' }}>
              <StatCard
                icon={PhoneIncoming}
                label="Answer Rate"
                value={`${ft.overall_answer_rate}%`}
                sub={`${ft.total_answered.toLocaleString()} answered`}
                iconBg="bg-[rgba(45,212,191,0.10)]"
              />
            </div>
            <div className="animate-slide-up" style={{ animationDelay: '120ms' }}>
              <StatCard
                icon={Clock}
                label="Total Duration"
                value={formatDuration(ft.total_duration_seconds)}
                sub="HH:MM:SS"
                iconBg="bg-[rgba(148,163,184,0.07)]"
              />
            </div>
          </div>

          {/* ── Running Campaigns ──────────────────────────────────────── */}
          <div className="bg-st-card rounded-lg border border-st-b-sub p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-[7px] h-[7px] rounded-full bg-st-ok animate-pulse" />
              <h2 className="text-[11px] font-medium text-st-txt2 uppercase tracking-[0.05em]">
                {t('dashboard.running_campaigns')}
              </h2>
              {!campaignsLoading && (
                <span className="ml-auto text-[11px] text-st-txt4">
                  {t('dashboard.running_campaigns_count', { n: runningCampaigns.length })}
                </span>
              )}
            </div>

            {campaignsLoading ? (
              <div className="flex items-center gap-2 text-st-txt3 text-[12px] py-4">
                <Loader2 size={13} className="animate-spin text-st-teal" />
              </div>
            ) : runningCampaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Radio size={22} className="text-st-txt4 mb-2" />
                <p className="text-[12px] text-st-txt3">{t('dashboard.no_running_campaigns')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {runningCampaigns.map((c, i) => {
                  const status = c.status ?? 'running'
                  const total = Math.max(0, Number(c.total_numbers ?? 0))
                  const done = Math.max(0, Number(c.calls_count ?? 0))
                  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
                  const st = CAMPAIGN_STATUS_STYLE[status] ?? CAMPAIGN_STATUS_STYLE.pending
                  return (
                    <div
                      key={c.campaign_id}
                      className="bg-[rgba(255,255,255,0.02)] border border-st-b-sub rounded-lg hover:border-st-b-hover transition-colors flex flex-col overflow-hidden animate-card-in"
                      style={{ animationDelay: `${Math.min(i * 55, 550)}ms` }}
                    >
                      {/* Teal top accent */}
                      <div className="h-[2px] bg-st-teal rounded-t-lg" />

                      <div className="px-3.5 pt-3 pb-2">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                            st.chip
                          )}>
                            {st.dot && <span className={cn('w-[7px] h-[7px] rounded-full animate-pulse flex-shrink-0', st.dot)} />}
                            Running
                          </span>
                          <button
                            onClick={() => handleInterrupt(c.campaign_id)}
                            disabled={interruptingId === c.campaign_id}
                            title="Interrupt"
                            className="flex items-center justify-center w-6 h-6 rounded text-st-err hover:bg-[rgba(252,165,165,0.08)] transition-colors disabled:opacity-50"
                          >
                            {interruptingId === c.campaign_id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <StopCircle size={12} />}
                          </button>
                        </div>
                        <h3 className="font-medium text-st-txt1 text-[12px] leading-snug line-clamp-2 mb-0.5">
                          {c.campaign_name}
                        </h3>
                        <p className="text-[10px] font-mono text-st-txt4 truncate">{c.campaign_id}</p>
                      </div>

                      <div className="px-3.5 pb-2 space-y-px text-[11px]">
                        {c.phone_number && (
                          <p className="flex items-center gap-2">
                            <span className="text-st-txt4">Caller</span>
                            <span className="font-mono text-st-txt2">{c.phone_number}</span>
                          </p>
                        )}
                        {c.agent_name && (
                          <p className="flex items-center gap-2">
                            <span className="text-st-txt4">Agent</span>
                            <span className="text-st-txt2">{c.agent_name}</span>
                          </p>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="px-3.5 pb-3">
                        <div className="flex items-center justify-between text-[10px] mb-1.5">
                          <span className="text-st-txt4">Progress</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-st-txt3">{done} / {total}</span>
                            <span className="font-medium text-st-teal-l">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-[3px] w-full rounded overflow-hidden bg-[rgba(13,148,136,0.20)]">
                          <div
                            className="h-full rounded transition-all duration-300 bg-st-teal"
                            style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                      </div>

                      <div className="border-t border-st-b-div grid grid-cols-3 mt-auto">
                        <button
                          onClick={() => navigate(`/campaigns/${c.campaign_id}`)}
                          className="flex items-center justify-center gap-1 py-2 text-[10px] font-medium text-st-txt4 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-teal-l transition-colors border-r border-st-b-div"
                        >
                          <LayoutDashboard size={11} /> Detail
                        </button>
                        <button
                          onClick={() => navigate(`/campaigns/${c.campaign_id}/quota-insight`)}
                          className="flex items-center justify-center gap-1 py-2 text-[10px] font-medium text-st-txt4 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-ok transition-colors border-r border-st-b-div"
                        >
                          <PieChartIcon size={11} /> Quota
                        </button>
                        <button
                          onClick={() => navigate(`/campaigns/${c.campaign_id}/agent-prompt`)}
                          className="flex items-center justify-center gap-1 py-2 text-[10px] font-medium text-st-txt4 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-teal-l transition-colors"
                        >
                          <Bot size={11} /> Prompt
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Charts ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

            {/* Total Calls */}
            <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
            <ChartCard title="Calls / Day">
              {chartData.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="dateLabel" {...axisProps} interval="preserveStartEnd" />
                    <YAxis {...axisProps} allowDecimals={false} width={34} />
                    <Tooltip content={
                      <DarkTooltip formatter={(v) => `${v} calls`} />
                    } />
                    <Line
                      type="monotone" dataKey="total_calls"
                      stroke="#2DD4BF" strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: '#2DD4BF', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
            </div>

            {/* Answer Rate */}
            <div className="animate-slide-up" style={{ animationDelay: '60ms' }}>
            <ChartCard title="Answer Rate / Day">
              {chartData.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="dateLabel" {...axisProps} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} {...axisProps} tickFormatter={v => `${v}%`} width={34} />
                    <Tooltip content={
                      <DarkTooltip formatter={(v) => `${v}%`} />
                    } />
                    <Line
                      type="monotone" dataKey="answer_rate"
                      stroke="rgba(13,148,136,0.80)" strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: '#0D9488', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
            </div>

            {/* Duration */}
            <div className="animate-slide-up" style={{ animationDelay: '120ms' }}>
            <ChartCard title="Duration / Day">
              {chartData.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="dateLabel" {...axisProps} interval="preserveStartEnd" />
                    <YAxis {...axisProps} tickFormatter={v => `${v}m`} width={34} />
                    <Tooltip content={
                      <DarkTooltip
                        formatter={(_, p) => formatDuration(p.payload.total_duration_seconds)}
                      />
                    } />
                    <Line
                      type="monotone" dataKey="duration_minutes"
                      stroke="rgba(45,212,191,0.50)" strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: '#2DD4BF', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
            </div>

            {/* Pie — Status Distribution */}
            {stats && (
              <div className="animate-slide-up" style={{ animationDelay: '180ms' }}>
              <ChartCard title="Status Distribution">
                {stats.category_distribution.length === 0 ? <EmptyChart /> : (
                  <div className="flex flex-col items-center gap-2">
                    <ResponsiveContainer width="100%" height={110}>
                      <PieChart>
                        <Pie
                          data={stats.category_distribution}
                          dataKey="count"
                          nameKey="category"
                          cx="50%" cy="50%"
                          outerRadius={48} innerRadius={26}
                          paddingAngle={2}
                        >
                          {stats.category_distribution.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: '#0B1120',
                            border: '1px solid rgba(13,148,136,0.25)',
                            borderRadius: 6,
                            fontSize: 11,
                            color: '#94A3B8',
                          }}
                          formatter={(value: number, name: string) => {
                            const pct = stats.totals.total_calls > 0
                              ? Math.round(value / stats.totals.total_calls * 1000) / 10
                              : 0
                            return [`${value.toLocaleString()} (${pct}%)`, name]
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-full space-y-1">
                      {stats.category_distribution.slice(0, 5).map((entry, i) => {
                        const pct = stats.totals.total_calls > 0
                          ? Math.round(entry.count / stats.totals.total_calls * 1000) / 10
                          : 0
                        return (
                          <div key={entry.category} className="flex items-center gap-1.5 text-[10px] animate-row-in" style={{ animationDelay: `${i * 35}ms` }}>
                            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-st-txt3 capitalize flex-1 truncate">{entry.category}</span>
                            <span className="text-st-txt4 tabular-nums">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </ChartCard>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
