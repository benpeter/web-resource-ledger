# Prompt

Backlog #98, found while checking `@cloudflare/playwright` 1.4.0 on staging
(phase 0174): a page over the 500-subresource cap failed when its `load` event
fired within the 20 s navigation timeout and was captured as partial when it
didn't, so nytimes.com and finance.yahoo.com flipped between failed, partial
and full from run to run. Ben was away and said to decide open questions
myself.
