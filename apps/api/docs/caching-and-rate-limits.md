# Caching and rate limits

How the API limits requests (SEC-008) and what it keeps in memory.

## Rate limits

All limits are counted over 15 minutes. A request over the limit gets `429` with a JSON message.

| Limiter         | Routes                                                         | Default | Counted per | What is counted      | Setting             |
| --------------- | -------------------------------------------------------------- | ------- | ----------- | -------------------- | ------------------- |
| `authLimiter`   | `POST /auth/register`, `/verify-email`, `/resend-verification` | 20      | IP          | Every request        | `AUTH_RATE_LIMIT`   |
| `loginLimiter`  | `POST /auth/login`                                             | 20      | IP          | Only failed attempts | `AUTH_RATE_LIMIT`   |
| `apiLimiter`    | All other route groups, which share one count                  | 300     | IP          | Every request        | `API_RATE_LIMIT`    |
| `uploadLimiter` | The recitation upload, on top of `apiLimiter`                  | 60      | Account     | Every request        | `UPLOAD_RATE_LIMIT` |

`GET /api/v1/health` has no limit. The limiters are in `src/middlewares/rateLimiter.js`.

- A new route under `/auth` must be given a limiter in `src/routes/authRoutes.js`. `src/app.js` does not add one.
- After the failed login limit is reached, the right password is refused too, until the window ends.
- The login limit is per IP only. Guessing one account's password from many addresses is not limited per account.

## Browser and proxy caches

Every `/api` answer, errors included, carries `Cache-Control: no-store` (`src/middlewares/noStore.js`), because answers can hold family and child data.

## Server cache

The API keeps some database reads in its own memory for a short time.

| Cache                   | What it holds                                          | Cleared when                                                  |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `competencyCache`       | `GET /curriculum/competencies` and `/competencies/:id` | A competency is created, updated, or activated or deactivated |
| `publishedContentCache` | `GET /content` and `/content/:id` for non-staff users  | Content is published (which also archives the older version)  |

- **Lifetime:** `CACHE_TTL_SECONDS`, default 60, at most 3600. `0` turns the cache off.
- **Size:** at most 500 entries in each cache. When full, the oldest entry is dropped.
- **Key:** the final database filter, the page and the limit, or the requested id. Different age bands therefore never share an entry.
- **Staff and reviewers** are never served from the content cache, so they see their changes at once. The competency cache serves everyone.
- **Permissions** are checked on every request. With `?childId=`, the family check and the audit event happen before the cache is read.
- A read that is still running when a cache is cleared is not saved, so old data cannot come back after a change.

### Rules

Never cache child, family, mission, growth, consent, admin or login data. A new write path for competencies or published content must call `clear()`.

## Limitations

- **One copy per instance.** With more than one API instance, `clear()` empties only the instance that handled the change, so the others can answer with old data for up to `CACHE_TTL_SECONDS`. The rate limit counts are also per instance (finding S-3 in `security-review.md`). A shared store such as Redis would solve both.
- **Direct database changes** (a script, or a manual edit) do not clear the cache. They show after the lifetime ends.
- No load test has measured how much the cache helps.
- Behind a load balancer, `TRUST_PROXY` must be set, or all clients share one limit (S-2).

## Open questions for the product manager

1. Which endpoints are slow or busy? Curriculum and published content were chosen on the assumption that they are read often and change rarely.
2. Will more than one API instance run?
3. Are the default limits and the 60 second lifetime right?
4. Should login also be limited per account? It would slow guessing from many addresses, but a stranger could then lock a real user out for a while.

## Tests

`tests/utils/cache.test.js`, `tests/api/caching.test.js`, `tests/api/rate-limits.test.js`, `tests/api/no-store.test.js`.
