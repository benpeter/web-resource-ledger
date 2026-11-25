# Prompt

Backlog #105: screenshots of ad-heavy pages take 18 to 90 seconds. Measured
on 2026-11-25 with a throwaway build that logged the requests started during
each screenshot: merriam-webster.com started 674 new requests during one
screenshot (28 s), spiegel.de, 30,000 px tall, started 2 (4 s). Ben, asked
whether WRL should stop a page from loading anything new once it has settled
and been scrolled: "Yes, build it".
