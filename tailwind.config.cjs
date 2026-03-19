const tailwindForms = require('@tailwindcss/forms');
const tailwindTypography = require('@tailwindcss/typography');

module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: 'var(--color-accent)',
        ink: 'var(--color-ink-500)',
        bg: 'var(--color-bg)',
        card: 'var(--color-card)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: [
          'var(--font-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [tailwindForms, tailwindTypography],
};
