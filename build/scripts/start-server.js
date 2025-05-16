import path from 'node:path';
import { fileURLToPath } from 'url';
import { initProxy } from '../src/init-server';
export async function createNotionServer(accessToken) {
    const filename = fileURLToPath(import.meta.url);
    const directory = path.dirname(filename);
    const specPath = path.resolve(directory, '../scripts/notion-openapi.json');
    const baseUrl = process.env.BASE_URL ?? undefined;
    const proxy = await initProxy(specPath, baseUrl, accessToken);
    return proxy.getServer();
}
//# sourceMappingURL=start-server.js.map