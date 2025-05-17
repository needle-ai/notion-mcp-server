import { MCPProxy } from './openapi-mcp-server/mcp/proxy'
import { NotionOpenAPISpec } from './notion-openapi'

export async function createNotionServer(accessToken: string) {
  const proxy = new MCPProxy('Notion API', NotionOpenAPISpec, accessToken)
  return proxy.getServer()
}
