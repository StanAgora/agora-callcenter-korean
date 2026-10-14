import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { PlusCircle, Radio, PhoneCall, Bot, History, PhoneIncoming, BarChart2, LogOut, Settings, UserCircle2, FileText } from 'lucide-react'
import agoraLogo from '../assets/agora-logo-2.webp'
import { LANGUAGES, setLang, type Lang } from '../i18n'
import { logout } from '../lib/auth'

export function Layout() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const NAV = [
    { to: '/dashboard',       label: 'Dashboard',                icon: BarChart2 },

    { to: '/campaigns',       label: t('app_nav.campaigns'),     icon: Radio },
    { to: '/inbound-routing', label: 'Inbound Routing',          icon: PhoneIncoming },
    { to: '/phone-numbers',   label: t('app_nav.phone_numbers'), icon: PhoneCall },
    { to: '/agents',          label: t('app_nav.agents'),        icon: Bot },
    { to: '/call-history',    label: t('app_nav.call_history'),  icon: History },
    { to: '/contracts',       label: 'Contracts',                icon: FileText },
  ]

  return (
    <div className="flex h-screen bg-st-bg">
      {/* Sidebar */}
      <aside className="w-[200px] bg-st-nav border-r border-st-b-div flex flex-col flex-shrink-0">

        {/* Logo */}
        <div className="px-4 pt-4 pb-3 border-b border-st-b-div">
          <img src={agoraLogo} alt="Agora" className="h-16 w-auto object-contain opacity-90" />
          <p className="text-[9px] text-st-txt4 tracking-[0.06em] uppercase mt-2 leading-tight">
            Agora · TEPCO Demo
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-px overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-2 py-[7px] rounded-md text-[13px] transition-colors',
                  isActive
                    ? 'bg-st-teal-b2 border border-st-b-teal text-st-teal-l'
                    : 'text-st-txt3 hover:text-st-txt2 hover:bg-[rgba(255,255,255,0.04)] border border-transparent'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={14}
                    strokeWidth={1.5}
                    className={isActive ? 'text-st-teal-l' : 'text-st-txt4'}
                  />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Language switcher */}
        <div className="px-3 py-3 border-t border-st-b-div">
          <select
            value={i18n.language}
            onChange={e => setLang(e.target.value as Lang)}
            className="w-full px-2.5 py-1.5 rounded-md text-xs text-st-txt2 bg-transparent border border-st-b-sub focus:outline-none focus:border-st-b-teal cursor-pointer"
            style={{ colorScheme: 'dark' }}
          >
            {LANGUAGES.map(({ code, flag, label }) => (
              <option key={code} value={code} style={{ background: '#0B1120' }}>
                {flag} {label}
              </option>
            ))}
          </select>
        </div>

        {/* Status pill + user */}
        <div className="px-3 py-3 border-t border-st-b-div space-y-2">
          {/* System status */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[rgba(13,148,136,0.08)]">
            <span className="w-[7px] h-[7px] rounded-full bg-st-ok flex-shrink-0" />
            <span className="text-[10px] text-st-ok tracking-wide">System Online</span>
          </div>

          {/* User row */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-st-b-sub">
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-st-teal-bg">
              <UserCircle2 size={13} className="text-st-teal-l" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-st-txt1 truncate">agora</p>
              <p className="text-[10px] text-st-txt4 truncate">Admin</p>
            </div>
            <NavLink
              to="/settings"
              title={t('nav.settings')}
              className={({ isActive }) =>
                cn('p-1 rounded transition-colors', isActive ? 'text-st-teal-l' : 'text-st-txt4 hover:text-st-txt2')
              }
            >
              <Settings size={12} />
            </NavLink>
            <button
              onClick={handleLogout}
              title={t('login.logout')}
              className="p-1 rounded text-st-txt4 hover:text-st-err transition-colors"
            >
              <LogOut size={12} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-st-bg">
        <Outlet />
      </main>
    </div>
  )
}
