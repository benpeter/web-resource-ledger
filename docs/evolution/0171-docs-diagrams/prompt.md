# Prompt

Same session as phases 0133 to 0170, not from the backlog: after #426 edited
the sequence diagram on the Architecture page, the live page showed it as a
code block. Its two diagrams and the three in the security whitepaper have
never rendered: the docs CSP from 2026-03-22 (`script-src 'self'` in
`site/_headers`) blocks the inline module script that `base.njk` used from
2026-03-26 to load Mermaid from jsDelivr. The browser console showed the CSP
violation on every docs page.
