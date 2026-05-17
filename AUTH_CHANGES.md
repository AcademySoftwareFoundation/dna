# DNA Authentication — Code Changes Summary

**Branch:** `dna/issue55-token-based-authentication-for-backend-API-endpoints`  
**Author:** Srijan Tripathi  
**Date:** May 2026

---

## 1. Overview

This change replaces DNA's original single-method authentication (ShotGrid username + password only) with a **multi-provider authentication system** supporting three login methods:

| Method | Description |
|--------|-------------|
| **ShotGrid PAT** | Username + ShotGrid Legacy Password (original method, kept) |
| **ShotGrid SSO (Autodesk APS)** | OAuth2 popup via Autodesk Platform Services |
| **Google OAuth2** | Sign in with Google account |

All three methods produce the same result: a short-lived **DNA JWT** stored client-side, with the actual credentials (ShotGrid token, Google token) stored **server-side in MongoDB** (or optionally Redis) and never exposed to the browser.

---

## 2. Problem Statement

The original implementation had several gaps:

- **Single auth method only** — only username + password (ShotGrid PAT) was supported
- **No SSO** — users at studios using Autodesk cloud (ASWF) had no single sign-on option  
- **No Google auth** — no alternative for users who don't have ShotGrid credentials  
- **Insecure token handling** — the ShotGrid session token was stored in browser localStorage, exposing it to XSS attacks
- **No session invalidation** — logging out did not revoke the token server-side
- **Stale session bug** — after a backend restart, the browser would silently use an expired session and receive 401 errors on every API call with no clear indication to re-login

---

## 3. Architecture: How Authentication Works

### 3.1 ShotGrid PAT Login Flow (fully satisfies Issue #55)

The PAT flow is the primary path that satisfies the issue's core requirement: every ShotGrid query runs under the **user's own token**, so ShotGrid enforces its native permission model.

```
Browser              Backend (FastAPI)         ShotGrid API          Redis
  │                        │                        │                   │
  │  POST /auth/login      │                        │                   │
  │  { username, password }│                        │                   │
  │ ──────────────────────>│                        │                   │
  │                        │  POST /api/v1/auth/    │                   │
  │                        │    access_token        │                   │
  │                        │  { grant_type:         │                   │
  │                        │    "password",         │                   │
  │                        │    username, password }│                   │
  │                        │ ──────────────────────>│                   │
  │                        │                        │  validate creds   │
  │                        │  { access_token,       │  against SG user  │
  │                        │    refresh_token }     │  database         │
  │                        │ <──────────────────────│                   │
  │                        │                        │                   │
  │                        │  find_one("HumanUser", │                   │
  │                        │   [["email","is",      │                   │
  │                        │     username]])        │                   │
  │                        │  ─ ─ ─(script creds)─>│                   │
  │                        │                        │  looks up real    │
  │                        │  { id, name, email,    │  user record      │
  │                        │    login }             │                   │
  │                        │ <─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │                   │
  │                        │                        │                   │
  │                        │  UserSession {         │                   │
  │                        │   session_id: uuid,    │                   │
  │                        │   jti: uuid,           │                   │
  │                        │   email: <from SG>,    │  SETEX (8hr TTL)  │
  │                        │   name:  <from SG>,    │ ─────────────────>│
  │                        │   sg_user_id: <from SG>│                   │
  │                        │   sg_token: <SG token> │                   │
  │                        │   auth_provider: "pat"}│                   │
  │                        │                        │                   │
  │  DNA JWT               │                        │                   │
  │  { jti, session_id,    │                        │                   │
  │    email, exp }        │                        │                   │
  │  ──────────────────────│  ← no credentials      │                   │
  │  (stored in browser    │    inside the JWT      │                   │
  │   sessionStorage)      │                        │                   │
  │                        │                        │                   │
  │                        │                        │                   │
  │  ══ Every subsequent API call ══════════════════════════════════════│
  │                        │                        │                   │
  │  GET /projects/user/.. │                        │                   │
  │  Authorization:        │                        │                   │
  │    Bearer <DNA JWT>    │                        │                   │
  │ ──────────────────────>│                        │                   │
  │                        │  1. verify JWT         │                   │
  │                        │     signature + expiry │                   │
  │                        │  2. check jti not in   │                   │
  │                        │     blocklist          │                   │
  │                        │  3. GET session        │                   │
  │                        │     → fetch sg_token   │ ─────────────────>│
  │                        │                        │  <────────────────│
  │                        │  4. SG query with      │                   │
  │                        │     USER'S OWN token   │                   │
  │                        │  ─────────────────────>│                   │
  │                        │                        │  ShotGrid enforces│
  │                        │                        │  user's own       │
  │                        │                        │  permissions      │
  │                        │  project list          │                   │
  │                        │ <──────────────────────│                   │
  │  project list          │                        │                   │
  │ <──────────────────────│                        │                   │
```

