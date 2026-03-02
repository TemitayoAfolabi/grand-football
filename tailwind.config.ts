import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // -----------------------------------------------------------------------
      // Colors — Dark Premium Design Tokens
      // -----------------------------------------------------------------------
      colors: {
        bg: { primary: '#0B0F1A', secondary: '#111827' },
        surface: {
          DEFAULT: '#1A2235',
          elevated: '#243046',
          glass: 'rgba(26, 34, 53, 0.7)',
        },
        border: {
          DEFAULT: '#2A3A54',
          subtle: '#1E2D42',
          strong: '#3A5278',
        },
        text: {
          DEFAULT: '#F1F5F9',
          primary: '#F1F5F9',
          secondary: '#94A3B8',
          tertiary: '#64748B',
          disabled: '#475569',
          inverse: '#0B0F1A',
        },
        // Aliases so text-primary, text-secondary, bg-background all resolve
        primary: { DEFAULT: '#22C55E' },
        secondary: { DEFAULT: '#94A3B8' },
        background: '#111827',
        accent: {
          DEFAULT: '#22C55E',
          hover: '#16A34A',
          muted: 'rgba(34, 197, 94, 0.14)',
          glow: 'rgba(34, 197, 94, 0.25)',
        },
        gold: {
          DEFAULT: '#F5C518',
          muted: 'rgba(245, 197, 24, 0.15)',
        },
        success: {
          DEFAULT: '#22C55E',
          muted: 'rgba(34, 197, 94, 0.15)',
        },
        warning: {
          DEFAULT: '#ffd166',
          muted: 'rgba(245, 158, 11, 0.15)',
        },
        error: {
          DEFAULT: '#ff5d7a',
          muted: 'rgba(255, 93, 122, 0.15)',
        },
        info: {
          DEFAULT: '#3B82F6',
          muted: 'rgba(59, 130, 246, 0.15)',
        },
        live: '#EF4444',
        podium: {
          gold: '#F5C518',
          silver: '#C0C0C0',
          bronze: '#CD7F32',
          'gold-glow': 'rgba(245, 197, 24, 0.3)',
          'silver-glow': 'rgba(192, 192, 192, 0.2)',
          'bronze-glow': 'rgba(205, 127, 50, 0.2)',
        },
      },

      // -----------------------------------------------------------------------
      // Typography
      // -----------------------------------------------------------------------
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        display: [
          '40px',
          { lineHeight: '1.0', fontWeight: '800', letterSpacing: '-0.02em' },
        ],
        h1: [
          '28px',
          { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.01em' },
        ],
        h2: [
          '22px',
          { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.01em' },
        ],
        h3: ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: [
          '12px',
          { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.02em' },
        ],
        score: [
          '36px',
          { lineHeight: '1.0', fontWeight: '800', letterSpacing: '-0.02em' },
        ],
        rank: [
          '24px',
          { lineHeight: '1.0', fontWeight: '800', letterSpacing: '-0.01em' },
        ],
        stat: ['20px', { lineHeight: '1.1', fontWeight: '700' }],
        'stat-label': [
          '12px',
          { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.05em' },
        ],
        nav: [
          '12px',
          { lineHeight: '1.2', fontWeight: '500', letterSpacing: '0.02em' },
        ],
        countdown: [
          '14px',
          { lineHeight: '1.0', fontWeight: '600', letterSpacing: '0.05em' },
        ],
        'score-mobile': ['32px', { lineHeight: '1.1', fontWeight: '700' }],
        'score-desktop': ['40px', { lineHeight: '1.1', fontWeight: '700' }],
        'rank-mobile': ['20px', { lineHeight: '1.1', fontWeight: '700' }],
        'rank-desktop': ['24px', { lineHeight: '1.1', fontWeight: '700' }],
      },

      // -----------------------------------------------------------------------
      // Border Radius
      // -----------------------------------------------------------------------
      borderRadius: {
        card: '1.1rem',
        input: '0.85rem',
        pill: '9999px',
      },

      // -----------------------------------------------------------------------
      // Spacing (8px base unit)
      // -----------------------------------------------------------------------
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '24px',
        '6': '32px',
        '7': '48px',
        '8': '64px',
      },

      // -----------------------------------------------------------------------
      // Breakpoints (matching UI/UX spec)
      // -----------------------------------------------------------------------
      screens: {
        mobile: '0px',
        tablet: '640px',
        desktop: '1024px',
      },

      // -----------------------------------------------------------------------
      // Box Shadows
      // -----------------------------------------------------------------------
      boxShadow: {
        card: '0 2px 12px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 12px 32px rgba(0, 0, 0, 0.4)',
        'glow-accent': '0 0 0 1px rgba(34, 197, 94, 0.28), 0 0 28px rgba(34, 197, 94, 0.2)',
        'glow-gold': '0 0 20px rgba(245, 197, 24, 0.3)',
      },

      // -----------------------------------------------------------------------
      // Background Images (Gradients)
      // -----------------------------------------------------------------------
      backgroundImage: {
        'gradient-hero':
          'radial-gradient(circle at top right, rgba(34, 197, 94, 0.08), transparent 36%)',
        'gradient-card':
          'linear-gradient(160deg, rgba(26, 34, 53, 0.86), #1A2235)',
        'gradient-card-accent':
          'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 60%)',
        'gradient-gold':
          'linear-gradient(135deg, #F5C518 0%, #D4A017 100%)',
        'gradient-surface':
          'linear-gradient(180deg, #1A2235 0%, #111827 100%)',
        'gradient-nav':
          'linear-gradient(180deg, rgba(11, 15, 26, 0.92), rgba(11, 15, 26, 0.88))',
      },

      // -----------------------------------------------------------------------
      // Keyframes
      // -----------------------------------------------------------------------
      keyframes: {
        'skeleton-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'slide-in-top': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'button-press': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.97)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'live-pulse': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        'podium-rise': {
          from: { transform: 'translateY(40px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'card-glow': {
          '0%, 100%': {
            boxShadow: '0 0 15px rgba(34, 197, 94, 0.25)',
          },
          '50%': {
            boxShadow: '0 0 25px rgba(34, 197, 94, 0.25)',
          },
        },
        'count-up': {
          from: { opacity: '0', transform: 'scale(0.5)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 0 1px rgba(34, 197, 94, 0.28), 0 0 28px rgba(34, 197, 94, 0.2)',
          },
          '50%': {
            boxShadow: '0 0 0 1px rgba(34, 197, 94, 0.4), 0 0 34px rgba(34, 197, 94, 0.3)',
          },
        },
      },

      // -----------------------------------------------------------------------
      // Animations
      // -----------------------------------------------------------------------
      animation: {
        'skeleton-pulse': 'skeleton-pulse 2s ease-in-out infinite',
        'slide-in-top': 'slide-in-top 150ms ease-out',
        'button-press': 'button-press 100ms ease-in-out',
        shimmer: 'shimmer 1.5s linear infinite',
        'live-pulse': 'live-pulse 1.5s ease-out infinite',
        'podium-rise': 'podium-rise 500ms ease-out forwards',
        'fade-in-up': 'fade-in-up 300ms ease-out forwards',
        'card-glow': 'card-glow 2s ease-in-out infinite',
        'count-up': 'count-up 500ms ease-out forwards',
        'pulse-glow': 'pulse-glow 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
