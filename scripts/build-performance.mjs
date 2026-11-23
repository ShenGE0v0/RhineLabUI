import { build } from 'vite';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const label = process.argv[2] || 'candidate';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid benchmark label');

const root = process.cwd();
const outDir = resolve(`release/performance-${label}`);

function resolveBaseline() {
  // Parent of the archive-rendering optimization on this repository's history.
  const ref = process.env.PERF_BASELINE || '8799b03179a9a0ebd2611843e644a5a0530b24bf';
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (cause) {
    throw new Error(`Baseline revision ${ref} is unavailable. Set PERF_BASELINE to a local commit.`, { cause });
  }
}

async function buildBenchmark(project) {
  await build({
    root: project,
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          benchmark: join(project, 'reference/performance.html'),
          app: join(project, 'index.html'),
        },
      },
    },
  });
}

if (label === 'baseline') {
  const baselineCommit = resolveBaseline();
  const work = resolve('.tools/performance');
  await mkdir(work, { recursive: true });
  const snapshot = await mkdtemp(join(work, 'baseline-'));
  console.log('Performance baseline:', baselineCommit);
  try {
    const archive = join(snapshot, 'source.tar');
    execFileSync('git', [
      'archive', '--format=tar', `--output=${archive}`, baselineCommit,
      'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'content', 'public', 'src',
    ]);
    execFileSync('tar', ['-xf', archive, '-C', snapshot]);
    // Use the same benchmark driver and installed dependencies for both builds.
    const reference = join(snapshot, 'reference');
    await mkdir(reference);
    for (const file of ['performance.html', 'performance.ts', 'model-precision.ts']) {
      await copyFile(join(root, 'reference', file), join(reference, file));
    }
    // Historical Vite configs open assets relative to the working directory.
    process.chdir(snapshot);
    await buildBenchmark(snapshot);
    await writeFile(join(work, 'baseline.json'), JSON.stringify({ baselineCommit }, null, 2));
  } finally {
    process.chdir(root);
    await rm(snapshot, { recursive: true, force: true });
  }
} else {
  await buildBenchmark(root);
}
