import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2, PlusCircle, Trash2, Bot, X, Pencil, ChevronDown, ChevronRight, FileText, MessageCircle, AlertCircle,
  Mic, SlidersHorizontal, AudioLines, Sparkles, MapPin, type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { bcp47ForI18n } from '../../i18n'
import { API } from '../../lib/api'
const SENSITIVE_PLACEHOLDER = '****'

// ── Types ─────────────────────────────────────────────────────────
export interface Agent {
  id: number
  agent_id: string
  agent_name: string
  app_id: string
  system_content: string | null
  greeting_message: string | null
  failure_message: string | null
  voice_id: string | null
  properties: Record<string, unknown> | null
  created_at: string | null
}

export interface PropsForm {
  llm_json: string
  tts_json: string
  asr_json: string
  params_json: string
  turn_json: string
  adv_json: string
  geofencing_json: string
}

function maskPath(obj: Record<string, unknown>, path: string[]): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  let node: Record<string, unknown> = clone
  for (const key of path.slice(0, -1)) {
    if (typeof node[key] !== 'object' || node[key] === null) return clone
    node = node[key] as Record<string, unknown>
  }
  const last = path[path.length - 1]
  if (node[last] !== undefined) node[last] = SENSITIVE_PLACEHOLDER
  return clone
}

export function propsToForm(props: Record<string, unknown>): PropsForm {
  const llm = (props.llm as Record<string, unknown>) ?? {}
  const tts = (props.tts as Record<string, unknown>) ?? {}
  const asr = (props.asr as Record<string, unknown>) ?? {}
  const parameters = (props.parameters as Record<string, unknown>) ?? {}
  const turnDet = (props.turn_detection as Record<string, unknown>) ?? {}
  const adv = (props.advanced_features as Record<string, unknown>) ?? {}
  const geofence = (props.geofence as Record<string, unknown>) ?? {}

  const paramsMerged: Record<string, unknown> = {
    data_channel: 'rtm',
    audio_scenario: 'default',
    enable_dump: true,
    enable_metrics: true,
    enable_flexible: true,
    enable_error_message: true,
    silence_config: { timeout_ms: 4000 },
    ...parameters,
    idle_timeout: (props.idle_timeout as number) ?? 120,
  }
  const turnDefault = {
    config: {
      start_of_speech: { vad_config: { interrupt_duration_ms: 160, speaking_interrupt_duration_ms: 160, prefix_padding_ms: 800 } },
      end_of_speech: { semantic_config: { silence_duration_ms: 240, max_wait_ms: 3000 } },
    },
  }
  const advDefault = { enable_rtm: true, enable_sal: false, enable_tools: true }

  return {
    llm_json: JSON.stringify(maskPath(llm, ['api_key']), null, 2),
    tts_json: JSON.stringify(maskPath(tts, ['params', 'key']), null, 2),
    asr_json: JSON.stringify(asr, null, 2),
    params_json: JSON.stringify(paramsMerged, null, 2),
    turn_json: JSON.stringify(Object.keys(turnDet).length ? turnDet : turnDefault, null, 2),
    adv_json: JSON.stringify(Object.keys(adv).length ? adv : advDefault, null, 2),
    geofencing_json: JSON.stringify(geofence, null, 2),
  }
}

function parseJsonField(label: string, raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`${label} JSON is invalid: ${err.message}`)
    throw err
  }
}

export function formToProps(f: PropsForm, original: Record<string, unknown>): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(original)) as Record<string, unknown>
  base.llm = parseJsonField('LLM', f.llm_json)
  base.tts = parseJsonField('TTS', f.tts_json)
  base.asr = parseJsonField('ASR', f.asr_json)
  if (f.geofencing_json.trim() === '' || f.geofencing_json.trim() === '{}') {
    delete base.geofence
  } else {
    base.geofence = parseJsonField('Geofencing', f.geofencing_json)
  }
  const paramsParsed = parseJsonField('Parameters', f.params_json)
  const { idle_timeout, ...parameters } = paramsParsed
  base.idle_timeout = (idle_timeout as number) ?? 120
  base.parameters = parameters
  base.turn_detection = parseJsonField('Turn Detection', f.turn_json)
  base.advanced_features = parseJsonField('Advanced Features', f.adv_json)
  return base
}

