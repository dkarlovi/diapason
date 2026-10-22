import { defineConfig } from "vite";

export default defineConfig({
  base: "/diapason/",
  server: {
    // getUserMedia requires a secure context; localhost qualifies, so plain http is fine.
    host: "localhost",
    port: 5173,
    open: true,
  },
});
