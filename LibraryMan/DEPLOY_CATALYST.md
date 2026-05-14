# 🚀 LibraryMan — Deploy to Zoho Catalyst

Full guide to host LibraryMan on Catalyst with **Data Store** + **Authentication** + **Authorization**.

---

## 0. Architecture

```
┌────────────────────────┐        ┌─────────────────────────────┐
│  Web Client Hosting    │  HTTPS │  AdvancedIO Function         │
│  (client/dist)         │ ─────▶ │  (server/index.js)           │
│  React + Catalyst SDK  │ cookie │  Express + zcatalyst-sdk     │
└─────────┬──────────────┘        └────────┬────────────────────┘
          │                                │
          │  Catalyst Auth (iframe)        │  Data Store SDK
          ▼                                ▼
   ┌──────────────────┐            ┌─────────────────┐
   │ Catalyst Auth    │            │ Catalyst Data   │
   │ (Users + Roles)  │            │ Store: Books,   │
   └──────────────────┘            │     BookLoans   │
                                   └─────────────────┘
```

- **Auth** — Catalyst Embedded iframe renders sign-in/sign-up; session cookie is automatically sent with every API call (`withCredentials: true`).
- **Authz** — Each Catalyst user has a role (`admin` or `member`) stored in `user.role_details.role_name`. The backend middleware `requireRole(...)` blocks forbidden actions with HTTP 403.
- **Persistence** — Two Data Store tables: `Books` and `BookLoans`. Schema lives in `server/catalyst-datastore.json`.

---

## 1. Prerequisites

```bash
node --version   # ≥ 18 recommended (Catalyst function runtime: node18)
npm install -g zcatalyst-cli
catalyst --version
catalyst login
```

---

## 2. Create the Catalyst project

1. Go to **https://catalyst.zoho.com → Create New Project → "LibraryMan"**.
2. On the project home, enable these components:
   - ✅ **Authentication** (under *Serverless* → *Authentication*)
   - ✅ **Data Store**
   - ✅ **Functions**
   - ✅ **Web Client Hosting**

---

## 3. Configure Authentication

### 3.1 Allowed sign-up methods
*Authentication → Settings → Sign-up Methods* — enable at least **Email/Password**.

### 3.1.a  Add Zoho and Google as federated providers  ⭐
There are two equally-valid paths — pick **one**.

**Path A — Catalyst-managed federation (recommended in production)**

In *Authentication → Settings → Social Sign-In*, enable **Zoho** and **Google**. Catalyst will host the entire OAuth dance and issue its own session cookie; the client doesn't need to know any provider secrets. Once enabled, the Catalyst sign-in iframe automatically shows **Continue with Zoho** / **Continue with Google** buttons. No code changes required.

**Path B — Direct OAuth via LibraryMan's `/auth/oauth/*` endpoints**

Use this for local dev, custom branding, or when you need fine-grained control over the flow. Both Zoho and Google issue authorization codes that the backend exchanges with PKCE.

1. **Register a Zoho OAuth client** at https://api-console.zoho.com/ → *Self-Client* or *Server-based Application*.
   - **Redirect URI** — `https://<your-client-host>/auth/callback`
   - **Scope** — `AaaServer.profile.READ`
   - Copy `Client ID` + `Client Secret`.

2. **Register a Google OAuth client** at https://console.cloud.google.com/apis/credentials → *OAuth client ID* → *Web application*.
   - **Authorized redirect URI** — `https://<your-client-host>/auth/callback`
   - **Scopes** — `openid email profile`
   - Copy `Client ID` + `Client Secret`.

3. **Set these env vars on the AdvancedIO function** (*Functions → library_api → Environment Variables*):

   | Name | Value |
   |---|---|
   | `ZOHO_OAUTH_CLIENT_ID` | from step 1 |
   | `ZOHO_OAUTH_CLIENT_SECRET` | from step 1 |
   | `GOOGLE_OAUTH_CLIENT_ID` | from step 2 |
   | `GOOGLE_OAUTH_CLIENT_SECRET` | from step 2 |
   | `ADMIN_EMAILS` *(optional)* | comma-list of emails to auto-promote to admin |

4. The client auto-discovers enabled providers via `GET /auth/providers` and renders **Continue with Zoho** / **Continue with Google** buttons.

> 🔐 **Security model** — secrets live only on the server, PKCE (`S256`) is required for every exchange, `state` is constant-time-compared on the callback, the access token never touches the browser, and unverified Google emails are rejected.

### 3.2 Allowed origins (critical)
*Authentication → Settings → Sign-Up & Sign-In* → add your deployed client origin, e.g.
```
https://libraryman-XXXXXX.development.catalystserverless.com
```

### 3.3 Create the two roles
*Authentication → Roles → + New Role*

| Role Name | Description |
|---|---|
| `admin`  | Full library management |
| `member` | Default — borrow / return own loans |

> The role name **must match exactly** (lowercase) — middleware reads `user.role_details.role_name`.

### 3.4 Default role on sign-up
*Authentication → Settings → Sign-Up & Sign-In → Default Role* → choose **member**. New users will get the `member` role automatically; you'll promote selected users to `admin` manually.

### 3.5 Promote your first admin
*Authentication → Users → click your user → Change Role → admin*.

---

## 4. Create the Data Store tables

Open *Data Store → + New Table* and create both tables exactly as below.

### Table: `Books`
| Column         | Type | Length | Required | Default     |
|----------------|------|-------:|----------|-------------|
| `title`        | Text |    200 | ✅       |             |
| `author`       | Text |    150 | ✅       |             |
| `isbn`         | Text |     20 | ❌       |             |
| `status`       | Text |     20 | ✅       | `available` |

