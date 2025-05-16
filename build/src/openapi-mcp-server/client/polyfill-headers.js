/*
* The Headers class was supported in Node.js starting with version 18, which was released on April 19, 2022.
* We need to have a polyfill ready to work for old Node versions.
* See more at https://github.com/makenotion/notion-mcp-server/issues/32
* */
class PolyfillHeaders {
    constructor(init) {
        this.headers = new Map();
        if (init) {
            Object.entries(init).forEach(([key, value]) => {
                this.append(key, value);
            });
        }
    }
    append(name, value) {
        const key = name.toLowerCase();
        if (!this.headers.has(key)) {
            this.headers.set(key, []);
        }
        this.headers.get(key).push(value);
    }
    get(name) {
        const key = name.toLowerCase();
        if (!this.headers.has(key)) {
            return null;
        }
        return this.headers.get(key).join(', ');
    }
}
const GlobalHeaders = typeof global !== 'undefined' && 'Headers' in global
    ? global.Headers
    : undefined;
export const Headers = (GlobalHeaders || PolyfillHeaders);
//# sourceMappingURL=polyfill-headers.js.map