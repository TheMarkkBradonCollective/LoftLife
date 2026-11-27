#!/usr/bin/env node
/**
 * Build a served, searchable gallery of every imported Kenney model.
 *
 * Every tile is the actual preview PNG rendered from that model's GLB by
 * scripts/render-kenney-previews.mjs — there are no stand-in images. The page
 * is static and ships with the site at /asset-gallery.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KENNEY_ITEMS, KENNEY_SOURCE, KENNEY_STYLE_GROUPS } from '../shared/catalog/kenney-library.mjs';
import { KENNEY_REPLACEMENTS } from '../shared/catalog/kenney-replacements.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'public', 'asset-gallery.html');

const usedFor = new Map();
for (const [catalogId, sourceId] of Object.entries(KENNEY_REPLACEMENTS)) {
  usedFor.set(sourceId, catalogId);
}

const tiles = KENNEY_ITEMS.map((item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  subcategory: item.subcategory,
  kit: item.asset.kit,
  styleGroup: item.asset.styleGroup,
  preview: `catalog-previews/${item.id}.png`,
  triangles: item.asset.triangles,
  size: item.size,
  usedFor: usedFor.get(item.id) ?? null,
  source: item.asset.sourceUrl,
}));

const kits = [...new Set(tiles.map((tile) => tile.kit))].sort();
const categories = [...new Set(tiles.map((tile) => tile.category))].sort();

const escape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LoftLife — imported Kenney asset gallery</title>
<style>
  :root{color-scheme:dark;--bg:#0f1114;--panel:#171a1f;--line:#282d35;--ink:#e9edf2;--muted:#8d97a5;--sage:#7c9a82;--brass:#b08d57}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
  header{padding:28px clamp(16px,4vw,40px) 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:linear-gradient(#0f1114f2,#0f1114e6);backdrop-filter:blur(8px);z-index:2}
  h1{margin:0;font-size:clamp(19px,2.4vw,26px);letter-spacing:-0.02em}
  header p{margin:6px 0 0;color:var(--muted);max-width:900px}
  .stats{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--muted)}
  .stats b{color:var(--ink);font-variant-numeric:tabular-nums}
  .controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  input,select{background:#0b0d10;border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:8px 10px;font:inherit;min-height:38px}
  input{flex:1;min-width:220px}
  main{padding:20px clamp(16px,4vw,40px) 48px}
  .count{color:var(--muted);font-size:12px;margin:0 0 14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
  figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:10px;display:flex;flex-direction:column;gap:6px}
  figure img{width:100%;height:auto;aspect-ratio:1;object-fit:contain;background:radial-gradient(circle at 50% 36%,#2a3038,#14171b 72%);border-radius:9px;display:block}
  figcaption{font-size:11.5px;font-weight:600;line-height:1.3}
  .meta{color:var(--muted);font-size:10px;display:flex;flex-wrap:wrap;gap:4px 8px;font-variant-numeric:tabular-nums}
  .tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 7px;font-size:9.5px;color:#b9c2cd}
  .used{border-color:var(--brass);color:#e7c98f}
  footer{padding:0 clamp(16px,4vw,40px) 40px;color:var(--muted);font-size:11px}
  a{color:#bcd3c1}
</style>
</head>
<body>
<header>
  <h1>Imported Kenney 3D library — real previews</h1>
  <p>Every tile below is the transparent PNG rendered from that model's shipped GLB, with the same LoftLife material-role styling the game applies. Source: <a href="${escape(KENNEY_SOURCE.repository)}">${escape(KENNEY_SOURCE.repository)}</a>, ${escape(KENNEY_SOURCE.license)}, by ${escape(KENNEY_SOURCE.author)}.</p>
  <div class="stats">
    <span><b>${tiles.length}</b> models</span>
    <span><b>${kits.length}</b> kits</span>
    <span><b>${categories.length}</b> categories</span>
    <span><b>${KENNEY_STYLE_GROUPS.length}</b> style groups</span>
    <span><b>${Object.keys(KENNEY_REPLACEMENTS).length}</b> replace existing items</span>
  </div>
  <div class="controls">
    <input id="q" type="search" placeholder="Search names, kits, tags…" aria-label="Search assets">
    <select id="kit" aria-label="Filter by kit"><option value="">All kits</option>${kits.map((kit) => `<option>${escape(kit)}</option>`).join('')}</select>
    <select id="category" aria-label="Filter by category"><option value="">All categories</option>${categories.map((category) => `<option>${escape(category)}</option>`).join('')}</select>
    <select id="style" aria-label="Filter by style group"><option value="">All art styles</option>${KENNEY_STYLE_GROUPS.map((group) => `<option value="${escape(group.id)}">${escape(group.label)}</option>`).join('')}</select>
  </div>
</header>
<main>
  <p class="count" id="count"></p>
  <div class="grid" id="grid"></div>
</main>
<footer>Generated by <code>scripts/build-catalog-gallery.mjs</code>. License and source records: <code>shared/catalog/kenney-library.mjs</code> and <code>docs/KENNEY-ASSET-LIBRARY.md</code>.</footer>
<script>
const ASSETS = ${JSON.stringify(tiles)};
const grid = document.getElementById('grid');
const count = document.getElementById('count');
const q = document.getElementById('q');
const kit = document.getElementById('kit');
const category = document.getElementById('category');
const style = document.getElementById('style');
const esc = (value) => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let shown = 0;
function render(){
  const term = q.value.trim().toLowerCase();
  const list = ASSETS.filter((asset) =>
    (!kit.value || asset.kit === kit.value) &&
    (!category.value || asset.category === category.value) &&
    (!style.value || asset.styleGroup === style.value) &&
    (!term || (asset.name + ' ' + asset.kit + ' ' + asset.category + ' ' + asset.subcategory + ' ' + asset.id).toLowerCase().includes(term))
  );
  count.textContent = list.length + ' of ' + ASSETS.length + ' models';
  grid.innerHTML = list.map((asset) => \`<figure>
    <img src="\${esc(asset.preview)}" alt="\${esc(asset.name)}" loading="lazy" decoding="async" width="512" height="512">
    <figcaption>\${esc(asset.name)}</figcaption>
    <div class="meta"><span>\${esc(asset.kit)}</span><span>\${asset.size[0]}×\${asset.size[1]} m</span><span>\${asset.triangles} tris</span></div>
    <div class="meta"><span class="tag">\${esc(asset.category)}</span>\${asset.usedFor ? \`<span class="tag used">replaces \${esc(asset.usedFor)}</span>\` : ''}</div>
  </figure>\`).join('');
}
for (const control of [q,kit,category,style]) control.addEventListener('input', render);
render();
</script>
</body>
</html>`;

fs.writeFileSync(out, html);
console.log(`Gallery: ${tiles.length} models → ${path.relative(process.cwd(), out)}`);
