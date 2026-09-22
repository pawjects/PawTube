import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false
  },
  plugins: [
    {
      name: 'copy-public-to-dist-public',
      closeBundle() {
        const srcPublic = path.resolve(__dirname, 'public');
        const destPublic = path.resolve(__dirname, 'dist', 'public');
        if (fs.existsSync(srcPublic)) {
          fs.cpSync(srcPublic, destPublic, { recursive: true });
        }
      }
    }
  ]
});
