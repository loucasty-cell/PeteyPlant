import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Petey Plant R3F frontend. The backend (FastAPI) is expected on
// http://localhost:8000 by default; override with VITE_API_URL.
// No runtime CDN calls: all assets are bundled locally.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
  },
  preview: {
    port: 4174,
  },
});
