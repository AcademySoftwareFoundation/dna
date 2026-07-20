# DNA Authentication — Code Changes Summary

**Branch:** `dna/issue55-Autodesk-PAT-based-authentication-for-backend-API-endpoints`  
**Author:** Srijan Tripathi  
**Date:** July 2026

---

## 1. Overview

This change implements **PAT (Personal Access Token) based authentication** for DNA — specifically the legacy ShotGrid username + password flow — without ever storing the password in the session.

| Method | Description |
|--------|-------------|
| **ShotGrid PAT** | Username + ShotGrid Legacy Password (verified once, password discarded) |

The core principle: after ShotGrid validates the user's password at login, the password is **thrown away**. All subsequent ShotGrid queries run via the server's script account with `sudo_as_login=<username>`, so ShotGrid still enforces the user's own native permission group — but without keeping any user credential alive in the session.

---

## 2. Problem Statement

The original implementation had several gaps addressed in this PR:

- **Password stored in session** — ShotGrid username + password were kept in MongoDB sessions, which was flagged as a security risk. Stolen session data could expose ShotGrid credentials.
- **No session backend abstraction** — only Redis was supported; MongoDB (already in the stack) couldn't be used as an alternative.
- **`sudo_as_login` not used** — API calls to ShotGrid were either made with a script account (bypassing user permissions) or would have required a stored credential. This PR adds proper user-identity propagation via `sudo_as_login`.
- **Authorization bypass in `/projects/user/{email}`** — any authenticated user could read any other user's project list by substituting a different email in the URL path.
- **Inconsistent `self._sg` usage** — `search()` and `get_version_statuses()` called `self.sg.find()` directly (bypassing sudo), so the script account's permissions were used instead of the user's.

---

## 3. Architecture: How Authentication Works

### 3.1 Phase 1 — PAT Login (password verified then discarded)

```
Browser              Backend (FastAPI)         ShotGrid API          MongoDB
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
  │                        │  *** PASSWORD          │                   │
  │                        │      DISCARDED ***     │                   │
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
  │                        │   session_id: uuid,    │   insert_one      │
  │                        │   jti: uuid,           │   (8hr TTL index) │
  │                        │   email: <from SG>,    │ ─────────────────>│
  │                        │   name:  <from SG>,    │                   │
  │                        │   auth_provider: "pat",│                   │
  │                        │   shotgrid: {          │  stored; NO       │
  │                        │     user_id: <int>,    │  password field   │
  │                        │     username: <login>, │                   │
  │                        │     access_token: ..., │                   │
  │                        │     refresh_token: ... │                   │
  │                        │   }}                   │                   │
  │                        │                        │                   │
  │  DNA JWT (the "Key")   │                        │                   │
  │  { jti, session_id,    │                        │                   │
  │    email, exp }        │                        │                   │
  │ <──────────────────────│  ← no credentials      │                   │
  │  (stored in browser    │    inside the JWT      │                   │
  │   sessionStorage)      │                        │                   │
```

**Code — how the password is discarded:**

```python
# Step 1 — verify user's identity via ShotGrid
sg_token_set = sg_auth.login_user(username, password)
# password validated by ShotGrid; access_token + refresh_token returned

# Step 2 — look up canonical user record (id, real email, login name)
user_info = sg_auth.get_user_info(sg_token_set.access_token, username=username)
# all values come from ShotGrid — nothing hardcoded

# Step 3 — build session; password is simply NOT passed
shotgrid = ShotGridCredentials(
    user_id       = user_info.sg_user_id,       # ShotGrid integer PK
    username      = username,                    # login name for sudo_as_login
    access_token  = sg_token_set.access_token,   # stored for token refresh only
    refresh_token = sg_token_set.refresh_token,
    # password is verified once to confirm identity, then discarded
)
```

`username` (the ShotGrid login name) is safe to store — it is the user's public identifier, not a credential.

---

### 3.2 Phase 2 — Per-Request ShotGrid Call (`sudo_as_login`)

