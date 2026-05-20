import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#f7f5f1",
        ink: "#1c2522",
        muted: "#647067",
        line: "#ded8cd",
        moss: "#2f6f5e",
        ocean: "#315f8a",
        coral: "#b75f46",
        amber: "#b8872f",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(34, 42, 36, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
