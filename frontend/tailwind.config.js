/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // ── Corporate Navy re-skin ──────────────────────────────────────────
        // `extend` deep-merges, so we override ONLY the dark end of slate. Every
        // bg-slate-900 / text-slate-900 (sidebar, buttons, headers, headings)
        // becomes a refined navy instead of harsh near-black — softer on the eye,
        // more corporate — while the light/mid slate shades (text, borders,
        // muted) stay as before for readability.
        slate: {
          700: "#2b3b57",
          800: "#1c2a46",
          900: "#16233d",
          950: "#0d1730",
        },
        // Navy-blue accent — matches the dashboard hero (#16233d). Used for CTAs,
        // active nav, selected states and soft tints (bg-brand-50). A cohesive navy
        // family rather than a bright blue, so actions sit in the same tone as the
        // chrome instead of standing apart.
        brand: {
          50: "#eef1f6",
          100: "#dae1ec",
          200: "#b8c5da",
          300: "#8b9dc0",
          400: "#5a7099",
          500: "#334b74",
          600: "#16233d",
          700: "#111a2e",
          800: "#0d1424",
          900: "#0a101d",
          950: "#05080f",
        },
      },
    },
  },
  plugins: [],
};
