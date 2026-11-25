# Decisions

## One deletion for three jobs

WRL could delete a whole tenant (phase 0152) and quarantined captures after 90
days (phase 0129), but not single captures. The quarantine purge already did
the right thing per capture: R2 objects first, then its threat checks and its
row, keeping a WACZ object that another capture still uses. That per-capture
step is now one function in `src/retention.js`, used by the quarantine purge,
the new expired-capture purge and the new admin route.

## Retention as a variable, set only on staging

`CAPTURE_RETENTION_DAYS` turns the purge on; unset, nothing is deleted. Staging
sets 30, production leaves it unset, so the hosted service's data-retention
promises don't change. Self-hosted deployments get the option for free.

## Hourly, 100 per run

It runs on the hour from the per-minute cron, next to the sign-in purge, not
from the weekly retention cron: staging had about 2,700 captures to delete at
the start, and 100 a week would never catch up. 100 per hour clears the backlog
in about a day and keeps each run small (three D1 calls and one R2 call per
capture).

## A route, not a script, for one tenant's captures

The founder cleanup could have been a one-off script against D1 and R2. The
Worker's R2 binding deletes up to 1,000 keys per call and already has the
shared-WACZ check, so an admin route
(`DELETE /v1/admin/tenants/{id}/captures?confirm={id}`) does it with the same
code the cron uses, and stays for the next time an account wants its captures
gone but the account kept. It deletes up to 100 per call and says how many are
left, like the cron's batch, so one call never runs long.

## Not done

- No cache purge after deleting: the verification responses of deleted captures
  stay at the edge for up to 24 hours, as with the tenant purge. OPERATIONS.md
  says how to purge them.
- Schedules keep `last_capture_id` pointing at a deleted capture; the dashboard
  then shows a link that answers 404 until the next run.
