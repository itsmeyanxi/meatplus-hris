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
        // Corporate blue accent, available as bg-brand-600, text-brand-700, etc.
        brand: {
          50: "#eff5ff",
          100: "#dbe8fe",
          200: "#bfd7fe",
          300: "#93bbfd",
          400: "#609afa",
          500: "#3b7cf6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
    },
  },
  plugins: [],
};
