// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import tailwindcss from "@tailwindcss/vite";
// import tsConfigPaths from "vite-tsconfig-paths";
// import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// export default defineConfig({
//   server: {
//     port: 8080,
//   },
//   plugins: [
//     tanstackStart({ server: { entry: "server" } }),
//     react(),
//     tailwindcss(),
//     tsConfigPaths(),
//   ],
//   resolve: {
//     alias: {
//       "@": "/src",
//     },
//   },
// });


import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  server: {
    port: 8080,
  },
  plugins: [
    tanstackStart(),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});