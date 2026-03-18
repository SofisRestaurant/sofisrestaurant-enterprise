/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: 'class', // ✅ enables class-based dark mode
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: 'var(--color-accent)',
        ink: 'var(--color-ink-500)',
        bg: 'var(--color-bg)',
        card: 'var(--color-card)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-sans)',
      },
    },
  },
  plugins: [],
};

module.exports = config;