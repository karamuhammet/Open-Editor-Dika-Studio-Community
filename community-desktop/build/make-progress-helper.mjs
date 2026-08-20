/* Compiles build/progress-helper.nsi into build/ccprogress.exe.
 *
 * The installer ships that executable inside itself and runs it while the copy is going, because the
 * percentage cannot be computed from inside the installer without crashing it. progress-helper.nsi
 * carries the whole explanation; this file only builds it.
 *
 * makensis is the one electron-builder already downloaded, so nothing new is installed and the helper
 * is built by exactly the compiler that builds the installer around it. Set NSIS_MAKENSIS to override.
 *
 *   node build/make-progress-helper.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function makensis() {
  if (process.env.NSIS_MAKENSIS && existsSync(process.env.NSIS_MAKENSIS)) return process.env.NSIS_MAKENSIS;
  const cache = join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'nsis');
  if (existsSync(cache)) {
    // newest nsis-<version> first, so a cache holding two versions builds with the same one
    // electron-builder is currently using rather than whichever happens to be listed first.
    const dirs = readdirSync(cache)
      .filter((d) => /^nsis-\d/.test(d))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const rel of ['makensis.exe', join('Bin', 'makensis.exe')]) {
        const exe = join(cache, d, rel);
        if (existsSync(exe)) return exe;
      }
    }
  }
  throw new Error('makensis not found. Run an electron-builder Windows build once so it downloads NSIS, or set NSIS_MAKENSIS.');
}

const out = join(HERE, 'ccprogress.exe');
const exe = makensis();
const log = execFileSync(exe, [join(HERE, 'progress-helper.nsi')], { cwd: HERE, encoding: 'utf8' });

const errors = log.split(/\r?\n/).filter((l) => /^Error|error:/i.test(l));
if (errors.length) {
  console.error(log);
  throw new Error('makensis reported errors');
}
if (!existsSync(out)) throw new Error('ccprogress.exe was not produced');

console.log(JSON.stringify({
  compiler: exe,
  out: 'build/ccprogress.exe',
  bytes: statSync(out).size,
}, null, 1));
