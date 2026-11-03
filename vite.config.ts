import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built site work from any folder on a static host.
export default defineConfig({ plugins: [react()], base: './' });
