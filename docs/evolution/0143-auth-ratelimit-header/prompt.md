# Prompt

Same session as phases 0133 to 0142. Phase 0142 fixed the `AUTH_RATE_LIMITER` row in
the INTERNALS route docs and noticed that `X-RateLimit-Limit` on the routes behind that
limiter said 20 (sign-in, unsubscribe, verify-email) or 30 (account, billing), while the
binding allows 10 a minute per IP. Production showed the same: `/auth/session` answered
with `x-ratelimit-limit: 20`.
