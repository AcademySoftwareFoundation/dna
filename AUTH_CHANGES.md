# DNA Authentication

**Branch:** `dna/issue55-Autodesk-PAT-based-authentication-for-backend-API-endpoints`
**Issue:** [#55 — Lockdown backend API endpoints behind token auth](https://github.com/AcademySoftwareFoundation/dna/issues/55)
**Author:** Srijan Tripathi
**Updated:** September 2026

This document describes how authentication and authorization work in DNA as
implemented on this branch: the login and request flows, the token and session
model, the security controls, the configuration, and where each piece lives in
the code.

---

## 1. Overview

When authentication is enabled, every API endpoint except `/health` and
`/auth/*` requires a valid token. The backend supports three providers, selected
by `AUTH_PROVIDER`; the frontend's `VITE_AUTH_PROVIDER` must match.

| Value      | Login                                    | Notes                                              |
|------------|------------------------------------------|----------------------------------------------------|
| `none`     | Any email, no validation (default)       | Local development and tests only                   |
| `google`   | Google OAuth                             | Unchanged by this branch; see `DEPLOYMENT.md`       |
| `shotgrid` | ShotGrid username + Legacy Password (PAT) | Added by this branch; the subject of this document |

The ShotGrid provider rests on three principles:

1. **DNA stores no user credential.** The password is verified against ShotGrid
   at login and never stored, logged, or placed in a token. The ShotGrid tokens
   that verification returns are discarded too.
2. **ShotGrid enforces permissions.** Every request queries ShotGrid through the
   script account with `sudo_as_login=<user>`, so ShotGrid applies that user's
   own permission group. DNA adds no permission logic of its own.
3. **Revocation is immediate.** Every request confirms its server-side session
   still exists; ending a session cuts off all of its tokens at once.

---

## 2. How it works

### 2.1 Login — the password is verified, then discarded

```
Browser                  DNA backend                     ShotGrid            MongoDB
  │  POST /auth/login       │                                │                   │
  │  { username, password } │                                │                   │
  │────────────────────────>│  POST /api/v1/auth/access_token│                   │
  │                         │  grant_type=password           │                   │
  │                         │───────────────────────────────>│ validate          │
  │                         │  { access_token, refresh_token}│ credentials       │
  │                         │<───────────────────────────────│                   │
  │                         │ ** password and ShotGrid       │                   │
  │                         │    tokens discarded **         │                   │
  │                         │  find HumanUser by login,      │                   │
  │                         │  then by email (script account)│                   │
  │                         │───────────────────────────────>│                   │
  │                         │  { id, name, email, login,     │                   │
  │                         │    status } — must be active   │                   │
  │                         │<───────────────────────────────│                   │
  │                         │  create session (hash of refresh secret only)      │
  │                         │───────────────────────────────────────────────────>│
  │  200 { access_token }   │                                │                   │
  │  Set-Cookie: dna_refresh│                                │                   │
  │<────────────────────────│                                │                   │
```

The user is looked up by **login name first, then email**, because people sign in
with either depending on the site. The session stores the resolved
`HumanUser.login` — not what was typed — because that is the value
`sudo_as_login` matches on. An account whose status is not active is refused.

ShotGrid's token response is used only as proof that the credentials are valid.
DNA never needs a user's ShotGrid token — every request runs as the script
account with `sudo_as_login` — so keeping one would only put a renewable
ShotGrid credential in the database.

### 2.2 Tokens and session

| Credential | Lifetime | Where it lives | Readable by page JavaScript? |
|------------|----------|----------------|------------------------------|
| **Access token** — signed JWT `{ jti, sub, session_id, email, name, iat, exp, iss, aud }` | 15 minutes | Response body → `sessionStorage`; sent as `Authorization: Bearer` | Yes |
| **Refresh token** — 256-bit random secret, sent as `<session_id>.<secret>` | Until the session ends | `dna_refresh` cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/auth` | **No** |

Neither credential contains a password or a ShotGrid token.

**Session document** (`dna_sessions` collection, MongoDB):

```
_id                              session_id (UUID)
jti                              id of the most recently issued access token
email, name                      from ShotGrid
auth_provider                    "shotgrid_pat"
created_at                       unix timestamp — drives the absolute lifetime
expires_at                       TTL index — drives the idle timeout
shotgrid:
  user_id                        HumanUser id
  username                       HumanUser login — used for sudo_as_login
dna_refresh_token_hash           SHA-256 of the current refresh secret
dna_previous_refresh_token_hash  SHA-256 of the secret it replaced
dna_refresh_rotated_at           when the last rotation happened
```

The document holds **no credential**: no password, no ShotGrid token, and only
a **hash** of the refresh secret. A database leak exposes names and email
addresses, but nothing that can sign in to DNA or ShotGrid. Revoked access-token ids are kept in
`dna_token_blocklist` until they would have expired.

### 2.3 Every request — impersonation via `sudo_as_login`

```
Browser                  DNA backend                                  ShotGrid
  │  GET /projects/...      │                                            │
  │  Bearer <access token>  │                                            │
  │────────────────────────>│ 1. signature (HS256), expiry, iss and aud  │
  │                         │ 2. jti not on the blocklist                │
  │                         │ 3. session exists and within max lifetime  │
  │                         │ 4. same-user check on per-user endpoints   │
  │                         │ 5. script account + sudo_as_login=<login>  │
  │                         │───────────────────────────────────────────>│
  │                         │                  query runs with the user's│
  │                         │                  own permission group      │
  │  response               │<───────────────────────────────────────────│
  │<────────────────────────│                                            │
```

- **Authenticated once per request, off the event loop.** Steps 1–3 run in a
  single dependency whose result every consumer shares. It is a synchronous
  function, so FastAPI runs its blocking MongoDB lookup in the threadpool.
- **Fails closed.** If a session cannot supply a ShotGrid login name, the request
  is rejected with 401. It is never downgraded to the bare script account, which
  would answer with full site permissions.
- **Notes are attributed to their author.** Publishing opens a nested
  `sudo_as_login` for the note's author, so a supervisor publishing a playlist
  of artists' notes records each artist correctly.
- **Same-user endpoints.** These return 403 unless the path email matches the
  token's email (compared case-insensitively):
  `GET /projects/user/{user_email}`, `/users/{user_email}/settings`,
  `/users/{user_email}/qc-checks` and `/users/{user_email}/qc-checks/{check_id}`.

### 2.4 Staying signed in — single-use refresh tokens

About a minute before the access token expires, and whenever a sleeping tab
becomes visible again, the frontend calls `POST /auth/refresh`. The browser
attaches the cookie; the page adds the `X-DNA-CSRF: 1` header.

```
refresh secret matches the current hash
    → atomically swap in a new secret (only one concurrent request can win)
    → the winner checks the HumanUser with the script account:
          deactivated, deleted, or login   → delete the session → 401
            changed
          ShotGrid unreachable or script   → keep the session; recheck on the
            account unusable                 next refresh
    → 200 + new access token + new cookie

refresh secret matches the previous hash
    rotated ≤ 30 s ago  → a concurrent tab won the swap: new access token only
    rotated earlier     → a real, rotated-out secret replayed: delete the session → 401

refresh secret never issued for this session (forged, mistyped)
    → 401, nothing revoked
```

A forged secret is rejected **without** revoking anything. Session ids are
readable inside every access token, so revoking on any mismatch would let anyone
who had seen one token log that user out at will. Only replaying a secret that
was genuinely issued counts as theft.

The frontend ends the session only on 401 or 403. Network errors and 5xx
responses are retried every 30 seconds, so a brief ShotGrid or backend hiccup
does not sign anyone out.

When any other API call is answered with 401 — the session was ended from
another device, or the account was deactivated — the frontend refreshes at once
(at most every 30 seconds) rather than waiting for the scheduled refresh. The
refresh either renews the session or shows the login page.

When the session ends or a different user signs in, the frontend discards the
React Query cache and the current selection, so nothing loaded for one user is
shown to the next.

A session ends when **any** of these happens:

| Limit | Default | Setting |
|-------|---------|---------|
| Idle — no refresh for this long | 8 hours | `SESSION_TTL_SECONDS` |
| Absolute — time since login, however active | 12 hours | `SESSION_MAX_LIFETIME_SECONDS` |
| Browser closed | — | cookie has no `Max-Age` |
| ShotGrid account deactivated, deleted, or its login changed — checked on every refresh; not when ShotGrid is merely unreachable | — | — |
| Logout, logout everywhere, or refresh-token reuse | — | — |

### 2.5 Logging out

- `POST /auth/logout` ends the current session. It accepts the access token —
  even if expired — or the refresh cookie, so an idle user can still log out.
- `POST /auth/logout-all` ends every session for the user, on every device.

Both **fail closed**: if the session cannot be removed server-side they return
`503` rather than reporting success while the session remains usable. The
frontend discards its local credentials either way.

---

## 3. Security design

### 3.1 Controls

| Control | Threat addressed |
|---------|------------------|
| Password verified once, never stored; ShotGrid tokens from login discarded | Database, backup or log leak exposing credentials usable against ShotGrid directly |
| 15-minute access tokens | A leaked access token (logs, proxy, XSS) is useful only briefly |
| Session existence checked on every request | Revocation takes effect on the next request, including endpoints that never call ShotGrid |
| Refresh token in an `HttpOnly` cookie | XSS cannot read the long-lived credential |
| Refresh token stored only as a hash | Database leak does not yield usable refresh tokens |
| Rotation on every refresh + reuse detection | A copied refresh token: replaying a genuinely issued, rotated-out secret revokes the whole session, locking out the thief even if they refreshed first |
| Forged refresh secrets rejected without side effects | Forcing another user's logout using a session id read from a token or log |
| Atomic refresh-token swap | Concurrent refreshes (several tabs, a waking laptop) leaving the browser holding a cookie the server discarded |
| `SameSite=Strict` + required `X-DNA-CSRF` header | Cross-site request forgery against cookie-authenticated endpoints |
| Credentialed CORS only with an explicit origin list | Any website making logged-in requests on a user's behalf |
| 12-hour absolute session lifetime | A session kept alive indefinitely by a continuously refreshed token |
| Account status re-checked with the script account on every DNA refresh, distinguishing refusal from outage | Deactivated ShotGrid accounts keeping DNA access, without a ShotGrid outage logging everyone out |
| Fail-closed logout and logout everywhere | Users told they are logged out while the session survives; lost or compromised devices |
| `sudo_as_login` with fail-closed provider resolution | Queries answered with script-account permissions |
| `JWT_SECRET_KEY` of at least 32 characters, algorithm pinned on decode | Forged tokens via a guessable key or algorithm confusion |
| `iss` and `aud` claims required and verified | Tokens minted by another system sharing the signing key (e.g. staging) being accepted |
| Idle timeout enforced on read, not only by MongoDB's TTL monitor | Sessions remaining usable for a minute or more past expiry |
| No session ids or emails in security logs; login outage details logged, never returned | Logs used to target a session; unauthenticated callers learning internal URLs or errors |
| Login, refresh and logout run in the threadpool | A slow ShotGrid stalling every other request and WebSocket |
| Frontend refreshes on any API 401 and clears cached data when the user changes | A revoked session leaving a page of errors; one user's data shown to the next on a shared tab |
| HSTS honours `X-Forwarded-Proto` | HTTPS downgrade behind a TLS-terminating proxy |

### 3.2 Deliberate design choices

- **Session-existence check rather than strict `jti` matching.** All tabs share
  one refresh cookie, so requiring each access token's `jti` to equal the latest
  one issued would invalidate every other open tab whenever one refreshed. The
  15-minute lifetime bounds older tokens instead, and deleting a session still
  revokes all of them at once.
- **30-second reuse grace window.** Two tabs can present the same refresh secret
  before either receives the rotated cookie. Within 30 seconds of a rotation this
  is treated as that race; afterwards it is treated as theft.
- **One MongoDB session read per authenticated request, in the threadpool.**
  This lookup is what makes revocation immediate. The session store uses a
  synchronous driver; running authentication as a synchronous dependency keeps
  it off the event loop, and FastAPI's per-request dependency cache ensures the
  lookup happens once however many consumers need the caller's identity. The
  login, refresh and logout endpoints, which call ShotGrid and MongoDB, are
  synchronous for the same reason.
- **No ShotGrid token is kept, even to detect deactivation.** A stored ShotGrid
  refresh token would stop working once an account is disabled, but it is also
  a credential anyone reading the database could use against ShotGrid. Asking
  ShotGrid for the account's status with the script account gives the same
  signal without it. The trade-off: changing a ShotGrid password does not end
  existing DNA sessions; use logout everywhere, or deactivate the account.
- **A ShotGrid outage does not end sessions.** The ShotGrid check on refresh is
  how a deactivated account is noticed, so a refusal ends the session. When
  ShotGrid cannot be reached, nothing is known about the account; the session
  continues, the check is retried on the next refresh, and the 12-hour absolute
  lifetime still applies.
- **Credentials are never combined with a CORS wildcard.** With
  `AUTH_PROVIDER=shotgrid`, credentialed CORS is enabled only for an explicit
  `CORS_ALLOWED_ORIGINS` list. The Google deployment (`CORS_ALLOWED_ORIGINS=*`)
  is unaffected.
- **Refresh-cookie `SameSite` is configurable.** `Strict` works when the frontend
  and API share a site (for example `localhost:8080` and `localhost:8000`). Split
  deployments set `REFRESH_COOKIE_SAMESITE=none`, which requires `Secure` and
  relies on the CSRF header for cross-site protection.

---

## 4. HTTP API

### 4.1 Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /auth/login` | none | Report the login mode (`{"mode": "pat"}`) so the UI renders the right form |
| `POST /auth/login` | none | Exchange username + password for an access token and refresh cookie |
| `POST /auth/refresh` | cookie + `X-DNA-CSRF` | Rotate the refresh cookie and issue a new access token |
| `POST /auth/logout` | access token (even expired), or cookie + `X-DNA-CSRF` | End the current session and clear the cookie |
| `POST /auth/logout-all` | access token | End every session for the current user |
| `GET /auth/me` | access token | Return `email`, `name` and `shotgrid_user_id` |
| `GET /health` | none | Readiness: `mongo` (live ping) and `shotgrid` (startup credential check); 503 when either fails |

### 4.2 Status codes

| Code | Meaning |
|------|---------|
| `401` | Missing, invalid, expired or revoked token; session ended (logout, idle, maximum lifetime, reuse detected, ShotGrid account no longer active); or a session with no usable ShotGrid identity |
| `403` | ShotGrid denied access to the resource; the request targets another user's data; or `X-DNA-CSRF` is missing on a cookie-authenticated call |
| `503` | ShotGrid is unreachable or erroring, or the script account is misconfigured — including during login, where nothing is known about the credentials and a generic message is returned; or a logout could not be completed server-side |

### 4.3 ShotGrid error translation

ShotGrid reports permission denials, revoked identities and outages as the same
`shotgun_api3.Fault`. Unhandled, all three would surface as HTTP 500.
`classify_sg_fault` maps them to domain errors, and FastAPI exception handlers
turn those into status codes:

| ShotGrid condition | Domain error | HTTP |
|--------------------|--------------|------|
| `AuthenticationFault` | `ProdtrackAuthError` | 401 |
| Fault naming a permission problem | `ProdtrackPermissionError` | 403 |
| Any other fault | `ProdtrackUnavailableError` | 503 |

---

## 5. Configuration

### 5.1 Backend (`api` service)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `AUTH_PROVIDER` | No | `none` | `none`, `google` or `shotgrid` |
| `JWT_SECRET_KEY` | Yes\* | — | Access-token signing key; at least 32 characters (`openssl rand -hex 32`). The backend refuses to start otherwise |
| `JWT_ALGORITHM` | No | `HS256` | Signing algorithm, pinned on decode |
| `JWT_ISSUER` | No | `dna-backend` | `iss` claim issued and required |
| `JWT_AUDIENCE` | No | `dna-api` | `aud` claim issued and required |
| `JWT_EXPIRE_MINUTES` | No | `15` | Access-token lifetime |
| `SESSION_TTL_SECONDS` | No | `28800` | Idle timeout (8 hours) |
| `SESSION_MAX_LIFETIME_SECONDS` | No | `43200` | Absolute session lifetime (12 hours) |
| `CORS_ALLOWED_ORIGINS` | Yes\* | — | Explicit, comma-separated frontend origins. Never `*` with ShotGrid auth |
| `REFRESH_COOKIE_SAMESITE` | No | `strict` | `strict`, `lax` or `none` (frontend and API on different sites) |
| `REFRESH_COOKIE_SECURE` | No | `true` | Browsers treat `http://localhost` as secure, so the default works locally |
| `SHOTGRID_URL` | Yes\* | — | ShotGrid site URL |
| `SHOTGRID_SCRIPT_NAME`, `SHOTGRID_API_KEY` | Yes\* | — | Script account that performs `sudo_as_login`; verified at startup |
| `SG_SITE_TYPE` | No | `cloud` | `onprem` sites need no Personal Access Token |
| `SG_STARTUP_CHECK_TIMEOUT` | No | `10` | Seconds to wait for the startup credential check |
| `MONGODB_URL`, `MONGODB_DB` | No | `mongodb://localhost:27017`, `dna` | Session storage |
| `LOG_LEVEL` | No | `INFO` | Application log level |

\* Required when `AUTH_PROVIDER=shotgrid`.

### 5.2 Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_AUTH_PROVIDER` | `none`, `google` or `shotgrid` — must match the backend |
| `VITE_API_BASE_URL` | Backend URL. When unset, requests are relative to the page origin |

The frontend Docker image defaults to `google` for the GCP deployment. Build a
ShotGrid image with `--build-arg VITE_AUTH_PROVIDER=shotgrid`.

### 5.3 Enabling ShotGrid login locally

Step-by-step setup and a quick verification are in
[QUICKSTART.md § Authentication](QUICKSTART.md#authentication).

---

## 6. Code map

### 6.1 Backend

| File | Responsibility |
|------|----------------|
| `src/main.py` | `get_current_user` and `get_user_scoped_prodtrack_provider` dependencies; `/auth/*` endpoints; refresh-cookie and CSRF helpers; ShotGrid fault handlers; startup credential check (`lifespan`); `/health`; security headers |
| `src/dna/auth_providers/auth_provider_base.py` | Provider interface and `get_auth_provider` factory (`none`, `google`, `shotgrid`) |
| `src/dna/auth_providers/shotgrid_sso.py` | `ShotGridSSOProvider`: login, access-token validation with session check, refresh rotation and reuse detection, logout, logout-all, cookie settings |
| `src/dna/auth/shotgrid_auth_client.py` | Password verification against the ShotGrid token endpoint; HumanUser lookup and account-status check |
| `src/dna/auth/session_store.py` | `UserSession` and `ShotGridCredentials` models; `MongoSessionStore` with TTL indexes, blocklist and logout-all |
| `src/dna/auth/email.py` | Case-insensitive email comparison for same-user checks |
| `src/dna/cors_settings.py` | CORS settings; credentials only for ShotGrid auth with explicit origins |
| `src/dna/prodtrack_providers/prodtrack_provider_base.py` | `get_prodtrack_provider(sudo_login=...)` and the `Prodtrack*Error` domain errors |
| `src/dna/prodtrack_providers/shotgrid.py` | `ShotgridProvider` script connection with `sudo_as_login`; `sudo()` context; `classify_sg_fault` |
| `src/dna/auth_providers/google_auth_provider.py`, `noop_auth_provider.py` | Google and no-auth providers, unchanged |

### 6.2 Frontend

| File | Responsibility |
|------|----------------|
| `src/contexts/ShotGridAuthContext.tsx` | Login, refresh scheduling before expiry, on tab visibility and on API 401s; session restore from the cookie; logout and logout-everywhere |
| `src/contexts/AuthContext.tsx` | Shared `useAuth()` context; selects the noop, Google or ShotGrid provider and adapts ShotGrid to the shared shape |
| `src/components/ShotGridLoginPage.tsx` | Username + password form |
| `src/App.tsx` | Shows `ShotGridLoginPage` when `authProvider === 'shotgrid'` and the user is not signed in; clears cached data and selection when the signed-in user changes |
| `packages/core/src/apiHandler.ts` | `setUnauthorizedHandler`: notifies the auth context when an API call returns 401 |

---

## 7. Testing

### 7.1 Automated

Run from `backend/`:

```bash
python -m pytest tests/test_auth_prod.py tests/test_shotgrid_auth_client.py tests/test_cors_settings.py -v
```

| File | Covers |
|------|--------|
| `tests/test_auth_prod.py` | No password or ShotGrid token in the model or database; JWT secret length; login and identity resolution; short-lived access tokens; session check on every request; refresh rotation, reuse detection, grace window and maximum lifetime; forged secrets rejected without revocation; concurrent refreshes with one winner; an inactive ShotGrid account revoking the session while an outage keeps it; idle expiry before MongoDB reaps the document; `iss`/`aud` enforcement; one authentication per request, off the event loop; logout and logout-all including fail-closed behaviour; `sudo_as_login` routing and fail-closed provider resolution; fault translation; cross-user 403; provider factory for all three providers; cookie attributes and CSRF enforcement over HTTP |
| `tests/test_shotgrid_auth_client.py` | Password grant, error messages shown to users, login-then-email user lookup, inactive accounts, account-status check, refusal vs outage classification |
| `tests/test_cors_settings.py` | Credentialed CORS only for ShotGrid with explicit origins; Google deployment unchanged |

The critical controls are mutation-tested — each defect was re-introduced and
the targeted test failed: removing the per-request session check, disabling
reuse detection, revoking on a forged secret, making the refresh swap
non-atomic, treating a ShotGrid outage as a refusal, accepting expired but
unreaped sessions, skipping audience verification, authenticating twice per
request, and moving authentication or the login and refresh endpoints back onto
the event loop.

The same behaviours were also verified against a real MongoDB instance: eight
concurrent refreshes of one cookie produced exactly one rotation in every run,
and an expired session document still present in MongoDB was rejected.

### 7.2 Manual verification

```bash
# 1. Log in; the refresh cookie is saved to a cookie jar
TOKEN=$(curl -s -c jar.txt -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"you@studio.com","password":"<legacy-password>"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. The session resolves
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/auth/me

# 3. The stored session holds no password, no ShotGrid token, and only a refresh-token hash
docker exec dna-mongo mongosh dna --quiet \
  --eval 'printjson(db.dna_sessions.findOne({}, {shotgrid: 1, dna_refresh_token_hash: 1, _id: 0}))'

# 4. Refresh using only the cookie (expect 200 and a rotated cookie)
curl -s -b jar.txt -c jar.txt -X POST -H "X-DNA-CSRF: 1" http://localhost:8000/auth/refresh

# 5. Cross-user access is refused (expect 403)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/projects/user/someone.else@studio.com

# 6. Log out, then the access token no longer works (expect 401)
curl -s -b jar.txt -X POST -H "X-DNA-CSRF: 1" -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/auth/logout
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/auth/me
```

---

## 8. Known limitations and future work

| Item | Status |
|------|--------|
| Rate limiting on `POST /auth/login` | **Not implemented** — repeated password guessing is not throttled |
| Persistent authentication audit log (logins, failures, logouts) | Not implemented; events are written to application logs only |
| Access after deactivation | ShotGrid refuses to act as a deactivated user, so every ShotGrid-backed request fails at once. Endpoints that read only DNA's own data (e.g. draft notes) keep working until the next refresh — at most the 15-minute access-token lifetime |
| Password change ending DNA sessions | Not detected; existing sessions continue until a limit is reached. Use logout everywhere, or deactivate the account in ShotGrid |
| Access token readable by page JavaScript | By design: only the 15-minute access token is, the refresh token is not |
| Asynchronous session store | The store uses a synchronous MongoDB driver; authentication runs in FastAPI's threadpool to keep it off the event loop |
| Frontend "permission denied" view for 403 responses | Not implemented |
| Publishing drafts written by other users | Notes are created by impersonating each draft's author, so they are created with the author's ShotGrid permissions, not the requester's. Behaviour inherited from upstream; needs a product decision |
| `Content-Security-Policy` header | Not set; would further limit the impact of XSS on the in-page access token |
| Autodesk Identity SSO and `POST /auth/callback`; launching from ShotGrid (AMI) | Out of scope for this branch |
| MongoDB network exposure | Deployment concern: the local compose file publishes MongoDB without authentication. Sessions hold no credentials, but names and emails are readable |
