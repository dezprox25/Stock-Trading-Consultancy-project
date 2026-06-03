/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        trading: {
          bg: "#080B0E",        // Pitch black-slate
          surface: "#111720",   // Surface container background
          border: "#1F2937",    // Panel borders
          gridLine: "#161D27",  // Custom grid border lines
          textMuted: "#8491A5", // Gray descriptions
          textActive: "#F3F4F6",// Bright text
          bullish: "#0ECB81",   // Rich vibrant green
          bearish: "#F6465D",   // Rich vibrant red
          neutral: "#F0B90B",   // Rich yellow
          divergence: "#FF9800",// Alert orange
          sentiment: "#B026FF", // Alert purple
          dayHigh: "#1E40AF",   // Solid blue (Day High)
          dayLow: "#4B5563",    // Solid grey (Day Low)
        }
      },
      fontFamily: {
        sans: ["Outfit", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      }
    },
  },
  plugins: [],
}
