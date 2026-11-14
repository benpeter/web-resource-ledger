# Prompt

Same session as phases 0133 to 0169, not from the backlog: checking the
security whitepaper against the code. It says a daily cron re-scans all
captured URLs against Google Web Risk and that captures made while Web Risk
was unreachable are re-screened within 24 hours. Production D1 showed 885 of
901 complete captures with a last check older than a day, and `threat_checks`
alternated between 281-282 checks and 16-17 checks every night since at least
2026-11-01.