```
Browser                    Backend                          ShotGrid API       MongoDB
  │                           │                                  │                │
  │  GET /projects/user/{e}   │                                  │                │
  │  Authorization: Bearer    │                                  │                │
  │    <DNA JWT>              │                                  │                │
  │ ─────────────────────────>│                                  │                │
  │                           │  1. verify JWT sig + expiry      │                │
  │                           │  2. check jti not revoked        │                │
  │                           │  3. check path email matches     │                │
  │                           │     JWT email (403 if not)       │                │
  │                           │  4. get_session(session_id) ─────────────────────>│
  │                           │<─────────────────────────────────────────────────│
  │                           │     → session.sg_username                         │
  │                           │                                  │                │
  │                           │  ShotgridProvider(               │                │
  │                           │    sudo_user=username)           │                │
  │                           │                                  │                │
  │                           │  self._sg.find(...)              │                │
  │                           │  = script account +              │                │
  │                           │    sudo_as_login=username ───────>                │
  │                           │                                  │  enforces user's│
  │                           │                                  │  permission     │
  │                           │                                  │  group natively │
  │                           │<─────────────────────────────────                │
  │ <─────────────────────────│                                  │                │
```

**How `sudo_as_login` works:**

`shotgun_api3` supports `sudo_as_login`, which instructs ShotGrid to execute the query *as if* the named user made it, while the script account provides authentication. ShotGrid enforces the sudo user's own native permission group — identical to if they had logged in directly. This is Autodesk's recommended identity-broker pattern for server-to-server integrations.

```python
# get_prodtrack_provider() — resolves the right ShotGrid connection per request
if user_token:
    store = get_session_store()
    session = store.get_session(session_id) if session_id else None
    sudo_login = session.sg_username if (session and session.sg_username) else user_token
    return ShotgridProvider(sudo_user=sudo_login, session_id=session_id)
```

`user_token` is a presence signal (confirms authenticated PAT session), not a credential. The actual identity anchor is `session.sg_username` fetched from MongoDB.

---

### 3.3 Key Security Properties

- **No password stored anywhere** — password goes in, hits ShotGrid's API over HTTPS, and is immediately GC'd. Not in MongoDB, not in logs, not in the JWT.
- **DNA JWT carries no credentials** — `{ jti, session_id, email, exp }` only.
- **MongoDB is the source of truth** — a JWT is only valid if `session_id` resolves to a live MongoDB document (8h TTL); no session → 401 immediately.
- **JWT revocation** — logout deletes the session document and adds `jti` to the blocklist, preventing replay for the token's remaining lifetime.
- **User permissions enforced by ShotGrid** — `sudo_as_login` makes ShotGrid apply the user's own permission group; no custom permission logic in DNA.
- **Authorization check on path parameter** — `GET /projects/user/{email}` returns 403 if the JWT email doesn't match the path email, preventing cross-user data access.

---

## 4. Files Changed

### 4.1 `backend/src/dna/auth/session_store.py`

Three independent improvements:

#### A. `ShotGridCredentials` — password field removed entirely

The `password: Optional[str]` field has been **removed** — not made `None` by default, not made optional in a different way, but removed from the dataclass entirely. The password is now discarded at the point of ShotGrid verification and never reaches the session store.

```python
# Before — password field existed on the credentials dataclass
@dataclass
class ShotGridCredentials:
    user_id: int
    username: str = ""
    access_token: str = ""
    refresh_token: Optional[str] = None
    password: Optional[str] = None   # ← REMOVED (security risk)

# After — no password field
@dataclass
class ShotGridCredentials:
    user_id: int
    username: str = ""               # ShotGrid login name for sudo_as_login
    access_token: str = ""           # ShotGrid Bearer token (for token refresh)
    refresh_token: Optional[str] = None
```

The `username` field (ShotGrid login name) is the stable identity anchor enabling `sudo_as_login`. Safe to persist — it is the user's public ShotGrid username, not a secret.

#### B. SOLID restructuring — `ShotGridCredentials` nested dataclass

ShotGrid-specific fields are isolated in a nested dataclass instead of being flat on `UserSession`. Following the Open/Closed Principle — a new provider (Ftrack, Kitsu, etc.) adds its own dataclass and an `Optional` field on `UserSession` without touching existing ShotGrid code.

