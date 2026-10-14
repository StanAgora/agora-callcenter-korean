import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { StatusBadge, TypeBadge } from '../../components/ui/Badge'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { PlusCircle, LayoutDashboard, SlidersHorizontal, Sparkles, Loader2, Trash2, LayoutList, LayoutGrid, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'
import { API } from '../../lib/api'

interface SurveyAPI {
  id: string
  name: string
  type: 'CATI' | 'URL'
  status: 'draft' | 'running' | 'paused' | 'completed'
  quota_mode: string
  total_target: number
  total_completed: number
  created_at: string
}

export function SurveyListPage() {
  const { t } = useTranslation()
  const [surveys, setSurveys] = useState<SurveyAPI[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [duplicateModal, setDuplicateModal] = useState<{ id: string; defaultName: string } | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')

  useEffect(() => {
    fetch(`${API}/api/surveys`)
      .then(r => r.json())
      .then(setSurveys)
      .catch(() => setError(t('common.server_error')))
      .finally(() => setLoading(false))
  }, [t])

  function openDuplicateModal(survey: SurveyAPI) {
    const base = survey.name.replace(/ \(\d+\)$/, '')
    const existing = new Set(surveys.map(s => s.name))
    let n = 2
    while (existing.has(`${base} (${n})`)) n++
    const suggested = `${base} (${n})`
    setDuplicateName(suggested)
    setDuplicateModal({ id: survey.id, defaultName: suggested })
  }

  async function confirmDuplicate() {
    if (!duplicateModal) return
    const name = duplicateName.trim()
    if (!name) return
    setDuplicatingId(duplicateModal.id)
    setDuplicateModal(null)
    try {
      const resp = await fetch(`${API}/api/surveys/${duplicateModal.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!resp.ok) throw new Error()
      const newSurvey = await resp.json()
      setSurveys(prev => [newSurvey, ...prev])
    } catch {
      setError(t('common.error_occurred'))
    } finally {
      setDuplicatingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('survey_list.confirm_delete'))) return
    setDeletingId(id)
    try {
      const resp = await fetch(`${API}/api/surveys/${id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error()
      setSurveys(prev => prev.filter(s => s.id !== id))
    } catch {
      setError(t('common.error_occurred'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="h-full flex flex-col bg-st-bg">
      {/* Page header */}
      <div className="bg-st-nav border-b border-st-b-div px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="animate-fade-in">
          <h1 className="text-lg font-medium text-st-txt1">{t('survey_list.title')}</h1>
          <p className="text-sm text-st-txt3 mt-0.5">{t('survey_list.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-[rgba(255,255,255,0.05)] rounded-md p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded transition-colors',
                viewMode === 'list' ? 'bg-st-teal-bg text-st-txt2' : 'text-st-txt3 hover:text-st-txt2'
              )}
            >
              <LayoutList size={15} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded transition-colors',
                viewMode === 'grid' ? 'bg-st-teal-bg text-st-txt2' : 'text-st-txt3 hover:text-st-txt2'
              )}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <Link
            to="/surveys/new"
            className="inline-flex items-center gap-2 bg-st-teal hover:bg-st-teal-h text-white border-0 px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <PlusCircle size={16} />
            {t('survey_list.new_campaign')}
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

      {loading && (
        <div className="flex items-center justify-center py-20 text-st-txt3">
          <Loader2 size={20} className="animate-spin mr-2 text-st-txt2" />
          <span className="text-sm">{t('common.loading_data')}</span>
        </div>
      )}

      {error && (
        <div className="bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded-md p-4 text-sm text-st-err">{error}</div>
      )}

      {!loading && !error && surveys.length === 0 && (
        <div className="bg-st-card border border-st-b-sub rounded-md p-12 text-center">
          <p className="text-sm text-st-txt2">{t('survey_list.empty')}</p>
          <p className="text-xs mt-1 text-st-txt3">{t('survey_list.empty_hint')}</p>
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="grid gap-4">
          {surveys.map((survey, i) => (
            <div key={survey.id} className="bg-st-card border border-st-b-sub rounded-md p-5 hover:border-st-b-hover transition-colors animate-card-in" style={{ animationDelay: `${Math.min(i * 55, 550)}ms` }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <TypeBadge type={survey.type} />
                    <StatusBadge status={survey.status} />
                  </div>
                  <h2 className="font-medium text-st-txt1 truncate">{survey.name}</h2>
                  <p className="text-xs text-st-txt3 mt-0.5">
                    {t('survey_list.created')}: {new Date(survey.created_at).toLocaleDateString()} · {t('survey_list.quota_mode')}: {survey.quota_mode}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    to={`/surveys/${survey.id}/prompt`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[rgba(255,255,255,0.04)] text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                  >
                    <Sparkles size={13} />
                    {t('survey_list.btn_prompt')}
                  </Link>
                  <Link
                    to={`/surveys/${survey.id}/quotas`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors"
                  >
                    <SlidersHorizontal size={13} />
                    {t('survey_list.btn_quota')}
                  </Link>
                  {survey.status !== 'draft' && (
                    <Link
                      to={`/surveys/${survey.id}/dashboard`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors"
                    >
                      <LayoutDashboard size={13} />
                      {t('survey_list.btn_dashboard')}
                    </Link>
                  )}
                  <button
                    onClick={() => openDuplicateModal(survey)}
                    disabled={!!duplicatingId}
                    title={t('survey_list.btn_duplicate')}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md text-st-txt3 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-txt1 transition-colors disabled:opacity-40"
                  >
                    {duplicatingId === survey.id ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={() => handleDelete(survey.id)}
                    disabled={deletingId === survey.id}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md text-st-txt3 hover:bg-[rgba(252,165,165,0.08)] hover:text-st-err transition-colors disabled:opacity-40"
                  >
                    {deletingId === survey.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <ProgressBar completed={survey.total_completed} target={survey.total_target} size="sm" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Duplicate name modal */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDuplicateModal(null)}>
          <div className="bg-st-nav border border-st-b-sub rounded-md w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium text-st-txt1 mb-1">{t('survey_list.duplicate_modal_title')}</h3>
            <p className="text-xs text-st-txt3 mb-4">{t('survey_list.duplicate_modal_desc')}</p>
            <input
              type="text"
              className="w-full border border-st-b-sub rounded-md px-3 py-2 text-sm focus:outline-none focus:border-st-b-teal bg-transparent text-st-txt1 mb-4"
              value={duplicateName}
              onChange={e => setDuplicateName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmDuplicate(); if (e.key === 'Escape') setDuplicateModal(null) }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDuplicateModal(null)}
                className="px-4 py-2 rounded-md text-sm text-st-txt2 border border-st-b-sub hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmDuplicate}
                disabled={!duplicateName.trim()}
                className="px-4 py-2 rounded-md text-sm font-medium bg-st-teal hover:bg-st-teal-h text-white border-0 transition-colors disabled:opacity-40"
              >
                {t('survey_list.btn_duplicate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {surveys.map((survey, i) => (
            <div key={survey.id} className="bg-st-card border border-st-b-sub rounded-md p-4 hover:border-st-b-hover transition-colors flex flex-col gap-3 animate-card-in" style={{ animationDelay: `${Math.min(i * 55, 550)}ms` }}>
              {/* Top: badges + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <TypeBadge type={survey.type} />
                  <StatusBadge status={survey.status} />
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openDuplicateModal(survey)}
                    disabled={!!duplicatingId}
                    title={t('survey_list.btn_duplicate')}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-st-txt4 hover:bg-[rgba(255,255,255,0.04)] hover:text-st-txt2 transition-colors disabled:opacity-40"
                  >
                    {duplicatingId === survey.id ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={() => handleDelete(survey.id)}
                    disabled={deletingId === survey.id}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-st-txt4 hover:bg-[rgba(252,165,165,0.08)] hover:text-st-err transition-colors disabled:opacity-40"
                  >
                    {deletingId === survey.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <h2 className="font-medium text-st-txt1 text-sm leading-snug line-clamp-2">{survey.name}</h2>
                <p className="text-xs text-st-txt3 mt-1">
                  {new Date(survey.created_at).toLocaleDateString()} · {survey.quota_mode}
                </p>
              </div>

              {/* Progress */}
              <ProgressBar completed={survey.total_completed} target={survey.total_target} size="sm" />

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-st-b-div">
                <Link
                  to={`/surveys/${survey.id}/prompt`}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium bg-[rgba(255,255,255,0.04)] text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                >
                  <Sparkles size={12} />
                  {t('survey_list.btn_prompt')}
                </Link>
                <Link
                  to={`/surveys/${survey.id}/quotas`}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium border border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors"
                >
                  <SlidersHorizontal size={12} />
                  {t('survey_list.btn_quota')}
                </Link>
                {survey.status !== 'draft' && (
                  <Link
                    to={`/surveys/${survey.id}/dashboard`}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium border border-st-b-sub text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] hover:border-st-b-teal transition-colors"
                  >
                    <LayoutDashboard size={12} />
                    {t('survey_list.btn_dashboard')}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
