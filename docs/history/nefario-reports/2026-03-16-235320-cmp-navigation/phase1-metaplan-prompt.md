MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

Cookie consent banners from third-party CMP providers (Sourcepoint, OneTrust, consentmanager.net, etc.) render correctly during capture, so that autoconsent can detect and dismiss them and captureSettings accurately reflects consent state.

### Success criteria

- Cross-domain iframe navigations (CMP iframes) are no longer blocked by the route handler
- Cross-domain top-level navigations are still blocked (TOCTOU security guarantee preserved)
- Autoconsent detects CMPs on sites that use iframe-based consent (Guardian, Spiegel, NYT as test cases)
- BBC capture follows the bbc.com -> bbc.co.uk redirect successfully (same-site redirect, not a security risk)
- All existing capture and security tests pass
- Staging validation against the same 8-site test set from #79

### Scope

- In: context.route handler in capture.js (line 445-453), specifically the isNavigationRequest() check; related tests
- Out: Autoconsent library changes, CMP-specific handling, new consent providers, subresource counting logic

### Constraints

- Use route.request().frame() === page.mainFrame() (or Playwright equivalent) to distinguish top-level from iframe navigation

### Evidence

Discovered during #79 staging testing. 6/7 tested sites show consent=notDetected despite having CMPs.

| Site | CMP Provider | consent result | Explanation |
|------|-------------|---------------|-------------|
| theguardian.com | Sourcepoint | notDetected | CMP iframe blocked |
| spiegel.de | Sourcepoint/Pur | notDetected | CMP iframe blocked |
| nytimes.com | OneTrust | notDetected | CMP iframe blocked |
| arstechnica.com | unknown | notDetected | CMP iframe blocked |
| bbc.com | -- | notDetected | Top-level redirect to bbc.co.uk blocked (ERR_BLOCKED_BY_CLIENT) |
| tagesschau.de | none | notDetected | No CMP (correct) |
| slashdot.org | consentmanager.net | dismissed | CMP injects inline via script (no iframe) |

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation

## External Skill Discovery

No external skills discovered in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills detected
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase1-metaplan.md
