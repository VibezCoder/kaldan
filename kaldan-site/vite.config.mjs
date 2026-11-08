import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pages = JSON.parse(fs.readFileSync(path.join(root, '.page-inputs.json'), 'utf8'));
export default defineConfig({
  root,
  server: { proxy: { '/api': 'http://127.0.0.1:8899' } },
  build: { rollupOptions: { input: pages.map(page => path.join(root, page)) } },
});
