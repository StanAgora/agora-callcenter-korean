export interface CorrectionEntry {
  original: string | null
  corrected: string
  call_id: string
  corrected_at: string
}

export type Corrections = Record<string, CorrectionEntry>

/** Renders a contract field value, showing the original (struck through, gray) above the
 *  corrected value (green) when a post-call correction was detected for this field. */
export function ContractFieldValue({
  value,
  correction,
  className = 'text-xs',
}: {
  value: string | null
  correction?: CorrectionEntry | null
  className?: string
}) {
  if (!correction) {
    return <span className={className + ' ' + (value ? 'text-st-txt2' : 'text-st-txt4')}>{value ?? '—'}</span>
  }
  return (
    <div className="flex flex-col leading-tight">
      <span className={className + ' text-st-txt4 line-through'}>{correction.original ?? '—'}</span>
      <span className={className + ' text-[#4ade80] font-medium'}>{correction.corrected}</span>
    </div>
  )
}
