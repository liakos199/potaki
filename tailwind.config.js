/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        manrope: ["Manrope-Regular", "sans-serif"],
        "manrope-bold": ["Manrope-Bold", "sans-serif"],
        "manrope-semibold": ["Manrope-SemiBold", "sans-serif"],
        "manrope-medium": ["Manrope-Medium", "sans-serif"],
        "manrope-regular": ["Manrope-Regular", "sans-serif"],
        "manrope-light": ["Manrope-Light", "sans-serif"],
        "manrope-extralight": ["Manrope-Extralight", "sans-serif"],
      },
      colors: {
        primary: {
          100: "#F9F5FF",
          200: "#E8D7FF",
          300: "#D6B2FF",
          400: "#C49CFF",
          500: "#B386FF",
          600: "#A06FFF",
          700: "#8D59FF",
          800: "#7A43FF",
          900: "#672DFF",
        }
      }
    },
  },
  plugins: [],
}