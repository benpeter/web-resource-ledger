// Declarative deprecation registry.
// When an endpoint is deprecated, add an entry here along with the
// corresponding header injection code in src/index.js.
//
// Key format: 'METHOD /path/template'
// Values:
//   deprecated: Unix timestamp (integer) when the endpoint was marked deprecated
//               (emitted as Structured Field Date @timestamp per RFC 9745)
//   sunset:     HTTP-date string (RFC 7231) when the endpoint stops responding (per RFC 8594)
//   link:       URL to migration documentation (must be a valid absolute URL --
//               validate before interpolating into Link header to prevent header injection)
//
// Example:
// 'GET /v1/captures/:id/status': {
//   deprecated: 1735689599,
//   sunset: 'Tue, 01 Jul 2025 00:00:00 GMT',
//   link: 'https://docs.webresourceledger.com/migration/status-endpoint',
// },

export const DEPRECATIONS = {};
