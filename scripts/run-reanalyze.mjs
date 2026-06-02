/**
 * Launcher del script de reclasificación de referencias.
 * En Windows con antivirus/proxy corporativo, Node a veces no confía en el
 * certificado de Supabase (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Este wrapper
 * ejecuta el script con tsx y relaja la verificación TLS SOLO en este proceso
 * local (no afecta a `next dev` ni a producción).
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const script = path.join(__dirname, 'reanalyze-reference-images.ts');

const preloadTls = path.join(__dirname, 'preload-tls-local.cjs');
const result = spawnSync(
  process.execPath,
  ['-r', preloadTls, tsxCli, script, ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: process.env }
);

process.exit(result.status ?? 1);
