import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const buildDir = join(rootDir, '.build')
const webDir = join(rootDir, 'apps', 'doom-web')
const publicDir = join(webDir, 'public')
const host = process.env.DOOM_MCP_HOST || '127.0.0.1'
const port = Number(process.env.DOOM_MCP_PORT || 8787)
const watch = process.argv.includes('--watch')

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wad': 'application/octet-stream',
  '.wasm': 'application/wasm',
}

function runBuild() {
  const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

async function writeBuildPackageJson() {
  await mkdir(buildDir, { recursive: true })
  await writeFile(join(buildDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))
}

runBuild()
await writeBuildPackageJson()

let watcher = null
if (watch) {
  watcher = spawn('npx', ['tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

async function freshImport(relativePath) {
  const absolutePath = join(buildDir, relativePath)
  const href = pathToFileURL(absolutePath).href
  return import(watch ? `${href}?t=${Date.now()}` : href)
}

function corsHeaders() {
  return {
    'access-control-allow-headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'mcp-session-id',
  }
}

function resolveOrigin(request) {
  const forwardedProto = request.headers['x-forwarded-proto']
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || 'http'
  const hostHeader = request.headers.host || `${host}:${port}`
  return `${protocol}://${hostHeader}`
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : undefined
}

async function handleMcpRequest(request, response) {
  try {
    const { getDoomMcpConfig } = await freshImport('apps/doom-mcp-server/src/config.js')
    const { createDoomMcpServer } = await freshImport('apps/doom-mcp-server/src/mcp/server.js')

    const deploymentOrigin = resolveOrigin(request)
    const config = getDoomMcpConfig(process.env, deploymentOrigin)
    const server = createDoomMcpServer(config)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    response.on('close', () => {
      void transport.close()
      void server.close()
    })

    await server.connect(transport)

    const body = request.method === 'POST' ? await readJsonBody(request) : undefined
    await transport.handleRequest(request, response, body)
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() })
    }
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: error instanceof Error ? error.message : 'Internal server error' },
      }),
    )
  }
}

function mapRequestToFile(pathname) {
  if (pathname === '/' || pathname === '/index.html' || pathname === '/play') {
    return join(webDir, 'index.html')
  }

  if (pathname === '/styles.css') {
    return join(webDir, 'src', 'styles.css')
  }

  if (pathname.startsWith('/src/')) {
    return join(buildDir, 'apps', 'doom-web', pathname)
  }

  if (pathname.startsWith('/packages/')) {
    return join(buildDir, pathname)
  }

  const publicFile = join(publicDir, decodeURIComponent(pathname))
  if (existsSync(publicFile)) {
    return publicFile
  }

  if (!extname(pathname)) {
    return join(webDir, 'index.html')
  }

  return null
}

async function serveStaticFile(filePath, response) {
  const normalized = normalize(filePath)
  const allowedRoots = [buildDir, webDir, publicDir]

  if (!allowedRoots.some((root) => normalized.startsWith(root))) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Forbidden')
    return
  }

  if (!existsSync(normalized)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
    return
  }

  const fileStats = await stat(normalized)
  if (!fileStats.isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
    return
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes[extname(normalized)] || 'application/octet-stream',
    ...corsHeaders(),
  })

  createReadStream(normalized).pipe(response)
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders())
    response.end()
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() })
    response.end(JSON.stringify({ ok: true, service: 'doom-mcp-server' }))
    return
  }

  if (url.pathname === '/mcp') {
    await handleMcpRequest(request, response)
    return
  }

  if (request.method !== 'GET') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Method Not Allowed')
    return
  }

  try {
    const filePath = mapRequestToFile(url.pathname)
    if (!filePath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not Found')
      return
    }
    await serveStaticFile(filePath, response)
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(String(error))
  }
})

server.listen(port, host, () => {
  console.log(`doom-in-mcp listening on http://${host}:${port}`)
  console.log(`  play:   http://${host}:${port}/play`)
  console.log(`  mcp:    http://${host}:${port}/mcp`)
  console.log(`  health: http://${host}:${port}/health`)
  if (watch) {
    console.log('watching for TypeScript changes...')
  }
})

function shutdown() {
  if (watcher) {
    watcher.kill('SIGTERM')
  }
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
