import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, PlusCircle, Trash2, PhoneCall, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { bcp47ForI18n } from '../../i18n'
import { API } from '../../lib/api'

interface PhoneNumber {
  id: number
  number_id: string
  name: string
  phone_number: string
  type: string
  sip_gateway_host: string | null
  sip_signaling_port: number | null
  outbound_protocol: string | null
  created_at: string | null
}

const PROTOCOL_OPTIONS = ['udp', 'tcp', 'tls']
const TYPE_OPTIONS = ['sip_trunk']

const defaultForm = {
  name: '',
  phone_number: '',
  type: 'sip_trunk',
  sip_gateway_host: '',
  sip_signaling_port: 5060,
  outbound_protocol: 'udp',
}

export function PhoneNumbersPage() {
  const { t, i18n } = useTranslation()
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ ...defaultForm })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadNumbers() {
    try {
      // 先从数据库快速加载
      const dbData = await fetch(`${API}/api/phone-numbers`).then(r => r.json())
      setNumbers(dbData)
      setLoading(false)

      // 同时在后台同步 Agora 列表，有新增记录时刷新
      const synced = await fetch(`${API}/api/phone-numbers/sync`, { method: 'POST' }).then(r => r.json())
      setNumbers(synced)
    } catch {
      setError(t('common.server_error'))
      setLoading(false)
    }
  }

  useEffect(() => { loadNumbers() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.phone_number.trim()) {
      setFormError(t('phone_numbers.form_name_phone_required'))
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone_number: form.phone_number.trim(),
        type: form.type,
      }
      if (form.sip_gateway_host.trim()) payload.sip_gateway_host = form.sip_gateway_host.trim()
      if (form.sip_signaling_port) payload.sip_signaling_port = Number(form.sip_signaling_port)
      if (form.outbound_protocol) payload.outbound_protocol = form.outbound_protocol

      const resp = await fetch(`${API}/api/phone-numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || 'Request failed')
      }
      const newRecord = await resp.json()
      setNumbers(prev => [newRecord, ...prev])
      setShowModal(false)
      setForm({ ...defaultForm })
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(numberId: string) {
    if (!confirm(t('phone_numbers.delete_confirm'))) return
    setDeletingId(numberId)
    try {
      const resp = await fetch(`${API}/api/phone-numbers/${numberId}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error()
      setNumbers(prev => prev.filter(n => n.number_id !== numberId))
    } catch {
      alert(t('common.delete_failed'))
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(bcp47ForI18n(i18n.language), {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-8 bg-st-bg min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h1 className="text-xl font-medium text-st-txt1">Phone Numbers</h1>
          <p className="text-sm text-st-txt2 mt-0.5">{t('phone_numbers.page_subtitle')}</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError('') }}
          className="inline-flex items-center gap-2 bg-st-teal text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-st-teal-h border-0 transition-colors"
        >
          <PlusCircle size={16} />
          Add Number
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-st-txt3">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">{t('common.loading')}</span>
        </div>
      )}
      {error && (
        <div className="bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-md p-4 text-sm text-st-err">{error}</div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          {numbers.length === 0 ? (
            <div className="bg-st-card border border-st-b-sub rounded-md p-12 text-center text-st-txt3">
              <PhoneCall size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('phone_numbers.empty')}</p>
              <p className="text-xs mt-1">{t('phone_numbers.empty_hint')}</p>
            </div>
          ) : (
            <div className="bg-st-nav border border-st-b-sub rounded-md overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-st-b-sub bg-st-bg text-xs font-medium text-st-txt4 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Number ID</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Phone Number</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">SIP_TO_Domain</th>
                    <th className="text-left px-4 py-3">SIP_Port</th>
                    <th className="text-left px-4 py-3">Protocol</th>
                    <th className="text-left px-4 py-3">Created At</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-st-b-div">
                  {numbers.map((n, i) => (
                    <tr key={n.number_id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors animate-card-in" style={{ animationDelay: `${Math.min(i * 55, 550)}ms` }}>
                      <td className="px-4 py-3 font-mono text-xs text-st-txt3">{n.number_id}</td>
                      <td className="px-4 py-3 font-medium text-st-txt1">{n.name}</td>
                      <td className="px-4 py-3 font-mono text-st-txt2">{n.phone_number}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[rgba(255,255,255,0.04)] text-st-txt1">
                          {n.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-st-txt2">{n.sip_gateway_host ?? '—'}</td>
                      <td className="px-4 py-3 text-st-txt2">{n.sip_signaling_port ?? '—'}</td>
                      <td className="px-4 py-3">
                        {n.outbound_protocol ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[rgba(255,255,255,0.04)] text-st-txt3 uppercase">
                            {n.outbound_protocol}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-st-txt3 text-xs whitespace-nowrap">{formatDate(n.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(n.number_id)}
                          disabled={deletingId === n.number_id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[rgba(252,165,165,0.08)] text-st-err hover:bg-[rgba(252,165,165,0.12)] border border-[rgba(252,165,165,0.22)] transition-colors disabled:opacity-40"
                        >
                          {deletingId === n.number_id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Number Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-st-nav rounded-md border border-st-b-sub w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-st-b-sub">
              <h2 className="font-medium text-st-txt1">Add Phone Number</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-st-txt3 hover:text-st-txt2 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-st-txt4 mb-1">
                  Name <span className="text-st-err">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Input Your Phone Number"
                  className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm focus:outline-none focus:border-st-b-teal bg-transparent text-st-txt1"
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-medium text-st-txt4 mb-1">
                  Phone Number <span className="text-st-err">*</span>
                </label>
                <input
                  type="text"
                  value={form.phone_number}
                  onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+12013040791"
                  className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-st-b-teal bg-transparent text-st-txt1"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-st-txt4 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm focus:outline-none focus:border-st-b-teal bg-st-nav text-st-txt2"
                  style={{ colorScheme: 'dark' }}
                >
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* SIP Gateway Host */}
              <div>
                <label className="block text-xs font-medium text-st-txt4 mb-1">
                  SIP_TO_Domain (sip_gateway_host)
                </label>
                <input
                  type="text"
                  value={form.sip_gateway_host}
                  onChange={e => setForm(f => ({ ...f, sip_gateway_host: e.target.value }))}
                  placeholder="Input the SIP Domain"
                  className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm focus:outline-none focus:border-st-b-teal bg-transparent text-st-txt1"
                />
              </div>

              {/* SIP Port + Protocol (2 columns) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-st-txt4 mb-1">
                    SIP_Port (sip_signaling_port)
                  </label>
                  <input
                    type="number"
                    value={form.sip_signaling_port}
                    onChange={e => setForm(f => ({ ...f, sip_signaling_port: Number(e.target.value) }))}
                    placeholder="5060"
                    className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm focus:outline-none focus:border-st-b-teal bg-transparent text-st-txt1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-st-txt4 mb-1">Outbound Protocol</label>
                  <select
                    value={form.outbound_protocol}
                    onChange={e => setForm(f => ({ ...f, outbound_protocol: e.target.value }))}
                    className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm focus:outline-none focus:border-st-b-teal bg-st-nav text-st-txt2"
                    style={{ colorScheme: 'dark' }}
                  >
                    {PROTOCOL_OPTIONS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>

              {formError && (
                <p className="text-sm text-st-err bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-md px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white border-0 transition-colors',
                    submitting ? 'bg-st-teal cursor-not-allowed opacity-40' : 'bg-st-teal hover:bg-st-teal-h'
                  )}
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? 'Adding...' : 'Add Number'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
