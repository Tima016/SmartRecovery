/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Backgrounds ──────────────────────────────────────
        bg: {
          primary: '#0F1115',   // deepest layer
          secondary: '#161A20',   // secondary surfaces
          tertiary: '#1C2028',   // tertiary depth
          elevated: '#1D2128',   // cards, elevated panels
          panel: '#13161B',   // sidebar, topbar
          border: '#23262E',   // all borders
        },
        // ── Accent — Emerald ─────────────────────────────────
        accent: {
          primary: '#00C896',   // main CTA, active states
          secondary: '#1F8F6B',   // secondary accents
          dim: '#009E78',   // dimmed variant
          glow: 'rgba(0,200,150,0.12)',
          subtle: 'rgba(0,200,150,0.06)',
        },
        // ── Status ───────────────────────────────────────────
        status: {
          ok: '#00C896',       // success / healthy
          warn: '#D97706',       // amber — warning
          error: '#C0392B',       // deep red — critical
          info: '#3D7EBF',       // muted blue — informational
          dim: '#6B7280',
        },
        // ── Text hierarchy ───────────────────────────────────
        text: {
          primary: '#E6E8EB',
          secondary: '#9CA3AF',
          muted: '#6B7280',
          accent: '#00C896',
        },

        // ── Backward-compat aliases (used by existing component classes) ──
        // Keep 'accent.cyan' pointing to emerald so existing
        // classes like text-accent-cyan, bg-accent-cyan still work
        // without touching every component file.
        'accent-cyan': '#00C896',
        'accent-blue': '#1F8F6B',
      },

      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },

      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        scan: 'scan 2s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
      },

      keyframes: {
        scan: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },

      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
