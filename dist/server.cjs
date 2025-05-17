"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server.ts
var server_exports = {};
__export(server_exports, {
  createNotionServer: () => createNotionServer
});
module.exports = __toCommonJS(server_exports);

// src/openapi-mcp-server/mcp/proxy.ts
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");

// src/openapi-mcp-server/openapi/parser.ts
var OpenAPIToMCPConverter = class {
  constructor(openApiSpec) {
    this.openApiSpec = openApiSpec;
    this.schemaCache = {};
    this.nameCounter = 0;
  }
  /**
   * Resolve a $ref reference to its schema in the openApiSpec.
   * Returns the raw OpenAPI SchemaObject or null if not found.
   */
  internalResolveRef(ref, resolvedRefs) {
    if (!ref.startsWith("#/")) {
      return null;
    }
    if (resolvedRefs.has(ref)) {
      return null;
    }
    const parts = ref.replace(/^#\//, "").split("/");
    let current = this.openApiSpec;
    for (const part of parts) {
      current = current[part];
      if (!current) return null;
    }
    resolvedRefs.add(ref);
    return current;
  }
  /**
   * Convert an OpenAPI schema (or reference) into a JSON Schema object.
   * Uses caching and handles cycles by returning $ref nodes.
   */
  convertOpenApiSchemaToJsonSchema(schema, resolvedRefs, resolveRefs = false) {
    if ("$ref" in schema) {
      const ref = schema.$ref;
      if (!resolveRefs) {
        if (ref.startsWith("#/components/schemas/")) {
          return {
            $ref: ref.replace(/^#\/components\/schemas\//, "#/$defs/"),
            ..."description" in schema ? { description: schema.description } : {}
          };
        }
        console.error(`Attempting to resolve ref ${ref} not found in components collection.`);
      }
      const refSchema = { $ref: ref };
      if ("description" in schema && schema.description) {
        refSchema.description = schema.description;
      }
      if (this.schemaCache[ref]) {
        return this.schemaCache[ref];
      }
      const resolved = this.internalResolveRef(ref, resolvedRefs);
      if (!resolved) {
        console.error(`Failed to resolve ref ${ref}`);
        return {
          $ref: ref.replace(/^#\/components\/schemas\//, "#/$defs/"),
          description: "description" in schema ? schema.description ?? "" : ""
        };
      } else {
        const converted = this.convertOpenApiSchemaToJsonSchema(resolved, resolvedRefs, resolveRefs);
        this.schemaCache[ref] = converted;
        return converted;
      }
    }
    const result = {};
    if (schema.type) {
      result.type = schema.type;
    }
    if (schema.format === "binary") {
      result.format = "uri-reference";
      const binaryDesc = "absolute paths to local files";
      result.description = schema.description ? `${schema.description} (${binaryDesc})` : binaryDesc;
    } else {
      if (schema.format) {
        result.format = schema.format;
      }
      if (schema.description) {
        result.description = schema.description;
      }
    }
    if (schema.enum) {
      result.enum = schema.enum;
    }
    if (schema.default !== void 0) {
      result.default = schema.default;
    }
    if (schema.type === "object") {
      result.type = "object";
      if (schema.properties) {
        result.properties = {};
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          result.properties[name] = this.convertOpenApiSchemaToJsonSchema(propSchema, resolvedRefs, resolveRefs);
        }
      }
      if (schema.required) {
        result.required = schema.required;
      }
      if (schema.additionalProperties === true || schema.additionalProperties === void 0) {
        result.additionalProperties = true;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        result.additionalProperties = this.convertOpenApiSchemaToJsonSchema(schema.additionalProperties, resolvedRefs, resolveRefs);
      } else {
        result.additionalProperties = false;
      }
    }
    if (schema.type === "array" && schema.items) {
      result.type = "array";
      result.items = this.convertOpenApiSchemaToJsonSchema(schema.items, resolvedRefs, resolveRefs);
    }
    if (schema.oneOf) {
      result.oneOf = schema.oneOf.map((s) => this.convertOpenApiSchemaToJsonSchema(s, resolvedRefs, resolveRefs));
    }
    if (schema.anyOf) {
      result.anyOf = schema.anyOf.map((s) => this.convertOpenApiSchemaToJsonSchema(s, resolvedRefs, resolveRefs));
    }
    if (schema.allOf) {
      result.allOf = schema.allOf.map((s) => this.convertOpenApiSchemaToJsonSchema(s, resolvedRefs, resolveRefs));
    }
    return result;
  }
  convertToMCPTools() {
    const apiName = "API";
    const openApiLookup = {};
    const tools = {
      [apiName]: { methods: [] }
    };
    const zip = {};
    for (const [path, pathItem] of Object.entries(this.openApiSpec.paths || {})) {
      if (!pathItem) continue;
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!this.isOperation(method, operation)) continue;
        const mcpMethod = this.convertOperationToMCPMethod(operation, method, path);
        if (mcpMethod) {
          const uniqueName = this.ensureUniqueName(mcpMethod.name);
          mcpMethod.name = uniqueName;
          tools[apiName].methods.push(mcpMethod);
          openApiLookup[apiName + "-" + uniqueName] = { ...operation, method, path };
          zip[apiName + "-" + uniqueName] = { openApi: { ...operation, method, path }, mcp: mcpMethod };
        }
      }
    }
    return { tools, openApiLookup, zip };
  }
  /**
   * Convert the OpenAPI spec to OpenAI's ChatCompletionTool format
   */
  convertToOpenAITools() {
    const tools = [];
    for (const [path, pathItem] of Object.entries(this.openApiSpec.paths || {})) {
      if (!pathItem) continue;
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!this.isOperation(method, operation)) continue;
        const parameters = this.convertOperationToJsonSchema(operation, method, path);
        const tool = {
          type: "function",
          function: {
            name: operation.operationId,
            description: operation.summary || operation.description || "",
            parameters
          }
        };
        tools.push(tool);
      }
    }
    return tools;
  }
  /**
   * Convert the OpenAPI spec to Anthropic's Tool format
   */
  convertToAnthropicTools() {
    const tools = [];
    for (const [path, pathItem] of Object.entries(this.openApiSpec.paths || {})) {
      if (!pathItem) continue;
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!this.isOperation(method, operation)) continue;
        const parameters = this.convertOperationToJsonSchema(operation, method, path);
        const tool = {
          name: operation.operationId,
          description: operation.summary || operation.description || "",
          input_schema: parameters
        };
        tools.push(tool);
      }
    }
    return tools;
  }
  convertComponentsToJsonSchema() {
    const components = this.openApiSpec.components || {};
    const schema = {};
    for (const [key, value] of Object.entries(components.schemas || {})) {
      schema[key] = this.convertOpenApiSchemaToJsonSchema(value, /* @__PURE__ */ new Set());
    }
    return schema;
  }
  /**
   * Helper method to convert an operation to a JSON Schema for parameters
   */
  convertOperationToJsonSchema(operation, method, path) {
    const schema = {
      type: "object",
      properties: {},
      required: [],
      $defs: this.convertComponentsToJsonSchema()
    };
    if (operation.parameters) {
      for (const param of operation.parameters) {
        const paramObj = this.resolveParameter(param);
        if (paramObj && paramObj.schema) {
          const paramSchema = this.convertOpenApiSchemaToJsonSchema(paramObj.schema, /* @__PURE__ */ new Set());
          if (paramObj.description) {
            paramSchema.description = paramObj.description;
          }
          schema.properties[paramObj.name] = paramSchema;
          if (paramObj.required) {
            schema.required.push(paramObj.name);
          }
        }
      }
    }
    if (operation.requestBody) {
      const bodyObj = this.resolveRequestBody(operation.requestBody);
      if (bodyObj?.content) {
        if (bodyObj.content["application/json"]?.schema) {
          const bodySchema = this.convertOpenApiSchemaToJsonSchema(bodyObj.content["application/json"].schema, /* @__PURE__ */ new Set());
          if (bodySchema.type === "object" && bodySchema.properties) {
            for (const [name, propSchema] of Object.entries(bodySchema.properties)) {
              schema.properties[name] = propSchema;
            }
            if (bodySchema.required) {
              schema.required.push(...bodySchema.required);
            }
          }
        }
      }
    }
    return schema;
  }
  isOperation(method, operation) {
    return ["get", "post", "put", "delete", "patch"].includes(method.toLowerCase());
  }
  isParameterObject(param) {
    return !("$ref" in param);
  }
  isRequestBodyObject(body) {
    return !("$ref" in body);
  }
  resolveParameter(param) {
    if (this.isParameterObject(param)) {
      return param;
    } else {
      const resolved = this.internalResolveRef(param.$ref, /* @__PURE__ */ new Set());
      if (resolved && resolved.name) {
        return resolved;
      }
    }
    return null;
  }
  resolveRequestBody(body) {
    if (this.isRequestBodyObject(body)) {
      return body;
    } else {
      const resolved = this.internalResolveRef(body.$ref, /* @__PURE__ */ new Set());
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  resolveResponse(response) {
    if ("$ref" in response) {
      const resolved = this.internalResolveRef(response.$ref, /* @__PURE__ */ new Set());
      if (resolved) {
        return resolved;
      } else {
        return null;
      }
    }
    return response;
  }
  convertOperationToMCPMethod(operation, method, path) {
    if (!operation.operationId) {
      console.warn(`Operation without operationId at ${method} ${path}`);
      return null;
    }
    const methodName = operation.operationId;
    const inputSchema = {
      $defs: this.convertComponentsToJsonSchema(),
      type: "object",
      properties: {},
      required: []
    };
    if (operation.parameters) {
      for (const param of operation.parameters) {
        const paramObj = this.resolveParameter(param);
        if (paramObj && paramObj.schema) {
          const schema = this.convertOpenApiSchemaToJsonSchema(paramObj.schema, /* @__PURE__ */ new Set(), false);
          if (paramObj.description) {
            schema.description = paramObj.description;
          }
          inputSchema.properties[paramObj.name] = schema;
          if (paramObj.required) {
            inputSchema.required.push(paramObj.name);
          }
        }
      }
    }
    if (operation.requestBody) {
      const bodyObj = this.resolveRequestBody(operation.requestBody);
      if (bodyObj?.content) {
        if (bodyObj.content["multipart/form-data"]?.schema) {
          const formSchema = this.convertOpenApiSchemaToJsonSchema(bodyObj.content["multipart/form-data"].schema, /* @__PURE__ */ new Set(), false);
          if (formSchema.type === "object" && formSchema.properties) {
            for (const [name, propSchema] of Object.entries(formSchema.properties)) {
              inputSchema.properties[name] = propSchema;
            }
            if (formSchema.required) {
              inputSchema.required.push(...formSchema.required);
            }
          }
        } else if (bodyObj.content["application/json"]?.schema) {
          const bodySchema = this.convertOpenApiSchemaToJsonSchema(bodyObj.content["application/json"].schema, /* @__PURE__ */ new Set(), false);
          if (bodySchema.type === "object" && bodySchema.properties) {
            for (const [name, propSchema] of Object.entries(bodySchema.properties)) {
              inputSchema.properties[name] = propSchema;
            }
            if (bodySchema.required) {
              inputSchema.required.push(...bodySchema.required);
            }
          } else {
            inputSchema.properties["body"] = bodySchema;
            inputSchema.required.push("body");
          }
        }
      }
    }
    let description = operation.summary || operation.description || "";
    if (operation.responses) {
      const errorResponses = Object.entries(operation.responses).filter(([code]) => code.startsWith("4") || code.startsWith("5")).map(([code, response]) => {
        const responseObj = this.resolveResponse(response);
        let errorDesc = responseObj?.description || "";
        return `${code}: ${errorDesc}`;
      });
      if (errorResponses.length > 0) {
        description += "\nError Responses:\n" + errorResponses.join("\n");
      }
    }
    const returnSchema = this.extractResponseType(operation.responses);
    try {
      return {
        name: methodName,
        description,
        inputSchema,
        ...returnSchema ? { returnSchema } : {}
      };
    } catch (error) {
      console.warn(`Failed to generate Zod schema for ${methodName}:`, error);
      return {
        name: methodName,
        description,
        inputSchema,
        ...returnSchema ? { returnSchema } : {}
      };
    }
  }
  extractResponseType(responses) {
    const successResponse = responses?.["200"] || responses?.["201"] || responses?.["202"] || responses?.["204"];
    if (!successResponse) return null;
    const responseObj = this.resolveResponse(successResponse);
    if (!responseObj || !responseObj.content) return null;
    if (responseObj.content["application/json"]?.schema) {
      const returnSchema = this.convertOpenApiSchemaToJsonSchema(responseObj.content["application/json"].schema, /* @__PURE__ */ new Set(), false);
      returnSchema["$defs"] = this.convertComponentsToJsonSchema();
      if (responseObj.description && !returnSchema.description) {
        returnSchema.description = responseObj.description;
      }
      return returnSchema;
    }
    if (responseObj.content["image/png"] || responseObj.content["image/jpeg"]) {
      return { type: "string", format: "binary", description: responseObj.description || "" };
    }
    return { type: "string", description: responseObj.description || "" };
  }
  ensureUniqueName(name) {
    if (name.length <= 64) {
      return name;
    }
    const truncatedName = name.slice(0, 64 - 5);
    const uniqueSuffix = this.generateUniqueSuffix();
    return `${truncatedName}-${uniqueSuffix}`;
  }
  generateUniqueSuffix() {
    this.nameCounter += 1;
    return this.nameCounter.toString().padStart(4, "0");
  }
};

// src/openapi-mcp-server/client/http-client.ts
var import_openapi_client_axios = __toESM(require("openapi-client-axios"), 1);
var import_form_data = __toESM(require("form-data"), 1);
var import_fs = __toESM(require("fs"), 1);

// src/openapi-mcp-server/client/polyfill-headers.ts
var PolyfillHeaders = class {
  constructor(init) {
    this.headers = /* @__PURE__ */ new Map();
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
    return this.headers.get(key).join(", ");
  }
};
var GlobalHeaders = typeof global !== "undefined" && "Headers" in global ? global.Headers : void 0;
var Headers = GlobalHeaders || PolyfillHeaders;

// src/openapi-mcp-server/openapi/file-upload.ts
function isFileUploadParameter(operation) {
  const fileParams = [];
  if (!operation.requestBody) return fileParams;
  const requestBody = operation.requestBody;
  const content = requestBody.content || {};
  const multipartContent = content["multipart/form-data"];
  if (!multipartContent?.schema) return fileParams;
  const schema = multipartContent.schema;
  if (schema.type !== "object" || !schema.properties) return fileParams;
  Object.entries(schema.properties).forEach(([propName, prop]) => {
    const schemaProp = prop;
    if (schemaProp.type === "string" && schemaProp.format === "binary") {
      fileParams.push(propName);
    }
    if (schemaProp.type === "array" && schemaProp.items) {
      const itemSchema = schemaProp.items;
      if (itemSchema.type === "string" && itemSchema.format === "binary") {
        fileParams.push(propName);
      }
    }
  });
  return fileParams;
}

// src/openapi-mcp-server/client/http-client.ts
var HttpClientError = class extends Error {
  constructor(message, status, data, headers) {
    super(`${status} ${message}`);
    this.status = status;
    this.data = data;
    this.headers = headers;
    this.name = "HttpClientError";
  }
};
var HttpClient = class {
  constructor(config, openApiSpec) {
    this.client = new (import_openapi_client_axios.default.default ?? import_openapi_client_axios.default)({
      definition: openApiSpec,
      axiosConfigDefaults: {
        baseURL: config.baseUrl,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "notion-mcp-server",
          ...config.headers
        }
      }
    });
    this.api = this.client.init();
  }
  async prepareFileUpload(operation, params) {
    const fileParams = isFileUploadParameter(operation);
    if (fileParams.length === 0) return null;
    const formData = new import_form_data.default();
    for (const param of fileParams) {
      let addFile2 = function(name, filePath2) {
        try {
          const fileStream = import_fs.default.createReadStream(filePath2);
          formData.append(name, fileStream);
        } catch (error) {
          throw new Error(`Failed to read file at ${filePath2}: ${error}`);
        }
      };
      var addFile = addFile2;
      const filePath = params[param];
      if (!filePath) {
        throw new Error(`File path must be provided for parameter: ${param}`);
      }
      switch (typeof filePath) {
        case "string":
          addFile2(param, filePath);
          break;
        case "object":
          if (Array.isArray(filePath)) {
            let fileCount = 0;
            for (const file of filePath) {
              addFile2(param, file);
              fileCount++;
            }
            break;
          }
        //deliberate fallthrough
        default:
          throw new Error(`Unsupported file type: ${typeof filePath}`);
      }
    }
    for (const [key, value] of Object.entries(params)) {
      if (!fileParams.includes(key)) {
        formData.append(key, value);
      }
    }
    return formData;
  }
  /**
   * Execute an OpenAPI operation
   */
  async executeOperation(operation, params = {}) {
    const api = await this.api;
    const operationId = operation.operationId;
    if (!operationId) {
      throw new Error("Operation ID is required");
    }
    const formData = await this.prepareFileUpload(operation, params);
    const urlParameters = {};
    const bodyParams = formData || { ...params };
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if ("name" in param && param.name && param.in) {
          if (param.in === "path" || param.in === "query") {
            if (params[param.name] !== void 0) {
              urlParameters[param.name] = params[param.name];
              if (!formData) {
                delete bodyParams[param.name];
              }
            }
          }
        }
      }
    }
    if (!operation.requestBody && !formData) {
      for (const key in bodyParams) {
        if (bodyParams[key] !== void 0) {
          urlParameters[key] = bodyParams[key];
          delete bodyParams[key];
        }
      }
    }
    const operationFn = api[operationId];
    if (!operationFn) {
      throw new Error(`Operation ${operationId} not found`);
    }
    try {
      const hasBody = Object.keys(bodyParams).length > 0;
      const headers = formData ? formData.getHeaders() : { ...hasBody ? { "Content-Type": "application/json" } : { "Content-Type": null } };
      const requestConfig = {
        headers: {
          ...headers
        }
      };
      const response = await operationFn(urlParameters, hasBody ? bodyParams : void 0, requestConfig);
      const responseHeaders = new Headers();
      Object.entries(response.headers).forEach(([key, value]) => {
        if (value) responseHeaders.append(key, value.toString());
      });
      return {
        data: response.data,
        status: response.status,
        headers: responseHeaders
      };
    } catch (error) {
      if (error.response) {
        console.error("Error in http client", error);
        const headers = new Headers();
        Object.entries(error.response.headers).forEach(([key, value]) => {
          if (value) headers.append(key, value.toString());
        });
        throw new HttpClientError(error.response.statusText || "Request failed", error.response.status, error.response.data, headers);
      }
      throw error;
    }
  }
};

