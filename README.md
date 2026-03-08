# i69 Storage

A file storage app that runs on **Cloudflare Workers**, uses **R2** for files and **D1** for users. Features login, signup, per-user quotas (10 GB default, 50 GB max), and a root admin account.

## Features

- **Sign up / Log in** – Email + password (stored hashed in D1).
- **Storage limits** – New users get **10 GB**; max **50 GB** per user (admin can set quota).
- **Root account** – There is **no separate root password**. You sign up with your email and password, then run one SQL command to mark that user as root. You then log in with the **same email and password**; root is just a flag that unlocks the Admin page.
- **Dashboard** – Total Images / Audios / Videos, Monthly Bandwidth, Total File Size, and a Monthly Upload Trends chart (images, videos, audios).
- **Storage** – `/storage` lists all your files and an “Upload Assets” modal with drag-and-drop and an upload queue (progress and ETA).
- **Upload / Download / Delete** – Files stored in Cloudflare R2.

## Setup

### 1. Create R2 bucket and D1 database

```bash
# Create R2 bucket (dashboard: R2 → Create bucket, name: i69-storage-bucket)
npx wrangler r2 bucket create i69-storage-bucket

# Create D1 database
npx wrangler d1 create i69-storage-db
```

Copy the **database_id** from the create output and put it in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "i69-storage-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 2. Run migrations

Both migrations (schema + `media_type` for dashboard/storage) must be applied:

```bash
npm install
npm run db:local    # for local dev
npm run db:migrate  # for production (run before first deploy)
```

### 3. Create a root account

After signing up once via the app, promote your user to root in D1:

**Local:**

```bash
npx wrangler d1 execute i69-storage-db --local --command "UPDATE users SET is_root = 1 WHERE email = 'your@email.com';"
```

**Production:**

```bash
npx wrangler d1 execute i69-storage-db --remote --command "UPDATE users SET is_root = 1 WHERE email = 'your@email.com';"
```

### 4. Deploy

```bash
npm run deploy
```

Then open the Worker URL (e.g. `https://i69-storage.<your-subdomain>.workers.dev`).

## Commands

| Command | Description |
|--------|-------------|
| `npm run dev` | Run Worker locally |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run db:create` | Create D1 database |
| `npm run db:migrate` | Apply migrations (production) |
| `npm run db:local` | Apply migrations (local D1) |

## Quotas

- **New signups:** 10 GB.
- **Maximum per user:** 50 GB (you can add an admin UI later to set `quota_gb` between 10 and 50).
- **Root:** Same binding; increase `quota_gb` in D1 if you want a higher cap for root.

## Tech

- **Hono** – Routing and HTML.
- **D1** – Users, sessions, file metadata, `used_bytes` / `quota_gb`.
- **R2** – File storage; keys like `users/{userId}/{timestamp}-{filename}`.
