import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FileText, CheckCircle, XCircle, Loader2, Trash2, FileCheck, Eye, X, Phone, RotateCcw, Bot, Calendar, Plus, Clock, Settings2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { API } from '../../lib/api'
import { ContractFieldValue, type Corrections } from '../../lib/contractFieldDiff'

const TABLE_COLUMNS: [string, string][] = [
  ['電話番号',   '電話番号（契約名義人）'],
  ['使用者',     '使用者'],
  ['使用場所住所','使用場所住所'],
  ['部屋番号',   '部屋番号'],
  ['契約プラン', '契約プラン'],
  ['支払方法',   '支払方法'],
]

const CSV_COLUMNS: [string, string][] = [
  ['電話番号',   'phone_number'],
  ['使用者',     '使用者'],
  ['使用場所住所','使用場所住所'],
  ['部屋番号',   '部屋番号'],
  ['契約プラン', '契約プラン'],
  ['支払方法',   '支払方法'],
]

const FIELD_LABELS: [string, string][] = [...TABLE_COLUMNS]

interface ContractFields {
  使用者: string | null; 使用場所住所: string | null
  部屋番号: string | null
  契約プラン: string | null; 支払方法: string | null; 電話番号: string | null
}

interface ParsedData {
  filename: string; file_type: string; file_b64: string
  fields: ContractFields; preview_text: string | null
}

interface Contract {
  id: number; filename: string; file_type: string
  fields: ContractFields; created_at: string | null
  corrections?: Corrections
}

interface PreviewFile { filename: string; file_type: string; file_b64: string }

interface CsvRow { [key: string]: string }

interface Agent { agent_id: string; agent_name: string }
interface PhoneNumber { number_id: string; phone_number: string; name?: string }
interface TimeRange { start: string; end: string }

type CustomEvalType = 'string' | 'number' | 'boolean'
interface CustomEvaluation {
  variable_name: string
  type: CustomEvalType
  criteria: string
  enums: string[]
  _draft: string
}


// Agora Engine requires dial_task / template_variables keys to be ASCII —
// these are the keys actually sent to Agora, distinct from the Japanese
// keys used for local DB storage / CSV export / UI display above.
const CONTRACT_FIELDS: [string, string][] = [
  ['電話番号', 'phone_number'],
  ['使用者', 'user_name'], ['使用場所住所', 'service_address_reading'],
  ['部屋番号', 'room_number_reading'],
  ['契約プラン', 'plan_name'], ['支払方法', 'payment_method'],
]

/** Contract fields with any confirmed post-call corrections applied — used whenever we dial
 *  out again (CSV / dial_tasks) so re-dials use the latest corrected value, not the stale
 *  originally-uploaded one. */
function effectiveFields(c: Contract): Record<string, string | null> {
  const f = { ...(c.fields as Record<string, string | null>) }
  if (c.corrections) {
    for (const [key, correction] of Object.entries(c.corrections)) {
      f[key] = correction.corrected
    }
  }
  return f
}

