import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const buildDir = join(rootDir, '.build')

const compileResult = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (compileResult.status !== 0) {
  process.exit(compileResult.status ?? 1)
}

await mkdir(buildDir, { recursive: true })
await writeFile(join(buildDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))

const testResult = spawnSync(
  process.execPath,
  [
    '--experimental-default-type=module',
    '--test',
    join(rootDir, '.build', 'apps', 'doom-mcp-server', 'src', 'tests', 'token.test.js'),
    join(rootDir, '.build', 'apps', 'doom-mcp-server', 'src', 'tests', 'tools.test.js'),
  ],
  {
    cwd: rootDir,
    stdio: 'inherit',
  },
)

process.exit(testResult.status ?? 1)
