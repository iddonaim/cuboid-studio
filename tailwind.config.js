/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Geist Variable'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'Geist Mono Variable'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Warm-gray "ink" ramp for the drafting-instrument theme.
        // 50 is paper-bright, 950 is full ink — components use this ramp
        // for all neutral surfaces, rules, and text.
        ink: {
          50:  "#FAF9F6",
          100: "#F1EFE9",
          200: "#E4E1D7",
          300: "#CFCBBF",
          400: "#A39F93",
          500: "#7C786C",
          600: "#5D5A50",
          700: "#47443C",
          800: "#33312A",
          900: "#24221C",
          950: "#16150F",
        },
        border:      "hsl(var(--border) / <alpha-value>)",
        input:       "hsl(var(--input) / <alpha-value>)",
        ring:        "hsl(var(--ring) / <alpha-value>)",
        background:  "hsl(var(--background) / <alpha-value>)",
        foreground:  "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT:    "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT:    "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}