export function ContractsPage() {
  const [contracts, setContracts]       = useState<Contract[]>([])
  const [loadingList, setLoadingList]   = useState(true)
  const [dragging, setDragging]         = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState('')
  const [parsed, setParsed]             = useState<ParsedData | null>(null)
  const [confirming, setConfirming]     = useState(false)
  const [previewFile, setPreviewFile]   = useState<PreviewFile | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<number | null>(null)
  const [deletingId, setDeletingId]     = useState<number | null>(null)

  // 外呼通話チェックボックス
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set())

  // CSV モーダル
  const [csvRows, setCsvRows]           = useState<CsvRow[] | null>(null)
  const [csvBlob, setCsvBlob]           = useState<string>('')   // object URL for download

  // 発信設定
  const [agents, setAgents]             = useState<Agent[]>([])
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [selectedAgentId, setSelectedAgentId]   = useState('')
  const [selectedNumberId, setSelectedNumberId] = useState('')

  // Campaign 作成
  const [dialMode, setDialMode]               = useState<'immediate' | 'scheduled'>('immediate')
  const [campaignName, setCampaignName]       = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [campaignError, setCampaignError]     = useState('')
  const [campaignSuccess, setCampaignSuccess] = useState(false)
  const [removedDuplicates, setRemovedDuplicates] = useState<CsvRow[]>([])

  // Structured output 設定
  const [soEnabled, setSoEnabled]     = useState(true)
  const [soCriteria, setSoCriteria]   = useState('Customer Confirmed the Contract Info is all correct.')
  const [customEvals, setCustomEvals] = useState<CustomEvaluation[]>([])

  // End Call Config 設定
  const [ecMaxDuration, setEcMaxDuration]           = useState(900)
  const [ecSilenceTimeout, setEcSilenceTimeout]     = useState(120)
  const [ecRingTimeout, setEcRingTimeout]           = useState(30)
  const [ecOnSilenceTimeout, setEcOnSilenceTimeout] = useState(true)
  const [ecOnUserRequest, setEcOnUserRequest]       = useState(true)
  const [ecOnAiAssistant, setEcOnAiAssistant]       = useState(true)
  const [ecOnVoicemail, setEcOnVoicemail]           = useState(false)

  // 予約発信設定
  const [schedStartTime, setSchedStartTime]   = useState('')
  const [schedTimezone, setSchedTimezone]     = useState('Asia/Tokyo')
  const [schedTimeRanges, setSchedTimeRanges] = useState<Record<number, TimeRange[]>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  const WEEKDAYS = [
    { wd: 1, label: t('contracts.wd_mon') }, { wd: 2, label: t('contracts.wd_tue') }, { wd: 3, label: t('contracts.wd_wed') },
    { wd: 4, label: t('contracts.wd_thu') }, { wd: 5, label: t('contracts.wd_fri') }, { wd: 6, label: t('contracts.wd_sat') },
    { wd: 0, label: t('contracts.wd_sun') },
  ]
  const TIMEZONES = [
    { value: 'Asia/Tokyo',       label: t('contracts.tz_japan') },
    { value: 'Asia/Shanghai',    label: t('contracts.tz_china') },
    { value: 'Europe/London',    label: t('contracts.tz_uk') },
    { value: 'America/New_York', label: t('contracts.tz_us_east') },
  ]

  useEffect(() => {
    loadContracts()
    fetch(`${API}/api/agents`).then(r => r.json()).then(setAgents).catch(() => {})
    fetch(`${API}/api/phone-numbers`).then(r => r.json()).then(setPhoneNumbers).catch(() => {})
  }, [])

  async function loadContracts() {
    try {
      const data = await fetch(`${API}/api/contracts`).then(r => r.json())
      setContracts(data)
    } catch { /* ignore */ } finally { setLoadingList(false) }
  }

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      setUploadError(t('contracts.file_type_error'))
      return
    }
    setUploadError(''); setUploading(true); setParsed(null); setPreviewFile(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const resp = await fetch(`${API}/api/contracts/parse`, { method: 'POST', body: form })
      if (!resp.ok) { const e = await resp.json().catch(() => ({ detail: resp.statusText })); throw new Error(e.detail) }
      setParsed(await resp.json())
    } catch (e: unknown) { setUploadError(e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploading(false) }
  }

  async function handleConfirm() {
    if (!parsed) return
    setConfirming(true)
    try {
      const resp = await fetch(`${API}/api/contracts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: parsed.filename, file_type: parsed.file_type, file_b64: parsed.file_b64, fields: parsed.fields }),
      })
      if (!resp.ok) throw new Error('Save failed')
      const saved: Contract = await resp.json()
      setContracts(prev => [saved, ...prev]); setParsed(null)
    } catch (e: unknown) { setUploadError(e instanceof Error ? e.message : 'Save failed') }
    finally { setConfirming(false) }
  }

  function handleCancel() { setParsed(null); setUploadError(''); if (fileInputRef.current) fileInputRef.current.value = '' }

  async function handleInspect(c: Contract) {
    setLoadingPreview(c.id); setParsed(null); setUploadError('')
    try {
      const resp = await fetch(`${API}/api/contracts/${c.id}/file`)
      if (!resp.ok) throw new Error()
      const blob = await resp.blob()
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      setPreviewFile({ filename: c.filename, file_type: c.file_type, file_b64: b64 })
    } catch { alert(t('contracts.file_read_error')) }
    finally { setLoadingPreview(null) }
  }

  async function handleDelete(id: number) {
    if (!confirm(t('contracts.delete_confirm'))) return
    setDeletingId(id)
    try {
      await fetch(`${API}/api/contracts/${id}`, { method: 'DELETE' })
      setContracts(prev => prev.filter(c => c.id !== id))
      setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      if (previewFile) setPreviewFile(null)
    } catch { alert(t('contracts.delete_error')) }
    finally { setDeletingId(null) }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function handleReset() { setSelectedIds(new Set()) }

  function handleDial(mode: 'immediate' | 'scheduled') {
    const selected = contracts.filter(c => selectedIds.has(c.id))
    if (selected.length === 0) { alert(t('contracts.select_required')); return }

    setDialMode(mode)
    const ts = new Date()
    setCampaignName(`contracts-${ts.getMonth()+1}${String(ts.getDate()).padStart(2,'0')}-${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}`)
    setCampaignError('')
    setCampaignSuccess(false)
    setSchedTimeRanges({})
    setSchedStartTime('')
    setEcMaxDuration(900); setEcSilenceTimeout(120); setEcRingTimeout(30)
    setEcOnSilenceTimeout(true); setEcOnUserRequest(true); setEcOnAiAssistant(true); setEcOnVoicemail(false)

    const header = CSV_COLUMNS.map(([, csvKey]) => csvKey).join(',')
    const rows = selected.map(c => {
      const f = effectiveFields(c)
      return CSV_COLUMNS.map(([fieldKey]) => {
        const val = f[fieldKey] ?? ''
        return `"${val.replace(/"/g, '""')}"`
      }).join(',')
    })
    const csvContent = [header, ...rows].join('\n')

    const allDisplayRows: CsvRow[] = selected.map(c => {
      const f = effectiveFields(c)
      const row: CsvRow = {}
      CSV_COLUMNS.forEach(([fieldKey, csvKey]) => { row[csvKey] = f[fieldKey] ?? '' })
      return row
    })

    const seenPhones = new Set<string>()
    const dedupedRows: CsvRow[] = []
    const removedRows: CsvRow[] = []
    for (const row of allDisplayRows) {
      const phone = (row['phone_number'] ?? '').trim()
      if (phone && seenPhones.has(phone)) {
        removedRows.push(row)
      } else {
        if (phone) seenPhones.add(phone)
        dedupedRows.push(row)
      }
    }
    setRemovedDuplicates(removedRows)
    setCsvRows(dedupedRows)

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    if (csvBlob) URL.revokeObjectURL(csvBlob)
    setCsvBlob(url)
  }

  function closeCsvModal() {
    setCsvRows(null)
    if (csvBlob) { URL.revokeObjectURL(csvBlob); setCsvBlob('') }
    setCampaignError('')
    setCampaignSuccess(false)
    setRemovedDuplicates([])
  }

  // 時間帯ヘルパー
  function addTimeRange(wd: number) {
    setSchedTimeRanges(prev => ({ ...prev, [wd]: [...(prev[wd] ?? []), { start: '09:00', end: '18:00' }] }))
  }
  function removeTimeRange(wd: number, idx: number) {
    setSchedTimeRanges(prev => ({ ...prev, [wd]: (prev[wd] ?? []).filter((_, i) => i !== idx) }))
  }
  function updateTimeRange(wd: number, idx: number, field: 'start' | 'end', value: string) {
    setSchedTimeRanges(prev => ({
      ...prev,
      [wd]: (prev[wd] ?? []).map((r, i) => i === idx ? { ...r, [field]: value } : r),
    }))
  }

  function addCustomEval() {
    setCustomEvals(prev => [...prev, { variable_name: '', type: 'string', criteria: '', enums: [], _draft: '' }])
  }
  function removeCustomEval(idx: number) {
    setCustomEvals(prev => prev.filter((_, i) => i !== idx))
  }
  function updateCustomEval(idx: number, field: keyof CustomEvaluation | '_draft', value: string) {
    setCustomEvals(prev => prev.map((ev, i) => i === idx ? { ...ev, [field]: value } : ev))
  }
  function addEnum(idx: number, value: string) {
    setCustomEvals(prev => prev.map((ev, i) =>
      i === idx ? { ...ev, enums: [...ev.enums, value], _draft: '' } : ev
    ))
  }
  function removeEnum(idx: number, enumIdx: number) {
    setCustomEvals(prev => prev.map((ev, i) =>
      i === idx ? { ...ev, enums: ev.enums.filter((_, ei) => ei !== enumIdx) } : ev
    ))
  }

  async function handleCreateCampaign() {
    if (!campaignName.trim()) { setCampaignError(t('contracts.name_required')); return }
    if (dialMode === 'scheduled') {
      if (!schedStartTime) { setCampaignError(t('contracts.start_time_required')); return }
      if (!Object.values(schedTimeRanges).some(r => r.length > 0)) {
        setCampaignError(t('contracts.time_range_required')); return
      }
    }

    const selected = contracts.filter(c => selectedIds.has(c.id))
    const allDialTasks = selected
      .filter(c => c.fields.電話番号)
      .map(c => {
        const f = effectiveFields(c)
        return {
          ...Object.fromEntries(
            CONTRACT_FIELDS.map(([fieldKey, csvKey]) => [csvKey, f[fieldKey] ?? ''])
          ),
          contract_id: c.id,
        } as Record<string, string | number>
      })

    const seenTaskPhones = new Set<string>()
    const dialTasks = allDialTasks.filter(task => {
      const phone = String(task['phone_number'] ?? '').trim()
      if (!phone || seenTaskPhones.has(phone)) return false
      seenTaskPhones.add(phone)
      return true
    })

    if (dialTasks.length === 0) { setCampaignError(t('contracts.no_phone_error')); return }

    const payload: Record<string, unknown> = {
      campaign_name: campaignName.trim(),
      phone_number_id: selectedNumberId,
      agent_id: selectedAgentId,
      dial_tasks: dialTasks,
      start_immediately: dialMode === 'immediate',
      end_call_config: {
        max_call_duration_seconds: ecMaxDuration,
        silence_timeout_seconds: ecSilenceTimeout,
        ring_timeout_seconds: ecRingTimeout,
        end_call_on_voicemail: ecOnVoicemail,
        end_call_on_user_request: ecOnUserRequest,
        end_call_on_ai_assistant: ecOnAiAssistant,
        end_call_on_silence_timeout: ecOnSilenceTimeout,
      },
      enable_transcript: true,
      enable_recording: true,
      structured_output: (() => {
        const validCustomEvals = customEvals
          .filter(e => e.variable_name.trim() && e.criteria.trim())
          .map(({ variable_name, type, criteria, enums }) => ({
            variable_name: variable_name.trim(),
            type,
            criteria: criteria.trim(),
            ...(type !== 'boolean' && enums.length > 0 ? { enums } : {}),
          }))
        return {
          enable_structured_output: soEnabled,
          ...(soEnabled ? {
            call_success_evaluation: { criteria: soCriteria.trim() || 'Customer Confirmed the Contract Info is all correct.' },
            ...(validCustomEvals.length > 0 ? { custom_evaluations: validCustomEvals } : {}),
          } : {}),
        }
      })(),
    }

    if (dialMode === 'scheduled') {
      payload.schedule_option = {
        scheduled_start_time: new Date(schedStartTime).toISOString(),
        timezone: schedTimezone,
        allowed_time_ranges_config: Object.entries(schedTimeRanges)
          .filter(([, ranges]) => ranges.length > 0)
          .map(([wd, ranges]) => ({ weekday: parseInt(wd), time_ranges: ranges })),
      }
    }

    setCreatingCampaign(true); setCampaignError('')
    try {
      const resp = await fetch(`${API}/api/campaigns-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail ?? 'Campaign creation failed')
      }
      setCampaignSuccess(true)
      setTimeout(() => closeCsvModal(), 1800)
    } catch (e) {
      setCampaignError(e instanceof Error ? e.message : t('contracts.error_generic'))
    } finally {
      setCreatingCampaign(false)
    }
  }

  function downloadCsv() {
    if (!csvBlob) return
    const a = document.createElement('a')
    a.href = csvBlob
    a.download = `csv_temp_${Date.now()}.csv`
    a.click()
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const activePreview: { filename: string; file_type: string; file_b64: string; preview_text?: string | null } | null =
    parsed ?? previewFile ?? null

  const csvHeaders = CSV_COLUMNS.map(([, k]) => k)

  return (
    <div className="flex h-screen bg-st-bg overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-1/2 flex flex-col border-r border-st-b-sub bg-st-nav overflow-auto">
        <div className="px-6 py-4 border-b border-st-b-div flex items-center justify-between flex-shrink-0 animate-fade-in">
          <div>
            <h1 className="text-lg font-medium text-st-txt1">Contracts</h1>
            <p className="text-sm text-st-txt3 mt-0.5">{t('contracts.subtitle')}</p>
          </div>
          {(parsed || previewFile) && (
            <button onClick={() => { setParsed(null); setPreviewFile(null); setUploadError('') }}
              className="p-1.5 rounded text-st-txt3 hover:text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-6 py-5 flex flex-col flex-1">
          {!activePreview && (
            <div
              className={cn('border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-colors',
                dragging ? 'border-st-b-teal bg-[rgba(255,255,255,0.04)]' : 'border-st-b-sub hover:border-st-b-hover hover:bg-[rgba(255,255,255,0.04)]',
                uploading && 'pointer-events-none opacity-60')}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {uploading ? (
                <><Loader2 size={32} className="text-st-txt3 animate-spin mb-3" /><p className="text-sm text-st-txt3">{t('contracts.parsing')}</p></>
              ) : (
                <><Upload size={32} className="text-st-txt5 mb-3" />
                  <p className="text-sm font-medium text-st-txt2">{t('contracts.drop_hint')}</p>
                  <p className="text-xs text-st-txt3 mt-1">{t('contracts.drop_click')}</p>
                  <p className="text-xs text-st-txt3 mt-2">{t('contracts.file_types')}</p></>
              )}
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          )}

          {uploadError && (
            <p className="mt-3 text-sm text-st-err bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg px-3 py-2">{uploadError}</p>
          )}

          {activePreview && (
            <div className="flex flex-col flex-1 gap-4">
              <div className="flex items-center gap-2 text-sm text-st-txt2 font-medium">
                <FileText size={16} className="text-st-txt2" />
                <span className="truncate">{activePreview.filename}</span>
                {previewFile && !parsed && (
                  <span className="text-xs text-st-txt2 bg-[rgba(255,255,255,0.04)] px-2 py-0.5 rounded ml-auto flex-shrink-0">{t('contracts.saved_preview')}</span>
                )}
              </div>

              <div className="border border-st-b-sub rounded-lg overflow-hidden bg-st-bg" style={{ height: '680px' }}>
                {activePreview.file_type === 'pdf' ? (
                  <object data={`data:application/pdf;base64,${activePreview.file_b64}#navpanes=0&toolbar=0`}
                    type="application/pdf" className="w-full h-full">
                    <div className="flex items-center justify-center h-full text-sm text-st-txt3">{t('contracts.pdf_not_available')}</div>
                  </object>
                ) : (
                  <pre className="p-4 text-xs text-st-txt2 leading-relaxed whitespace-pre-wrap overflow-auto h-full font-sans">
                    {'preview_text' in activePreview ? (activePreview.preview_text || t('contracts.docx_no_text')) : t('contracts.docx_no_preview')}
                  </pre>
                )}
              </div>

              {parsed && (
                <>
                  <div className="border border-st-b-sub rounded-lg p-4 bg-st-bg">
                    <p className="text-xs font-medium text-st-txt4 uppercase tracking-[0.1em] mb-3">{t('contracts.extracted_fields')}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {FIELD_LABELS.map(([key, label]) => (
                        <div key={key} className="flex flex-col">
                          <span className="text-[10px] text-st-txt4">{label}</span>
                          <span className="text-xs text-st-txt2 font-medium truncate">
                            {(parsed.fields as Record<string, string | null>)[key] ?? '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleConfirm} disabled={confirming}
                      className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white border-0 transition-colors',
                        confirming ? 'bg-[rgba(255,255,255,0.04)] cursor-not-allowed disabled:opacity-40' : 'bg-st-teal hover:bg-st-teal-h')}>
                      {confirming ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                      {t('contracts.save_to_db')}
                    </button>
                    <button onClick={handleCancel} disabled={confirming}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-st-txt2 border border-st-b-sub hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors">
                      <XCircle size={15} />{t('common.cancel')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-st-b-div bg-st-nav flex-shrink-0 animate-fade-in">
          <h2 className="text-base font-medium text-st-txt1">{t('contracts.saved_contracts')}</h2>
          <p className="text-sm text-st-txt3 mt-0.5">
            {t('contracts.total_n', { n: contracts.length })}
            {selectedIds.size > 0 && <span className="ml-2 text-st-txt1 font-medium">{t('contracts.selected_n', { n: selectedIds.size })}</span>}
          </p>
        </div>

        {/* Table area */}
        <div className="flex-1 overflow-auto">
          {loadingList ? (
            <div className="flex items-center justify-center py-16 text-st-txt3">
              <Loader2 size={20} className="animate-spin mr-2" /><span className="text-sm">{t('contracts.loading')}</span>
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-st-txt3">
              <FileCheck size={32} className="mb-3 opacity-30" /><p className="text-sm">{t('contracts.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-st-nav sticky top-0 z-10">
                <tr>
                  {/* 外呼通話 チェックボックス列 */}
                  <th className="px-3 py-2.5 text-xs font-medium text-st-txt3 border-b border-st-b-sub whitespace-nowrap text-center">
                    {t('contracts.col_outbound')}
                  </th>
                  {TABLE_COLUMNS.map(([, label]) => (
                    <th key={label} className="text-left px-3 py-2.5 text-xs font-medium text-st-txt3 border-b border-st-b-sub whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-st-txt3 border-b border-st-b-sub whitespace-nowrap">{t('contracts.col_created')}</th>
                  <th className="sticky right-0 z-20 bg-st-nav px-3 py-2.5 text-xs font-medium text-st-txt3 border-b border-st-b-sub border-l border-l-st-b-sub whitespace-nowrap">{t('contracts.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c, i) => {
                  const checked = selectedIds.has(c.id)
                  const rowBg = i % 2 === 0 ? 'bg-st-bg' : 'bg-[rgba(255,255,255,0.01)]'
                  return (
                    <tr key={c.id} className={cn('transition-colors hover:bg-[rgba(255,255,255,0.03)] animate-row-in', rowBg)} style={{ animationDelay: `${Math.min(i * 35, 550)}ms` }}>
                      {/* 外呼通話 チェックボックス */}
                      <td className="px-3 py-2 border-b border-st-b-div text-center">
                        <button
                          onClick={() => toggleSelect(c.id)}
                          className={cn(
                            'w-6 h-6 rounded border-2 flex items-center justify-center mx-auto transition-colors text-sm',
                            checked
                              ? 'bg-st-teal-bg border-st-b-teal text-st-teal-l'
                              : 'bg-transparent border-st-b-sub hover:border-st-b-teal',
                          )}
                        >
                          {checked && '✅'}
                        </button>
                      </td>
                      {/* 字段列 */}
                      {TABLE_COLUMNS.map(([key]) => {
                        const val = (c.fields as Record<string, string | null>)[key]
                        const correction = c.corrections?.[key]
                        return (
                          <td key={key} className="px-3 py-2 border-b border-st-b-div whitespace-nowrap">
                            <ContractFieldValue value={val} correction={correction} />
                          </td>
                        )
                      })}
                      {/* 登録日 */}
                      <td className="px-3 py-2 border-b border-st-b-div whitespace-nowrap text-xs text-st-txt3">
                        {formatDate(c.created_at)}
                      </td>
                      {/* 浮动操作按钮 */}
                      <td className="sticky right-0 z-10 bg-[#0F172A] px-3 py-2 border-b border-st-b-div border-l border-l-st-b-div whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleInspect(c)} disabled={loadingPreview === c.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-st-txt1 bg-[#162032] hover:bg-[#1C2A42] border border-st-b-sub hover:border-st-b-teal transition-colors disabled:opacity-50">
                            {loadingPreview === c.id ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}{t('contracts.btn_inspect')}
                          </button>
                          <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-st-err bg-[#220E0E] hover:bg-[#2E1212] border border-[rgba(252,165,165,0.35)] transition-colors disabled:opacity-50">
                            {deletingId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}{t('contracts.btn_delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 発信設定 */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 border-t border-st-b-div bg-st-nav">
          <p className="text-[10px] font-medium text-st-txt4 uppercase tracking-[0.1em] mb-2.5">{t('contracts.dial_settings')}</p>
          <div className="flex gap-3">
            {/* Agent selector */}
            <div className="flex-1">
              <label className="flex items-center gap-1 text-[11px] text-st-txt3 mb-1.5">
                <Bot size={11} />{t('contracts.agent_label')}
              </label>
              <select
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
                className={cn(
                  'w-full px-3 py-1.5 rounded-lg text-xs bg-st-bg border transition-colors focus:outline-none',
                  selectedAgentId ? 'text-st-txt1 border-st-b-teal' : 'text-st-txt3 border-st-b-sub hover:border-st-b-hover',
                )}
                style={{ colorScheme: 'dark' }}
              >
                <option value="">{t('contracts.select_agent')}</option>
                {agents.map(a => (
                  <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>
                ))}
              </select>
            </div>

            {/* Phone Number selector */}
            <div className="flex-1">
              <label className="flex items-center gap-1 text-[11px] text-st-txt3 mb-1.5">
                <Phone size={11} />{t('contracts.number_label')}
              </label>
              <select
                value={selectedNumberId}
                onChange={e => setSelectedNumberId(e.target.value)}
                className={cn(
                  'w-full px-3 py-1.5 rounded-lg text-xs bg-st-bg border transition-colors focus:outline-none',
                  selectedNumberId ? 'text-st-txt1 border-st-b-teal' : 'text-st-txt3 border-st-b-sub hover:border-st-b-hover',
                )}
                style={{ colorScheme: 'dark' }}
              >
                <option value="">{t('contracts.select_number')}</option>
                {phoneNumbers.map(n => (
                  <option key={n.number_id} value={n.number_id}>
                    {n.phone_number}{n.name ? ` (${n.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-st-b-div bg-st-nav flex items-center justify-end gap-3">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-st-txt2 border border-st-b-sub hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors"
          >
            <RotateCcw size={14} />{t('contracts.btn_reset')}
          </button>
          <button
            onClick={() => handleDial('scheduled')}
            disabled={selectedIds.size === 0 || !selectedAgentId || !selectedNumberId}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              selectedIds.size === 0 || !selectedAgentId || !selectedNumberId
                ? 'opacity-40 cursor-not-allowed text-st-txt3 border-st-b-sub bg-transparent'
                : 'text-st-teal border-st-b-teal bg-st-teal-bg hover:bg-[rgba(20,184,166,0.12)]',
            )}
          >
            <Calendar size={14} />{t('contracts.btn_scheduled')}
          </button>
          <button
            onClick={() => handleDial('immediate')}
            disabled={selectedIds.size === 0 || !selectedAgentId || !selectedNumberId}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white border-0 transition-colors',
              selectedIds.size === 0 || !selectedAgentId || !selectedNumberId
                ? 'opacity-40 cursor-not-allowed bg-[rgba(255,255,255,0.04)]'
                : 'bg-st-teal hover:bg-st-teal-h',
            )}
          >
            <Phone size={14} />{t('contracts.btn_immediate')}
          </button>
        </div>
      </div>

      {/* ── CSV / 発信確認モーダル ── */}
      {csvRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-st-nav border border-st-b-sub rounded-lg flex flex-col w-full max-w-5xl max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-st-b-div flex-shrink-0">
              <div className="flex items-center gap-2.5">
                {dialMode === 'scheduled'
                  ? <Calendar size={16} className="text-st-teal" />
                  : <Phone size={16} className="text-st-teal" />}
                <div>
                  <h3 className="font-medium text-st-txt1">
                    {dialMode === 'scheduled' ? t('contracts.modal_scheduled_title') : t('contracts.modal_immediate_title')}
                  </h3>
                  <p className="text-xs text-st-txt3 mt-0.5">{t('agora.count_n', { n: csvRows.length })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadCsv}
                  className="text-xs text-st-txt2 hover:text-st-txt1 px-2 py-1 rounded hover:bg-[rgba(255,255,255,0.04)] border border-transparent hover:border-st-b-sub transition-colors">
                  {t('contracts.csv_download')}
                </button>
                <button onClick={closeCsvModal}
                  className="p-1.5 rounded text-st-txt3 hover:text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-auto">

              {/* Campaign name */}
              <div className="px-6 py-4 border-b border-st-b-div">
                <label className="text-[11px] font-medium text-st-txt4 uppercase tracking-[0.08em]">{t('contracts.campaign_name_label')}</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  placeholder={t('contracts.campaign_name_ph')}
                  className="mt-1.5 w-full px-3 py-1.5 rounded-lg text-sm text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors placeholder:text-st-txt4"
                />
              </div>

              {/* CSV table */}
              <table className="w-full text-xs border-collapse">
                <thead className="bg-st-nav sticky top-0 z-10">
                  <tr>
                    {csvHeaders.map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-st-txt3 border-b border-st-b-sub whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-st-bg' : 'bg-[rgba(255,255,255,0.01)]'}>
                      {csvHeaders.map(h => (
                        <td key={h} className="px-3 py-2 border-b border-st-b-div whitespace-nowrap text-st-txt2">
                          {row[h] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── 予約設定 (scheduled only) ── */}
              {dialMode === 'scheduled' && (
                <div className="px-6 py-5 border-t border-st-b-div space-y-5">
                  <p className="text-[11px] font-medium text-st-txt4 uppercase tracking-[0.1em] flex items-center gap-1.5">
                    <Calendar size={12} />{t('contracts.scheduled_settings')}
                  </p>

                  {/* Start time + Timezone */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[11px] text-st-txt3 mb-1.5 block">{t('contracts.start_datetime')}</label>
                      <input
                        type="datetime-local"
                        value={schedStartTime}
                        onChange={e => setSchedStartTime(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors"
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] text-st-txt3 mb-1.5 block">{t('contracts.timezone_label')}</label>
                      <select
                        value={schedTimezone}
                        onChange={e => setSchedTimezone(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors"
                        style={{ colorScheme: 'dark' }}
                      >
                        {TIMEZONES.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Time ranges per weekday */}
                  <div>
                    <label className="text-[11px] text-st-txt3 mb-2 flex items-center gap-1">
                      <Clock size={11} />{t('contracts.time_ranges_label')}
                    </label>
                    <div className="border border-st-b-sub rounded-lg overflow-hidden">
                      {WEEKDAYS.map(({ wd, label }, idx) => {
                        const ranges = schedTimeRanges[wd] ?? []
                        return (
                          <div
                            key={wd}
                            className={cn(
                              'flex items-start gap-3 px-4 py-2.5',
                              idx < WEEKDAYS.length - 1 ? 'border-b border-st-b-div' : '',
                              wd === 0 ? 'bg-[rgba(252,165,165,0.04)]' : wd === 6 ? 'bg-[rgba(96,165,250,0.04)]' : 'bg-st-bg',
                            )}
                          >
                            {/* Day label */}
                            <span className={cn(
                              'w-5 text-xs font-medium flex-shrink-0 mt-1.5',
                              wd === 0 ? 'text-[#f87171]' : wd === 6 ? 'text-[#60a5fa]' : 'text-st-txt2',
                            )}>{label}</span>

                            {/* Ranges */}
                            <div className="flex-1 flex flex-col gap-1.5">
                              {ranges.length === 0 && (
                                <span className="text-xs text-st-txt4 mt-1.5">—</span>
                              )}
                              {ranges.map((r, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <input
                                    type="time"
                                    value={r.start}
                                    onChange={e => updateTimeRange(wd, i, 'start', e.target.value)}
                                    className="px-2 py-0.5 rounded text-xs text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal"
                                    style={{ colorScheme: 'dark' }}
                                  />
                                  <span className="text-st-txt4 text-xs">–</span>
                                  <input
                                    type="time"
                                    value={r.end}
                                    onChange={e => updateTimeRange(wd, i, 'end', e.target.value)}
                                    className="px-2 py-0.5 rounded text-xs text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal"
                                    style={{ colorScheme: 'dark' }}
                                  />
                                  <button
                                    onClick={() => removeTimeRange(wd, i)}
                                    className="p-0.5 rounded text-st-txt4 hover:text-st-err hover:bg-[rgba(252,165,165,0.08)] transition-colors"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              ))}
                            </div>

                            {/* Add button */}
                            <button
                              onClick={() => addTimeRange(wd)}
                              className="flex-shrink-0 mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-st-txt3 hover:text-st-txt1 border border-st-b-sub hover:border-st-b-teal hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                            >
                              <Plus size={10} />{t('contracts.add_time_range')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── End Call Config 設定 ── */}
              <div className="px-6 py-5 border-t border-st-b-div space-y-4">
                <p className="text-[11px] font-medium text-st-txt4 uppercase tracking-[0.1em] flex items-center gap-1.5">
                  <Clock size={12} />{t('contracts.ec_section')}
                </p>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[11px] text-st-txt3 mb-1.5 block">{t('contracts.ec_max_duration_label')}</label>
                    <input
                      type="number"
                      min={0}
                      value={ecMaxDuration}
                      onChange={e => setEcMaxDuration(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-st-txt3 mb-1.5 block">{t('contracts.ec_silence_timeout_label')}</label>
                    <input
                      type="number"
                      min={0}
                      value={ecSilenceTimeout}
                      onChange={e => setEcSilenceTimeout(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-st-txt3 mb-1.5 block">{t('contracts.ec_ring_timeout_label')}</label>
                    <input
                      type="number"
                      min={0}
                      value={ecRingTimeout}
                      onChange={e => setEcRingTimeout(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs text-st-txt1 bg-st-bg border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>

                <div className="border border-st-b-sub rounded-lg divide-y divide-st-b-div overflow-hidden">
                  {([
                    [t('contracts.ec_on_silence_timeout'), ecOnSilenceTimeout, setEcOnSilenceTimeout],
                    [t('contracts.ec_on_user_request'), ecOnUserRequest, setEcOnUserRequest],
                    [t('contracts.ec_on_ai_assistant'), ecOnAiAssistant, setEcOnAiAssistant],
                    [t('contracts.ec_on_voicemail'), ecOnVoicemail, setEcOnVoicemail],
                  ] as [string, boolean, (v: boolean) => void][]).map(([label, value, setValue], i) => (
                    <label key={i} className="flex items-center justify-between px-3 py-2 cursor-pointer bg-st-bg">
                      <span className="text-xs text-st-txt2">{label}</span>
                      <button
                        type="button"
                        onClick={() => setValue(!value)}
                        className={cn('relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors', value ? 'bg-st-teal' : 'bg-[rgba(255,255,255,0.1)]')}
                      >
                        <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform', value ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Structured Output 設定 ── */}
              <div className="px-6 py-5 border-t border-st-b-div space-y-4">
                {/* Header + toggle */}
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
                            {/* variable_name */}
                            <input
                              type="text"
                              value={ev.variable_name}
                              onChange={e => updateCustomEval(idx, 'variable_name', e.target.value)}
                              placeholder={t('contracts.so_var_name_ph')}
                              className="w-28 flex-shrink-0 px-2 py-1 rounded text-xs text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors placeholder:text-st-txt4 font-mono"
                            />
                            {/* type */}
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
                            {/* criteria */}
                            <input
                              type="text"
                              value={ev.criteria}
                              onChange={e => updateCustomEval(idx, 'criteria', e.target.value)}
                              placeholder={t('contracts.so_eval_criteria_ph')}
                              className="flex-1 min-w-0 px-2 py-1 rounded text-xs text-st-txt1 bg-[rgba(255,255,255,0.04)] border border-st-b-sub focus:outline-none focus:border-st-b-teal transition-colors placeholder:text-st-txt4"
                            />
                            {/* enums (string / number only) */}
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
                            {/* delete row */}
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
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-st-b-div">
              {removedDuplicates.length > 0 && (
                <div className="mb-3 text-xs bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.3)] rounded-lg px-3 py-2.5 space-y-2">
                  <p className="text-[#fbbf24] font-medium">
                    ⚠ {t('contracts.dedup_notice', { n: removedDuplicates.length })}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {removedDuplicates.map((row, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded bg-[rgba(251,191,36,0.12)] text-[#fbbf24] font-mono text-[11px]">
                        {row['phone_number'] || '—'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {campaignError && (
                <p className="mb-3 text-xs text-st-err bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg px-3 py-2">{campaignError}</p>
              )}
              {campaignSuccess && (
                <p className="mb-3 text-xs text-st-teal bg-st-teal-bg border border-st-b-teal rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <CheckCircle size={13} />{t('contracts.campaign_success')}
                </p>
              )}
              <div className="flex items-center justify-end">
                <button
                  onClick={handleCreateCampaign}
                  disabled={creatingCampaign || campaignSuccess}
                  className={cn(
                    'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white border-0 transition-colors',
                    creatingCampaign || campaignSuccess
                      ? 'opacity-50 cursor-not-allowed bg-[rgba(255,255,255,0.04)]'
                      : 'bg-st-teal hover:bg-st-teal-h',
                  )}
                >
                  {creatingCampaign
                    ? <><Loader2 size={14} className="animate-spin" />{t('contracts.creating_campaign')}</>
                    : dialMode === 'scheduled'
                      ? <><Calendar size={14} />{t('contracts.btn_start_scheduled')}</>
                      : <><Phone size={14} />{t('contracts.btn_start_immediate')}</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
