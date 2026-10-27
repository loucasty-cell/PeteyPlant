/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Herbarium-ledger palette. Theme-dependent tokens resolve through
        // CSS variables so the dark moss-black tokens apply under `.dark`.
        paper: 'var(--paper)',
        parchment: 'var(--parchment)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        inksoft: 'var(--inksoft)',
        inkfaint: 'var(--inkfaint)',
        rule: 'var(--rule)',
        rulestrong: 'var(--rulestrong)',
        leaftint: 'var(--leaftint)',
        ambertint: 'var(--ambertint)',
        dangersoft: 'var(--dangersoft)',
        // Fixed signal colours (identical light/dark).
        leaf: '#00A159',
        leafdeep: '#007338',
        amber: '#DA950B',
        amberdeep: '#A75C00',
        danger: '#BE222A',
        dangerdeep: '#8E1A20',
        water: '#2591C4',
        waterdeep: '#1B6E96',
        clay: '#A85F3C',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Typographic scale: fixed ratio 1.25 from a 16px base.
      // caption 12.8 · body 16 · subhead 20 · title 25 · display 31.25 · hero 39.06
      fontSize: {
        caption: ['0.8rem', { lineHeight: '1.4' }],
        body: ['1rem', { lineHeight: '1.5' }],
        subhead: ['1.25rem', { lineHeight: '1.3' }],
        title: ['1.5625rem', { lineHeight: '1.2' }],
        display: ['1.953rem', { lineHeight: '1.15' }],
        hero: ['2.441rem', { lineHeight: '1.1' }],
      },
      // Radii from the 4pt spacing scale: 4 · 8 · 12 · 16 · 24.
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
      // Tactile language: hard offset press shadows, no blur, no glow.
      // 2px / 4px / 8px offsets — all on the 4pt scale (2 = half-step).
      boxShadow: {
        'press-sm': '2px 2px 0 rgb(24 27 31 / 0.16)',
        press: '4px 4px 0 rgb(24 27 31 / 0.16)',
        'press-lg': '8px 8px 0 rgb(24 27 31 / 0.14)',
      },
      keyframes: {
        // Slow idle sway only; no pulsing, no bounce eases.
        sway: {
          '0%, 100%': { transform: 'rotate(-1.5deg)' },
          '50%': { transform: 'rotate(1.5deg)' },
        },
        // Pressed-stamp entrance for ledger marks: one beat, then settle.
        stamp: {
          '0%': { transform: 'scale(1.15) rotate(-4deg)', opacity: '0' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
      },
      animation: {
        sway: 'sway 4s ease-in-out infinite',
        stamp: 'stamp 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
