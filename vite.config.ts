import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Binary catalog assets that production serves from R2/CDN, never from dist.
 * Local development is unchanged: Vite serves `public/` in dev, so these stay
 * exactly where the import pipelines write them.
 */
const R2_HOSTED_ASSET_DIRS = ['models', 'catalog-previews'];

/**
 * When VITE_ASSET_BASE_URL is set for a build, `publicDir` is disabled so the
 * 112 MB of previews and GLBs are never copied into dist. Every other file in
 * public/ (the asset gallery, future files) is copied here instead, and the
 * gallery's preview paths are rewritten to the R2 base.
 */
function externalizeCatalogAssets(assetBase: string): Plugin {
  return {
    name: 'loftlife-external-catalog-assets',
    apply: 'build',
    closeBundle(error?: Error): void {
      if (error) return;
      const distDir = path.resolve(__dirname, 'dist');
      const publicDir = path.resolve(__dirname, 'public');
      if (!fs.existsSync(distDir)) return;

      // Defensive: clear any asset trees left by an older local build.
      for (const dir of R2_HOSTED_ASSET_DIRS) {
        fs.rmSync(path.join(distDir, dir), {recursive: true, force: true});
      }
      if (!fs.existsSync(publicDir)) return;

      for (const entry of fs.readdirSync(publicDir, {withFileTypes: true})) {
        if (R2_HOSTED_ASSET_DIRS.includes(entry.name)) continue;
        const from = path.join(publicDir, entry.name);
        const to = path.join(distDir, entry.name);
        if (entry.isDirectory()) {
          fs.cpSync(from, to, {recursive: true, force: true});
        } else {
          fs.copyFileSync(from, to);
        }
      }

      // The generated gallery stores previews as "catalog-previews/<id>.png";
      // point them at the bucket so the page still resolves in production.
      const gallery = path.join(distDir, 'asset-gallery.html');
      if (fs.existsSync(gallery)) {
        const html = fs.readFileSync(gallery, 'utf8');
        const rewritten = html.replace(
          /"preview":"catalog-previews\//g,
          `"preview":"${assetBase}/catalog-previews/`
        );
        if (rewritten !== html) fs.writeFileSync(gallery, rewritten);
      }

      console.log(
        `[LoftLife] catalog assets served from ${assetBase}; ` +
          `public/${R2_HOSTED_ASSET_DIRS.join(' and public/')} were not copied to dist`
      );
    },
  };
}

export default defineConfig(({command, mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const assetBase = (env.VITE_ASSET_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const externalAssets = command === 'build' && assetBase !== '';

  if (externalAssets && !/^https?:\/\/[^/]+/.test(assetBase)) {
    throw new Error(
      `VITE_ASSET_BASE_URL must be an absolute http(s) URL such as https://assets.example.com/catalog/v1 (got "${assetBase}")`
    );
  }
  if (command === 'build' && !externalAssets) {
    console.warn(
      '[LoftLife] VITE_ASSET_BASE_URL is not set: this build bundles ~112 MB of models and ' +
        'previews from public/. Set it to the R2/CDN root ending in /catalog/v1 for production ' +
        '(see docs/KENNEY-ASSET-LIBRARY.md).'
    );
  }

  return {
    // Only disabled for the externalized production build; dev and builds
    // without VITE_ASSET_BASE_URL keep serving public/ unchanged.
    publicDir: externalAssets ? false : 'public',
    plugins: [
      react(),
      tailwindcss(),
      externalAssets ? externalizeCatalogAssets(assetBase) : null,
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Empty by default: Cloud previews inject their own exact hostname through
      // __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS, never a blanket wildcard.
      allowedHosts: [],
      // The API + realtime gateway runs separately (npm run server). Proxying
      // keeps the browser on one origin, so cookies/WebSockets stay same-site.
      proxy: {
        '/api': {
          target: process.env.LOFTLIFE_API_URL ?? 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
        '/ws': {
          target: process.env.LOFTLIFE_API_URL ?? 'http://127.0.0.1:8787',
          ws: true,
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
