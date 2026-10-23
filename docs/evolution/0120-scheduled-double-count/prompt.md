# Prompt

Found while fixing dropped logs (phase 0119) on 2026-10-23: the scheduler
called `incrementUsage` after queuing scheduled captures, and the queue
consumer calls it again when each capture completes.
