# 📚 LibraryMan

![CI / CD](https://github.com/OWNER/REPO/actions/workflows/ci-cd.yml/badge.svg?branch=main)

A simple library management application with **Add / Lend / Return / Delete** book modules — built with **React (Vite)** on the frontend and **Node.js + Express** on the backend, structured for hosting on **Zoho Catalyst** with Authentication, Authorization, and Data Store.

> The book list ships with **search, status & author filters, sort and pagination** — performant up to several thousand rows.
> CI runs both test suites on every push; pushes to `main` auto-deploy to Catalyst.
> See [`.github/workflows/README.md`](.github/workflows/README.md) for the pipeline guide.

---

## 🗂 Project Structure

```
LibraryMan/
├── catalyst.json              # Catalyst project config (functions + client)
├── client/                    # React frontend (deploy → Catalyst Web Client Hosting)
│   ├── src/
│   │   ├── components/        # AddBook, LendBook, ReturnBook, DeleteBook, BookList
│   │   ├── api/booksApi.js    # Axios API wrapper
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── server/                    # Node.js backend (deploy → Catalyst AdvancedIO Function)
    ├── routes/books.js        # REST endpoints
    ├── store/bookStore.js     # In-memory data store
    ├── index.js               # Express app (exports for Catalyst)
    ├── catalyst-config.json
    └── package.json
```

---

## 🚀 Local Development

### 1. Backend
```bash
cd server
npm install
npm run dev          # http://localhost:3001
```

### 2. Frontend
```bash
cd client
npm install
npm run dev          # http://localhost:5173 (proxies /api → :3001)
```

Open <http://localhost:5173> and start managing books.

---

## 🔌 API Reference

| Method | Endpoint            | Body                  | Description           |
|--------|---------------------|-----------------------|-----------------------|
| GET    | `/books`            | —                     | List all books        |
| POST   | `/books`            | `{ title, author }`   | Add a new book        |
| POST   | `/books/:id/lend`   | `{ borrower }`        | Lend a book           |
| POST   | `/books/:id/return` | —                     | Return a lent book    |
| DELETE | `/books/:id`        | —                     | Delete a book         |

All responses use the shape: `{ success: boolean, data?: ..., error?: string }`.

### Example
```bash
curl -X POST http://localhost:3001/books \
  -H "Content-Type: application/json" \
  -d '{"title":"Atomic Habits","author":"James Clear"}'
```

---

## ☁️ Deploying to Zoho Catalyst

### Prerequisites
```bash
npm install -g zcatalyst-cli
catalyst login
```

### 1. Initialize Catalyst project (one-time)
From the `LibraryMan/` root:
```bash
catalyst init
# Select: Functions + Client
# Function type: AdvancedIO (Node.js 18)
# Function name: library_api  → point to ./server
# Client folder: ./client/dist
```

### 2. Deploy the backend (AdvancedIO function)
```bash
cd server
npm install --production
cd ..
catalyst deploy --only functions
```
Once deployed, copy the function URL — it will look like:
`https://<project>-<id>.catalystserverless.com/server/library_api`

### 3. Build & deploy the frontend
```bash
cd client
echo "VITE_API_BASE=https://<project>-<id>.catalystserverless.com/server/library_api" > .env.production
npm install
npm run build           # outputs to client/dist
cd ..
catalyst deploy --only client
```

### 4. (Optional) Full deploy
```bash
catalyst deploy
```

Your app will be live at the Catalyst-provided Web Client URL.

---

## 🏗 Architecture Decisions

- **In-memory store** is used for simplicity. For production, migrate `server/store/bookStore.js` to use **Zoho Catalyst Data Store** via the `zcatalyst-sdk-node` package — the store module is intentionally isolated to make this swap trivial.
- **Express app is exported** (not started) when run via Catalyst, since the AdvancedIO runtime invokes it. A `require.main === module` check still allows local `node index.js` execution.
- **Vite** chosen over CRA for faster builds and smaller output — ideal for Catalyst static hosting.
- **CORS** is enabled in dev. On Catalyst, you may restrict origins to your Web Client URL via `cors({ origin: ['https://your-app.catalystserverless.com'] })`.

---

## 🧰 Tech Stack

| Layer    | Tech                            |
|----------|---------------------------------|
| Frontend | React 18, React Router, Axios, Vite |
| Backend  | Node.js 18, Express 4, UUID     |
| Hosting  | Zoho Catalyst (AdvancedIO + Web Client) |

---

## 📜 License
MIT
