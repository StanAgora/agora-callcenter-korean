import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, PhoneCall, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { bcp47ForI18n } from '../../i18n'
import { API } from '../../lib/api'
const PAGE_SIZE = 50

interface CallItem {
  call_id: string
  campaign_id: string
  from_number: string | null
  to_number: string | null
  call_category: string | null
  hangup_reason: string | null
  duration_seconds: number | null
  call_ts: number | null
  end_ts: number | null
  has_transcript: boolean
  has_structured_output: boolean
}

function categoryStyle(cat: string | null): { dot: string; text: string } {
  const c = (cat ?? '').toLowerCase()
  if (c.includes('answered')) return { dot: 'bg-st-ok', text: 'text-st-ok' }
  if (c.includes('transferred_success') || c.includes('transfer_success')) return { dot: 'bg-st-ok', text: 'text-st-ok' }
  if (c.includes('transferred_failed') || c.includes('transfer_failed')) return { dot: 'bg-st-err', text: 'text-st-err' }
  if (c.includes('voicemail')) return { dot: 'bg-[rgba(255,255,255,0.05)]', text: 'text-st-txt2' }
  if (c.includes('no_answer') || c === 'no-answer') return { dot: 'bg-st-warn', text: 'text-st-warn' }
  if (c.includes('failed') || c.includes('error')) return { dot: 'bg-st-err', text: 'text-st-err' }
  if (c.includes('ai_assistant') || c.includes('ai-assistant')) return { dot: 'bg-[rgba(255,255,255,0.05)]', text: 'text-st-txt2' }
  return { dot: 'bg-[rgba(255,255,255,0.05)]', text: 'text-st-txt3' }
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${s}s`
}

function fmtTs(ts: number | null, lng: string): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(bcp47ForI18n(lng))
}

export function CallHistoryPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [calls, setCalls] = useState<CallItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${API}/api/calls-v2/?page=${page}&page_size=${PAGE_SIZE}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        setCalls(data.items ?? [])
        setTotal(Number(data.total ?? 0))
      })
      .catch(e => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [page])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-st-b-div bg-st-nav flex-shrink-0 animate-fade-in">
        <div>
          <h1 className="text-lg font-medium text-st-txt1">{t('app_nav.call_history')}</h1>
          <p className="text-xs text-st-txt3 mt-0.5">
            {t('call_history.subtitle', { n: total })}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-32 text-st-txt3">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">{t('agora.loading')}</span>
          </div>
        ) : error ? (
          <div className="m-6 bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg p-4 text-sm text-st-err">{error}</div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-st-txt5">
            <PhoneCall size={36} className="mb-3 opacity-40" />
            <p className="text-sm text-st-txt3">{t('call_history.empty')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-st-bg border-b border-st-b-div z-10">
              <tr>
                <th className="px-4 py-3 text-left text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">{t('call_history.col_from')}</th>
                <th className="px-4 py-3 text-left text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">{t('call_history.col_to')}</th>
                <th className="px-4 py-3 text-left text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">{t('call_history.col_category')}</th>
                <th className="px-4 py-3 text-left text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">{t('call_history.col_hangup')}</th>
                <th className="px-4 py-3 text-left text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">{t('call_history.col_duration')}</th>
                <th className="px-4 py-3 text-left text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">{t('call_history.col_time')}</th>
                <th className="px-4 py-3 text-left text-[8px] font-medium text-st-txt4 uppercase tracking-[0.1em]">{t('call_history.col_campaign')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-st-b-div">
              {calls.map((c, i) => {
                const st = categoryStyle(c.call_category)
                return (
                  <tr
                    key={c.call_id}
                    onClick={() => navigate(`/campaigns/${c.campaign_id}`)}
                    className="hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors animate-row-in"
                    style={{ animationDelay: `${Math.min(i * 35, 550)}ms` }}
                  >
                    <td className="px-4 py-3 font-mono text-st-txt3">{c.from_number ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-st-txt1">{c.to_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', st.dot)} />
                        <span className={cn('text-xs font-medium', st.text)}>{c.call_category ?? '—'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-st-txt3">{c.hangup_reason ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-st-txt2">{fmtDuration(c.duration_seconds)}</td>
                    <td className="px-4 py-3 text-xs text-st-txt3 whitespace-nowrap">
                      {fmtTs(c.call_ts, i18n.language)}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-st-txt3 truncate max-w-[160px]">
                      {c.campaign_id}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-st-b-div bg-st-nav flex-shrink-0">
          <p className="text-xs text-st-txt3">
            {t('call_history.page_info', { page, totalPages, total })}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded border border-st-b-sub text-st-txt3 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-st-txt2 px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-st-b-sub text-st-txt3 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
