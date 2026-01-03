import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/LakelandTrek25/",   // 👈 VERY IMPORTANT
});
