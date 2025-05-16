import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIToMCPConverter } from '../openapi/parser';
import { HttpClient, HttpClientError } from '../client/http-client';
// import this class, extend and return server
export class MCPProxy {
    constructor(name, openApiSpec, accessToken) {
        this.server = new Server({ name, version: '1.0.0' }, { capabilities: { tools: {} } });
        const baseUrl = openApiSpec.servers?.[0].url;
        if (!baseUrl) {
            throw new Error('No base URL found in OpenAPI spec');
        }
        this.httpClient = new HttpClient({
            baseUrl,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Notion-Version': '2022-06-28',
            },
        }, openApiSpec);
        // Convert OpenAPI spec to MCP tools
        const converter = new OpenAPIToMCPConverter(openApiSpec);
        const { tools, openApiLookup } = converter.convertToMCPTools();
        this.tools = tools;
        this.openApiLookup = openApiLookup;
        this.setupHandlers();
    }
    setupHandlers() {
        // Handle tool listing
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [];
            // Add methods as separate tools to match the MCP format
            Object.entries(this.tools).forEach(([toolName, def]) => {
                def.methods.forEach(method => {
                    const toolNameWithMethod = `${toolName}-${method.name}`;
                    const truncatedToolName = this.truncateToolName(toolNameWithMethod);
                    tools.push({
                        name: truncatedToolName,
                        description: method.description,
                        inputSchema: method.inputSchema,
                    });
                });
            });
            return { tools };
        });
        // Handle tool calling
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: params } = request.params;
            // Find the operation in OpenAPI spec
            const operation = this.findOperation(name);
            if (!operation) {
                throw new Error(`Method ${name} not found`);
            }
            try {
                // Execute the operation
                const response = await this.httpClient.executeOperation(operation, params);
                // Convert response to MCP format
                return {
                    content: [
                        {
                            type: 'text', // currently this is the only type that seems to be used by mcp server
                            text: JSON.stringify(response.data), // TODO: pass through the http status code text?
                        },
                    ],
                };
            }
            catch (error) {
                console.error('Error in tool call', error);
                if (error instanceof HttpClientError) {
                    console.error('HttpClientError encountered, returning structured error', error);
                    const data = error.data?.response?.data ?? error.data ?? {};
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'error', // TODO: get this from http status code?
                                    ...(typeof data === 'object' ? data : { data: data }),
                                }),
                            },
                        ],
                    };
                }
                throw error;
            }
        });
    }
    findOperation(operationId) {
        return this.openApiLookup[operationId] ?? null;
    }
    parseHeadersFromEnv() {
        const headersJson = process.env.OPENAPI_MCP_HEADERS;
        if (!headersJson) {
            return {};
        }
        try {
            const headers = JSON.parse(headersJson);
            if (typeof headers !== 'object' || headers === null) {
                console.warn('OPENAPI_MCP_HEADERS environment variable must be a JSON object, got:', typeof headers);
                return {};
            }
            return headers;
        }
        catch (error) {
            console.warn('Failed to parse OPENAPI_MCP_HEADERS environment variable:', error);
            return {};
        }
    }
    getContentType(headers) {
        const contentType = headers.get('content-type');
        if (!contentType)
            return 'binary';
        if (contentType.includes('text') || contentType.includes('json')) {
            return 'text';
        }
        else if (contentType.includes('image')) {
            return 'image';
        }
        return 'binary';
    }
    truncateToolName(name) {
        if (name.length <= 64) {
            return name;
        }
        return name.slice(0, 64);
    }
    async connect(transport) {
        // The SDK will handle stdio communication
        await this.server.connect(transport);
    }
    getServer() {
        return this.server;
    }
}
//# sourceMappingURL=proxy.js.map