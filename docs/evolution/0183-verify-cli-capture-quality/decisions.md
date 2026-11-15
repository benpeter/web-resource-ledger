# Decisions

- The CLI reads `captureQuality` from `datapackage.json` and returns it as
  `capture.quality`, next to `capture.url` and `capture.capturedAt`, which
  0.4.0 already reads from the same file. The bundle hash covers it, so the
  CLI can say "covered by the signature" without a new check.
- Someone who verifies a bundle offline is the reader who most needs to know
  that the capture shows a block page or only part of the page: they have no
  dashboard and may not open the screenshot. So the notes are in the standard
  output, not only behind `--json`.
- Notes appear only when there is something to say: a partial render, a
  screenshot that shows only the top of the page, a status of 400 or higher.
  A full capture of a page that answered 200 prints what it printed before.
- The reader keeps only the fields it knows, each with the type it expects.
  A bundle is input from outside, and its values go to a terminal and into a
  report someone may file.
- The texts say "the capture service", not "WRL": the CLI names no operator
  elsewhere either.
- This goes into the unreleased 0.4.0 instead of a 0.5.0. Nothing of 0.4.0 is
  published, and one publish is less work for Ben than two.
- The docs site is untouched. Its CLI examples show the released version, and
  backlog #87 already has "update the site pages" after the publish.