// src/openapi-mcp-server/mcp/proxy.ts
var MCPProxy = class {
  constructor(name, openApiSpec, accessToken) {
    this.server = new import_server.Server({ name, version: "1.0.0" }, { capabilities: { tools: {} } });
    const baseUrl = openApiSpec.servers?.[0].url;
    if (!baseUrl) {
      throw new Error("No base URL found in OpenAPI spec");
    }
    this.httpClient = new HttpClient(
      {
        baseUrl,
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28"
        }
      },
      openApiSpec
    );
    const converter = new OpenAPIToMCPConverter(openApiSpec);
    const { tools, openApiLookup } = converter.convertToMCPTools();
    this.tools = tools;
    this.openApiLookup = openApiLookup;
    this.setupHandlers();
  }
  setupHandlers() {
    this.server.setRequestHandler(import_types.ListToolsRequestSchema, async () => {
      const tools = [];
      Object.entries(this.tools).forEach(([toolName, def]) => {
        def.methods.forEach((method) => {
          const toolNameWithMethod = `${toolName}-${method.name}`;
          const truncatedToolName = this.truncateToolName(toolNameWithMethod);
          tools.push({
            name: truncatedToolName,
            description: method.description,
            inputSchema: method.inputSchema
          });
        });
      });
      return { tools };
    });
    this.server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
      const { name, arguments: params } = request.params;
      const operation = this.findOperation(name);
      if (!operation) {
        throw new Error(`Method ${name} not found`);
      }
      try {
        const response = await this.httpClient.executeOperation(operation, params);
        return {
          content: [
            {
              type: "text",
              // currently this is the only type that seems to be used by mcp server
              text: JSON.stringify(response.data)
              // TODO: pass through the http status code text?
            }
          ]
        };
      } catch (error) {
        console.error("Error in tool call", error);
        if (error instanceof HttpClientError) {
          console.error("HttpClientError encountered, returning structured error", error);
          const data = error.data?.response?.data ?? error.data ?? {};
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "error",
                  // TODO: get this from http status code?
                  ...typeof data === "object" ? data : { data }
                })
              }
            ]
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
      if (typeof headers !== "object" || headers === null) {
        console.warn("OPENAPI_MCP_HEADERS environment variable must be a JSON object, got:", typeof headers);
        return {};
      }
      return headers;
    } catch (error) {
      console.warn("Failed to parse OPENAPI_MCP_HEADERS environment variable:", error);
      return {};
    }
  }
  getContentType(headers) {
    const contentType = headers.get("content-type");
    if (!contentType) return "binary";
    if (contentType.includes("text") || contentType.includes("json")) {
      return "text";
    } else if (contentType.includes("image")) {
      return "image";
    }
    return "binary";
  }
  truncateToolName(name) {
    if (name.length <= 64) {
      return name;
    }
    return name.slice(0, 64);
  }
  async connect(transport) {
    await this.server.connect(transport);
  }
  getServer() {
    return this.server;
  }
};

