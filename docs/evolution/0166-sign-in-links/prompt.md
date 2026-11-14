# Prompt

Same session as phases 0133 to 0165, found during the docs pass (#46) while
checking the marketplace use-case page. Its "Sign in" link went to
`/auth/login`, which redirects to GitHub OAuth at once. So did the "Sign in"
button on every landing page, the landing hero's "Get started free" and the docs
navigation. Sign-in with an emailed link exists since 2026-10-23 (phase 0131) but
only on the dashboard's sign-in page (`/ui`), which none of those links opened.
Backlog #90: sign-ups stayed flat while website traffic tripled, much of it from
OSINT directories whose readers may not have a GitHub account.