**Why user identity is NOT hardcoded for PAT:**

After ShotGrid validates the password and returns an `access_token`, the backend immediately makes a second call to ShotGrid to look up the real `HumanUser` record by email:

```python
# Step 1 — get user's ShotGrid access token
sg_token_set = sg_auth.login_user(username, password)
#   → calls POST /api/v1/auth/access_token with grant_type=password
#   → ShotGrid validates credentials against its own user database
#   → returns access_token + refresh_token

# Step 2 — look up real user identity from ShotGrid
user_info = sg_auth.get_user_info(sg_token_set.access_token, username=username)
#   → queries ShotGrid HumanUser entity by email using script credentials
#   → returns: sg_user_id (real integer SG ID), name, email, login
#   → ALL VALUES come from ShotGrid — nothing is hardcoded

# Step 3 — store in Redis
session = UserSession(
    email    = user_info.email,       # ← from ShotGrid, not from login form
    name     = user_info.name,        # ← from ShotGrid
    sg_user_id = user_info.sg_user_id,# ← real ShotGrid integer ID
    sg_token = sg_token_set.access_token,  # ← user's personal SG token
    ...
)
```

The `sg_user_id` in the Redis session is the actual integer primary key of the `HumanUser` record in ShotGrid's database — fetched live at login time, never hardcoded.

**Fallback:** If `SHOTGRID_SCRIPT_NAME` and `SHOTGRID_API_KEY` are not configured, the backend trusts the authenticated email directly and sets `sg_user_id=0`. This is a degraded mode — the email-based identification still works for DNA, but the numeric ShotGrid user ID won't be available. For production the script credentials should always be set.

---

### 3.2 Request Lifecycle (all auth methods)

```
Browser                    Backend                       Redis
  │                           │                             │
  │  GET /projects            │                             │
  │  Bearer: <DNA JWT>        │                             │
  │ ─────────────────────────>│                             │
  │                           │  decode + verify JWT sig    │
  │                           │  check jti not in blocklist │──> GET dna:blocklist:{jti}
  │                           │  extract session_id         │
  │                           │  fetch full session         │──> GET dna:session:{id}
  │                           │<────────────────────────────│
  │                           │  use sg_token from session  │
  │                           │  call ShotGrid API ────────>  (user's own perms)
  │  response                 │<────────────────────────────
  │<──────────────────────────│
```

**Key security properties:**
- The DNA JWT contains only: `jti` (unique ID), `session_id`, `email`, `exp` — **no credentials**
- The real ShotGrid token lives only in Redis with an 8-hour TTL — never sent to the browser
- Token revocation: logout adds `jti` to a Redis blocklist and deletes the session — the token cannot be replayed even if intercepted
- Every request makes a live Redis lookup — if the session is gone (logout, expiry, restart), it fails immediately with 401
- ShotGrid queries run under the user's own token → ShotGrid enforces their native project permissions

---

### 3.3 Limitations of Google Auth (outside Issue #55 scope)

Google authentication is an **addition** to this PR, not part of the original issue. Because a Google account has no inherent link to a ShotGrid account, Google users cannot have a personal ShotGrid token. Instead:

