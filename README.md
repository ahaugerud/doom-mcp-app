# DOOM MCP (local)

A local DOOM MCP server + browser shell, adapted from
[chrisnager/chrisnager-dot-com](https://github.com/chrisnager/chrisnager-dot-com/tree/master/doom)
for standalone local use behind ngrok.

It exposes two MCP tools:

- `create_doom_session` — creates a session and returns a signed `launch_url`, plus an inline
  MCP app widget for hosts that support it.
- `get_doom_launch_url` — plain-text fallback that returns the same signed launch URL.

Freedoom Phase 1 is bundled as the default playable content (see [LEGAL.md](./LEGAL.md)).

## Structure

```text
apps/
  doom-web/            browser shell (landing + /play route + inline widget)
  doom-mcp-server/     MCP server logic and tool registration
packages/
  doom-adapter/        runtime wrapper around cloudflare/doom-wasm
  doom-session/        signed token and launch URL helpers
scripts/
  local-server.mjs     single Node server: serves /mcp, /play, /health on one port
```

## Setup

```bash
npm install
```

## Run locally

```bash
npm start
```

This compiles the TypeScript once and starts a single server on `http://127.0.0.1:8787` with:

- `http://127.0.0.1:8787/mcp` — MCP endpoint (Streamable HTTP transport)
- `http://127.0.0.1:8787/play` — playable DOOM page
- `http://127.0.0.1:8787/health` — health check

For live-reload while editing, use `npm run dev` instead (runs `tsc --watch` and reloads the
MCP module on each request).

Override the host/port with env vars if needed:

```bash
DOOM_MCP_HOST=0.0.0.0 DOOM_MCP_PORT=8787 npm start
```

## Expose it publicly

The server derives its public origin from the incoming request's `Host` header on every MCP
call, so whatever URL your tunnel gives you is automatically used for the signed `launch_url`
and for the MCP widget's CSP allowlist — no extra configuration needed.

### Cloudflare Tunnel (recommended)

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

This prints a random `https://<something>.trycloudflare.com` URL. Point your MCP client at
`https://<something>.trycloudflare.com/mcp`.

**Use this instead of ngrok's free tier if you want the inline DOOM widget to render inside the
chat.** ngrok's free plan shows a "You are about to visit..." browser-warning interstitial to
any browsing context that hasn't clicked through it yet. Your own browser tab bypasses it once
you click through, but the sandboxed widget iframe that Claude renders is a separate, cookie-less
context — so its background requests for the widget script/wasm/wad assets get served the
interstitial's HTML instead of the real file, and the inline widget fails with "Failed to load
the DOOM widget module." The `create_doom_session`/`get_doom_launch_url` tool calls still succeed
either way and return a working `launch_url` you can open directly — it's only the inline
in-chat rendering that ngrok's free tier blocks. Cloudflare's quick tunnels have no such
interstitial.

### ngrok (works, but no inline widget on the free plan)

```bash
ngrok http 8787
```

Point your MCP client at `https://abc123.ngrok-free.app/mcp`. Tool calls work and the returned
launch link opens fine in a real browser; a paid ngrok plan removes the interstitial if you want
the inline widget too.

## Config (optional env vars)

| Variable | Default | Purpose |
|---|---|---|
| `DOOM_MCP_HOST` | `127.0.0.1` | Bind host |
| `DOOM_MCP_PORT` | `8787` | Bind port |
| `DOOM_TOKEN_SECRET` | dev default | HMAC secret for signed launch tokens |
| `DOOM_WEB_ORIGIN` | auto-detected from request | Force a specific public origin instead of auto-detecting from `Host` |
| `DOOM_DEFAULT_SESSION_TTL_SECONDS` | `3600` | Default session lifetime |

## Test

```bash
npm test
```

Runs the token-signing and tool-handler unit tests under Node's built-in test runner.
