/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#ff385c',
          active: '#e31c5f',
        }
      },
      boxShadow: {
        'airbnb': '0 6px 16px rgba(0,0,0,0.12)',
      }
    },
  },
  plugins: [],
}
