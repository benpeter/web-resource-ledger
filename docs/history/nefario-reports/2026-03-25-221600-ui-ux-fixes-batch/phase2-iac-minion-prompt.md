You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Item 4 of a UI/UX fixes batch: Notify operator when new tenant API keys are created (#200).

When a new API key is created via the admin API, fire a notification (email via Resend or Coralogix log alert) with tenant ID, key name, scopes, and timestamp. Fire-and-forget — must not block key creation.

## Your Planning Question

Two viable approaches for operator notification on admin key creation:
(a) Enhance the existing `admin.key_create` Coralogix log event and create a Coralogix alert rule
(b) Send an email via the existing Resend/EMAIL_QUEUE pipeline to a hardcoded operator address from env

The existing code in `src/admin.js` `handleAdminCreateKey()` already does `ctx.waitUntil(log(env, 3, 'admin', { event: 'admin.key_create', ... }))` which is fire-and-forget.

The existing email infrastructure in `src/email-dispatch.js` uses Resend via EMAIL_QUEUE with tenant-specific preferences (verified email, opt-in). This is designed for per-tenant notifications, not operator/system notifications.

Which approach minimizes new code and operational complexity? Does Coralogix alerting need new infrastructure, or is it configurable through the dashboard? Should we do both?

## Context Files to Read
- `src/admin.js` (handleAdminCreateKey function)
- `src/email-dispatch.js` (email pipeline)
- `src/log.js` (Coralogix logging)
- `wrangler.toml` (queue bindings, env vars)

## Instructions
1. Read the relevant files
2. Apply your infrastructure expertise
3. Return your contribution with recommendations, proposed tasks, risks

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-iac-minion.md
