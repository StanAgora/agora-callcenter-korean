import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { SurveyStatus } from '../../types'

const STATUS_STYLES: Record<SurveyStatus, string> = {
  draft:     'bg-[rgba(255,255,255,0.04)] text-st-txt3 border border-st-b-sub',
  running:   'bg-[rgba(13,148,136,0.12)] text-st-ok border border-[rgba(13,148,136,0.25)]',
  paused:    'bg-[rgba(251,191,36,0.08)] text-st-warn border border-[rgba(251,191,36,0.22)]',
  completed: 'bg-[rgba(255,255,255,0.05)] text-st-txt3 border border-st-b-sub',
}

export function StatusBadge({ status }: { status: SurveyStatus }) {
  const { t } = useTranslation()
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium',
      STATUS_STYLES[status]
    )}>
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-st-ok animate-pulse" />
      )}
      {t(`status.${status}`)}
    </span>
  )
}

export function TypeBadge({ type }: { type: 'CATI' | 'URL' }) {
  return (
    <span className={cn(
      'inline-flex px-2.5 py-0.5 rounded text-xs font-medium',
      type === 'CATI'
        ? 'bg-[rgba(255,255,255,0.04)] text-st-txt1 border border-st-b-sub'
        : 'bg-[rgba(255,255,255,0.05)] text-st-txt3 border border-st-b-sub'
    )}>
      {type}
    </span>
  )
}
