ADVISE

- [security]: `dep.link` is interpolated directly into the Link header value without URL validation, allowing a developer who edits `src/deprecations.js` to inject additional link relations via crafted values containing `>; rel="..."`.
  SCOPE: `src/index.js` -- deprecation header injection block (Link header concatenation)
  CHANGE: Validate `dep.link` is a well-formed HTTPS URL before interpolation. A one-line guard suffices: `if (!/^https?:\/\//.test(dep.link)) throw new Error(`Invalid deprecation link: ${dep.link}`);` -- or strip angle brackets and semicolons from `dep.link` before embedding it. The check should be in the post-response block or in a helper that validates the DEPRECATIONS config at module load time.
  WHY: The Link header value is `${existingLink}, <${dep.link}>; rel="deprecation"`. If `dep.link` contains `>; rel="malicious"` the resulting header gains an injected link relation. The attack surface is limited to developers with merge access to `src/deprecations.js`, but the defense-in-depth principle requires that header values be validated at the point of construction, not solely at the code-review gate. The risk class is HTTP response header injection (CWE-113).
  TASK: Task 2 (Worker implementation -- deprecation header injection in `src/index.js`)

- [security]: `dep.deprecated` is interpolated as `@${dep.deprecated}` into the Deprecation header without asserting it is an integer, allowing a malformed Structured Field Date to be emitted if a developer sets the field to a non-numeric string.
  SCOPE: `src/deprecations.js` schema definition and `src/index.js` header injection block
  CHANGE: Coerce to integer before interpolation: `response.headers.set('Deprecation', \`@${Math.trunc(Number(dep.deprecated))}\`)` and add a module-load assertion (or the DEPRECATIONS JSDoc should specify `number` type and the Task 4 deprecation tests should assert the field is a positive integer). This prevents emitting `@undefined` or `@2026-03-25` into headers.
  WHY: An invalid Structured Field Date in the Deprecation header (RFC 9745) is not exploitable by an external attacker, but it causes standards-noncompliant responses that may trip client-side parsers. Coercing at the point of emission is a one-token fix that eliminates the class of error.
  TASK: Task 2 (Worker implementation) and Task 4 (tests -- the deprecation format test should assert the generated value is `@<integer>`)
