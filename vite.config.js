import { defineConfig } from 'vite';

// GSAP n'est pas bundle : le script attend window.gsap et window.ScrollTrigger,
// charges depuis le CDN avant lui (voir webflow/head.html).
export default defineConfig({
  build: {
    target: 'es2019',
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.js',
      name: 'ScrollVideo',
      formats: ['iife'],
      fileName: () => 'scroll-video.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'scroll-video.[ext]',
      },
    },
  },
});