```
Google User request
  → Redis session: { auth_provider: "google", sg_token: "" }
  → Backend detects no sg_token
  → Falls back to SHOTGRID_API_KEY (script/service account)
  → ShotGrid query runs as service account, NOT the user
```

This means Google users see whatever the service account can see — **ShotGrid's per-user permission model is not enforced for Google sessions**. This is a known gap. Full implementation would require linking the Google account to a ShotGrid user record (email match or one-time confirmation step).

---

## 4. Files Changed

### 4.1 `backend/src/dna/auth/session_store.py`

**What changed (three independent improvements):**

#### A. MongoDB as the default session backend (replaces Redis)

Previously, sessions were stored in Redis — a separate service that had to run alongside the backend. The team noted that MongoDB is already in the DNA stack for storage, so adding Redis for sessions was an unnecessary extra dependency.

The file now ships two concrete implementations behind an `AbstractSessionStore` interface, and the backend env var `SESSION_BACKEND` selects which one to use:

```
SESSION_BACKEND=mongo   ← default, uses existing MongoDB, no extra service
SESSION_BACKEND=redis   ← opt-in, for deployments that already have Redis
```

MongoDB stores sessions in three collections with TTL indexes so expired documents are automatically cleaned up:

```
dna_sessions        ← user sessions (8-hour TTL)
dna_oauth_states    ← CSRF state tokens (10-minute TTL)
dna_token_blocklist ← revoked JWT jti values
```

#### B. SOLID restructuring — `ShotGridCredentials` nested dataclass

Previously, ShotGrid-specific fields (`sg_token`, `sg_user_id`, `sg_password`, `refresh_token`) were flat fields on `UserSession`. This made it hard for developers adding a new provider (Ftrack, Kitsu, etc.) to know which fields were generic vs ShotGrid-specific.

Following the **Open/Closed Principle** — open for extension, closed for modification — provider-specific credentials are now nested in typed dataclasses:

```python
# Before — ShotGrid-specific fields mixed with generic identity
@dataclass
class UserSession:
    session_id: str
    jti: str
    email: str
    name: str
    auth_provider: str
    sg_user_id: int          # ← ShotGrid-specific
    sg_token: str            # ← ShotGrid-specific
    refresh_token: str       # ← ShotGrid-specific
    sg_password: str         # ← ShotGrid-specific

# After — generic identity at top level, ShotGrid fields isolated
@dataclass
class ShotGridCredentials:         # NEW: ShotGrid-specific credentials
    user_id: int
    access_token: str
    refresh_token: Optional[str] = None
    password: Optional[str] = None   # PAT path only

@dataclass
class UserSession:
    session_id: str
    jti: str
    email: str
    name: str
    auth_provider: str
    created_at: float = ...
    # Provider credentials — add new providers here, never touch existing ones
    shotgrid: Optional[ShotGridCredentials] = None
    # future: ftrack: Optional[FtrackCredentials] = None
```

A developer adding Ftrack support would:
1. Create `FtrackCredentials` dataclass
2. Add `ftrack: Optional[FtrackCredentials] = None` to `UserSession`
3. **Never touch any existing ShotGrid code**

Legacy property aliases (`sg_token`, `sg_user_id`, `sg_password`, `refresh_token`) are kept on `UserSession` so all existing call-sites continue to work during the transition.

#### C. `AbstractSessionStore` ABC interface

The new abstract base class means any future storage backend (DynamoDB, Postgres, Redis Cluster) can be added by implementing 9 methods — without touching any application code.

---

### 4.2 `backend/src/dna/auth_providers/shotgrid_sso.py`

This is the main auth provider class. Three significant additions:

#### A. `get_login_info()` — multi-provider mode discovery

The frontend calls `GET /auth/login` on startup to discover which login methods are available. Previously it returned a single `mode: "pat"` or `mode: "sso"`. Now it returns a structured object:

