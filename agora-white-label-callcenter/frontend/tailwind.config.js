/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Slate + Teal design system (primary) ──────────────────
        st: {
          bg:       '#0F172A',                  // bg-st-bg     — page background
          nav:      '#0B1120',                  // bg-st-nav    — sidebar / surface
          card:     'rgba(255,255,255,0.03)',    // bg-st-card   — card background
          'b-sub':  'rgba(255,255,255,0.07)',    // border-st-b-sub  — default border
          'b-div':  'rgba(148,163,184,0.08)',   // border-st-b-div  — divider
          'b-teal': 'rgba(13,148,136,0.25)',    // border-st-b-teal — teal accent border
          'b-hover':'rgba(13,148,136,0.35)',    // border-st-b-hover— card hover border
          teal:     '#0D9488',                  // bg-st-teal   — primary teal
          'teal-h': '#0F766E',                  // bg-st-teal-h — teal hover
          'teal-l': '#2DD4BF',                  // text-st-teal-l— teal light / highlight
          'teal-bg':'rgba(13,148,136,0.12)',    // bg-st-teal-bg — teal fill bg
          'teal-b2':'rgba(13,148,136,0.15)',    // bg-st-teal-b2 — active nav bg
          txt1:     '#F1F5F9',                  // text-st-txt1 — primary text
          txt2:     '#94A3B8',                  // text-st-txt2 — secondary text
          txt3:     'rgba(148,163,184,0.50)',   // text-st-txt3 — muted
          txt4:     'rgba(148,163,184,0.35)',   // text-st-txt4 — labels / timestamps
          txt5:     'rgba(148,163,184,0.20)',   // text-st-txt5 — placeholder
          ok:       '#2DD4BF',                  // text-st-ok   — success / online
          err:      'rgba(252,165,165,0.80)',   // text-st-err  — error
          warn:     'rgba(251,191,36,0.75)',    // text-st-warn — warning
        },
        // ── Near-black tokens (legacy — kept for unported pages) ──
        dark: {
          bg:   '#111318',
          nav:  '#0C0E13',
          b0:   'rgba(255,255,255,0.06)',
          b1:   'rgba(255,255,255,0.08)',
          b2:   'rgba(255,255,255,0.15)',
          t1:   'rgba(255,255,255,0.85)',
          t2:   'rgba(255,255,255,0.60)',
          t3:   'rgba(255,255,255,0.40)',
          t4:   'rgba(255,255,255,0.20)',
          t5:   'rgba(255,255,255,0.12)',
          ok:   'rgba(110,231,183,0.80)',
          err:  'rgba(252,165,165,0.70)',
          warn: 'rgba(251,191,36,0.70)',
        },
        // ── Legacy colour aliases (build compat) ─────────────────
        primary: {
          50:'#EEF2FF',100:'#E0E7FF',200:'#C7D2FE',
          400:'#818CF8',500:'#6366F1',600:'#4F46E5',700:'#4338CA',
        },
        surface:{ DEFAULT:'#F9FAFB',card:'#FFFFFF',hover:'#F9FAFB',pressed:'#F3F4F6' },
        ink:    { DEFAULT:'#111827',secondary:'#6B7280',tertiary:'#9CA3AF',disabled:'#D1D5DB' },
        border: { DEFAULT:'#E5E7EB',light:'#F3F4F6',focus:'#4F46E5' },
        status: {
          success:'#059669','success-bg':'#ECFDF5',
          warning:'#D97706','warning-bg':'#FFFBEB',
          error:'#DC2626','error-bg':'#FEF2F2',
          info:'#2563EB','info-bg':'#EFF6FF',
        },
        gblue:  {50:'#EEF2FF',100:'#E0E7FF',200:'#C7D2FE',400:'#818CF8',500:'#4F46E5',600:'#4338CA',700:'#3730A3'},
        ggreen: {50:'#ECFDF5',100:'#D1FAE5',400:'#34D399',500:'#059669',600:'#047857'},
        gyellow:{50:'#FFFBEB',100:'#FEF3C7',400:'#FBBF24',500:'#F59E0B',600:'#D97706'},
        gred:   {50:'#FEF2F2',100:'#FEE2E2',400:'#F87171',500:'#EF4444',600:'#DC2626'},
        gpurple:{50:'#F5F3FF',100:'#EDE9FE',400:'#A78BFA',500:'#7C3AED',600:'#6D28D9'},
        gteal:  {50:'#F0FDFA',400:'#2DD4BF',500:'#0D9488'},
      },
      fontFamily: {
        sans: ['Inter','-apple-system','BlinkMacSystemFont','Segoe UI','Noto Sans KR','sans-serif'],
        mono: ['JetBrains Mono','Fira Code','Consolas','Monaco','monospace'],
      },
      keyframes: {
        cardIn:  { from: { opacity:'0', transform:'translateX(-14px)' }, to: { opacity:'1', transform:'translateX(0)' } },
        rowIn:   { from: { opacity:'0', transform:'translateY(-7px)'  }, to: { opacity:'1', transform:'translateY(0)' } },
        fadeIn:  { from: { opacity:'0' },                                  to: { opacity:'1' } },
        slideUp: { from: { opacity:'0', transform:'translateY(10px)'  }, to: { opacity:'1', transform:'translateY(0)' } },
      },
      animation: {
        'card-in':  'cardIn  0.22s cubic-bezier(0.16,1,0.3,1) both',
        'row-in':   'rowIn   0.18s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':  'fadeIn  0.20s ease-out both',
        'slide-up': 'slideUp 0.24s cubic-bezier(0.16,1,0.3,1) both',
      },
      boxShadow: {
        xs:'none', sm:'none', card:'none', 'card-hover':'none', menu:'none', fab:'none',
      },
      borderRadius: {
        google: '8px',
      },
    },
  },
  plugins: [],
}
