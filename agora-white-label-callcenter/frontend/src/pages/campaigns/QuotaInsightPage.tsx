import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Target, CheckCircle2, Loader2, AlertCircle, TrendingUp, BarChart3, Percent } from 'lucide-react'
import { cn } from '../../lib/utils'
import { API } from '../../lib/api'
const QUOTA_INSIGHT_POLL_MS = 10_000

interface QuotaHitEvidenceRow {
  call_id: string
  at?: string
  confidence?: number
  evidence?: string
  variables?: Record<string, string | number | null | undefined>
}

interface QuotaCell {
  id: number
  campaign_id: string
  label: string
  filters: Record<string, string>
  target: number
  completed: number
  hit_evidence?: QuotaHitEvidenceRow[] | null
}

interface CampaignInfo {
  campaign_id: string
  campaign_name: string
  status: string | null
}

function pct(completed: number, target: number): number {
  if (!target) return 0
  return Math.min(100, Math.round((completed / target) * 100))
}

function cellColor(p: number) {
  if (p >= 100) return { bar: 'bg-st-teal-l', badge: 'bg-[rgba(13,148,136,0.12)] text-st-ok border-[rgba(13,148,136,0.25)]', border: 'border-[rgba(13,148,136,0.25)]' }
  if (p >= 60)  return { bar: 'bg-st-teal',  badge: 'bg-[rgba(255,255,255,0.04)] text-st-txt1 border-st-b-sub',   border: 'border-st-b-sub' }
  if (p >= 20)  return { bar: 'bg-st-warn',   badge: 'bg-[rgba(251,191,36,0.08)] text-st-warn border-[rgba(251,191,36,0.22)]',      border: 'border-[rgba(251,191,36,0.22)]' }
  return               { bar: 'bg-[rgba(13,148,136,0.20)]',    badge: 'bg-[rgba(255,255,255,0.04)] text-st-txt3 border-st-b-sub',         border: 'border-st-b-sub' }
}

function quotaCardSurface(hasHits: boolean, isQuotaFull: boolean): { bg: string; border: string } {
  if (!hasHits) return { bg: '', border: '' }
  if (isQuotaFull) return { bg: 'bg-[rgba(13,148,136,0.10)]', border: 'border-[rgba(13,148,136,0.30)]' }
  return { bg: 'bg-[rgba(251,191,36,0.08)]', border: 'border-[rgba(251,191,36,0.22)]' }
}