// src/notion-openapi.ts
var NotionOpenAPISpec = {
  "openapi": "3.1.0",
  "info": {
    "title": "Notion API",
    "version": "1"
  },
  "servers": [
    {
      "url": "https://api.notion.com"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer"
      },
      "basicAuth": {
        "type": "http",
        "scheme": "basic"
      }
    },
    "parameters": {},
    "schemas": {}
  },
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/v1/users/{user_id}": {
      "get": {
        "summary": "Retrieve a user",
        "description": "",
        "operationId": "get-user",
        "parameters": [
          {
            "name": "user_id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": '{\n  "object": "user",\n  "id": "d40e767c-d7af-4b18-a86d-55c61f1e39a4",\n  "type": "person",\n	"person": {\n		"email": "avo@example.org",\n	},\n  "name": "Avocado Lovelace",\n  "avatar_url": "https://secure.notion-static.com/e6a352a8-8381-44d0-a1dc-9ed80e62b53d.jpg",\n}'
                  }
                }
              }
            }
          },
          "400": {
            "description": "400",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": "{}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {}
                }
              }
            }
          }
        },
        "deprecated": false,
        "security": []
      }
    },
    "/v1/users": {
      "get": {
        "summary": "List all users",
        "operationId": "get-users",
        "parameters": [
          {
            "name": "start_cursor",
            "in": "query",
            "description": "If supplied, this endpoint will return a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "The number of items from the full list desired in the response. Maximum: 100",
            "schema": {
              "type": "integer",
              "default": 100
            }
          }
        ],
        "responses": {
          "400": {
            "description": "400",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": "{}"
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {}
                }
              }
            }
          }
        },
        "deprecated": false
      }
    },
    "/v1/users/me": {
      "get": {
        "summary": "Retrieve your token's bot user",
        "description": "",
        "operationId": "get-self",
        "parameters": [],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": '{\n  "object": "user",\n  "id": "16d84278-ab0e-484c-9bdd-b35da3bd8905",\n  "name": "pied piper",\n  "avatar_url": null,\n  "type": "bot",\n  "bot": {\n    "owner": {\n      "type": "user",\n      "user": {\n        "object": "user",\n        "id": "5389a034-eb5c-47b5-8a9e-f79c99ef166c",\n        "name": "christine makenotion",\n        "avatar_url": null,\n        "type": "person",\n        "person": {\n          "email": "christine@makenotion.com"\n        }\n      }\n    }\n  }\n}'
                  }
                },
                "schema": {
                  "type": "object",
                  "properties": {
                    "object": {
                      "type": "string",
                      "example": "user"
                    },
                    "id": {
                      "type": "string",
                      "example": "16d84278-ab0e-484c-9bdd-b35da3bd8905"
                    },
                    "name": {
                      "type": "string",
                      "example": "pied piper"
                    },
                    "avatar_url": {},
                    "type": {
                      "type": "string",
                      "example": "bot"
                    },
                    "bot": {
                      "type": "object",
                      "properties": {
                        "owner": {
                          "type": "object",
                          "properties": {
                            "type": {
                              "type": "string",
                              "example": "user"
                            },
                            "user": {
                              "type": "object",
                              "properties": {
                                "object": {
                                  "type": "string",
                                  "example": "user"
                                },
                                "id": {
                                  "type": "string",
                                  "example": "5389a034-eb5c-47b5-8a9e-f79c99ef166c"
                                },
                                "name": {
                                  "type": "string",
                                  "example": "christine makenotion"
                                },
                                "avatar_url": {},
                                "type": {
                                  "type": "string",
                                  "example": "person"
                                },
                                "person": {
                                  "type": "object",
                                  "properties": {
                                    "email": {
                                      "type": "string",
                                      "example": "christine@makenotion.com"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "deprecated": false,
        "security": []
      }
    },
    "/v1/databases/{database_id}/query": {
      "post": {
        "summary": "Query a database",
        "description": "",
        "operationId": "post-database-query",
        "parameters": [
          {
            "name": "database_id",
            "in": "path",
            "description": "Identifier for a Notion database.",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "name": "filter_properties",
            "in": "query",
            "description": "A list of page property value IDs associated with the database. Use this param to limit the response to a specific page property value or values for pages that meet the `filter` criteria.",
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "filter": {
                    "type": "object",
                    "description": "When supplied, limits which pages are returned based on the [filter conditions](ref:post-database-query-filter).",
                    "or": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "type": "object",
                          "properties": {
                            "property": {
                              "type": "string"
                            },
                            "title": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "rich_text": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "url": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "email": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "phone_number": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "number": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "number"
                                },
                                "does_not_equal": {
                                  "type": "number"
                                },
                                "contains": {
                                  "type": "number"
                                },
                                "does_not_contain": {
                                  "type": "number"
                                },
                                "starts_with": {
                                  "type": "number"
                                },
                                "ends_with": {
                                  "type": "number"
                                }
                              }
                            },
                            "checkbox": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "boolean"
                                },
                                "does_not_equal": {
                                  "type": "boolean"
                                }
                              }
                            },
                            "select": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                }
                              }
                            },
                            "multi_select": {
                              "type": "object",
                              "properties": {
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                }
                              }
                            },
                            "status": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                }
                              }
                            },
                            "date": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "after": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_after": {
                                  "type": "string",
                                  "format": "date"
                                }
                              }
                            },
                            "created_time": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "after": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_after": {
                                  "type": "string",
                                  "format": "date"
                                }
                              }
                            },
                            "last_edited_time": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "after": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_after": {
                                  "type": "string",
                                  "format": "date"
                                }
                              }
                            }
                          }
                        }
                      },
                      "maxItems": 100
                    },
                    "and": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "type": "object",
                          "properties": {
                            "property": {
                              "type": "string"
                            },
                            "title": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "rich_text": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "url": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "email": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "phone_number": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                },
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                },
                                "starts_with": {
                                  "type": "string"
                                },
                                "ends_with": {
                                  "type": "string"
                                }
                              }
                            },
                            "number": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "number"
                                },
                                "does_not_equal": {
                                  "type": "number"
                                },
                                "contains": {
                                  "type": "number"
                                },
                                "does_not_contain": {
                                  "type": "number"
                                },
                                "starts_with": {
                                  "type": "number"
                                },
                                "ends_with": {
                                  "type": "number"
                                }
                              }
                            },
                            "checkbox": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "boolean"
                                },
                                "does_not_equal": {
                                  "type": "boolean"
                                }
                              }
                            },
                            "select": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                }
                              }
                            },
                            "multi_select": {
                              "type": "object",
                              "properties": {
                                "contains": {
                                  "type": "string"
                                },
                                "does_not_contain": {
                                  "type": "string"
                                }
                              }
                            },
                            "status": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string"
                                },
                                "does_not_equal": {
                                  "type": "string"
                                }
                              }
                            },
                            "date": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "after": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_after": {
                                  "type": "string",
                                  "format": "date"
                                }
                              }
                            },
                            "created_time": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "after": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_after": {
                                  "type": "string",
                                  "format": "date"
                                }
                              }
                            },
                            "last_edited_time": {
                              "type": "object",
                              "properties": {
                                "equals": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "after": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_before": {
                                  "type": "string",
                                  "format": "date"
                                },
                                "on_or_after": {
                                  "type": "string",
                                  "format": "date"
                                }
                              }
                            }
                          }
                        }
                      },
                      "maxItems": 100
                    }
                  },
                  "sorts": {
                    "type": "array",
                    "description": "When supplied, orders the results based on the provided [sort criteria](ref:post-database-query-sort).",
                    "items": {
                      "type": "object",
                      "required": [
                        "property",
                        "direction"
                      ],
                      "properties": {
                        "property": {
                          "type": "string"
                        },
                        "direction": {
                          "enum": [
                            "ascending",
                            "descending"
                          ],
                          "type": "string"
                        }
                      }
                    }
                  },
                  "start_cursor": {
                    "type": "string",
                    "description": "When supplied, returns a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results."
                  },
                  "page_size": {
                    "type": "integer",
                    "description": "The number of items from the full list desired in the response. Maximum: 100",
                    "default": 100
                  },
                  "archived": {
                    "type": "boolean"
                  },
                  "in_trash": {
                    "type": "boolean"
                  }
                }
              }
            }
          }
        },
        "responses": {},
        "deprecated": false,
        "security": []
      }
    },
    "/v1/search": {
      "post": {
        "summary": "Search by title",
        "description": "",
        "operationId": "post-search",
        "parameters": [],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "query": {
                    "type": "string",
                    "description": "The text that the API compares page and database titles against."
                  },
                  "sort": {
                    "type": "object",
                    "description": 'A set of criteria, `direction` and `timestamp` keys, that orders the results. The **only** supported timestamp value is `"last_edited_time"`. Supported `direction` values are `"ascending"` and `"descending"`. If `sort` is not provided, then the most recently edited results are returned first.',
                    "properties": {
                      "direction": {
                        "type": "string",
                        "description": "The direction to sort. Possible values include `ascending` and `descending`."
                      },
                      "timestamp": {
                        "type": "string",
                        "description": "The name of the timestamp to sort against. Possible values include `last_edited_time`."
                      }
                    }
                  },
                  "filter": {
                    "type": "object",
                    "description": 'A set of criteria, `value` and `property` keys, that limits the results to either only pages or only databases. Possible `value` values are `"page"` or `"database"`. The only supported `property` value is `"object"`.',
                    "properties": {
                      "value": {
                        "type": "string",
                        "description": "The value of the property to filter the results by.  Possible values for object type include `page` or `database`.  **Limitation**: Currently the only filter allowed is `object` which will filter by type of object (either `page` or `database`)"
                      },
                      "property": {
                        "type": "string",
                        "description": "The name of the property to filter by. Currently the only property you can filter by is the object type.  Possible values include `object`.   Limitation: Currently the only filter allowed is `object` which will filter by type of object (either `page` or `database`)"
                      }
                    }
                  },
                  "start_cursor": {
                    "type": "string",
                    "description": "A `cursor` value returned in a previous response that If supplied, limits the response to results starting after the `cursor`. If not supplied, then the first page of results is returned. Refer to [pagination](https://developers.notion.com/reference/intro#pagination) for more details."
                  },
                  "page_size": {
                    "type": "integer",
                    "description": "The number of items from the full list to include in the response. Maximum: `100`.",
                    "default": 100,
                    "format": "int32"
                  }
                }
              }
            }
          }
        },
        "responses": {},
        "deprecated": false,
        "security": []
      }
    },
    "/v1/blocks/{block_id}/children": {
      "get": {
        "summary": "Retrieve block children",
        "description": "",
        "operationId": "get-block-children",
        "parameters": [
          {
            "name": "block_id",
            "in": "path",
            "description": "Identifier for a [block](ref:block)",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "name": "start_cursor",
            "in": "query",
            "description": "If supplied, this endpoint will return a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "The number of items from the full list desired in the response. Maximum: 100",
            "schema": {
              "type": "integer",
              "format": "int32",
              "default": 100
            }
          }
        ],
        "responses": {},
        "deprecated": false,
        "security": []
      },
      "patch": {
        "summary": "Append block children",
        "description": "",
        "operationId": "patch-block-children",
        "parameters": [
          {
            "name": "block_id",
            "in": "path",
            "description": "Identifier for a [block](ref:block). Also accepts a [page](ref:page) ID.",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "children"
                ],
                "properties": {
                  "children": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "paragraph": {
                          "type": "object",
                          "properties": {
                            "rich_text": {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "properties": {
                                  "text": {
                                    "type": "object",
                                    "properties": {
                                      "content": {
                                        "type": "string",
                                        "maxLength": 2e3
                                      },
                                      "link": {
                                        "type": [
                                          "object",
                                          "null"
                                        ],
                                        "properties": {
                                          "url": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "url"
                                        ]
                                      }
                                    },
                                    "additionalProperties": false,
                                    "required": [
                                      "content"
                                    ]
                                  },
                                  "type": {
                                    "enum": [
                                      "text"
                                    ],
                                    "type": "string"
                                  }
                                },
                                "additionalProperties": false,
                                "required": [
                                  "text"
                                ]
                              },
                              "maxItems": 100
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "rich_text"
                          ]
                        },
                        "bulleted_list_item": {
                          "type": "object",
                          "properties": {
                            "rich_text": {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "properties": {
                                  "text": {
                                    "type": "object",
                                    "properties": {
                                      "content": {
                                        "type": "string",
                                        "maxLength": 2e3
                                      },
                                      "link": {
                                        "type": [
                                          "object",
                                          "null"
                                        ],
                                        "properties": {
                                          "url": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "url"
                                        ]
                                      }
                                    },
                                    "additionalProperties": false,
                                    "required": [
                                      "content"
                                    ]
                                  },
                                  "type": {
                                    "enum": [
                                      "text"
                                    ],
                                    "type": "string"
                                  }
                                },
                                "additionalProperties": false,
                                "required": [
                                  "text"
                                ]
                              },
                              "maxItems": 100
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "rich_text"
                          ]
                        },
                        "type": {
                          "enum": [
                            "paragraph",
                            "bulleted_list_item"
                          ],
                          "type": "string"
                        }
                      },
                      "additionalProperties": false
                    },
                    "description": "Child content to append to a container block as an array of [block objects](ref:block)"
                  },
                  "after": {
                    "type": "string",
                    "description": "The ID of the existing block that the new block should be appended after."
                  }
                }
              }
            }
          }
        },
        "responses": {},
        "deprecated": false,
        "security": []
      }
    },
    "/v1/blocks/{block_id}": {
      "get": {
        "summary": "Retrieve a block",
        "description": "",
        "operationId": "retrieve-a-block",
        "parameters": [
          {
            "name": "block_id",
            "in": "path",
            "description": "Identifier for a Notion block",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ],
        "responses": {},
        "deprecated": false,
        "security": []
      },
      "patch": {
        "summary": "Update a block",
        "description": "",
        "operationId": "update-a-block",
        "parameters": [
          {
            "name": "block_id",
            "in": "path",
            "description": "Identifier for a Notion block",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "object",
                    "description": "The [block object `type`](ref:block#block-object-keys) value with the properties to be updated. Currently only `text` (for supported block types) and `checked` (for `to_do` blocks) fields can be updated.",
                    "properties": {}
                  },
                  "archived": {
                    "type": "boolean",
                    "description": "Set to true to archive (delete) a block. Set to false to un-archive (restore) a block.",
                    "default": true
                  }
                }
              }
            }
          }
        },
        "responses": {},
        "deprecated": false,
        "security": []
      },
      "delete": {
        "summary": "Delete a block",
        "description": "",
        "operationId": "delete-a-block",
        "parameters": [
          {
            "name": "block_id",
            "in": "path",
            "description": "Identifier for a Notion block",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ],
        "responses": {},
        "deprecated": false,
        "security": []
      }
    },
    "/v1/pages/{page_id}": {
      "get": {
        "summary": "Retrieve a page",
        "description": "",
        "operationId": "retrieve-a-page",
        "parameters": [
          {
            "name": "page_id",
            "in": "path",
            "description": "Identifier for a Notion page",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "name": "filter_properties",
            "in": "query",
            "description": "A list of page property value IDs associated with the page. Use this param to limit the response to a specific page property value or values. To retrieve multiple properties, specify each page property ID. For example: `?filter_properties=iAk8&filter_properties=b7dh`.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {},
        "deprecated": false,
        "security": []
      },
      "patch": {
        "summary": "Update page properties",
        "description": "",
        "operationId": "patch-page",
        "parameters": [
          {
            "name": "page_id",
            "in": "path",
            "description": "The identifier for the Notion page to be updated.",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "properties": {
                    "description": "The property values to update for the page. The keys are the names or IDs of the property and the values are property values. If a page property ID is not included, then it is not changed.",
                    "type": "object",
                    "properties": {
                      "title": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "text": {
                              "type": "object",
                              "properties": {
                                "content": {
                                  "type": "string",
                                  "maxLength": 2e3
                                },
                                "link": {
                                  "type": [
                                    "object",
                                    "null"
                                  ],
                                  "properties": {
                                    "url": {
                                      "type": "string"
                                    }
                                  },
                                  "required": [
                                    "url"
                                  ]
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "content"
                              ]
                            },
                            "type": {
                              "enum": [
                                "text"
                              ],
                              "type": "string"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "text"
                          ]
                        },
                        "maxItems": 100
                      },
                      "type": {
                        "enum": [
                          "title"
                        ],
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "title"
                    ]
                  },
                  "in_trash": {
                    "type": "boolean",
                    "description": "Set to true to delete a block. Set to false to restore a block.",
                    "default": false
                  },
                  "archived": {
                    "type": "boolean"
                  },
                  "icon": {
                    "description": "A page icon for the page. Supported types are [external file object](https://developers.notion.com/reference/file-object) or [emoji object](https://developers.notion.com/reference/emoji-object).",
                    "type": "object",
                    "properties": {
                      "emoji": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "emoji"
                    ]
                  },
                  "cover": {
                    "type": "object",
                    "description": "A cover image for the page. Only [external file objects](https://developers.notion.com/reference/file-object) are supported.",
                    "properties": {
                      "external": {
                        "type": "object",
                        "properties": {
                          "url": {
                            "type": "string"
                          }
                        },
                        "additionalProperties": false,
                        "required": [
                          "url"
                        ]
                      },
                      "type": {
                        "enum": [
                          "external"
                        ],
                        "type": "string"
                      }
                    },
                    "required": [
                      "external"
                    ],
                    "additionalProperties": false
                  }
                }
              }
            }
          }
        },
        "responses": {},
        "deprecated": false,
        "security": []
      }
    },
    "/v1/pages": {
      "post": {
        "summary": "Create a page",
        "description": "",
        "operationId": "post-page",
        "parameters": [],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "parent",
                  "properties"
                ],
                "properties": {
                  "parent": {
                    "type": "object",
                    "properties": {
                      "page_id": {
                        "type": "string",
                        "format": "uuid"
                      }
                    },
                    "required": [
                      "page_id"
                    ]
                  },
                  "properties": {
                    "type": "object",
                    "properties": {
                      "title": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "required": [
                            "text"
                          ],
                          "properties": {
                            "text": {
                              "type": "object",
                              "required": [
                                "content"
                              ],
                              "properties": {
                                "content": {
                                  "type": "string",
                                  "maxLength": 2e3
                                }
                              }
                            }
                          }
                        },
                        "maxItems": 100
                      },
                      "type": {
                        "enum": [
                          "title"
                        ],
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "title"
                    ]
                  },
                  "children": {
                    "type": "array",
                    "description": "The content to be rendered on the new page, represented as an array of [block objects](https://developers.notion.com/reference/block).",
                    "items": {
                      "type": "string"
                    }
                  },
                  "icon": {
                    "type": "string",
                    "description": "The icon of the new page. Either an [emoji object](https://developers.notion.com/reference/emoji-object) or an [external file object](https://developers.notion.com/reference/file-object)..",
                    "format": "json"
                  },
                  "cover": {
                    "type": "string",
                    "description": "The cover image of the new page, represented as a [file object](https://developers.notion.com/reference/file-object).",
                    "format": "json"
                  }
                }
              }
            }
          }
        },
        "responses": {},
        "deprecated": false,
        "security": []
      }
    },
    "/v1/databases": {
      "post": {
        "summary": "Create a database",
        "description": "",
        "operationId": "create-a-database",
        "parameters": [],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "parent",
                  "properties"
                ],
                "properties": {
                  "parent": {
                    "type": "object",
                    "properties": {
                      "type": {
                        "enum": [
                          "page_id"
                        ],
                        "type": "string"
                      },
                      "page_id": {
                        "type": "string",
                        "format": "uuid"
                      }
                    },
                    "required": [
                      "type",
                      "page_id"
                    ]
                  },
                  "properties": {
                    "type": "object",
                    "description": "Property schema of database. The keys are the names of properties as they appear in Notion and the values are [property schema objects](https://developers.notion.com/reference/property-schema-object).",
                    "additionalProperties": {
                      "oneOf": [
                        {
                          "type": "object",
                          "properties": {
                            "title": {
                              "type": "object",
                              "properties": {},
                              "additionalProperties": false
                            },
                            "description": {
                              "type": "string",
                              "maxLength": 280,
                              "minLength": 1
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "title"
                          ]
                        }
                      ]
                    }
                  },
                  "title": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "text"
                      ],
                      "properties": {
                        "text": {
                          "type": "object",
                          "properties": {
                            "content": {
                              "type": "string",
                              "maxLength": 2e3
                            },
                            "link": {
                              "type": [
                                "object",
                                "null"
                              ],
                              "properties": {
                                "url": {
                                  "type": "string"
                                }
                              },
                              "required": [
                                "url"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "content"
                          ]
                        },
                        "type": {
                          "enum": [
                            "text"
                          ],
                          "type": "string"
                        }
                      },
                      "additionalProperties": false
                    },
                    "maxItems": 100
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": `{
    "object": "database",
    "id": "bc1211ca-e3f1-4939-ae34-5260b16f627c",
    "created_time": "2021-07-08T23:50:00.000Z",
    "last_edited_time": "2021-07-08T23:50:00.000Z",
    "icon": {
        "type": "emoji",
        "emoji": "\u{1F389}"
    },
    "cover": {
        "type": "external",
        "external": {
            "url": "https://website.domain/images/image.png"
        }
    },
    "url": "https://www.notion.so/bc1211cae3f14939ae34260b16f627c",
    "title": [
        {
            "type": "text",
            "text": {
                "content": "Grocery List",
                "link": null
            },
            "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
            },
            "plain_text": "Grocery List",
            "href": null
        }
    ],
    "properties": {
        "+1": {
            "id": "Wp%3DC",
            "name": "+1",
            "type": "people",
            "people": {}
        },
        "In stock": {
            "id": "fk%5EY",
            "name": "In stock",
            "type": "checkbox",
            "checkbox": {}
        },
        "Price": {
            "id": "evWq",
            "name": "Price",
            "type": "number",
            "number": {
                "format": "dollar"
            }
        },
        "Description": {
            "id": "V}lX",
            "name": "Description",
            "type": "rich_text",
            "rich_text": {}
        },
        "Last ordered": {
            "id": "eVnV",
            "name": "Last ordered",
            "type": "date",
            "date": {}
        },
        "Meals": {
            "id": "%7DWA~",
            "name": "Meals",
            "type": "relation",
            "relation": {
                "database_id": "668d797c-76fa-4934-9b05-ad288df2d136",
                "single_property": {}
            }
        },
        "Number of meals": {
            "id": "Z\\\\Eh",
            "name": "Number of meals",
            "type": "rollup",
            "rollup": {
                "rollup_property_name": "Name",
                "relation_property_name": "Meals",
                "rollup_property_id": "title",
                "relation_property_id": "mxp^",
                "function": "count"
            }
        },
        "Store availability": {
            "id": "s}Kq",
            "name": "Store availability",
            "type": "multi_select",
            "multi_select": {
                "options": [
                    {
                        "id": "cb79b393-d1c1-4528-b517-c450859de766",
                        "name": "Duc Loi Market",
                        "color": "blue"
                    },
                    {
                        "id": "58aae162-75d4-403b-a793-3bc7308e4cd2",
                        "name": "Rainbow Grocery",
                        "color": "gray"
                    },
                    {
                        "id": "22d0f199-babc-44ff-bd80-a9eae3e3fcbf",
                        "name": "Nijiya Market",
                        "color": "purple"
                    },
                    {
                        "id": "0d069987-ffb0-4347-bde2-8e4068003dbc",
                        "name": "Gus's Community Market",
                        "color": "yellow"
                    }
                ]
            }
        },
        "Photo": {
            "id": "yfiK",
            "name": "Photo",
            "type": "files",
            "files": {}
        },
        "Food group": {
            "id": "CM%3EH",
            "name": "Food group",
            "type": "select",
            "select": {
                "options": [
                    {
                        "id": "6d4523fa-88cb-4ffd-9364-1e39d0f4e566",
                        "name": "\u{1F966}Vegetable",
                        "color": "green"
                    },
                    {
                        "id": "268d7e75-de8f-4c4b-8b9d-de0f97021833",
                        "name": "\u{1F34E}Fruit",
                        "color": "red"
                    },
                    {
                        "id": "1b234a00-dc97-489c-b987-829264cfdfef",
                        "name": "\u{1F4AA}Protein",
                        "color": "yellow"
                    }
                ]
            }
        },
        "Name": {
            "id": "title",
            "name": "Name",
            "type": "title",
            "title": {}
        }
    },
    "parent": {
        "type": "page_id",
        "page_id": "98ad959b-2b6a-4774-80ee-00246fb0ea9b"
    },
    "archived": false
}{
    "object": "database",
    "id": "bc1211ca-e3f1-4939-ae34-5260b16f627c",
    "created_time": "2021-07-08T23:50:00.000Z",
    "last_edited_time": "2021-07-08T23:50:00.000Z",
    "icon": {
        "type": "emoji",
        "emoji": "\u{1F389}"
    },
    "cover": {
        "type": "external",
        "external": {
            "url": "https://website.domain/images/image.png"
        }
    },
    "url": "https://www.notion.so/bc1211cae3f14939ae34260b16f627c",
    "title": [
        {
            "type": "text",
            "text": {
                "content": "Grocery List",
                "link": null
            },
            "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
            },
            "plain_text": "Grocery List",
            "href": null
        }
    ],
    "properties": {
        "+1": {
            "id": "Wp%3DC",
            "name": "+1",
            "type": "people",
            "people": {}
        },
        "In stock": {
            "id": "fk%5EY",
            "name": "In stock",
            "type": "checkbox",
            "checkbox": {}
        },
        "Price": {
            "id": "evWq",
            "name": "Price",
            "type": "number",
            "number": {
                "format": "dollar"
            }
        },
        "Description": {
            "id": "V}lX",
            "name": "Description",
            "type": "rich_text",
            "rich_text": {}
        },
        "Last ordered": {
            "id": "eVnV",
            "name": "Last ordered",
            "type": "date",
            "date": {}
        },
        "Meals": {
            "id": "%7DWA~",
            "name": "Meals",
            "type": "relation",
            "relation": {
                "database_id": "668d797c-76fa-4934-9b05-ad288df2d136",
                "synced_property_name": "Related to Grocery List (Meals)"
            }
        },
        "Number of meals": {
            "id": "Z\\\\Eh",
            "name": "Number of meals",
            "type": "rollup",
            "rollup": {
                "rollup_property_name": "Name",
                "relation_property_name": "Meals",
                "rollup_property_id": "title",
                "relation_property_id": "mxp^",
                "function": "count"
            }
        },
        "Store availability": {
            "id": "s}Kq",
            "name": "Store availability",
            "type": "multi_select",
            "multi_select": {
                "options": [
                    {
                        "id": "cb79b393-d1c1-4528-b517-c450859de766",
                        "name": "Duc Loi Market",
                        "color": "blue"
                    },
                    {
                        "id": "58aae162-75d4-403b-a793-3bc7308e4cd2",
                        "name": "Rainbow Grocery",
                        "color": "gray"
                    },
                    {
                        "id": "22d0f199-babc-44ff-bd80-a9eae3e3fcbf",
                        "name": "Nijiya Market",
                        "color": "purple"
                    },
                    {
                        "id": "0d069987-ffb0-4347-bde2-8e4068003dbc",
                        "name": "Gus's Community Market",
                        "color": "yellow"
                    }
                ]
            }
        },
        "Photo": {
            "id": "yfiK",
            "name": "Photo",
            "type": "files",
            "files": {}
        },
        "Food group": {
            "id": "CM%3EH",
            "name": "Food group",
            "type": "select",
            "select": {
                "options": [
                    {
                        "id": "6d4523fa-88cb-4ffd-9364-1e39d0f4e566",
                        "name": "\u{1F966}Vegetable",
                        "color": "green"
                    },
                    {
                        "id": "268d7e75-de8f-4c4b-8b9d-de0f97021833",
                        "name": "\u{1F34E}Fruit",
                        "color": "red"
                    },
                    {
                        "id": "1b234a00-dc97-489c-b987-829264cfdfef",
                        "name": "\u{1F4AA}Protein",
                        "color": "yellow"
                    }
                ]
            }
        },
        "Name": {
            "id": "title",
            "name": "Name",
            "type": "title",
            "title": {}
        }
    },
    "parent": {
        "type": "page_id",
        "page_id": "98ad959b-2b6a-4774-80ee-00246fb0ea9b"
    },
    "archived": false,
    "is_inline": false
}`
                  }
                }
              }
            }
          }
        },
        "deprecated": false,
        "security": []
      }
    },
    "/v1/databases/{database_id}": {
      "patch": {
        "summary": "Update a database",
        "description": "",
        "operationId": "update-a-database",
        "parameters": [
          {
            "name": "database_id",
            "in": "path",
            "description": "identifier for a Notion database",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "title": {
                    "description": "An array of [rich text objects](https://developers.notion.com/reference/rich-text) that represents the title of the database that is displayed in the Notion UI. If omitted, then the database title remains unchanged.",
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "text"
                      ],
                      "properties": {
                        "text": {
                          "type": "object",
                          "properties": {
                            "content": {
                              "type": "string",
                              "maxLength": 2e3
                            },
                            "link": {
                              "type": [
                                "object",
                                "null"
                              ],
                              "properties": {
                                "url": {
                                  "type": "string"
                                }
                              },
                              "required": [
                                "url"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "content"
                          ]
                        },
                        "type": {
                          "enum": [
                            "text"
                          ],
                          "type": "string"
                        }
                      },
                      "additionalProperties": false
                    }
                  },
                  "description": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "text"
                      ],
                      "properties": {
                        "text": {
                          "type": "object",
                          "properties": {
                            "content": {
                              "type": "string",
                              "maxLength": 2e3
                            },
                            "link": {
                              "type": [
                                "object",
                                "null"
                              ],
                              "properties": {
                                "url": {
                                  "type": "string"
                                }
                              },
                              "required": [
                                "url"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "content"
                          ]
                        },
                        "type": {
                          "enum": [
                            "text"
                          ],
                          "type": "string"
                        }
                      },
                      "additionalProperties": false
                    },
                    "maxItems": 100,
                    "description": "An array of [rich text objects](https://developers.notion.com/reference/rich-text) that represents the description of the database that is displayed in the Notion UI. If omitted, then the database description remains unchanged."
                  },
                  "properties": {
                    "type": "object",
                    "description": "Property schema of database. The keys are the names of properties as they appear in Notion and the values are [property schema objects](https://developers.notion.com/reference/property-schema-object).",
                    "properties": {
                      "name": {
                        "type": "string"
                      }
                    }
                  }
                },
                "additionalProperties": false
              }
            }
          }
        },
        "responses": {},
        "deprecated": false,
        "security": []
      },
      "get": {
        "summary": "Retrieve a database",
        "description": "",
        "operationId": "retrieve-a-database",
        "parameters": [
          {
            "name": "database_id",
            "in": "path",
            "description": "An identifier for the Notion database.",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": `{
    "object": "database",
    "id": "bc1211ca-e3f1-4939-ae34-5260b16f627c",
    "created_time": "2021-07-08T23:50:00.000Z",
    "last_edited_time": "2021-07-08T23:50:00.000Z",
    "icon": {
        "type": "emoji",
        "emoji": "\u{1F389}"
    },
    "cover": {
        "type": "external",
        "external": {
            "url": "https://website.domain/images/image.png"
        }
    },
    "url": "https://www.notion.so/bc1211cae3f14939ae34260b16f627c",
    "title": [
        {
            "type": "text",
            "text": {
                "content": "Grocery List",
                "link": null
            },
            "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
            },
            "plain_text": "Grocery List",
            "href": null
        }
    ],
    "description": [
        {
            "type": "text",
            "text": {
                "content": "Grocery list for just kale \u{1F96C}",
                "link": null
            },
            "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
            },
            "plain_text": "Grocery list for just kale \u{1F96C}",
            "href": null
        }
    ],
    "properties": {
        "+1": {
            "id": "Wp%3DC",
            "name": "+1",
            "type": "people",
            "people": {}
        },
        "In stock": {
            "id": "fk%5EY",
            "name": "In stock",
            "type": "checkbox",
            "checkbox": {}
        },
        "Price": {
            "id": "evWq",
            "name": "Price",
            "type": "number",
            "number": {
                "format": "dollar"
            }
        },
        "Description": {
            "id": "V}lX",
            "name": "Description",
            "type": "rich_text",
            "rich_text": {}
        },
        "Last ordered": {
            "id": "eVnV",
            "name": "Last ordered",
            "type": "date",
            "date": {}
        },
        "Meals": {
            "id": "%7DWA~",
            "name": "Meals",
            "type": "relation",
            "relation": {
                "database_id": "668d797c-76fa-4934-9b05-ad288df2d136",
                "synced_property_name": "Related to Grocery List (Meals)"
            }
        },
        "Number of meals": {
            "id": "Z\\\\Eh",
            "name": "Number of meals",
            "type": "rollup",
            "rollup": {
                "rollup_property_name": "Name",
                "relation_property_name": "Meals",
                "rollup_property_id": "title",
                "relation_property_id": "mxp^",
                "function": "count"
            }
        },
        "Store availability": {
            "id": "s}Kq",
            "name": "Store availability",
            "type": "multi_select",
            "multi_select": {
                "options": [
                    {
                        "id": "cb79b393-d1c1-4528-b517-c450859de766",
                        "name": "Duc Loi Market",
                        "color": "blue"
                    },
                    {
                        "id": "58aae162-75d4-403b-a793-3bc7308e4cd2",
                        "name": "Rainbow Grocery",
                        "color": "gray"
                    },
                    {
                        "id": "22d0f199-babc-44ff-bd80-a9eae3e3fcbf",
                        "name": "Nijiya Market",
                        "color": "purple"
                    },
                    {
                        "id": "0d069987-ffb0-4347-bde2-8e4068003dbc",
                        "name": "Gus's Community Market",
                        "color": "yellow"
                    }
                ]
            }
        },
        "Photo": {
            "id": "yfiK",
            "name": "Photo",
            "type": "files",
            "files": {}
        },
        "Food group": {
            "id": "CM%3EH",
            "name": "Food group",
            "type": "select",
            "select": {
                "options": [
                    {
                        "id": "6d4523fa-88cb-4ffd-9364-1e39d0f4e566",
                        "name": "\u{1F966}Vegetable",
                        "color": "green"
                    },
                    {
                        "id": "268d7e75-de8f-4c4b-8b9d-de0f97021833",
                        "name": "\u{1F34E}Fruit",
                        "color": "red"
                    },
                    {
                        "id": "1b234a00-dc97-489c-b987-829264cfdfef",
                        "name": "\u{1F4AA}Protein",
                        "color": "yellow"
                    }
                ]
            }
        },
        "Name": {
            "id": "title",
            "name": "Name",
            "type": "title",
            "title": {}
        }
    },
    "parent": {
        "type": "page_id",
        "page_id": "98ad959b-2b6a-4774-80ee-00246fb0ea9b"
    },
    "archived": false,
    "is_inline": false,
    "public_url": null
}`
                  }
                }
              }
            }
          }
        },
        "deprecated": false,
        "security": []
      }
    },
    "/v1/pages/{page_id}/properties/{property_id}": {
      "get": {
        "summary": "Retrieve a page property item",
        "description": "",
        "operationId": "retrieve-a-page-property",
        "parameters": [
          {
            "name": "page_id",
            "in": "path",
            "description": "Identifier for a Notion page",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "name": "property_id",
            "in": "path",
            "description": "Identifier for a page [property](https://developers.notion.com/reference/page#all-property-values)",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "For paginated properties. The max number of property item objects on a page. The default size is 100",
            "schema": {
              "type": "integer",
              "format": "int32"
            }
          },
          {
            "name": "start_cursor",
            "in": "query",
            "description": "For paginated properties.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Number Property Item": {
                    "value": '{\n  "object": "property_item",\n  "id" "kjPO",\n  "type": "number",\n  "number": 2\n}'
                  },
                  "Result": {
                    "value": '{\n    "object": "list",\n    "results": [\n        {\n            "object": "property_item",\n            "id" "kjPO",\n            "type": "rich_text",\n            "rich_text": {\n                "type": "text",\n                "text": {\n                    "content": "Avocado ",\n                    "link": null\n                },\n                "annotations": {\n                    "bold": false,\n                    "italic": false,\n                    "strikethrough": false,\n                    "underline": false,\n                    "code": false,\n                    "color": "default"\n                },\n                "plain_text": "Avocado ",\n                "href": null\n            }\n        },\n        {\n            "object": "property_item",\n            "id" "ijPO",\n            "type": "rich_text",\n            "rich_text": {\n                "type": "mention",\n                "mention": {\n                    "type": "page",\n                    "page": {\n                        "id": "41117fd7-69a5-4694-bc07-c1e3a682c857"\n                    }\n                },\n                "annotations": {\n                    "bold": false,\n                    "italic": false,\n                    "strikethrough": false,\n                    "underline": false,\n                    "code": false,\n                    "color": "default"\n                },\n                "plain_text": "Lemons",\n                "href": "http://notion.so/41117fd769a54694bc07c1e3a682c857"\n            }\n        },\n        {\n            "object": "property_item",\n            "id" "kjPO",\n            "type": "rich_text",\n            "rich_text": {\n                "type": "text",\n                "text": {\n                    "content": " Tomato ",\n                    "link": null\n                },\n                "annotations": {\n                    "bold": false,\n                    "italic": false,\n                    "strikethrough": false,\n                    "underline": false,\n                    "code": false,\n                    "color": "default"\n                },\n                "plain_text": " Tomato ",\n                "href": null\n            }\n        },\n...\n    ],\n    "next_cursor": "some-next-cursor-value",\n    "has_more": true,\n		"next_url": "http://api.notion.com/v1/pages/0e5235bf86aa4efb93aa772cce7eab71/properties/NVv^?start_cursor=some-next-cursor-value&page_size=25",\n    "property_item": {\n      "id": "NVv^",\n      "next_url": null,\n      "type": "rich_text",\n      "rich_text": {}\n    }\n}'
                  },
                  "Rollup List Property Item": {
                    "value": '{\n    "object": "list",\n    "results": [\n        {\n            "object": "property_item",\n          	"id": "dj2l",\n            "type": "relation",\n            "relation": {\n                "id": "83f92c9d-523d-466e-8c1f-9bc2c25a99fe"\n            }\n        },\n        {\n            "object": "property_item",\n          	"id": "dj2l",\n            "type": "relation",\n            "relation": {\n                "id": "45cfb825-3463-4891-8932-7e6d8c170630"\n            }\n        },\n        {\n            "object": "property_item",\n          	"id": "dj2l",\n            "type": "relation",\n            "relation": {\n                "id": "1688be1a-a197-4f2a-9688-e528c4b56d94"\n            }\n        }\n    ],\n    "next_cursor": "some-next-cursor-value",\n    "has_more": true,\n		"property_item": {\n      "id": "y}~p",\n      "next_url": "http://api.notion.com/v1/pages/0e5235bf86aa4efb93aa772cce7eab71/properties/y%7D~p?start_cursor=1QaTunT5&page_size=25",\n      "type": "rollup",\n      "rollup": {\n        "function": "sum",\n        "type": "incomplete",\n        "incomplete": {}\n      }\n    }\n    "type": "property_item"\n}'
                  }
                }
              }
            }
          }
        },
        "deprecated": false,
        "security": []
      }
    },
    "/v1/comments": {
      "get": {
        "summary": "Retrieve comments",
        "description": "Retrieves a list of un-resolved [Comment objects](ref:comment-object) from a page or block.",
        "operationId": "retrieve-a-comment",
        "parameters": [
          {
            "name": "block_id",
            "in": "query",
            "description": "Identifier for a Notion block or page",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "start_cursor",
            "in": "query",
            "description": "If supplied, this endpoint will return a page of results starting after the cursor provided. If not supplied, this endpoint will return the first page of results.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page_size",
            "in": "query",
            "description": "The number of items from the full list desired in the response. Maximum: 100",
            "schema": {
              "type": "integer",
              "format": "int32"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "OK": {
                    "value": '{\n    "object": "list",\n    "results": [\n        {\n            "object": "comment",\n            "id": "94cc56ab-9f02-409d-9f99-1037e9fe502f",\n            "parent": {\n                "type": "page_id",\n                "page_id": "5c6a2821-6bb1-4a7e-b6e1-c50111515c3d"\n            },\n            "discussion_id": "f1407351-36f5-4c49-a13c-49f8ba11776d",\n            "created_time": "2022-07-15T16:52:00.000Z",\n            "last_edited_time": "2022-07-15T19:16:00.000Z",\n            "created_by": {\n                "object": "user",\n                "id": "9b15170a-9941-4297-8ee6-83fa7649a87a"\n            },\n            "rich_text": [\n                {\n                    "type": "text",\n                    "text": {\n                        "content": "Single comment",\n                        "link": null\n                    },\n                    "annotations": {\n                        "bold": false,\n                        "italic": false,\n                        "strikethrough": false,\n                        "underline": false,\n                        "code": false,\n                        "color": "default"\n                    },\n                    "plain_text": "Single comment",\n                    "href": null\n                }\n            ]\n        }\n    ],\n    "next_cursor": null,\n    "has_more": false,\n    "type": "comment",\n    "comment": {}\n}'
                  }
                }
              }
            }
          }
        },
        "deprecated": false,
        "security": []
      },
      "post": {
        "summary": "Create comment",
        "description": "Creates a comment in a page or existing discussion thread.",
        "operationId": "create-a-comment",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "parent",
                  "rich_text"
                ],
                "properties": {
                  "parent": {
                    "type": "object",
                    "description": "The page that contains the comment",
                    "required": [
                      "page_id"
                    ],
                    "properties": {
                      "page_id": {
                        "type": "string",
                        "description": "the page ID"
                      }
                    }
                  },
                  "rich_text": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": [
                        "text"
                      ],
                      "properties": {
                        "text": {
                          "type": "object",
                          "required": [
                            "content"
                          ],
                          "properties": {
                            "content": {
                              "type": "string",
                              "description": "The content of the comment"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "200",
            "content": {
              "application/json": {
                "examples": {
                  "Result": {
                    "value": '{\n    "object": "comment",\n    "id": "b52b8ed6-e029-4707-a671-832549c09de3",\n    "parent": {\n        "type": "page_id",\n        "page_id": "5c6a2821-6bb1-4a7e-b6e1-c50111515c3d"\n    },\n    "discussion_id": "f1407351-36f5-4c49-a13c-49f8ba11776d",\n    "created_time": "2022-07-15T20:53:00.000Z",\n    "last_edited_time": "2022-07-15T20:53:00.000Z",\n    "created_by": {\n        "object": "user",\n        "id": "067dee40-6ebd-496f-b446-093c715fb5ec"\n    },\n    "rich_text": [\n        {\n            "type": "text",\n            "text": {\n                "content": "Hello world",\n                "link": null\n            },\n            "annotations": {\n                "bold": false,\n                "italic": false,\n                "strikethrough": false,\n                "underline": false,\n                "code": false,\n                "color": "default"\n            },\n            "plain_text": "Hello world",\n            "href": null\n        }\n    ]\n}'
                  }
                }
              }
            }
          }
        },
        "deprecated": false,
        "security": []
      }
    }
  }
};

// src/server.ts
async function createNotionServer(accessToken) {
  const proxy = new MCPProxy("Notion API", NotionOpenAPISpec, accessToken);
  return proxy.getServer();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createNotionServer
});
