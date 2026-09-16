/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        yt: {
          bg: '#0f0f0f',
          surface: '#212121',
          hover: '#272727',
          text: '#f1f1f1',
          muted: '#aaaaaa',
          red: '#ff0000',
          border: '#3f3f3f',
        },
      },
    },
  },
  plugins: [],
}
