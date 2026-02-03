/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          accent: '#3b82f6'
        }
      }
    },
  },
  plugins: [],
}