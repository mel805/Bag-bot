import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0f0f1a',
        card: '#151526',
        'brand-violet': '#8b5cf6',
        'brand-cyan': '#22d3ee'
      },
      boxShadow: { soft: '0 10px 25px rgba(0,0,0,0.25)' },
      borderRadius: { xl: '14px' },
      fontFamily: { inter: ['Inter','ui-sans-serif','system-ui','sans-serif'] }
    }
  },
  plugins: []
} satisfies Config;
