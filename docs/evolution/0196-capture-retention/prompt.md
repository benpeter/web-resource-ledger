# Prompt

Ben, 2026-11-25, answering the decisions in the handoff:

> founder tenant quota: stop the schedule and delete old captures
> staging: introduce the 30-day purge

On follow-up questions he chose to pause the founder tenant's schedule
(apache.org every 6 hours) rather than delete it, and to delete all 801 of its
captures. The staging R2 bucket held 18.4 GB in 13,467 objects, mostly battery
and probe captures.
