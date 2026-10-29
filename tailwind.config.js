/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        flashUp: {
          "0%, 100%": { backgroundColor: "transparent" },
          "25%": { backgroundColor: "rgba(16, 185, 129, 0.2)" },
        },
        flashDown: {
          "0%, 100%": { backgroundColor: "transparent" },
          "25%": { backgroundColor: "rgba(244, 63, 94, 0.2)" },
        },
      },
      animation: {
        "flash-up": "flashUp 1.2s ease-out",
        "flash-down": "flashDown 1.2s ease-out",
      },
    },
  },
  plugins: [],
};
