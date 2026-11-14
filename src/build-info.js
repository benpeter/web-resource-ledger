// tva
// Names the WRL build in evidence bundles and outbound requests, as
// WRL/<release>+<short commit> (SemVer build metadata), e.g. WRL/1.3.0+564eae4.
// BUILD_VERSION and BUILD_COMMIT are text replacements from `wrangler deploy
// --define` in the deploy workflows; tests and `wrangler dev` don't define them,
// so the typeof guards are needed (an undeclared identifier throws).

export function softwareId() {
  const version = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev';
  const commit = typeof BUILD_COMMIT !== 'undefined' ? `+${BUILD_COMMIT.slice(0, 7)}` : '';
  return `WRL/${version}${commit}`;
}
