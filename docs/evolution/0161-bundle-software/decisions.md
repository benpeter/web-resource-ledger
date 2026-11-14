# Decisions

- The value is `WRL/<release>+<short commit>`, SemVer build metadata. The release
  alone doesn't identify the code: 1.2.0 covered a dozen deploys with behaviour
  changes, and `/health` already reports the commit. An examiner can map the
  commit to the exact source.
- One function, `softwareId()` in `src/build-info.js`, used in all four places.
  It reads the `BUILD_VERSION` and `BUILD_COMMIT` replacements that the deploy
  workflows already pass to `wrangler deploy --define`; without them (tests,
  `wrangler dev`) it says `WRL/dev`, so a bundle never claims a release it isn't.
- Past bundles keep `WRL/0.1`: `software` is inside the signed digest, and their
  signatures and timestamps stay valid. Verification doesn't read the field.
- The User-Agent of the header fetch changes the same way. Sites see a new
  version string; nothing else about the request changes.
