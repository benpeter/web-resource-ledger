# Prompt

Backlog #15: classify render failures and set retry rules per category. Ben
unlocked it on 2026-11-26. Production had just given the data that was
missing: on 2026-11-26 a user (`gh-43403487`) captured school PDFs and a zip.
A 359 MB zip failed with "Capture could not be completed" after 4 attempts,
and a 24 MB PDF failed as "The page loaded but showed nothing (blank page)".
On staging, the catch-all message also hid `page.screenshot: Target crashed`
on ad-heavy pages.
