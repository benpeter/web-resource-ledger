// tva
import SwaggerParser from "@apidevtools/swagger-parser";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extracts the first example value from an OpenAPI examples map or a bare
 * `example` field, returning it as a formatted JSON string. Returns null when
 * no example is present.
 */
function pickExample(contentObj) {
  if (!contentObj) return null;

  // Prefer the first media type with content
  const mediaTypes = Object.values(contentObj);
  for (const media of mediaTypes) {
    if (media.examples) {
      const first = Object.values(media.examples)[0];
      if (first && first.value !== undefined) {
        return JSON.stringify(first.value, null, 2);
      }
    }
    if (media.example !== undefined) {
      return JSON.stringify(media.example, null, 2);
    }
  }
  return null;
}

/**
 * Flattens a dereferenced JSON Schema into an array of property rows for
 * rendering as a table. Handles nested objects (up to 2 levels of indentation),
 * arrays, oneOf/anyOf, and nullable types.
 */
function flattenSchema(schema, required = [], indent = 0) {
  if (!schema || typeof schema !== "object") return [];

  const rows = [];
  const props = schema.properties || {};
  const requiredSet = new Set(required);

  for (const [name, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") continue;

    const typeStr = resolveType(prop);
    const isRequired = requiredSet.has(name);
    const description = prop.description || "";
    const prefix = indent > 0 ? "\u00a0\u00a0".repeat(indent) : "";

    rows.push({ name: prefix + name, type: typeStr, required: isRequired, description });

    // Recurse one level into nested objects
    if (prop.type === "object" && prop.properties && indent < 1) {
      const nested = flattenSchema(prop, prop.required || [], indent + 1);
      rows.push(...nested);
    }

    // Show array item type for arrays with object items
    if (
      prop.type === "array" &&
      prop.items &&
      prop.items.type === "object" &&
      prop.items.properties &&
      indent < 1
    ) {
      const nested = flattenSchema(prop.items, prop.items.required || [], indent + 1);
      rows.push(...nested);
    }
  }

  return rows;
}

/**
 * Produces a human-readable type string for a schema node.
 */
function resolveType(prop) {
  if (!prop) return "any";

  // oneOf / anyOf
  if (prop.oneOf) {
    return prop.oneOf.map(resolveType).join(" | ");
  }
  if (prop.anyOf) {
    return prop.anyOf.map(resolveType).join(" | ");
  }

  // Nullable arrays like ["string", "null"]
  if (Array.isArray(prop.type)) {
    return prop.type.filter((t) => t !== "null").join(" | ") + (prop.type.includes("null") ? " | null" : "");
  }

  const base = prop.type || "any";

  if (base === "array") {
    if (prop.items) {
      return `array of ${resolveType(prop.items)}`;
    }
    return "array";
  }

  if (prop.format) {
    return `${base} (${prop.format})`;
  }
  if (prop.enum) {
    return prop.enum.map((v) => `"${v}"`).join(" | ");
  }
  if (prop.const !== undefined) {
    return `"${prop.const}"`;
  }

  return base;
}

/**
 * Builds a normalized operation object from a dereferenced path item method.
 */
function buildOperation(method, pathStr, operation) {
  // Determine security requirements
  const security = operation.security;
  let authRequired = null;
  if (!security) {
    // Inherits global security — not present in this spec so treat as none
    authRequired = null;
  } else if (security.length === 0) {
    authRequired = "none";
  } else {
    const scheme = Object.keys(security[0])[0];
    authRequired = scheme; // "bearerAuth" or "adminAuth"
  }

  // Parameters
  const parameters = (operation.parameters || []).map((p) => ({
    name: p.name,
    in: p.in,
    required: p.required || false,
    type: resolveType(p.schema || {}),
    description: p.description || "",
  }));

  // Request body
  let requestBody = null;
  if (operation.requestBody) {
    const content = operation.requestBody.content || {};
    const mediaType = Object.values(content)[0];
    requestBody = {
      required: operation.requestBody.required || false,
      schema: mediaType ? flattenSchema(mediaType.schema || {}, (mediaType.schema || {}).required || []) : [],
      example: pickExample(content),
    };
  }

  // Responses
  const responses = Object.entries(operation.responses || {}).map(([status, resp]) => {
    const content = resp.content || {};
    const description = resp.description || "";
    const mediaType = Object.values(content)[0];
    const schema = mediaType ? flattenSchema(mediaType.schema || {}, (mediaType.schema || {}).required || []) : [];
    const example = pickExample(content);
    return { status, description, schema, example };
  });

  return {
    method: method.toUpperCase(),
    path: pathStr,
    operationId: operation.operationId,
    summary: operation.summary || "",
    description: operation.description || "",
    tags: operation.tags || [],
    authRequired,
    parameters,
    requestBody,
    responses,
  };
}

export default async function () {
  const specPath = path.resolve(__dirname, "..", "..", "openapi.yaml");

  const api = await SwaggerParser.dereference(specPath);

  const { info, servers = [], tags = [], components = {} } = api;
  const securitySchemes = components.securitySchemes || {};

  // Collect all operations, grouped by tag
  const tagMap = {};
  for (const tag of tags) {
    tagMap[tag.name] = { name: tag.name, description: tag.description || "", operations: [] };
  }

  const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

  for (const [pathStr, pathItem] of Object.entries(api.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const op = buildOperation(method, pathStr, operation);
      for (const tag of op.tags) {
        if (!tagMap[tag]) {
          tagMap[tag] = { name: tag, description: "", operations: [] };
        }
        tagMap[tag].operations.push(op);
      }
    }
  }

  return {
    info,
    servers,
    tags: Object.values(tagMap),
    securitySchemes,
  };
}
