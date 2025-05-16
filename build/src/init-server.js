import fs from 'node:fs';
import path from 'node:path';
import { MCPProxy } from './openapi-mcp-server/mcp/proxy';
export class ValidationError extends Error {
    constructor(errors) {
        super('OpenAPI validation failed');
        this.errors = errors;
        this.name = 'ValidationError';
    }
}
async function loadOpenApiSpec(specPath, baseUrl) {
    let rawSpec;
    try {
        rawSpec = fs.readFileSync(path.resolve(process.cwd(), specPath), 'utf-8');
    }
    catch (error) {
        console.error('Failed to read OpenAPI specification file:', error.message);
        process.exit(1);
    }
    // Parse and validate the OpenApi Spec
    try {
        const parsed = JSON.parse(rawSpec);
        // Override baseUrl if specified.
        if (baseUrl) {
            parsed.servers[0].url = baseUrl;
        }
        return parsed;
    }
    catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        console.error('Failed to parse OpenAPI spec:', error.message);
        process.exit(1);
    }
}
export async function initProxy(specPath, baseUrl, accessToken) {
    const openApiSpec = await loadOpenApiSpec(specPath, baseUrl);
    const proxy = new MCPProxy('Notion API', openApiSpec, accessToken);
    return proxy;
}
//# sourceMappingURL=init-server.js.map