// ── UI primitives ─────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={cn('bg-st-nav rounded-lg border border-st-b-teal flex flex-col max-h-[92vh]', wide ? 'w-full max-w-3xl' : 'w-full max-w-lg')}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-st-b-div flex-shrink-0">
          <h2 className="font-medium text-st-txt1 text-sm">{title}</h2>
          <button onClick={onClose} className="text-st-txt4 hover:text-st-txt2 transition-colors"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function SectionHeader({ color, title, open, toggle }: {
  color: string; title: string; open: boolean; toggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn('w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium uppercase tracking-[0.06em] transition-colors', color)}
    >
      {title}
      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
    </button>
  )
}

function SettingsSectionCard({
  title, description, open, onToggle, icon: Icon, accentBar, iconWrap, children,
}: {
  title: string; description: string; open: boolean; onToggle: () => void
  icon: LucideIcon; accentBar: string; iconWrap: string; children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-lg border border-st-b-sub bg-st-card overflow-hidden border-l-4', accentBar)}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
      >
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', iconWrap)}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-st-txt1 leading-tight">{title}</div>
          <div className="text-[11px] text-st-txt3 mt-0.5 leading-snug">{description}</div>
        </div>
        {open
          ? <ChevronDown className="shrink-0 text-st-txt4" size={15} />
          : <ChevronRight className="shrink-0 text-st-txt4" size={15} />}
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 border-t border-st-b-div">
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  )
}

function Field({ label, sensitive, children }: { label: string; sensitive?: boolean; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-st-txt3 mb-1.5">
        {label}
        {sensitive && (
          <span className="px-1.5 py-0.5 bg-[rgba(251,191,36,0.08)] text-st-warn border border-[rgba(251,191,36,0.22)] rounded text-[9px] font-medium">
            {t('common.sensitive')}
          </span>
        )}
      </label>
      {children}
    </div>
  )
}

function LlmPromptBlock({
  kind, value, onChange, rows, showRequired, placeholder: placeholderProp,
}: {
  kind: 'system' | 'greeting' | 'failure'
  value: string; onChange: (v: string) => void
  rows: number; showRequired?: boolean; placeholder?: string
}) {
  const { t } = useTranslation()
  const isSystem = kind === 'system'
  const isGreeting = kind === 'greeting'

  const borderCls = isSystem
    ? 'border-[rgba(148,163,184,0.18)]'
    : isGreeting
      ? 'border-[rgba(13,148,136,0.25)]'
      : 'border-[rgba(252,165,165,0.22)]'

  const headerBg = isSystem
    ? 'bg-[rgba(255,255,255,0.03)] border-[rgba(148,163,184,0.10)]'
    : isGreeting
      ? 'bg-[rgba(13,148,136,0.06)] border-[rgba(13,148,136,0.15)]'
      : 'bg-[rgba(252,165,165,0.06)] border-[rgba(252,165,165,0.15)]'

  const iconCls = isSystem ? 'text-st-txt3' : isGreeting ? 'text-st-ok' : 'text-st-err'

  return (
    <div className={cn('overflow-hidden rounded-md border transition-colors focus-within:border-st-b-teal', borderCls)}>
      <div className={cn('flex items-center gap-2 border-b px-3 py-2', headerBg)}>
        {isSystem
          ? <FileText className={cn('h-3.5 w-3.5 flex-shrink-0', iconCls)} />
          : isGreeting
            ? <MessageCircle className={cn('h-3.5 w-3.5 flex-shrink-0', iconCls)} />
            : <AlertCircle className={cn('h-3.5 w-3.5 flex-shrink-0', iconCls)} />}
        <p className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-st-txt2">
          {isSystem ? 'System Prompt' : isGreeting ? 'Greeting Message' : 'Failure Message'}
          {showRequired && <span className="ml-0.5 text-st-err" aria-hidden>*</span>}
          <span className="ml-2 font-normal text-[10px] text-st-txt4">
            {isSystem
              ? `· ${t('agents.llm_h_system')}`
              : isGreeting
                ? `· ${t('agents.llm_h_greeting')}`
                : `· ${t('agents.llm_h_failure')}`}
          </span>
        </p>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        style={{ colorScheme: 'dark' }}
        className={cn(
          'w-full resize-y border-0 bg-transparent px-3 py-2 text-[13px] leading-relaxed text-st-txt1 placeholder:text-st-txt5 focus:ring-0 focus:outline-none',
          isSystem ? 'font-mono' : 'font-sans',
        )}
        placeholder={
          placeholderProp ?? (isSystem
            ? 'You are a helpful assistant...'
            : isGreeting
              ? t('agents.ph_greeting')
              : t('agents.ph_failure'))
        }
      />
    </div>
  )
}

