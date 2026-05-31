/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'card-red': '#dc2626',
        'card-black': '#1f2937',
        'table-green': '#065f46',
        'gold': '#fbbf24',
      }
    },
  },
  plugins: [],
}