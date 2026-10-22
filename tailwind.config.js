/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Antique gold used for interactive chrome (buttons, links, focus, active tab)
        accent: {
          50: '#fdf8ec',
          100: '#f9edc9',
          200: '#f2d98e',
          300: '#e9c25a',
          400: '#dcaa3a',
          500: '#c38f25',
          600: '#a6741b',
          700: '#855a18',
          800: '#6b4818',
          900: '#583c17',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
