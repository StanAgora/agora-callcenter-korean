import type { TFunction } from 'i18next'

/** DB `questionnaire_type`: agent path at campaign creation (new) or legacy survey upload method (old). */
export function campaignAgentSourceLabel(
    t: TFunction,
    questionnaireType: string | null | undefined,
): string {
    const raw = (questionnaireType ?? '').trim()
    if (!raw) {
        return ''
    }
    const q = raw.toLowerCase()
    if (q === 'create_agent_by_ai') {
        return t('nc_wiz.agent_mode_new_title')
    }
    if (q === 'existing_agent') {
        return t('nc_wiz.agent_mode_existing_title')
    }
    if (q === 'file_upload') {
        return t('new_survey.file_upload')
    }
    if (q === 'url_load') {
        return t('new_survey.url_load')
    }
    return raw
}

/** DB `quota_mode`: manual vs AI auto (new), or legacy hybrid / ai. */
export function campaignQuotaModeLabel(t: TFunction, quotaMode: string | null | undefined): string {
    const raw = (quotaMode ?? '').trim()
    if (!raw) {
        return ''
    }
    const m = raw.toLowerCase()
    if (m === 'ai_auto' || m === 'ai') {
        return t('new_survey.quota_ai')
    }
    if (m === 'manual') {
        return t('new_survey.quota_manual')
    }
    if (m === 'hybrid') {
        return t('new_survey.quota_hybrid')
    }
    return raw
}
