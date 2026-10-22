import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/diapason/",
  server: {
    // getUserMedia requires a secure context; localhost qualifies, so plain http is fine.
    host: "localhost",
    port: 5173,
    open: true,
  },
});
