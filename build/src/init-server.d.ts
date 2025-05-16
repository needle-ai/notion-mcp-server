import { MCPProxy } from './openapi-mcp-server/mcp/proxy';
export declare class ValidationError extends Error {
    errors: any[];
    constructor(errors: any[]);
}
export declare function initProxy(specPath: string, baseUrl: string | undefined, accessToken: string): Promise<MCPProxy>;
//# sourceMappingURL=init-server.d.ts.map