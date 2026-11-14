// Bundles the game into dist/ (used by desktop + Android) and dist-single/ (one self-contained HTML).
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, cpSync } from 'fs';
mkdirSync('dist', { recursive: true }); mkdirSync('dist-single', { recursive: true });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2020'], outfile: 'dist/game.js',
  define: { __VERSION__: JSON.stringify(pkg.version) }, legalComments: 'none', logLevel: 'warning' });
const html = readFileSync('src/index.html', 'utf8');
writeFileSync('dist/index.html', html.replace('<!--GAME-->', '<script src="game.js"></script>'));
// photo textures: dist/assets/tex/{1k,2k} (the Android build drops 2k in CI)
if (existsSync('assets/tex')) cpSync('assets/tex', 'dist/assets/tex', { recursive: true });
// realistic hero avatars (Microsoft Rocketbox, MIT): dist/assets/avatars/<name>/{model.fbx, *.jpg}
if (existsSync('assets/avatars')) cpSync('assets/avatars', 'dist/assets/avatars', { recursive: true });
// single-file build: embed the 1K textures as data URLs so it still works from one HTML file
let embed = '';
if (existsSync('assets/tex/1k')) {
  const map = {};
  for (const f of readdirSync('assets/tex/1k')) if (f.endsWith('.jpg')) map[f.replace('.jpg', '')] = 'data:image/jpeg;base64,' + readFileSync('assets/tex/1k/' + f).toString('base64');
  embed = '<script>window.__DD_TEX=' + JSON.stringify(map) + ';</script>';
}
const js = readFileSync('dist/game.js', 'utf8').replace(/<\/script/g, '<\\/script');
writeFileSync('dist-single/index.html', html.replace('<!--GAME-->', embed + '<script>' + js + '</script>'));
if (existsSync('build/icon.png')) copyFileSync('build/icon.png', 'dist/icon.png');
console.log('built dist/ (' + (js.length / 1024 / 1024).toFixed(2) + ' MB js, single-file ' + ((embed.length + js.length) / 1024 / 1024).toFixed(1) + ' MB)');
