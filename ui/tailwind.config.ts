import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FAFAF8",
        surface: "#FFFFFF",
        sidebar: "#F5F4F0",
        subtle: "#FCFCFA",
        muted: "#F2F1ED",
        "user-bubble": "#EFEEEA",
        line: "#ECEBE6",
        "line-soft": "#F3F2EE",
        "line-strong": "#DCDAD3",
        ink: "#16161A",
        "ink-2": "#44444B",
        "ink-3": "#55555C",
        "ink-4": "#6E6E76",
        primary: "#3346E0",
        "primary-hover": "#2233B8",
        "primary-soft": "#EEF0FD",
        "primary-soft-text": "#2F3FC8",
        success: "#1E7A4C",
        "success-soft": "#E8F4EC",
        "success-text": "#1E6B43",
        warning: "#C98A1B",
        "warning-soft": "#FBF1DE",
        "warning-text": "#8A5200",
        danger: "#B42318",
        "danger-soft": "#FCEBEA",
        "danger-text": "#A11F15",
        "neutral-dot": "#B7B5AD",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        block: "0 1px 2px rgba(22,22,26,0.04), 0 12px 32px -18px rgba(22,22,26,0.14)",
        modal: "0 4px 12px rgba(22,22,26,0.08), 0 32px 80px -24px rgba(22,22,26,0.4)",
      },
      borderRadius: {
        btn: "10px",
        chip: "6px",
        block: "16px",
        composer: "18px",
      },
      animation: {
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
