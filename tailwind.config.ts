import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        // Surfaces — warm-cool neutral, dark
        surface: {
          0: 'var(--bg-0)',
          1: 'var(--bg-1)',
          2: 'var(--bg-2)',
          3: 'var(--bg-3)',
          4: 'var(--bg-4)',
          5: 'var(--bg-5)',
        },
        // Foreground tiers
        fg: {
          0: 'var(--fg-0)',
          1: 'var(--fg-1)',
          2: 'var(--fg-2)',
          3: 'var(--fg-3)',
          4: 'var(--fg-4)',
        },
        // Strokes
        stroke: {
          1: 'var(--stroke-1)',
          2: 'var(--stroke-2)',
          3: 'var(--stroke-3)',
          strong: 'var(--stroke-strong)',
        },
        // Accent vermillion
        accent: {
          DEFAULT: 'var(--accent)',
          hi: 'var(--accent-hi)',
          glow: 'var(--accent-glow)',
          soft: 'var(--accent-soft)',
        },
        // Signal palette
        signal: {
          'pass': 'var(--pass)',
          'pass-bg': 'var(--pass-bg)',
          'fail': 'var(--fail)',
          'fail-bg': 'var(--fail-bg)',
          'blocked': 'var(--blocked)',
          'blocked-bg': 'var(--blocked-bg)',
          'skipped': 'var(--skipped)',
          'skipped-bg': 'var(--skipped-bg)',
          'running': 'var(--running)',
          'running-bg': 'var(--running-bg)',
        },
        // Layer chips
        layer: {
          ui: 'var(--layer-ui)',
          api: 'var(--layer-api)',
          unit: 'var(--layer-unit)',
        },
        // shadcn semantic aliases mapped to tokens
        background: 'var(--bg-0)',
        foreground: 'var(--fg-1)',
        card: {
          DEFAULT: 'var(--bg-2)',
          foreground: 'var(--fg-1)',
        },
        popover: {
          DEFAULT: 'var(--bg-3)',
          foreground: 'var(--fg-0)',
        },
        primary: {
          DEFAULT: 'var(--accent)',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: 'var(--bg-3)',
          foreground: 'var(--fg-1)',
        },
        muted: {
          DEFAULT: 'var(--bg-2)',
          foreground: 'var(--fg-2)',
        },
        destructive: {
          DEFAULT: 'var(--fail)',
          foreground: '#ffffff',
        },
        border: 'var(--stroke-2)',
        input: 'var(--stroke-2)',
        ring: 'var(--accent)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        jp: ['var(--font-jp)'],
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '1.3', letterSpacing: '0.04em' }],
        'xs': ['11px', { lineHeight: '1.35' }],
        'sm': ['12px', { lineHeight: '1.4' }],
        'base': ['13px', { lineHeight: '1.45' }],
        'md': ['14px', { lineHeight: '1.45' }],
        'lg': ['16px', { lineHeight: '1.4' }],
        'xl': ['18px', { lineHeight: '1.3' }],
        '2xl': ['22px', { lineHeight: '1.25' }],
      },
      borderRadius: {
        1: 'var(--r-1)',
        2: 'var(--r-2)',
        3: 'var(--r-3)',
        4: 'var(--r-4)',
      },
      boxShadow: {
        pop: 'var(--shadow-pop)',
        card: 'var(--shadow-card)',
      },
      transitionTimingFunction: {
        token: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      transitionDuration: {
        token: '120ms',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        blink: {
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'status-pulse': 'pulse 1.6s ease-in-out infinite',
        'caret-blink': 'blink 1s steps(2) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
