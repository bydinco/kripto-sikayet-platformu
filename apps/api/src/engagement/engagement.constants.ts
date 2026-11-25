// Burst control is the @Throttle decorator on each endpoint (see
// evidence-file.constants.ts for the same pattern); the daily comment
// quotas below are a separate, longer-window ceiling enforced in
// CommentsService.
export const VOTE_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
export const ME_TOO_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
export const COMMENT_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

export const DAILY_COMMENT_QUOTA = 30;
export const NEW_ACCOUNT_DAILY_COMMENT_QUOTA = 5;
// Mirrors reports.service.ts's own NEW_ACCOUNT_AGE_MS (not imported from
// there — that file's constant is private and out of scope for this
// change; both encode the same 24h "new account" product rule).
export const NEW_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

export const COMMENT_BODY_MIN_LENGTH = 2;
export const COMMENT_BODY_MAX_LENGTH = 1000;
export const ME_TOO_BODY_MAX_LENGTH = 500;
export const COMMENT_MAX_URLS = 2;
