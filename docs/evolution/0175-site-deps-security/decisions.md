# Decisions

- None of these packages runs in a Worker. The docs Worker
  (`site/src/index.js`) imports only `src/pirsch.js` and `src/log.js`; Eleventy
  and swagger-parser run when the site is built, on WRL's own Markdown and
  `openapi.yaml`. The critical liquidjs advisory (file reads outside the
  configured root) and the denial-of-service ones need input WRL doesn't feed
  them. The update is still cheap, and it clears the alert list so new alerts
  stand out.
- `npm update` in `site/` within the existing ranges, no `package.json`
  change: Eleventy 3.1.5 -> 3.1.8, liquidjs 10.25.1 -> 10.30.1, markdown-it
  14.1.1 -> 14.3.3, linkify-it 5.0.0 -> 5.0.2, js-yaml 4.1.1 -> 4.3.2, fast-uri
  3.1.0 -> 3.1.9, brace-expansion 1.1.12 -> 1.1.22, ajv 8.18.0 -> 8.20.0.
  `npm audit` in `site/` then reports 0.
- Eleventy 3.1.8 reads front matter with `@11ty/gray-matter` and js-yaml 4
  instead of `gray-matter` with js-yaml 3. The site built from origin/main
  (exported with `git archive`) and from this branch gives byte-identical
  pages; only the order of URLs in `sitemap.xml` differs, because Eleventy
  orders pages by file date and the export gives every file the same time.
