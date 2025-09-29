import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const watch = args.includes('--watch');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'static', 'dist');

const jsEntries = [
  { source: 'static/auth.js', outfile: path.join(outDir, 'js', 'auth.min.js') },
  { source: 'static/script.js', outfile: path.join(outDir, 'js', 'app.min.js') },
  { source: 'static/api-loader.js', outfile: path.join(outDir, 'js', 'api-loader.min.js') },
  { source: 'static/script_append.js', outfile: path.join(outDir, 'js', 'script-append.min.js') }
];

const cssEntries = [
  { source: 'static/style.css', outfile: path.join(outDir, 'css', 'app.min.css') }
];

const manifestEntries = [...jsEntries, ...cssEntries].map((entry) => ({
  source: entry.source.replace(/\\/g, '/'),
  outfile: entry.outfile
}));

async function ensureDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function writeManifest() {
  await mkdir(outDir, { recursive: true });
  const manifest = {};
  for (const entry of manifestEntries) {
    manifest[entry.source] = path.relative(projectRoot, entry.outfile).replace(/\\/g, '/');
  }
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

async function buildAsset(entry, type) {
  await ensureDir(entry.outfile);
  const options = {
    entryPoints: [path.join(projectRoot, entry.source)],
    outfile: entry.outfile,
    bundle: false,
    minify: true,
    sourcemap: true,
    legalComments: 'none',
    logLevel: watch ? 'silent' : 'info'
  };
  if (type === 'js') {
    options.target = ['es2018'];
  }
  if (watch) {
    options.watch = {
      onRebuild(error) {
        if (error) {
          console.error(`❌ Falha ao reconstruir ${entry.source}:`, error);
        } else {
          console.log(`♻️  Rebuild concluído: ${entry.source}`);
          writeManifest().catch((err) => console.error('Erro ao atualizar manifest:', err));
        }
      }
    };
  }
  await build(options);
  if (!watch) {
    console.log(`• ${path.relative(projectRoot, entry.source)} → ${path.relative(projectRoot, entry.outfile)}`);
  }
}

async function runBuild() {
  await rm(outDir, { recursive: true, force: true });
  const tasks = [];
  for (const entry of jsEntries) {
    tasks.push(buildAsset(entry, 'js'));
  }
  for (const entry of cssEntries) {
    tasks.push(buildAsset(entry, 'css'));
  }
  await Promise.all(tasks);
  await writeManifest();
  if (!watch) {
    console.log(`✅ Assets gerados em ${path.relative(projectRoot, outDir)}`);
  } else {
    console.log('👀 Modo watch ativo. Aguardando alterações...');
  }
}

runBuild().catch((error) => {
  console.error('Erro ao gerar assets:', error);
  process.exitCode = 1;
});
