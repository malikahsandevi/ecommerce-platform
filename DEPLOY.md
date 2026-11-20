# Deployment Guide

Three pieces: database (MongoDB Atlas), backend API (Render), admin
dashboard (Vercel). About 10 minutes in total.

## 1. Database — MongoDB Atlas (free)

1. Create a free cluster at https://cloud.mongodb.com (M0 tier is enough).
2. Database Access: create a database user with a password.
3. Network Access: allow `0.0.0.0/0` (so the hosted backend can connect).
4. Connect → Drivers → copy the connection string, e.g.
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/ecommerce`

## 2. Backend API — Render (free)

1. https://dashboard.render.com → **New → Blueprint** → select this repo.
   The included `render.yaml` creates the `ecommerce-backend` web service.
2. Fill the secret env values when prompted:
   `MONGO_URI` (from step 1), `JWT_SECRET` (any long random string),
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and your Cloudinary values.
3. Deploy. Your API URL will look like
   `https://ecommerce-backend.onrender.com` — opening it should reply
   "Server live hai!" and the API lives under `/api/...`.

> Render's free web services sleep when idle; the first request after a
> break can take ~30–50 seconds to wake up. That is expected on the free tier.

## 3. Admin dashboard — Vercel

1. Import this repo in Vercel and set the **Root Directory** to `admin`.
2. Add one environment variable:
   `NEXT_PUBLIC_API_URL = https://ecommerce-backend.onrender.com/api`
3. Deploy. Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from step 2.

## Local development

See the main [README](README.md#getting-started).