### Table: `BookLoans`
| Column            | Type | Length | Required |
|-------------------|------|-------:|----------|
| `book_id`         | Text |     64 | ✅       |
| `borrower_id`     | Text |     64 | ✅       |
| `borrower_email`  | Text |    200 | ✅       |
| `lent_at`         | Text |     40 | ✅       |
| `returned_at`     | Text |     40 | ❌       |

(Full schema reference: `server/catalyst-datastore.json`.)

---

## 5. Link the local workspace

```bash
cd /home/workspace/LibraryMan
catalyst init
```

When prompted:
- Project type — **Functions + Client**
- Function type — **AdvancedIO**
- Function stack — **node18**
- Function directory — **server**
- Client directory — **client/dist**
- Pick the **LibraryMan** project you created in step 2.

---

## 6. Deploy the backend (functions)

```bash
cd server
npm install --omit=dev
cd ..
catalyst deploy --only functions
```

📋 The CLI prints a URL like:
```
https://libraryman-XXXXXX.development.catalystserverless.com/server/library_api
```
Copy this — you need it for the client build.

### Set function environment variables
*Functions → library_api → Environment Variables* → add:

| Name              | Value                                                                           |
|-------------------|---------------------------------------------------------------------------------|
| `NODE_ENV`        | `production`                                                                    |
| `ALLOWED_ORIGINS` | `https://libraryman-XXXXXX.development.catalystserverless.com` (your web host)  |

> ❗ Do **NOT** set `USE_MEMORY_STORE` in production — the in-memory store is for tests only.

---

## 7. Build & deploy the client

```bash
# 7.1 Point the React build at the function URL (from step 6)
cat > client/.env.production <<EOF
VITE_API_BASE=https://libraryman-XXXXXX.development.catalystserverless.com/server/library_api
VITE_USE_MOCK_AUTH=false
EOF

# 7.2 Build & deploy
cd client && npm install && npm run build && cd ..
catalyst deploy --only client
```

The CLI prints the client URL — open it, sign in via the embedded Catalyst form, and you're live. 🎉

For all subsequent updates, just run:
```bash
catalyst deploy
```

---

## 8. Local development

### Option A — fully mocked (no Catalyst project required)
```bash
# server (in-memory store + mock auth via x-mock-user header)
cd server && USE_MEMORY_STORE=true npm run dev

# client (mock auth, dev buttons for member/admin)
cd client && cp .env.example .env && npm run dev
```
Open http://localhost:5173 — you'll see **"Sign in as Member / Sign in as Admin"** buttons.

### Option B — real Catalyst against your dev environment
```bash
# server linked to your Catalyst project
cd server && catalyst serve

# client pointing at the real function
cd client && echo "VITE_API_BASE=http://localhost:3001
VITE_USE_MOCK_AUTH=false" > .env && npm run dev
```

---

## 9. Testing

```bash
# Backend — Jest + Supertest (75 tests: routes, auth, OAuth, validation, store)
cd server && npm test

# Frontend — Vitest + React Testing Library (43 tests)
cd client && npm test
```

Both suites must pass before you `catalyst deploy`.

---

## 10. Authorization matrix (enforced server-side)

| Endpoint                | Anonymous | `member`           | `admin` |
|-------------------------|:---------:|:------------------:|:-------:|
| `GET /books`            |     ✅    |         ✅         |   ✅    |
| `POST /books`           |     ❌    |         ❌         |   ✅    |
| `DELETE /books/:id`     |     ❌    |         ❌         |   ✅    |
| `POST /books/:id/lend`  |     ❌    |         ✅         |   ✅    |
| `POST /books/:id/return`|     ❌    | ✅ (own loan only) |   ✅ (any) |
| `GET /books/me/loans`   |     ❌    |         ✅         |   ✅    |

UI navigation also reflects these rules — `Add` / `Delete` links are hidden from non-admins, and `RequireRole` guards each protected route.

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `401 Unauthenticated` after sign-in | Check **ALLOWED_ORIGINS** matches the client URL exactly (scheme + host, no trailing slash). |
| `403 Forbidden — requires role: admin` | User has `member` role — promote them in *Authentication → Users*. |
| Sign-in iframe doesn't render | Verify the Catalyst SDK URL is reachable; check the project allows the current origin. |
| CORS error in browser console | Add the client origin to `ALLOWED_ORIGINS` env var of the function and redeploy. |
| Data Store errors at runtime | Confirm both tables exist with **exact** column names + types from step 4. |
| `catalyst.initialize failed` | Function isn't running inside a Catalyst environment — ensure `NODE_ENV=production` and you deployed via `catalyst deploy`. |

---

## 12. What changed in v2.0

- ➕ `zcatalyst-sdk-node` integrated → Data Store + Auth
- ➕ Catalyst Web SDK loaded dynamically in the client
- ➕ Role-based middleware (`requireAuth` / `requireRole`)
- ➕ Joi input validation on every mutating route
- ➕ `helmet` + `cors` + `express-rate-limit` hardening
- ➕ `BookLoans` table tracks loan history per user
- ➕ `RequireRole` route guard + role-aware navigation
- ➕ **Zoho and Google federated sign-in** (Catalyst-managed *or* direct OAuth + PKCE)
- ➕ Provider discovery endpoint `GET /auth/providers`
- ➕ Full test suites: 75 backend + 43 frontend

Happy lending! 📚
