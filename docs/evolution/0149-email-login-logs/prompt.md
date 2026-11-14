# Prompt

Same session as phases 0133 to 0148. While checking the retention docs against
`src/email-login.js`, two `.catch(() => {})` calls turned up that phase 0136's sweep
of silent catches didn't cover (it looked at bare `catch {}` blocks and the queue
consumer).