```json
{
  "modes": {
    "shotgrid_pat": { "enabled": true },
    "shotgrid_sso": { "enabled": true, "redirect_url": "https://..." },
    "google":       { "enabled": true }
  }
}
```

- `shotgrid_pat` is always enabled (no env vars required)
- `shotgrid_sso` is enabled when `SHOTGRID_CLIENT_ID` is set in the environment
- `google` is enabled when `GOOGLE_CLIENT_ID` is set in the environment
- Legacy `mode` and `redirect_url` fields are still returned for backward compatibility

#### B. `handle_google_login(google_token)` — new Google auth path

```
Browser                        Backend
  │                               │
  │── POST /auth/google/login ───>│
  │   { token: <google_token> }   │── GoogleAuthProvider.validate_token()
  │                               │       └── calls Google tokeninfo API
  │                               │       └── calls Google userinfo API
  │                               │── create UserSession (auth_provider="google")
  │                               │── store in Redis
  │<── DNA JWT ───────────────────│
```

The Google access token is validated server-side against Google's API — it is **never trusted blindly**. After validation, the session is tagged `auth_provider="google"` so downstream code knows not to use ShotGrid credentials.

#### C. `_build_sg_oauth2_redirect()` — APS OAuth2 popup flow

Builds the Autodesk Platform Services authorization URL for the ShotGrid SSO popup. Key fixes applied during development:
- Removed unsupported `nonce` parameter (APS v2 rejects it)
- Scopes set to `openid user-profile:read data:read`

---

### 4.3 `backend/src/main.py`

Three changes:

#### A. `POST /auth/google/login` — new endpoint

```python
@app.post("/auth/google/login")
async def auth_google_login(body: GoogleLoginRequest, auth_provider: AuthProviderDep):
    return auth_provider.handle_google_login(body.token)
```

Accepts a Google OAuth2 access token from the browser and returns a DNA JWT. Errors produce HTTP 401 with a descriptive message.

#### B. `get_user_scoped_prodtrack_provider` — Google session support

Every API endpoint that needs ShotGrid data uses this FastAPI dependency. It was updated to skip ShotGrid token lookup for Google sessions and fall back to the service account (script credentials):

```python
# Before: always tried to get user's SG token (fails for Google users)
sg_token = session.sg_token

# After: only use user token for ShotGrid sessions
if session.auth_provider != "google" and session.sg_token:
    sg_token = session.sg_token
# Google users → sg_token stays None → uses script credentials
```

#### C. `GET /auth/me` — proper session expiry handling

This endpoint is called by the frontend on every page load to validate the stored JWT. Previously it silently ignored a missing Redis session and returned HTTP 200 — so a backend restart (which wipes Redis) would let users reach the app with dead sessions that then got 401 on every API call.

```python
# Before
except ValueError:
    pass   # silently returns 200 even when session is gone

# After
except ValueError as exc:
    raise HTTPException(status_code=401, detail=str(exc))
    # Frontend sees 401 → clears token → shows login page
```

---

### 4.4 `frontend/packages/app/src/contexts/ShotGridAuthContext.tsx`

Complete rewrite. Key changes:

#### A. New types for multi-provider support

```typescript
export interface LoginModes {
  shotgrid_pat: { enabled: boolean };
  shotgrid_sso: { enabled: boolean; redirect_url?: string };
  google:       { enabled: boolean };
}
```

#### B. New auth methods on the context

| Method | Description |
|--------|-------------|
| `signIn(username, password)` | ShotGrid PAT login (unchanged) |
| `signInWithSso('shotgrid_sso')` | Opens Autodesk SSO popup |
| `signInWithGoogleToken(token)` | Sends Google token to backend, receives DNA JWT |

#### C. Stale session fix — robust mount-time validation

On every page load, the stored JWT is validated against `/auth/me`. The validation now handles **both** HTTP errors and network errors (backend restarting):

