import { useState, useEffect } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { API } from '../../lib/api'

interface Settings {
  DATABASE_URL: string
  ANTHROPIC_API_KEY: string
  AGORA_API_KEY: string
  AGORA_PIPELINE_ID: string
  AGORA_PHONE_NUMBER: string
  VOICE_AGENT_BASE_URL: string
  VOICE_AGENT_API_KEY: string
  WEBHOOK_SECRET: string
  POLL_INTERVAL_SECONDS: string
  MAX_CONCURRENT_CALLS: string
}

const DEFAULTS: Settings = {
  DATABASE_URL: 'sqlite+aiosqlite:///./dev.db',
  ANTHROPIC_API_KEY: '',
  AGORA_API_KEY: '',
  AGORA_PIPELINE_ID: '',
  AGORA_PHONE_NUMBER: '',
  VOICE_AGENT_BASE_URL: '',
  VOICE_AGENT_API_KEY: '',
  WEBHOOK_SECRET: '',
  POLL_INTERVAL_SECONDS: '5',
  MAX_CONCURRENT_CALLS: '10',
}

function Field({
  label, desc, value, onChange, placeholder, type = 'text',
}: {
  label: string; desc?: string; value: string
  onChange: (v: string) => void; placeholder?: string
  type?: 'text' | 'password' | 'url' | 'number'
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div>
      <label className="block text-sm font-medium text-st-txt2 mb-1">{label}</label>
      {desc && <p className="text-xs text-st-txt3 mb-1.5">{desc}</p>}
      <div className="relative">
        <input
          type={isPassword && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm pr-9 focus:outline-none focus:border-st-b-teal bg-transparent text-st-txt2 font-mono"
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-st-txt3 hover:text-st-txt2">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-st-nav border border-st-b-sub rounded-lg p-6 space-y-5">
      <h2 className="text-sm font-medium text-st-txt1 border-b border-st-b-sub pb-3">{title}</h2>
      {children}
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(data => setCfg(prev => ({ ...prev, ...data })))
      .catch(() => setError(t('settings.load_fail')))
      .finally(() => setLoading(false))
  }, [])

  function set(key: keyof Settings) {
    return (v: string) => setCfg(prev => ({ ...prev, [key]: v }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const resp = await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      if (!resp.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError(t('settings.save_fail'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-st-txt3">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-medium text-st-txt1 mb-6 animate-fade-in">{t('settings.title')}</h1>

      {error && (
        <div className="mb-4 bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-lg p-3 text-sm text-st-err">{error}</div>
      )}

      <div className="space-y-5">

        {/* Agora Call Agent */}
        <div className="animate-slide-up" style={{ animationDelay: '40ms' }}>
          <Section title={t('settings.agora_section')}>
            <Field
              label={t('settings.label_api_key')}
              value={cfg.AGORA_API_KEY}
              onChange={set('AGORA_API_KEY')}
              placeholder="NWFl..."
              type="password"
            />
            <Field
              label={t('settings.label_pipeline_id')}
              desc={t('settings.desc_pipeline_id')}
              value={cfg.AGORA_PIPELINE_ID}
              onChange={set('AGORA_PIPELINE_ID')}
              placeholder="d2936d99..."
            />
            <Field
              label={t('settings.label_phone_number')}
              desc={t('settings.desc_phone_number')}
              value={cfg.AGORA_PHONE_NUMBER}
              onChange={set('AGORA_PHONE_NUMBER')}
              placeholder="031186778285"
            />
          </Section>
        </div>

        {/* Claude AI */}
        <div className="animate-slide-up" style={{ animationDelay: '95ms' }}>
          <Section title={t('settings.claude_ai_section')}>
            <Field
              label={t('settings.label_anthropic_key')}
              desc={t('settings.desc_anthropic_key')}
              value={cfg.ANTHROPIC_API_KEY}
              onChange={set('ANTHROPIC_API_KEY')}
              placeholder="sk-ant-..."
              type="password"
            />
          </Section>
        </div>

        {/* Database */}
        <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
          <Section title={t('settings.db_section')}>
            <Field
              label={t('settings.label_database_url')}
              desc={t('settings.desc_database_url')}
              value={cfg.DATABASE_URL}
              onChange={set('DATABASE_URL')}
              placeholder="sqlite+aiosqlite:///./dev.db"
            />
          </Section>
        </div>

        {/* Voice Agent */}
        <div className="animate-slide-up" style={{ animationDelay: '205ms' }}>
          <Section title={t('settings.voice_agent_section')}>
            <Field
              label={t('settings.label_endpoint_url')}
              desc={t('settings.desc_endpoint_url')}
              value={cfg.VOICE_AGENT_BASE_URL}
              onChange={set('VOICE_AGENT_BASE_URL')}
              placeholder="https://voice-agent.example.com"
              type="url"
            />
            <Field
              label={t('settings.label_api_key')}
              value={cfg.VOICE_AGENT_API_KEY}
              onChange={set('VOICE_AGENT_API_KEY')}
              placeholder="va_sk_..."
              type="password"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={t('settings.label_concurrency')}
                desc={t('settings.desc_concurrency')}
                value={cfg.MAX_CONCURRENT_CALLS}
                onChange={set('MAX_CONCURRENT_CALLS')}
                type="number"
              />
              <Field
                label={t('settings.label_poll_interval')}
                desc={t('settings.desc_poll_interval')}
                value={cfg.POLL_INTERVAL_SECONDS}
                onChange={set('POLL_INTERVAL_SECONDS')}
                type="number"
              />
            </div>
          </Section>
        </div>

        {/* Webhook */}
        <div className="animate-slide-up" style={{ animationDelay: '260ms' }}>
          <Section title={t('settings.webhook_section')}>
            <Field
              label={t('settings.label_webhook_secret')}
              desc={t('settings.desc_webhook_secret')}
              value={cfg.WEBHOOK_SECRET}
              onChange={set('WEBHOOK_SECRET')}
              placeholder="whsec_..."
              type="password"
            />
          </Section>
        </div>

        {/* Save */}
        <div className="flex items-center justify-between pt-1">
          {saved && (
            <div className="flex items-center gap-1.5 text-st-ok text-sm">
              <CheckCircle2 size={15} />
              {t('settings.saved')}
            </div>
          )}
          <div className="ml-auto">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-st-teal text-white border-0 rounded-lg text-sm font-medium hover:bg-st-teal-h disabled:opacity-40 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? t('common.saving') : t('settings.btn_save')}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
