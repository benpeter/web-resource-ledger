// Cron expressions from wrangler.toml [triggers], matched in the scheduled()
// handler of src/index.js. They live here, not in src/index.js: the Workers
// runtime treats every named export of the main module as an entrypoint and
// refuses to start on one that is not a handler.
//
// Cloudflare numbers weekdays from 1 = Sunday, so the weekly cron names the
// day (MON) instead of using a number (phase 0129).
export const MINUTE_CRON = '*/1 * * * *';
export const WEEKLY_CRON = '0 9 * * MON';
