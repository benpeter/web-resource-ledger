# Prompt

Same session as phases 0133 to 0146. Moving the tests to vitest 4 and
`@cloudflare/vitest-pool-workers` 0.19 (benpeter/wrl-backlog#85) broke tests that
send a keyless request after an authenticated one: the keyless read of another
tenant's public capture came back 404. Pool-workers 0.12 gave every `SELF.fetch` its
own `env`; 0.13 and later pass one shared object, the way the Workers runtime does in
production. A loop against `api.webresourceledger.com` showed the same thing live:
alternating an authenticated read of an own capture with a keyless read of another
tenant's public capture, 9 of 12 keyless reads returned 404 instead of 200.
