import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bot, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  propsToForm,
  formToProps,
  PropsEditor,
  type PropsForm,
  type Agent,
} from '../agents/AgentsPage'
import { API } from '../../lib/api'

export function CampaignAgentPromptPage() {
  const { t } = useTranslation()
  const { id: campaignId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [agent, setAgent] = useState<Agent | null>(null)
  const [original, setOriginal] = useState<Record<string, unknown>>({})
  const [form, setForm] = useState<PropsForm | null>(null)
  const [updating, setUpdating] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    if (!campaignId) return
    setError('')
    setLoading(true)
    try {
      const cResp = await fetch(`${API}/api/campaigns-v2/${campaignId}`)
      if (!cResp.ok) {
        setError(t('campaign_agent_prompt.err_load'))
        return
      }
      const c = await cResp.json() as { campaign_name?: string; agent_id?: string | null }
      setCampaignName(c.campaign_name ?? campaignId)
      const aid = c.agent_id
      if (!aid) {
        setError(t('campaign_agent_prompt.err_no_agent'))
        return
      }
      const agents: Agent[] = await fetch(`${API}/api/agents`).then(r => r.json())
      const a = agents.find(x => x.agent_id === aid)
      if (!a) {
        setError(t('campaign_agent_prompt.err_agent_missing'))
        return
      }
      setAgent(a)
      const orig = (a.properties ?? {}) as Record<string, unknown>
      setOriginal(JSON.parse(JSON.stringify(orig)) as Record<string, unknown>)
      setForm(propsToForm(orig))
    } catch {
      setError(t('campaign_agent_prompt.err_network'))
    } finally {
      setLoading(false)
    }
  }, [campaignId, t])

  useEffect(() => { load().catch(() => {}) }, [load])

  async function handleUpdate() {
    if (!agent || !form) return
    setSaveError('')
    setUpdating(true)
    try {
      const rebuilt = formToProps(form, original)
      const resp = await fetch(`${API}/api/agents/${agent.agent_id}/properties`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rebuilt),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || t('campaign_agent_prompt.err_update'))
      }
      await resp.json()
      if (campaignId) {
        navigate(`/campaigns/${campaignId}`, { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t('campaign_agent_prompt.err_update'))
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center text-st-txt3">
        <Loader2 size={22} className="mr-2 animate-spin text-st-txt1" />
        <span className="text-sm">{t('campaign_agent_prompt.loading')}</span>
      </div>
    )
  }

  if (error || !agent || !form) {
    return (
      <div className="p-8">
        <Link
          to={campaignId ? `/campaigns/${campaignId}` : '/'}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-st-txt3 hover:text-st-txt2"
        >
          <ArrowLeft size={15} />
          {t('agora.back')}
        </Link>
        <div className="max-w-lg rounded-lg border border-[rgba(252,165,165,0.22)] bg-[rgba(252,165,165,0.08)] p-4 text-sm text-st-err">
          {error || t('campaign_agent_prompt.err_cannot_edit')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="mb-4 flex flex-shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/campaigns/${campaignId}`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-st-txt3 hover:text-st-txt2"
          >
            <ArrowLeft size={15} />
            {t('campaign_agent_prompt.back_campaign')}
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-medium text-st-txt1">
            <Bot className="h-5 w-5 text-st-txt2" />
            {t('campaign_agent_prompt.title')}
          </h1>
          <p className="mt-0.5 text-sm text-st-txt3">
            {campaignName}
            <span className="mx-1.5 text-st-txt4">·</span>
            <span className="font-mono text-xs text-st-txt2">{agent.agent_name}</span>
            <span className="ml-1.5 text-xs text-st-txt3">{agent.agent_id}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleUpdate}
          disabled={updating}
          className={cn(
            'inline-flex flex-shrink-0 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white border-0 transition-colors',
            updating ? 'cursor-not-allowed disabled:opacity-40' : 'bg-st-teal hover:bg-st-teal-h',
          )}
        >
          {updating && <Loader2 size={16} className="animate-spin" />}
          {updating ? t('campaign_agent_prompt.updating') : t('campaign_agent_prompt.update')}
        </button>
      </div>

      <div className="mb-3 flex-shrink-0 rounded-lg border border-[rgba(251,191,36,0.22)] bg-[rgba(251,191,36,0.08)] px-3 py-2 text-xs text-st-warn">
        <span className="mr-1 inline-flex items-center rounded bg-[rgba(251,191,36,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-st-warn">
          {t('common.sensitive')}
        </span>
        {t('campaign_agent_prompt.sensitive_hint')}
      </div>

      {saveError && (
        <p className="mb-3 flex-shrink-0 rounded-lg border border-[rgba(252,165,165,0.22)] bg-[rgba(252,165,165,0.08)] px-3 py-2 text-sm text-st-err">
          {saveError}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-st-b-sub bg-st-card p-4">
        <PropsEditor form={form} onChange={patch => setForm(prev => (prev ? { ...prev, ...patch } : null))} />
      </div>
    </div>
  )
}