function JsonTextarea({ value, onChange, rows = 14 }: {
  value: string; onChange: (v: string) => void; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      spellCheck={false}
      style={{ colorScheme: 'dark' }}
      className="w-full resize-y border border-st-b-sub rounded-md px-3 py-2 text-[12.5px] font-mono leading-relaxed text-st-txt1 placeholder:text-st-txt5 focus:outline-none focus:border-st-b-teal bg-[rgba(255,255,255,0.04)]"
    />
  )
}

// ── Properties GUI form ───────────────────────────────────────────
export function PropsEditor({ form, onChange }: {
  form: PropsForm; onChange: (patch: Partial<PropsForm>) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState({ llm: true, tts: true, asr: false, params: false, turn: false, adv: false, geo: false })
  const toggle = (k: keyof typeof open) => setOpen(o => ({ ...o, [k]: !o[k] }))

  return (
    <div className="space-y-3">
      {/* LLM */}
      <div>
        <SectionHeader
          color="bg-st-teal-bg border border-st-b-teal text-st-teal-l hover:bg-[rgba(13,148,136,0.18)]"
          title="LLM" open={open.llm} toggle={() => toggle('llm')}
        />
        {open.llm && (
          <div className="mt-2 space-y-2.5 pl-1">
            <Field label="LLM Config (JSON)">
              <JsonTextarea value={form.llm_json} onChange={v => onChange({ llm_json: v })} rows={20} />
            </Field>
          </div>
        )}
      </div>

      {/* TTS */}
      <div>
        <SectionHeader
          color="bg-[rgba(255,255,255,0.04)] border border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.06)]"
          title="TTS" open={open.tts} toggle={() => toggle('tts')}
        />
        {open.tts && (
          <div className="mt-2 space-y-3 pl-1">
            <Field label="TTS Config (JSON)">
              <JsonTextarea value={form.tts_json} onChange={v => onChange({ tts_json: v })} rows={16} />
            </Field>
          </div>
        )}
      </div>

      <SettingsSectionCard title="ASR" description={t('agents.asr_desc')}
        open={open.asr} onToggle={() => toggle('asr')} icon={Mic}
        accentBar="border-l-[#0D9488]" iconWrap="bg-st-teal-bg text-st-teal-l">
        <Field label="ASR Config (JSON)">
          <JsonTextarea value={form.asr_json} onChange={v => onChange({ asr_json: v })} rows={6} />
        </Field>
      </SettingsSectionCard>

      <SettingsSectionCard title="Parameters" description={t('agents.params_desc')}
        open={open.params} onToggle={() => toggle('params')} icon={SlidersHorizontal}
        accentBar="border-l-[rgba(251,191,36,0.70)]" iconWrap="bg-[rgba(251,191,36,0.08)] text-st-warn">
        <Field label="Parameters Config (JSON)">
          <JsonTextarea value={form.params_json} onChange={v => onChange({ params_json: v })} rows={12} />
        </Field>
      </SettingsSectionCard>

      <SettingsSectionCard title="Turn Detection" description={t('agents.turn_desc')}
        open={open.turn} onToggle={() => toggle('turn')} icon={AudioLines}
        accentBar="border-l-[rgba(148,163,184,0.50)]" iconWrap="bg-[rgba(148,163,184,0.08)] text-st-txt2">
        <Field label="Turn Detection Config (JSON)">
          <JsonTextarea value={form.turn_json} onChange={v => onChange({ turn_json: v })} rows={12} />
        </Field>
      </SettingsSectionCard>

      <SettingsSectionCard title="Advanced Features" description={t('agents.adv_desc')}
        open={open.adv} onToggle={() => toggle('adv')} icon={Sparkles}
        accentBar="border-l-[rgba(148,163,184,0.25)]" iconWrap="bg-[rgba(148,163,184,0.06)] text-st-txt3">
        <Field label="Advanced Features Config (JSON)">
          <JsonTextarea value={form.adv_json} onChange={v => onChange({ adv_json: v })} rows={6} />
        </Field>
      </SettingsSectionCard>

      <SettingsSectionCard title="Geofencing" description={t('agents.geofencing_desc')}
        open={open.geo} onToggle={() => toggle('geo')} icon={MapPin}
        accentBar="border-l-[rgba(148,163,184,0.25)]" iconWrap="bg-[rgba(148,163,184,0.06)] text-st-txt3">
        <Field label="Geofencing Config (JSON)">
          <JsonTextarea value={form.geofencing_json} onChange={v => onChange({ geofencing_json: v })} rows={8} />
        </Field>
      </SettingsSectionCard>
    </div>
  )
}

// ── Create form defaults ──────────────────────────────────────────
const defaultCreateForm = { agent_name: '', system_content: '', greeting_message: '', failure_message: '', voice_id: '' }

// ── Main page ─────────────────────────────────────────────────────
export function AgentsPage() {
  const { t, i18n } = useTranslation()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ ...defaultCreateForm })
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')
  const [textModal, setTextModal] = useState<{ title: string; content: string } | null>(null)
  const [propsModal, setPropsModal] = useState<{ agent: Agent; original: Record<string, unknown>; form: PropsForm } | null>(null)
  const [propsError, setPropsError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadAgents() {
    try {
      const dbData = await fetch(`${API}/api/agents`).then(r => r.json())
      setAgents(dbData); setLoading(false)
      const synced = await fetch(`${API}/api/agents/sync`, { method: 'POST' }).then(r => r.json())
      setAgents(synced)
    } catch { setError(t('agents.server_error')); setLoading(false) }
  }
  useEffect(() => { loadAgents() }, [])

  function resetCreate() { setShowCreate(false); setCreateForm({ ...defaultCreateForm }); setCreateError('') }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setCreateError('')
    if (!createForm.agent_name.trim() || !createForm.system_content.trim() || !createForm.greeting_message.trim()) {
      setCreateError(t('agents.create_error_required')); return
    }
    setSubmitting(true)
    try {
      const resp = await fetch(`${API}/api/agents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: createForm.agent_name.trim(),
          system_content: createForm.system_content.trim(),
          greeting_message: createForm.greeting_message.trim(),
          failure_message: createForm.failure_message.trim(),
          voice_id: createForm.voice_id.trim() || 'ai_assistant_008',
        }),
      })
      if (!resp.ok) { const err = await resp.json().catch(() => ({ detail: resp.statusText })); throw new Error(err.detail || 'Request failed') }
      const newAgent = await resp.json()
      setAgents(prev => [newAgent, ...prev]); resetCreate()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Request failed')
    } finally { setSubmitting(false) }
  }

  async function handleDelete(agentId: string) {
    if (!confirm(t('agents.delete_confirm'))) return
    setDeletingId(agentId)
    try {
      const resp = await fetch(`${API}/api/agents/${agentId}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error()
      setAgents(prev => prev.filter(a => a.agent_id !== agentId))
    } catch { alert(t('common.delete_failed')) } finally { setDeletingId(null) }
  }

  function openPropsModal(agent: Agent) {
    setPropsError(''); const original = agent.properties ?? {}
    setPropsModal({ agent, original, form: propsToForm(original) })
  }

  async function handleUpdate() {
    if (!propsModal) return; setPropsError('')
    let rebuilt: Record<string, unknown>
    try {
      rebuilt = formToProps(propsModal.form, propsModal.original)
    } catch (err: unknown) {
      setPropsError(err instanceof Error ? err.message : 'Invalid JSON')
      return
    }
    setUpdating(true)
    try {
      const resp = await fetch(`${API}/api/agents/${propsModal.agent.agent_id}/properties`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rebuilt),
      })
      if (!resp.ok) { const err = await resp.json().catch(() => ({ detail: resp.statusText })); throw new Error(err.detail || 'Request failed') }
      const updated = await resp.json()
      setAgents(prev => prev.map(a => a.agent_id === updated.agent_id ? updated : a))
      setPropsModal(null)
    } catch (err: unknown) {
      setPropsError(err instanceof Error ? err.message : 'Request failed')
    } finally { setUpdating(false) }
  }

  function getLlmModel(agent: Agent): string | null {
    try {
      const llm = agent.properties?.llm as Record<string, unknown> | undefined
      const params = llm?.params as Record<string, unknown> | undefined
      return (params?.model as string) || null
    } catch { return null }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(bcp47ForI18n(i18n.language), {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-6 bg-st-bg min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="animate-fade-in">
          <h1 className="text-base font-medium text-st-txt1">Agents</h1>
          <p className="text-[11px] text-st-txt3 mt-0.5">{t('agents.page_subtitle')}</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError('') }}
          className="inline-flex items-center gap-2 bg-st-teal hover:bg-st-teal-h text-white px-3.5 py-2 rounded-md text-[13px] font-medium transition-colors"
        >
          <PlusCircle size={14} />
          Create Agent
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-st-txt3">
          <Loader2 size={18} className="animate-spin mr-2 text-st-teal" />
          <span className="text-[13px]">{t('agents.loading')}</span>
        </div>
      )}
      {error && (
        <div className="bg-[rgba(252,165,165,0.06)] border border-[rgba(252,165,165,0.20)] rounded-lg p-3 text-[12px] text-st-err">{error}</div>
      )}

      {!loading && !error && (
        agents.length === 0 ? (
          <div className="bg-st-card border border-st-b-sub rounded-lg p-12 text-center">
            <Bot size={28} className="mx-auto mb-3 text-st-txt5" />
            <p className="text-[13px] text-st-txt3">{t('agents.empty')}</p>
            <p className="text-[11px] text-st-txt4 mt-1">{t('agents.empty_hint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {agents.map((a, i) => (
              <div key={a.agent_id}
                className="bg-st-card border border-st-b-sub rounded-lg hover:border-st-b-hover transition-colors flex flex-col overflow-hidden animate-card-in"
                style={{ animationDelay: `${Math.min(i * 55, 550)}ms` }}>
                {/* Top teal accent strip */}
                <div className="h-[2px] bg-st-teal rounded-t-lg" />

                {/* Header */}
                <div className="px-4 pt-3.5 pb-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0 w-7 h-7 rounded-md bg-st-teal-bg flex items-center justify-center">
                        <Bot size={14} className="text-st-teal-l" />
                      </div>
                      <h3 className="font-medium text-st-txt1 text-[13px] leading-snug truncate">{a.agent_name}</h3>
                    </div>
                    {getLlmModel(a) && (
                      <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(255,255,255,0.06)] text-st-txt3 border border-st-b-sub font-mono">
                        {getLlmModel(a)}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-st-txt4 truncate mt-0.5">{a.agent_id}</p>
                </div>

                {/* Prompt previews */}
                <div className="px-4 pb-3 space-y-1.5 flex-1">
                  {a.greeting_message ? (
                    <button type="button"
                      onClick={() => setTextModal({ title: 'Greeting Message', content: a.greeting_message! })}
                      className="w-full text-left">
                      <div className="flex items-start gap-1.5 rounded border border-[rgba(13,148,136,0.20)] bg-[rgba(13,148,136,0.06)] px-2.5 py-1.5 hover:bg-[rgba(13,148,136,0.10)] transition-colors">
                        <MessageCircle size={11} className="text-st-ok mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-st-txt2 line-clamp-2 leading-snug">{a.greeting_message}</p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded border border-st-b-sub bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5">
                      <MessageCircle size={11} className="text-st-txt5 flex-shrink-0" />
                      <p className="text-[10px] text-st-txt4">No greeting message</p>
                    </div>
                  )}

                  {a.system_content ? (
                    <button type="button"
                      onClick={() => setTextModal({ title: 'System Prompt', content: a.system_content! })}
                      className="w-full text-left">
                      <div className="flex items-start gap-1.5 rounded border border-[rgba(148,163,184,0.15)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                        <FileText size={11} className="text-st-txt3 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] font-mono text-st-txt2 line-clamp-2 leading-snug">{a.system_content}</p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded border border-st-b-sub bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5">
                      <FileText size={11} className="text-st-txt5 flex-shrink-0" />
                      <p className="text-[10px] text-st-txt4">No system prompt</p>
                    </div>
                  )}
                </div>

                {/* Date */}
                <div className="px-4 pb-2.5">
                  <p className="text-[10px] text-st-txt4">{formatDate(a.created_at)}</p>
                </div>

                {/* Actions */}
                <div className="border-t border-st-b-div grid grid-cols-2">
                  <button onClick={() => openPropsModal(a)}
                    className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-st-txt4 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-teal-l transition-colors border-r border-st-b-div">
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={() => handleDelete(a.agent_id)} disabled={deletingId === a.agent_id}
                    className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-st-txt4 hover:bg-[rgba(252,165,165,0.06)] hover:text-st-err transition-colors disabled:opacity-40">
                    {deletingId === a.agent_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Text viewer modal */}
      {textModal && (
        <Modal title={textModal.title} onClose={() => setTextModal(null)}>
          <div className="px-5 py-4 overflow-y-auto">
            <div className="rounded-md border border-st-b-sub bg-[rgba(255,255,255,0.02)] p-4">
              <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-st-txt2 font-sans">
                {textModal.content}
              </pre>
            </div>
          </div>
        </Modal>
      )}

      {/* Properties GUI modal */}
      {propsModal && (
        <Modal title={`Edit Properties — ${propsModal.agent.agent_name}`} onClose={() => setPropsModal(null)} wide>
          <div className="px-5 pt-3 pb-3 border-b border-st-b-div flex-shrink-0 flex items-center justify-between gap-3">
            <p className="text-[11px] text-st-txt3">
              <span className="inline-flex items-center gap-1 bg-[rgba(251,191,36,0.08)] text-st-warn border border-[rgba(251,191,36,0.22)] px-1.5 py-0.5 rounded text-[9px] font-medium mr-1">
                {t('common.sensitive')}
              </span>
              {t('agents.props_sensitive_hint')}
            </p>
            <button onClick={handleUpdate} disabled={updating}
              className={cn('flex-shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-[13px] font-medium text-white transition-colors',
                updating ? 'bg-st-teal opacity-60 cursor-not-allowed' : 'bg-st-teal hover:bg-st-teal-h')}>
              {updating && <Loader2 size={13} className="animate-spin" />}
              {updating ? 'Updating...' : 'UPDATE'}
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1">
            {propsError && (
              <p className="mb-3 text-[12px] text-st-err bg-[rgba(252,165,165,0.06)] border border-[rgba(252,165,165,0.20)] rounded-md px-3 py-2">{propsError}</p>
            )}
            <PropsEditor form={propsModal.form}
              onChange={patch => setPropsModal(m => m ? { ...m, form: { ...m.form, ...patch } } : null)} />
          </div>
        </Modal>
      )}

      {/* Create Agent modal */}
      {showCreate && (
        <Modal title="Create Agent" onClose={resetCreate}>
          <form onSubmit={handleCreate} className="space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label className="block text-[11px] font-medium text-st-txt3 mb-1.5">
                Agent Name <span className="text-st-err">*</span>
              </label>
              <input type="text" value={createForm.agent_name}
                onChange={e => setCreateForm(f => ({ ...f, agent_name: e.target.value }))}
                placeholder="stantest2"
                style={{ colorScheme: 'dark' }}
                className="w-full border border-st-b-sub rounded-md px-3 py-2 text-[13px] text-st-txt1 placeholder:text-st-txt5 focus:outline-none focus:border-st-b-teal bg-[rgba(255,255,255,0.04)] transition-colors" />
            </div>
            <LlmPromptBlock kind="system" value={createForm.system_content}
              onChange={v => setCreateForm(f => ({ ...f, system_content: v }))} rows={20} showRequired />
            <LlmPromptBlock kind="greeting" value={createForm.greeting_message}
              onChange={v => setCreateForm(f => ({ ...f, greeting_message: v }))} rows={5} showRequired />
            <LlmPromptBlock kind="failure" value={createForm.failure_message}
              onChange={v => setCreateForm(f => ({ ...f, failure_message: v }))} rows={2}
              placeholder={t('agents.ph_failure')} />
            <div>
              <label className="block text-[11px] font-medium text-st-txt3 mb-1.5">
                Voice ID <span className="text-st-txt4 font-normal ml-1">(ai_assistant_008)</span>
              </label>
              <input type="text" value={createForm.voice_id}
                onChange={e => setCreateForm(f => ({ ...f, voice_id: e.target.value }))}
                placeholder="ai_assistant_008"
                style={{ colorScheme: 'dark' }}
                className="w-full border border-st-b-sub rounded-md px-3 py-2 text-[13px] text-st-txt1 placeholder:text-st-txt5 focus:outline-none focus:border-st-b-teal bg-[rgba(255,255,255,0.04)] transition-colors" />
            </div>
            {createError && (
              <p className="text-[12px] text-st-err bg-[rgba(252,165,165,0.06)] border border-[rgba(252,165,165,0.20)] rounded-md px-3 py-2">{createError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={resetCreate}
                className="px-4 py-1.5 text-[13px] font-medium text-st-txt2 border border-st-b-sub hover:border-st-b-teal hover:text-st-txt1 rounded-md transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className={cn('inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-[13px] font-medium text-white transition-colors',
                  submitting ? 'bg-st-teal opacity-60 cursor-not-allowed' : 'bg-st-teal hover:bg-st-teal-h')}>
                {submitting && <Loader2 size={13} className="animate-spin" />}
                {submitting ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
