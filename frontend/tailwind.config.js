/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#09090b',
        bg2: '#18181b',
        bg3: '#27272a',
        border: '#3f3f46',
        text: '#fafafa',
        muted: '#a1a1aa',
        primary: {
          DEFAULT: '#3b82f6',
          glow: 'rgba(59, 130, 246, 0.4)',
        },
        sky: {
          DEFAULT: '#0ea5e9',
          bg: 'rgba(14, 165, 233, 0.15)',
        },
        green: {
          DEFAULT: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)',
          glow: 'rgba(16, 185, 129, 0.4)',
        },
        red: {
          DEFAULT: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.15)',
          glow: 'rgba(239, 68, 68, 0.4)',
        },
        amber: {
          DEFAULT: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.15)',
        },
        glass: {
          bg: 'rgba(24, 24, 27, 0.7)',
          border: 'rgba(255, 255, 255, 0.08)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
