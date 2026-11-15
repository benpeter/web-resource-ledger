// tva
// Problem responses carry fields beyond the RFC 9457 four: limitType and
// quota on a 429, threatTypes on a 422 from threat screening, purgeAfter on an
// admin 409. openapi.yaml's ProblemDetail listed none of them, so clients
// generated from it dropped them, and the examples that showed them failed
// `npm run lint:api` validation. Every field the code passes to
// problemResponse() as its fourth argument is a property of a schema that
// extends ProblemDetail with allOf, as the admin 409 does with purgeAfter.
// Reads the sources as text, like routes-sync.test.js.
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

// Index of the quote that closes the string or template literal opened at i.
// A template's ${...} may hold further strings and templates.
function skipString(text, i) {
  const quote = text[i];
  for (i++; i < text.length && text[i] !== quote; i++) {
    if (text[i] === '\\') i++;
    else if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
      let depth = 0;
      for (i++; i < text.length; i++) {
        if ("'\"`".includes(text[i])) i = skipString(text, i);
        else if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) break;
      }
    }
  }
  return i;
}

// The arguments of the call whose '(' is at `open`, split at top-level commas.
// Strings and template literals are skipped, so commas and brackets in them
// don't count.
function callArguments(text, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if ("'\"`".includes(c)) {
      i = skipString(text, i);
    } else if ('([{'.includes(c)) {
      depth++;
    } else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) return [...args, text.slice(start, i)].map((a) => a.trim());
    } else if (c === ',' && depth === 1) {
      args.push(text.slice(start, i));
      start = i + 1;
    }
  }
  throw new Error(`unclosed call at ${open}`);
}

// The top-level keys of an object literal such as "{ limitType: 'quota', quota: {...} }".
function objectKeys(literal) {
  return callArguments(literal, 0)
    .map((entry) => entry.match(/^([A-Za-z_$][\w$]*)\s*(:|$)/)?.[1])
    .filter(Boolean);
}

function extraFields() {
  return jsFiles(join(root, 'src')).flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    return [...text.matchAll(/problemResponse\(/g)].flatMap((m) => {
      const extra = callArguments(text, m.index + m[0].length - 1)[3];
      return extra?.startsWith('{') ? objectKeys(extra) : [];
    });
  });
}

// Properties of the schemas that extend ProblemDetail with allOf, anywhere in
// the spec (named, like ProblemLimit, or inline in a response).
function problemExtensionFields(node) {
  if (!node || typeof node !== 'object') return [];
  const own = Array.isArray(node.allOf) && node.allOf.some((s) => s.$ref === '#/components/schemas/ProblemDetail')
    ? node.allOf.flatMap((s) => Object.keys(s.properties ?? {}))
    : [];
  return [...own, ...Object.values(node).flatMap(problemExtensionFields)];
}

describe('problem response fields', () => {
  it('every extra field the code sends is documented on a problem schema in openapi.yaml', () => {
    const spec = parse(readFileSync(join(root, 'openapi.yaml'), 'utf8'));
    const documented = problemExtensionFields(spec);
    const sent = [...new Set(extraFields())];
    expect(sent).toEqual(expect.arrayContaining(['limitType', 'quota', 'threatTypes']));
    expect(sent.filter((field) => !documented.includes(field))).toEqual([]);
  });
});
