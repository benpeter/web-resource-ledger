# Prompt

Backlog #99: the 50 MB size cap adds up the `Content-Length` headers of the
responses and checks only after load and after the settle wait. Those
responses never reach the Worker, so the sum says little about Worker memory,
and a page that passes 50 MB while WRL scrolls it is captured as full
(nytimes.com on staging, 55.6 MB). What the Worker holds is the rendered HTML
and the screenshots. On 2026-11-25 Ben dropped the "wait until it costs a real
capture" trigger and approved the fix, together with an alert when a Worker
run is killed for using too much memory (one `exceededMemory` invocation on
`wrl-staging` during the #105 tests).
