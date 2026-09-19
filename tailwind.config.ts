import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#0B0F17",
          surface: "#111827",
          border: "#1F2937"
        },
        geo: {
          blue: "#3B82F6",
          emerald: "#10B981",
          amber: "#F59E0B",
          danger: "#EF4444"
        }
      },
      boxShadow: {
        glow: "0 0 48px rgba(59, 130, 246, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
