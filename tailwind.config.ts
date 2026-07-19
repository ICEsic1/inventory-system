import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#060606',
        paper: '#f7f7f3',
      },
    },
  },
  plugins: [],
} satisfies Config;
