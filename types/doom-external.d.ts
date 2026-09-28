declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export class McpServer {
    constructor(serverInfo: unknown, options?: unknown)
    registerTool(name: string, config: unknown, callback: (args: any) => Promise<unknown> | unknown): void
    connect(transport: unknown): Promise<void>
    close(): Promise<void>
  }
}

declare module '@modelcontextprotocol/sdk/server/streamableHttp.js' {
  export class StreamableHTTPServerTransport {
    constructor(options?: unknown)
    close(): Promise<void>
    handleRequest(request: unknown, response: unknown, body?: unknown): Promise<void>
  }
}

declare module '@modelcontextprotocol/ext-apps/server' {
  export const RESOURCE_MIME_TYPE: string
  export function registerAppResource(
    server: { registerResource: (...args: unknown[]) => unknown },
    title: string,
    uri: string,
    meta: unknown,
    handler: (uri: URL) => Promise<unknown>,
  ): void
  export function registerAppTool(
    server: { registerTool: (...args: unknown[]) => unknown },
    name: string,
    config: unknown,
    callback: (args: any) => Promise<unknown> | unknown,
  ): void
}

declare module 'zod' {
  export const z: any
}
