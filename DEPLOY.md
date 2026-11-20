# Deployment Guide — Vercel + MongoDB Atlas

Three pieces: database (MongoDB Atlas, free), backend API (Vercel
serverless), admin dashboard (Vercel). Both code parts deploy from this
one repo as two separate Vercel projects.

## 1. Database — MongoDB Atlas (free)

1. Create a free M0 cluster at https://cloud.mongodb.com
2. Database Access: create a user (this project uses `ahsan`) with
   read/write access.
3. Network Access: allow `0.0.0.0/0` (Vercel functions run from changing
   IPs, so the API can only connect with open network access).
4. Your connection string looks like:
   `mongodb+srv://ahsan:<password>@<cluster>.mongodb.net/ecommerce?retryWrites=true&w=majority`

## 2. Backend API — Vercel

- Import this repo as a new Vercel project, **Root Directory: `backend`**
- No build command needed — `backend/vercel.json` routes every request to
  the serverless entry `backend/api/index.js` (the Express app in
  `backend/app.js`). `backend/server.js` remains for local use.
- Environment variables:
  - `MONGO_URI` — the Atlas string from step 1
  - `JWT_SECRET` — a long random string
  - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the admin login
  - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
- Verify: opening the project URL shows `Server live hai!` and
  `/api/products` returns JSON.

## 3. Admin dashboard — Vercel

- Import this repo again as a second project, **Root Directory: `admin`**
- Environment variable (needed before the first build):
  - `NEXT_PUBLIC_API_URL = https://<backend-project-domain>/api`
- Verify: the project URL shows the **Admin Sign In** screen; log in with
  the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from step 2.

## Local development

See the main [README](README.md#getting-started). Locally the backend runs
the classic way (`node server.js`) — the serverless entry is only used by
Vercel.