```typescript
// Before: network errors silently kept the stale token
try {
  const res = await fetch('/auth/me', ...);
  if (!res.ok) clearToken();
} catch { /* token NOT cleared */ }

// After: any failure clears the token
let tokenValid = false;
try {
  tokenValid = (await fetch('/auth/me', ...)).ok;
} catch {
  tokenValid = false;  // network error = treat as invalid
}
if (!tokenValid) clearToken();  // always clear on any failure
```

#### D. SSO popup relay via `window.postMessage`

The OAuth2 SSO flow opens a popup window. After Autodesk/Google redirects back, the popup sends the auth code to the parent tab via `postMessage`, then closes itself. The parent tab completes the exchange with the backend. This avoids full-page navigation interrupting the user's context.

---

### 4.5 `frontend/packages/app/src/components/ShotGridLoginPage.tsx`

Complete rewrite with a unified multi-provider login UI:

```
┌─────────────────────────────────┐
│         [DNA Logo]              │
│      Sign in to DNA             │
│   Choose how you'd like to      │
│         sign in                 │
│                                 │
│  CONTINUE WITH                  │
│  ┌─────────────────────────┐    │
│  │  G  Sign in with Google │    │
│  └─────────────────────────┘    │
│                                 │
│  ─────── or sign in with ───────│
│           ShotGrid              │
│                                 │
│  [Autodesk SSO] [Password Login]│  ← tabs, shown only if both enabled
│                                 │
│  ┌─────────────────────────┐    │
│  │  Sign in with Autodesk  │    │  ← SSO tab
│  └─────────────────────────┘    │
│                                 │
│  [or]                           │
│                                 │
│  Email: ___________________     │  ← PAT tab
│  Password: _______________      │
│  [Sign in]                      │
└─────────────────────────────────┘
```

Sections appear conditionally based on what the backend reports as enabled:
- Google button: only if `GOOGLE_CLIENT_ID` is configured
- Autodesk SSO: only if `SHOTGRID_CLIENT_ID` is configured  
- Tab switcher: only if **both** SSO and PAT are enabled
- PAT form: shown directly if SSO is disabled

---

### 4.6 `frontend/packages/app/src/main.tsx`

Added conditional `GoogleOAuthProvider` wrapping:

```typescript
// Only wrap with GoogleOAuthProvider when client ID is available
// (GoogleOAuthProvider is required by useGoogleLogin hook)
createRoot(document.getElementById('root')!).render(
  googleClientId
    ? <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider>
    : app
);
```

---

## 5. Environment Variables

### Backend (`docker-compose.local.yml` → `api` service)

| Variable | Required For | Description |
|----------|-------------|-------------|
| `AUTH_PROVIDER` | All | Must be `shotgrid` to enable token auth |
| `JWT_SECRET_KEY` | All | Secret key for signing DNA JWTs (min 32 chars) |
| `JWT_EXPIRE_MINUTES` | All | JWT lifetime (default: 480 min = 8 hours) |
| `SESSION_BACKEND` | All | `mongo` (default) or `redis` — selects session store backend |
| `MONGODB_URL` | mongo backend | MongoDB connection string (default: `mongodb://localhost:27017`) |
| `MONGODB_DB` | mongo backend | MongoDB database name (default: `dna`) |
| `REDIS_URL` | redis backend | Redis connection string — only needed when `SESSION_BACKEND=redis` |
| `SESSION_TTL_SECONDS` | All | Session lifetime (default: 28800 = 8 hours) |
| `SHOTGRID_CLIENT_ID` | SSO only | APS OAuth2 app client ID — enables Autodesk SSO tab |
| `SHOTGRID_CLIENT_SECRET` | SSO only | APS OAuth2 app client secret |
| `AUTH_CALLBACK_URL` | SSO only | Redirect URI registered in APS app (e.g. `http://localhost:8080/auth/callback`) |
| `GOOGLE_CLIENT_ID` | Google only | Google OAuth2 client ID — enables Google login button |

### Frontend (Docker build args)

