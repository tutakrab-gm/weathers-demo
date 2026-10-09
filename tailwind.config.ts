import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-thai)", "Noto Sans Thai", "system-ui", "sans-serif"] },
      colors: {
        brand: { 50: "#eff6ff", 100: "#dbeafe", 500: "#2563eb", 600: "#1d4ed8", 700: "#1e40af" },
        lv: { normal: "#16a34a", watch: "#ca8a04", warning: "#ea580c", critical: "#dc2626" },
      },
    },
  },
  plugins: [],
} satisfies Config;
