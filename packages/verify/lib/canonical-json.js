// Vendored from src/canonical-json.js -- verbatim copy
// Origin: https://github.com/benpeter/web-resource-ledger/blob/main/src/canonical-json.js

// tva
export function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}
