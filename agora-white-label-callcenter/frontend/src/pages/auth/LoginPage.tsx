import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { login } from '../../lib/auth'
import { LANGUAGES, setLang, type Lang } from '../../i18n'
import tokyoNight from '../../assets/tokyo-night.png'

export function LoginPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    setTimeout(() => {
      const ok = login(username.trim(), password)
      if (ok) {
        navigate('/dashboard', { replace: true })
      } else {
        setError(t('login.error'))
        setLoading(false)
      }
    }, 400)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: `url(${tokyoNight})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="w-full max-w-sm">
        {/* Language selector */}
        <div className="flex justify-center mb-4">
          <select
            value={i18n.language}
            onChange={e => setLang(e.target.value as Lang)}
            className="px-3 py-1.5 rounded text-xs text-st-txt2 bg-transparent border border-st-b-sub focus:outline-none focus:border-st-b-teal cursor-pointer"
            style={{ colorScheme: 'dark' }}
          >
            {LANGUAGES.map(({ code, flag, label }) => (
              <option key={code} value={code}>
                {flag} {label}
              </option>
            ))}
          </select>
        </div>

        {/* Card */}
        <div className="bg-[rgba(11,17,32,0.85)] backdrop-blur-sm rounded-lg border border-st-b-teal p-8">
          <h1 className="text-lg font-medium text-st-txt1 mb-1">{t('login.title')}</h1>
          <p className="text-sm text-st-txt3 mb-6">{t('login.subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-st-txt2 mb-1.5">
                {t('login.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t('login.username_ph')}
                autoComplete="username"
                autoFocus
                className="w-full border border-st-b-sub rounded px-3 py-2.5 text-sm text-st-txt1 focus:outline-none focus:border-st-b-teal bg-[rgba(255,255,255,0.04)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-st-txt2 mb-1.5">
                {t('login.password')}
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.password_ph')}
                  autoComplete="current-password"
                  className="w-full border border-st-b-sub rounded px-3 py-2.5 pr-10 text-sm text-st-txt1 focus:outline-none focus:border-st-b-teal bg-[rgba(255,255,255,0.04)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-st-txt3 hover:text-st-txt2 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-st-err bg-[rgba(252,165,165,0.08)] border border-[rgba(252,165,165,0.22)] rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 bg-st-teal hover:bg-st-teal-h disabled:opacity-40 text-white border-0 rounded py-2.5 text-sm font-medium transition-colors"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-st-txt4 mt-6">Powered by Agora</p>
      </div>
    </div>
  )
}