```python
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

Legacy property aliases (`sg_token`, `sg_user_id`, `sg_username`, `refresh_token`) remain on `UserSession` for backward compat.

#### C. MongoDB as the default session backend

Sessions default to MongoDB (`SESSION_BACKEND=mongo`) — using the same instance already running for DNA data.

```
dna_sessions        ← user sessions (8-hour TTL index on expires_at)
dna_oauth_states    ← CSRF state tokens (10-minute TTL)
dna_token_blocklist ← revoked JWT jti values
```

`AbstractSessionStore` ABC ensures any future backend (Redis, DynamoDB, Postgres) can be swapped in without touching application code.

---

### 4.2 `backend/src/dna/auth_providers/shotgrid_sso.py`

**`login()` method** — password is verified via `login_user(username, password)` to obtain the ShotGrid access token, but is not passed to `ShotGridCredentials`. The `username` is stored for `sudo_as_login`.

```python
shotgrid = ShotGridCredentials(
    user_id       = user_info.sg_user_id,
    username      = username,                    # used as sudo_as_login on every request
    access_token  = sg_token_set.access_token,
    refresh_token = sg_token_set.refresh_token,
    # password is verified once here to confirm identity, then discarded
)
```

---

### 4.3 `backend/src/dna/prodtrack_providers/prodtrack_provider_base.py`

**`get_prodtrack_provider()`** — removed the old login+password branch. Now always routes authenticated sessions through `ShotgridProvider(sudo_user=session.sg_username)`.

```python
# Before — had a branch attempting to authenticate with stored password
if session.sg_password and session.sg_username:
    return ShotgridProvider(login=..., password=...)   # ← REMOVED

# After — always use script account + sudo_as_login
if user_token:
    store = get_session_store()
    session = store.get_session(session_id) if session_id else None
    sudo_login = session.sg_username if (session and session.sg_username) else user_token
    return ShotgridProvider(sudo_user=sudo_login, session_id=session_id)
