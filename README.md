# E-Commerce Platform

A full-stack e-commerce system built with the MERN stack: a REST API backend
(Express + MongoDB) and a Next.js admin dashboard for running the store —
products, orders, customers, reviews, coupons and settings.

> This repository contains the backend API and the admin dashboard. The
> customer-facing storefront is not part of this repo.

## What's Inside

```
ecommerce-platform/
├── backend/   Express + MongoDB REST API (auth, products, orders, reviews…)
└── admin/     Next.js admin dashboard (products, orders, customers, settings)
```

## Features

- **Auth** — JWT-based login with hashed passwords (bcryptjs), admin seeding
- **Catalog** — products, categories and brands with full CRUD
- **Sales** — orders, coupons and dashboard statistics
- **Engagement** — product reviews and customer (user) management
- **Media** — image upload support via Cloudinary
- **Admin dashboard** — data tables and charts (Recharts) for every resource,
  dark/light theme, settings pages

## Tech Stack

- **Backend:** Node.js, Express 5, MongoDB + Mongoose, JWT, Cloudinary
- **Admin:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts

## Getting Started

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in your MongoDB URI and secrets
npm install
npm run dev            # http://localhost:5000  (API under /api)
```

### 2. Admin dashboard

```bash
cd admin
cp .env.example .env.local   # points to the backend API
npm install
npm run dev                  # http://localhost:3000
```

## API Overview

| Base path        | Covers                              |
| ---------------- | ----------------------------------- |
| `/api/auth`      | Login, registration, current user   |
| `/api/dashboard` | Admin dashboard statistics          |
| `/api/products`  | Product catalog CRUD                |
| `/api/orders`    | Orders                              |
| `/api/users`     | Customers / users                   |
| `/api/categories`| Product categories                  |
| `/api/brands`    | Brands                              |
| `/api/coupons`   | Discount coupons                    |
| `/api/reviews`   | Product reviews                     |
| `/api/settings`  | Store settings                      |
| `/api/media`     | Media / image handling              |

## Deployment Notes

- **Backend:** any Node host (Render, Railway, a VPS) with the `.env` values
  set; needs a MongoDB Atlas connection string in `MONGO_URI`.
- **Admin:** Vercel — set `NEXT_PUBLIC_API_URL` to the deployed backend's
  `/api` URL.
- Never commit a real `.env` file — it is git-ignored by default here.

## Author

**Ahsan Ali** — MERN Stack Developer
- Portfolio: https://ahsan-ali-protfolio.vercel.app
- GitHub: https://github.com/malikahsandevi
- LinkedIn: https://www.linkedin.com/in/ahsan-ali-468453440
