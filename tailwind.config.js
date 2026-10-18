/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#292C2B", soft: "#3A3E3C", muted: "#5E6361" },
        paper: { DEFAULT: "#F5F4F1", deep: "#ECEAE5" },
        stone: { DEFAULT: "#A5AAA6", light: "#D3D6D3" },
      },
      fontFamily: {
        sans: ['"Manrope Variable"', "system-ui", "sans-serif"],
        display: ['"Instrument Serif"', "Georgia", "serif"],
      },
      maxWidth: { page: "76rem" },
    },
  },
  plugins: [],
};
