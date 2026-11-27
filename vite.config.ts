import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Plugin, defineConfig } from 'vite';

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Commit SHA: explicit build arg → CI env → local git → "dev". */
function gitSha(): string {
  if (process.env.APP_GIT_SHA && process.env.APP_GIT_SHA !== 'dev') return process.env.APP_GIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const buildInfo = {
  name: 'voltrack',
  version: process.env.APP_VERSION || pkg.version,
  commit: gitSha(),
  builtAt: new Date().toISOString(),
};

/** Emits /version.json so a deployment can be verified against the commit that produced it. */
function versionJson(): Plugin {
  return {
    name: 'voltrack-version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(buildInfo, null, 2)}\n` });
    },
  };
}

export default defineConfig({
  // GitHub Pages project sites live under /<repo>/ — the deploy workflow sets VITE_BASE.
  base: process.env.VITE_BASE || '/',
  appType: 'mpa',
  define: {
    __APP_VERSION__: JSON.stringify(buildInfo.version),
    __GIT_SHA__: JSON.stringify(buildInfo.commit),
    __BUILD_TIME__: JSON.stringify(buildInfo.builtAt),
  },
  plugins: [versionJson()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: { index: page('index'), modular: page('modular'), acid: page('acid'), va: page('va') },
    },
  },
});
