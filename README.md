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

Apply all migrations (schema, `media_type`, `public_id`, backfill):

```bash
npm install
npm run db:local    # for local dev
npx wrangler d1 migrations apply i69-storage-db --remote   # production
```

**If you get `duplicate column name: media_type`:** your remote DB already has that column (e.g. from an earlier run). Mark 0001 as applied, then run migrations again:

```bash
npx wrangler d1 execute i69-storage-db --remote --command "INSERT INTO d1_migrations (name) VALUES ('0001_media_type.sql');"
npx wrangler d1 migrations apply i69-storage-db --remote
```

(If the insert fails, the migrations table may use a different column name; run `SELECT * FROM d1_migrations LIMIT 1;` to see the schema and use the correct column in the INSERT.)

### 3. Give existing users a URL id (if you had users before public_id)

If you already had user accounts before adding the `public_id` column, run all migrations (including the backfill) so every account gets a user id for URLs:

```bash
npx wrangler d1 migrations apply i69-storage-db --remote
```

That applies any new migrations, including one that sets `public_id` for all users that don’t have it yet.

### 4. Create a root account

**There is no separate “root” user or “admin” password.** The root account is any normal account you promote. So:

- **Root user** = the **email** you used when you signed up (e.g. `you@example.com`).
- **Root password** = the **password** you chose for that account when you signed up.

After signing up once via the app, promote that user to root in D1:

**Local:**

```bash
npx wrangler d1 execute i69-storage-db --local --command "UPDATE users SET is_root = 1 WHERE email = 'your@email.com';"
```

**Production:**

```bash
npx wrangler d1 execute i69-storage-db --remote --command "UPDATE users SET is_root = 1 WHERE email = 'your@email.com';"
```

### 5. Deploy

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

## UI styles you can build

With the same stack (HTML + CSS + optional JS), you can aim for many different looks:

- **Minimal / clean** – Lots of whitespace, simple typography, few colors (like the current app).
- **Dashboard / admin** – Sidebar nav, cards, tables, charts (current layout).
- **Glassmorphism** – Frosted glass panels, blur, light borders.
- **Brutalist** – Raw typography, high contrast, no rounded corners, bold borders.
- **Neumorphism** – Soft shadows, “pressed” or “raised” buttons and cards.
- **Retro / pixel** – Pixel fonts, chunky borders, limited palette.
- **Terminal / CLI** – Monospace font, green-on-black or amber, code-style layout.
- **Bento / grid** – Card grid with mixed sizes (like Apple or Notion).
- **Editorial** – Large type, serif fonts, magazine-style columns.

The app uses **DM Sans**, a neutral dark theme, and an indigo accent so it feels like a modern dashboard. Swap fonts and CSS variables to shift the vibe without changing the structure.