| Variable | Description |
|----------|-------------|
| `VITE_AUTH_PROVIDER` | Must be `shotgrid` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth2 client ID (same as backend `GOOGLE_CLIENT_ID`) |
| `VITE_API_BASE_URL` | Backend API URL |

---

## 6. Production Deployment Considerations

### Security
- **JWTs are short-lived** (8 hours by default, configurable via `JWT_EXPIRE_MINUTES`)
- **Redis is the source of truth** — a JWT is only valid if its `session_id` exists in Redis; logout immediately invalidates the session server-side
- **Token revocation** — the `jti` claim is blocklisted in Redis on logout, preventing replay attacks for the token's remaining lifetime
- **No credentials in JWTs** — ShotGrid tokens and Google tokens never leave the server

### Session Storage (MongoDB — default)
- The default `SESSION_BACKEND=mongo` uses the same MongoDB instance already running for DNA's data storage — no extra service needed
- Sessions are stored in `dna_sessions` with a TTL index; expired documents are cleaned automatically by MongoDB's background TTL thread (runs every ~60 seconds — the brief lag is fine and actually slightly more conservative/secure for blocklist entries)
- For production, MongoDB should have persistence enabled (default for `mongo:7` with a named volume)
- To switch to Redis: set `SESSION_BACKEND=redis` and `REDIS_URL` — the rest of the code is unchanged

### Session Storage (Redis — opt-in)
- Only needed when `SESSION_BACKEND=redis` is explicitly set
- Redis must be persistent in production (enable AOF or RDB snapshots) — without persistence, a Redis restart logs out all users
- The session TTL defaults to 8 hours — configurable via `SESSION_TTL_SECONDS`

### Google OAuth
- The Google OAuth2 Client ID must have the production domain added to **Authorized JavaScript Origins** in Google Cloud Console
- The same client ID is used in both backend (`GOOGLE_CLIENT_ID`) and frontend (`VITE_GOOGLE_CLIENT_ID`)
- Google users use the shared ShotGrid script account for production tracking queries (they don't have a personal ShotGrid token); access control is managed at the application level

### ShotGrid SSO (Autodesk APS)
- The APS OAuth2 application must be registered as a **Traditional Web App** (not a Hub App) at `aps.autodesk.com/myapps`
- The `AUTH_CALLBACK_URL` must be registered as a redirect URI in the APS app settings
- In production this would be `https://your-domain.com/auth/callback`

---

## 7. What Was NOT Changed

- The ShotGrid PAT (username + password) login flow is **fully backward compatible** — existing users are unaffected
- All downstream API endpoints (`/projects`, `/playlists`, `/versions`, `/notes`, etc.) are unchanged — they continue to accept the same `Authorization: Bearer <jwt>` header
- The AMI (Application Managed Interface) flow — launching DNA from within ShotGrid via session token — is unchanged

---

## 8. Summary of Files Modified

| File | Type | Change |
|------|------|--------|
| `backend/src/dna/auth/session_store.py` | Backend | MongoDB session backend (default); `ShotGridCredentials` dataclass; `AbstractSessionStore` ABC; legacy property aliases for backward compat |
| `backend/src/dna/auth_providers/shotgrid_sso.py` | Backend | All `UserSession` construction sites updated to use `shotgrid=ShotGridCredentials(...)`; imports `ShotGridCredentials` |
| `backend/src/main.py` | Backend | New `/auth/google/login` endpoint, Google session support, `/auth/me` fix |
| `backend/docker-compose.local.yml` | Config | Added `SESSION_BACKEND=mongo` and `MONGODB_URL`; Redis URL commented out |
| `frontend/packages/app/src/contexts/ShotGridAuthContext.tsx` | Frontend | Multi-provider context, robust session validation |
| `frontend/packages/app/src/components/ShotGridLoginPage.tsx` | Frontend | New multi-provider login UI |
| `frontend/packages/app/src/main.tsx` | Frontend | Conditional `GoogleOAuthProvider` wrapper |
| `frontend/packages/app/src/contexts/index.ts` | Frontend | Export new types |
