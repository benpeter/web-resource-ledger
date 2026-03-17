Should we add a collapsible "Verify independently" section to the verify page with a copy-to-clipboard npx command for the existing @w-r-l/verify CLI tool?

Context: The @w-r-l/verify package already exists at packages/verify/ with full 5-check cryptographic verification including CMS/PKCS#7 certificate chain validation. It's zero-install via npx. The verify page currently says "Time was recorded by an independent authority (not verified cryptographically)" for the timestamp check -- the CLI tool actually CAN verify this cryptographically, so linking to it from the verify page would address the perceived softening of the trust promise.

The user's specific UX idea: a collapsible link/section (e.g. "Verify independently") that, when expanded, shows a single npx command with a copy-to-clipboard icon. The command would be pre-filled with the capture URL. Simple, minimal, not a multi-step tutorial.
