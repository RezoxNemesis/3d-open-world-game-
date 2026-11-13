// Bundles the game into dist/ (used by desktop + Android) and dist-single/ (one self-contained HTML).
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
mkdirSync('dist', { recursive: true }); mkdirSync('dist-single', { recursive: true });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2020'], outfile: 'dist/game.js',
  define: { __VERSION__: JSON.stringify(pkg.version) }, legalComments: 'none', logLevel: 'warning' });
const html = readFileSync('src/index.html', 'utf8');
writeFileSync('dist/index.html', html.replace('<!--GAME-->', '<script src="game.js"></script>'));
const js = readFileSync('dist/game.js', 'utf8').replace(/<\/script/g, '<\\/script');
writeFileSync('dist-single/index.html', html.replace('<!--GAME-->', '<script>' + js + '</script>'));
if (existsSync('build/icon.png')) copyFileSync('build/icon.png', 'dist/icon.png');
console.log('built dist/ (' + (js.length / 1024 / 1024).toFixed(2) + ' MB js)');
