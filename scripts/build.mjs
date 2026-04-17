import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { build, context } from 'esbuild'

const watchMode = process.argv.includes('--watch')
const production = process.argv.includes('--production')
const projectRoot = process.cwd()
const outDir = path.join(projectRoot, 'out')

const buildOptions = {
  entryPoints: [path.join(projectRoot, 'src/extension.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(outDir, 'extension.js'),
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  define: {
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
  },
  logLevel: 'info',
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

if (watchMode) {
  const ctx = await context(buildOptions)
  await ctx.watch()
  console.log('[build] watching for changes...')
}
else {
  await build(buildOptions)
}