```

---

### 4.4 `backend/src/dna/prodtrack_providers/shotgrid.py`

Two sudo-context propagation fixes:

- **B-02** — `search()` (~line 507): `self.sg.find(` → `self._sg.find(`
- **B-03** — `get_version_statuses()` (~line 669): `self.sg.schema_field_read(` → `self._sg.schema_field_read(`

`self._sg` returns the active sudo connection (script account + `sudo_as_login`). `self.sg` is the raw script connection that bypasses sudo. These two methods were accidentally running under the script account's permissions rather than the user's.

---

### 4.5 `backend/src/main.py`

**S-07 fix** — `GET /projects/user/{email}` now validates path email matches JWT email:

```python
async def get_projects_for_user(
    user_email: str, provider: ProdtrackProviderDep, current_user: CurrentUserDep
) -> list[Project]:
    if os.getenv("AUTH_PROVIDER", "none") != "none" and not emails_match(current_user, user_email):
        raise HTTPException(status_code=403, detail="Access denied.")
    return provider.get_projects_for_user(user_email)
```

`emails_match()` is case-insensitive. The guard is skipped when `AUTH_PROVIDER=none` (dev mode).

---

## 5. Environment Variables

### Backend (`docker-compose.local.yml` → `api` service)

| Variable | Required For | Description |
|----------|-------------|-------------|
| `AUTH_PROVIDER` | All | Must be `shotgrid` to enable token auth |
| `SHOTGRID_AUTH_MODE` | All | `pat` — shows username + legacy password login form |
| `JWT_SECRET_KEY` | All | Secret key for signing DNA JWTs (min 32 chars) |
| `JWT_EXPIRE_MINUTES` | All | JWT lifetime (default: 480 min = 8 hours) |
| `SESSION_BACKEND` | All | `mongo` (default) or `redis` |
| `MONGODB_URL` | mongo backend | MongoDB connection string (e.g. `mongodb://mongo:27017`) |
| `MONGODB_DB` | mongo backend | MongoDB database name (default: `dna`) |
| `SESSION_TTL_SECONDS` | All | Session lifetime (default: 28800 = 8 hours) |
| `SHOTGRID_URL` | PAT | ShotGrid instance URL |
| `SHOTGRID_SCRIPT_NAME` | PAT | Script account name — used for `sudo_as_login` queries |
| `SHOTGRID_API_KEY` | PAT | Script account API key — used with `sudo_as_login` |

### Frontend (`.env` / Docker build args)

| Variable | Description |
|----------|-------------|
| `VITE_AUTH_PROVIDER` | Must be `shotgrid` |
| `VITE_API_BASE_URL` | Backend API URL |

---

## 6. Production Deployment Considerations

### Password security
- The user's ShotGrid password is **never persisted** — it exists in memory only for the single HTTPS call to ShotGrid's token endpoint, then is discarded.
- A compromised MongoDB session exposes the ShotGrid `access_token` (which expires and can be rotated) but never the user's password.

### `sudo_as_login` and script account
- The script account (`SHOTGRID_SCRIPT_NAME` / `SHOTGRID_API_KEY`) must have sufficient ShotGrid permissions to proxy queries for all users. Script accounts are typically created with Admin-equivalent read access.
- ShotGrid enforces the sudo user's native permission group on every query — DNA does not need to implement its own permission filtering.

### Session storage (MongoDB — default)
- Default `SESSION_BACKEND=mongo` reuses the same MongoDB instance as DNA's data storage — no extra service needed in production.
- Sessions stored in `dna_sessions` with a TTL index; expired documents are cleaned by MongoDB's background TTL thread (runs every ~60 seconds).
- For production, MongoDB should have persistence enabled (the default for `mongo:7` with a named volume).

### Token revocation
- Logout deletes the MongoDB session and blocklists the `jti` — token replay is impossible even if the JWT was captured in transit.
- Blocklist entries may linger up to ~60s past their TTL due to the MongoDB TTL thread cadence; this is strictly more conservative (safer).

---

## 7. What Was NOT Changed

- The ShotGrid legacy username + password login UX is **unchanged** from the user's perspective.
- All downstream API endpoints (`/projects`, `/playlists`, `/versions`, `/notes`, etc.) are unchanged — they accept the same `Authorization: Bearer <jwt>` header.
- The AMI (Application Managed Interface) flow — launching DNA from within ShotGrid via session token — is out of scope for this PR.
- Autodesk SSO / Google OAuth — out of scope for this PR.

---

## 8. Summary of Files Modified

| File | Change |
|------|--------|
| `backend/src/dna/auth/session_store.py` | Removed `password` field from `ShotGridCredentials`; added `username` for `sudo_as_login`; MongoDB default backend; `AbstractSessionStore` ABC; `ShotGridCredentials` nested dataclass |
| `backend/src/dna/auth_providers/shotgrid_sso.py` | `login()` — password discarded after SG verification; `username` stored; no `password=` in `ShotGridCredentials` constructor |
| `backend/src/dna/prodtrack_providers/prodtrack_provider_base.py` | Removed login+password branch; always uses `ShotgridProvider(sudo_user=session.sg_username)` |
| `backend/src/dna/prodtrack_providers/shotgrid.py` | `search()` and `get_version_statuses()` use `self._sg` (sudo-aware) instead of `self.sg` (bypasses sudo) |
| `backend/src/main.py` | `get_projects_for_user` — 403 guard if JWT email ≠ path email (S-07) |
| `backend/docker-compose.yml` | MongoDB service added; `SESSION_BACKEND=mongo` configured |
| `backend/requirements.txt` | `pymongo` added |

---

## 9. Issues Deferred to Future PRs

| ID | Category | Description |
|----|----------|-------------|
| S-05 | Security | ShotGrid `access_token` may appear in server logs on exceptions |
| S-06 | Security | DNA JWT stored in `localStorage` — move to `sessionStorage` or `httpOnly` cookie |
| S-08 | Security | No rate limiting on `POST /auth/login` — brute-force possible |
| S-09 | Security | Deactivating a ShotGrid user does not invalidate their live DNA session |
| O-04 | Security | Session sub-documents stored in plaintext in MongoDB — consider AES-256-GCM encryption at rest |
| B-05 | Bug | `HumanUser.login` vs `HumanUser.email` field mismatch on cloud ShotGrid instances |
| S-01/S-02 | AMI | HMAC signature on AMI session token not enforced; no timestamp validation |
| B-01 | AMI | AMI sessions fall through to script mode — need dedicated session creation |
| A-01 | Ops | No startup health check that verifies script account can authenticate to ShotGrid |
| O-01 | Ops | No audit log for login / logout / token refresh events |