export function QuotaInsightPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [cells, setCells]         = useState<QuotaCell[]>([])
  const [campaign, setCampaign]   = useState<CampaignInfo | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function loadQuotaInsight(initial: boolean) {
      if (initial) {
        setLoading(true)
        setError('')
      }
      try {
        const [cellData, campData] = await Promise.all([
          fetch(`${API}/api/quota-v2/${id}/cells`).then(r => r.json()),
          fetch(`${API}/api/campaigns-v2/${id}`).then(r => r.json()),
        ])
        if (cancelled) {
          return
        }
        setCells(cellData)
        const c = campData?.local ? { ...campData.local, ...campData.detail } : campData
        setCampaign({
          campaign_id: id,
          campaign_name: c.campaign_name ?? id,
          status: c.status ?? null,
        })
        if (initial) {
          setError('')
        }
      } catch {
        if (cancelled) {
          return
        }
        if (initial) {
          setError(t('quota_insight.load_fail'))
        }
      } finally {
        if (!cancelled && initial) {
          setLoading(false)
        }
      }
    }

    void loadQuotaInsight(true)
    const timer = window.setInterval(() => {
      void loadQuotaInsight(false)
    }, QUOTA_INSIGHT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [id, t])

  useEffect(() => {
    if (selectedCellId == null) return
    if (!cells.some(c => c.id === selectedCellId)) {
      setSelectedCellId(null)
    }
  }, [cells, selectedCellId])

  const totalTarget    = cells.reduce((s, c) => s + (c.target || 0), 0)
  const totalCompleted = cells.reduce((s, c) => s + (c.completed || 0), 0)
  const overallPct     = pct(totalCompleted, totalTarget)
  const doneCount      = cells.filter(c => pct(c.completed, c.target) >= 100).length

  const selectedCell = selectedCellId != null ? cells.find(c => c.id === selectedCellId) : null
  const hitRows: QuotaHitEvidenceRow[] = (() => {
    const raw = selectedCell?.hit_evidence
    if (!raw || !Array.isArray(raw)) return []
    return [...raw].reverse()
  })()

  const showHitDataRows = selectedCellId != null && selectedCell != null && hitRows.length > 0
  const hitTablePlaceholder: string = (() => {
    if (selectedCellId == null) return t('quota_insight.hit_records_hint')
    if (!selectedCell) return t('quota_insight.hit_records_hint')
    if (hitRows.length === 0) return t('quota_insight.hit_records_empty')
    return ''
  })()

  function formatConfidence(n: number | undefined): string {
    if (n == null || Number.isNaN(n)) return '—'
    if (n <= 1 && n >= 0) return `${Math.round(n * 100)}%`
    return String(n)
  }

  return (
    <div className="h-full flex flex-col bg-st-bg">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-st-b-div bg-st-nav">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-st-txt3 hover:text-st-txt2 transition-colors"
        >
          <ArrowLeft size={15} /> {t('agora.back')}
        </button>
        <div className="w-px h-4 bg-[rgba(13,148,136,0.25)]" />
        <div className="animate-fade-in">
          <h1 className="font-medium text-st-txt1 text-sm leading-none">
            {campaign?.campaign_name ?? id}
          </h1>
          <p className="text-xs text-st-txt4 mt-0.5 font-mono">{id}</p>
        </div>
        <span className="ml-auto text-xs font-medium text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub rounded px-2.5 py-1">
          Quota Insight
        </span>
      </div>

      {/* Body */}
      {loading && (
        <div className="flex-1 flex items-center justify-center text-st-txt3 gap-2">
          <Loader2 size={18} className="animate-spin" /> {t('agora.loading')}
        </div>
      )}

      {error && (
        <div className="m-6 flex items-center gap-2 p-4 bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-md text-sm text-st-err">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {!loading && !error && (
        <div className="flex-1 overflow-hidden flex min-h-0">

          {/* ── LEFT: summary + hit records table (fixed viewport height) ── */}
          <div
            className={cn(
              'flex-1 min-w-0 min-h-0 flex flex-col gap-5 overflow-hidden p-6',
              'bg-st-bg',
            )}
          >
            <div className="flex-shrink-0 space-y-3">
              <p className="text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">
                {t('quota_insight.summary')}
              </p>

              <div
                className={cn(
                  'flex w-full min-w-0 flex-nowrap items-stretch gap-3',
                  'overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                )}
              >
                <div
                  className={cn(
                    'flex min-w-[9.5rem] flex-1 items-start gap-2 rounded-lg border border-st-b-sub',
                    'bg-st-card px-3 py-2.5 animate-slide-up',
                  )}
                  style={{ animationDelay: '0ms' }}
                >
                  <div className="mt-0.5 rounded p-1.5 bg-[rgba(255,255,255,0.04)] text-st-txt2">
                    <Percent size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-st-txt3">
                      {t('quota_insight.overall')}
                    </p>
                    <p className="text-2xl font-normal tabular-nums text-st-txt1 tracking-tight">
                      {overallPct}%
                    </p>
                    <div className="mt-1.5 h-1.5 rounded bg-[rgba(13,148,136,0.20)] overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded transition-all duration-700',
                          overallPct >= 100
                            ? 'bg-st-teal-l'
                            : overallPct >= 50
                              ? 'bg-st-teal'
                              : 'bg-st-warn',
                        )}
                        style={{ width: `${overallPct}%` }}
                      />
                    </div>
                  </div>
                </div>
                {[
                  {
                    icon: Target,
                    label: t('quota_insight.stat_target'),
                    value: totalTarget,
                    color: 'text-st-txt1',
                    box: 'bg-[rgba(255,255,255,0.04)]',
                  },
                  {
                    icon: TrendingUp,
                    label: t('quota_insight.stat_done'),
                    value: totalCompleted,
                    color: 'text-st-txt2',
                    box: 'bg-[rgba(255,255,255,0.04)]',
                  },
                  {
                    icon: CheckCircle2,
                    label: t('quota_insight.stat_met'),
                    value: `${doneCount} / ${cells.length}`,
                    color: 'text-st-ok',
                    box: 'bg-[rgba(13,148,136,0.10)]',
                  },
                ].map(({ icon: Icon, label, value, color, box }, i) => (
                  <div
                    key={label}
                    className={cn(
                      'flex min-w-[8.5rem] flex-1 items-start gap-2 rounded-lg border border-st-b-sub',
                      'bg-st-card px-3 py-2.5 animate-slide-up',
                    )}
                    style={{ animationDelay: `${(i + 1) * 60}ms` }}
                  >
                    <div className={cn('mt-0.5 rounded p-1.5', box)}>
                      <Icon size={14} className={color} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-st-txt3">{label}</p>
                      <p className="text-2xl font-normal tabular-nums text-st-txt1">
                        {value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="flex-shrink-0 text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">
                {t('quota_insight.hit_records')}
              </p>
              <div
                className={cn(
                  'h-[min(50vh,28rem)] min-h-[16rem] min-w-0 flex-1',
                  'overflow-hidden rounded-lg border border-st-b-sub',
                  'bg-st-card',
                )}
              >
                <div className="h-full overflow-auto">
                  <table className="w-full border-collapse text-left text-sm text-st-txt1">
                    <thead className="sticky top-0 z-[1] border-b border-st-b-sub bg-st-nav">
                      <tr>
                        <th
                          className="w-[22%] max-w-xs whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-st-txt3"
                        >
                          {t('quota_insight.hit_call_id')}
                        </th>
                        <th
                          className="w-40 min-w-[8rem] whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-st-txt3"
                        >
                          {t('quota_insight.hit_confidence')}
                        </th>
                        <th
                          className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-st-txt3"
                        >
                          {t('quota_insight.hit_evidence')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {showHitDataRows ? (
                        hitRows.map((row, idx) => (
                          <tr
                            key={`${row.call_id}-${row.at ?? idx}`}
                            className={cn(
                              'align-top transition-colors animate-row-in',
                              'odd:bg-transparent even:bg-st-card',
                              'hover:bg-[rgba(255,255,255,0.04)]',
                            )}
                            style={{ animationDelay: `${Math.min(idx * 35, 550)}ms` }}
                          >
                            <td className="px-3 py-2.5 font-mono text-xs text-st-txt2 break-all">
                              {row.call_id}
                            </td>
                            <td className="px-3 py-2.5 text-sm tabular-nums text-st-txt1">
                              {formatConfidence(row.confidence)}
                            </td>
                            <td className="px-3 py-2.5 text-sm leading-relaxed text-st-txt2 break-words">
                              {row.evidence?.trim() ? row.evidence : '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr
                          className={cn(
                            'odd:bg-transparent even:bg-st-card',
                          )}
                        >
                          <td
                            colSpan={3}
                            className="px-3 py-20 text-center text-sm text-st-txt3"
                          >
                            {hitTablePlaceholder}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: quota cell cards ─────────── */}
          <div className="w-72 flex-shrink-0 border-l border-st-b-sub bg-st-nav overflow-y-auto p-6 space-y-3 min-h-0">
            <p className="text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em] mb-1">
              {t('quota_insight.quota_title', { n: cells.length })}
            </p>

            {cells.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-st-txt5 gap-3">
                <BarChart3 size={40} className="opacity-40" />
                <p className="text-sm text-st-txt3 text-center">
                  {t('quota_insight.no_cells')}
                </p>
                <p className="text-xs text-st-txt3 text-center">
                  {t('quota_insight.no_cells_hint')}
                </p>
              </div>
            )}

            {cells.map((cell, i) => {
              const p = pct(cell.completed, cell.target)
              const c = cellColor(p)
              const isDone = p >= 100
              const isSelected = selectedCellId === cell.id
              const hitList = Array.isArray(cell.hit_evidence) ? cell.hit_evidence : []
              const hasHits = hitList.length > 0
              const surface = quotaCardSurface(hasHits, isDone)
              const cardBorder = surface.border || c.border
              return (
                <button
                  key={cell.id}
                  type="button"
                  onClick={() => {
                    setSelectedCellId(s => (s === cell.id ? null : cell.id))
                  }}
                  className={cn(
                    'w-full text-left border rounded-lg p-4 space-y-3 transition-colors animate-card-in',
                    surface.bg || 'bg-st-card',
                    'hover:bg-[rgba(255,255,255,0.04)] focus:outline-none focus-visible:border-st-b-teal',
                    cardBorder,
                    isSelected && 'border-st-b-teal bg-[rgba(255,255,255,0.04)]',
                  )}
                  style={{ animationDelay: `${Math.min(i * 55, 550)}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {Object.keys(cell.filters).length > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {Object.entries(cell.filters).map(([k, v], i, arr) => (
                            <span key={k} className="inline-flex items-baseline gap-1 text-sm">
                              <span className="text-st-txt3 text-xs">{k}</span>
                              <span className="text-st-txt4 text-xs">=</span>
                              <span className="text-st-txt1 font-medium break-all">{v}</span>
                              {i < arr.length - 1 && (
                                <span className="text-st-txt4 ml-0.5 text-xs">·</span>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-st-txt2 break-words">
                          {cell.label}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border',
                        c.badge,
                      )}
                    >
                      {isDone && <CheckCircle2 size={10} />}
                      {p}%
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-2 bg-[rgba(13,148,136,0.20)] rounded overflow-hidden">
                      <div
                        className={cn('h-full rounded transition-all duration-500', c.bar)}
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-st-txt3 gap-2">
                      <span>
                        {t('quota_insight.completed')}{' '}
                        <strong className="text-st-txt2">{cell.completed}</strong>
                        <span className="mx-1">/</span>
                        {t('quota_insight.target')}{' '}
                        <strong className="text-st-txt2">{cell.target}</strong>
                      </span>
                      <span className="text-right">
                        {t('quota_insight.remaining', { n: Math.max(0, cell.target - cell.completed) })}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
