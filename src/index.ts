import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { hashPassword, verifyPassword, randomSessionId, sessionExpiry, generatePublicId } from "./auth";
import { DEFAULT_QUOTA_GB, MAX_QUOTA_GB } from "./types";
import type { Env, User } from "./types";

const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();

const LAYOUT = (title: string, body: ReturnType<typeof raw>) => html`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} – i69 Storage</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0a0a0c;
      --surface: #111113;
      --surface-hover: #18181b;
      --border: #1f1f23;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --danger: #ef4444;
      --radius: 10px;
      --radius-sm: 6px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.5; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
    h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.75rem; }
    form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 320px; }
    input[type=email], input[type=password], input[type=text] {
      padding: 0.625rem 0.875rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--text); font: inherit;
    }
    input:focus { outline: none; border-color: var(--accent); }
    button, .btn {
      padding: 0.5rem 1rem; border-radius: var(--radius-sm); border: none; cursor: pointer;
      font: inherit; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); text-decoration: none; }
    .btn-ghost { background: transparent; color: var(--accent); }
    .btn-ghost:hover { background: var(--surface-hover); text-decoration: none; }
    .btn-danger { background: var(--danger); color: #fff; font-size: 0.8125rem; }
    .btn-danger:hover { filter: brightness(1.1); text-decoration: none; }
    .error { color: #f87171; font-size: 0.875rem; }
    .success { color: #4ade80; font-size: 0.875rem; }
    .app { display: flex; min-height: 100vh; }
    .sidebar {
      width: 240px; background: var(--surface); border-right: 1px solid var(--border);
      padding: 1.25rem 1rem; display: flex; flex-direction: column; flex-shrink: 0;
    }
    .sidebar .brand { font-weight: 700; font-size: 1.125rem; color: var(--text); margin-bottom: 1.5rem; padding: 0 0.5rem; letter-spacing: -0.02em; }
    .sidebar .nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .sidebar .nav a {
      color: var(--text-muted); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
      font-weight: 500; transition: color .15s, background .15s;
    }
    .sidebar .nav a:hover { color: var(--text); background: var(--surface-hover); text-decoration: none; }
    .sidebar .nav a.active { color: var(--accent); background: rgba(99,102,241,.1); text-decoration: none; }
    .sidebar .user { font-size: 0.75rem; color: var(--text-muted); padding: 0.75rem 0.5rem; margin-top: auto; border-top: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; }
    .main { flex: 1; padding: 1.75rem 2rem; max-width: 960px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; }
    .card h3 { font-size: 0.6875rem; color: var(--text-muted); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    .card .value { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
    .chart-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.5rem; }
    .chart-wrap h3 { margin-bottom: 0.25rem; }
    .chart-wrap p.sub { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem; }
    .upload-zone {
      border: 2px dashed var(--border); border-radius: var(--radius); padding: 2.5rem; text-align: center; cursor: pointer;
      background: var(--surface); transition: border-color .2s, background .2s;
    }
    .upload-zone:hover { border-color: var(--accent); background: rgba(99,102,241,.05); }
    .upload-zone .icon { font-size: 2.5rem; margin-bottom: 0.5rem; opacity: 0.7; }
    .upload-zone .hint { color: var(--text-muted); font-size: 0.875rem; }
    .queue-item {
      display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 0.875rem;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 0.5rem;
    }
    .queue-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; font-size: 0.875rem; }
    .queue-item .status { color: var(--text-muted); font-size: 0.8125rem; margin-left: 0.75rem; }
    .queue-item .remove { cursor: pointer; color: var(--text-muted); padding: 0 0.25rem; }
    .usage { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1rem; }
    .root-badge { background: var(--accent); color: #fff; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; margin-left: 0.5rem; }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-top: 1.5rem; }
    .file-table { width: 100%; border-collapse: collapse; }
    .file-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); background: var(--surface-hover); border-bottom: 1px solid var(--border); }
    .file-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
    .file-table tr:last-child td { border-bottom: none; }
    .file-table tr:hover td { background: var(--surface-hover); }
    .file-table .actions { display: flex; align-items: center; gap: 0.5rem; }
    .file-table .type-pill { font-size: 0.6875rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--surface-hover); color: var(--text-muted); }
    .empty-state { text-align: center; padding: 3rem 1.5rem; color: var(--text-muted); }
    .empty-state p { margin-bottom: 0.5rem; }
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .auth-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 2rem; width: 100%; max-width: 360px; }
    .auth-card h1 { margin-bottom: 0.5rem; }
    .auth-card form { max-width: none; }
    .auth-card .link { margin-top: 1rem; font-size: 0.875rem; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;

function SIDEBAR(user: User, active: "dashboard" | "storage" | "admin", userId: string) {
  return html`
  <aside class="sidebar">
    <div class="brand">i69 Storage</div>
    <nav class="nav">
      <a href="/dashboard/${userId}" class="${active === "dashboard" ? "active" : ""}">Dashboard</a>
      <a href="/dashboard/${userId}/storage" class="${active === "storage" ? "active" : ""}">Storage</a>
      ${user.is_root ? html`<a href="/admin" class="${active === "admin" ? "active" : ""}">Admin</a>` : ""}
      <a href="/logout">Log out</a>
    </nav>
    <div class="user">${escapeHtml(user.email)}</div>
  </aside>`;
}

async function getCurrentUser(c: any): Promise<User | null> {
  const sid = getCookie(c, "sid");
  if (!sid) return null;
  const row = await c.env.DB.prepare(
    "SELECT u.id, u.public_id, u.email, u.quota_gb, u.used_bytes, u.is_root FROM users u INNER JOIN sessions s ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime('now')"
  )
    .bind(sid)
    .first();
  if (!row) return null;
  const r = row as User & { public_id: string | null };
  if (!r.public_id || r.public_id.trim() === "") {
    const publicId = generatePublicId();
    await c.env.DB.prepare("UPDATE users SET public_id = ? WHERE id = ? AND (public_id IS NULL OR public_id = '')")
      .bind(publicId, r.id)
      .run();
    r.public_id = publicId;
  }
  return r as User;
}

function requireAuth(app: Hono<{ Bindings: Env; Variables: { user: User } }>) {
  app.use("*", async (c, next) => {
    const user = await getCurrentUser(c);
    if (!user) {
      return c.redirect("/login");
    }
    c.set("user", user);
    await next();
  });
}

function ensureUserMatch(c: any, userId: string): Response | null {
  const user = c.get("user") as User;
  if (user.public_id !== userId) {
    return c.redirect(`/dashboard/${user.public_id}`);
  }
  return null;
}

// ---------- Public routes ----------
app.get("/", async (c) => {
  const user = await getCurrentUser(c);
  if (user) return c.redirect(`/dashboard/${user.public_id}`);
  return c.redirect("/login");
});

app.get("/login", (c) =>
  c.html(
    LAYOUT(
      "Login",
      html`
        <div class="auth-page">
          <div class="auth-card">
            <h1>Log in</h1>
            <p class="usage" style="margin-bottom:1rem;">Sign in to your account</p>
            <form method="post" action="/login">
              <input type="email" name="email" placeholder="Email" required />
              <input type="password" name="password" placeholder="Password" required />
              <button type="submit" class="btn btn-primary">Log in</button>
            </form>
            <p class="link">No account? <a href="/signup">Sign up</a></p>
            ${c.get("flash_error") ? html`<p class="error">${c.get("flash_error")}</p>` : null}
          </div>
        </div>
      `
    )
  )
);

app.post("/login", async (c) => {
  try {
    const form = await c.req.parseBody();
    const email = String(form["email"] ?? "").trim().toLowerCase();
    const password = String(form["password"] ?? "");
    if (!email || !password) {
      return c.html(
        LAYOUT("Login", html`<nav><a href="/signup">Sign up</a></nav><h1>Log in</h1>
          <form method="post" action="/login">
            <input type="email" name="email" placeholder="Email" required />
            <input type="password" name="password" placeholder="Password" required />
            <button type="submit" class="btn btn-primary">Log in</button>
          </form>
          <p class="error">Email and password required.</p>`)
      );
    }
    const user = await c.env.DB.prepare(
      "SELECT id, public_id, email, password_hash, quota_gb, used_bytes, is_root FROM users WHERE email = ?"
    )
      .bind(email)
      .first();
    if (!user || !(await verifyPassword(password, (user as any).password_hash))) {
      return c.html(
        LAYOUT("Login", html`<nav><a href="/signup">Sign up</a></nav><h1>Log in</h1>
          <form method="post" action="/login">
            <input type="email" name="email" placeholder="Email" required />
            <input type="password" name="password" placeholder="Password" required />
            <button type="submit" class="btn btn-primary">Log in</button>
          </form>
          <p class="error">Invalid email or password.</p>`)
      );
    }
    const sid = randomSessionId();
    const expires = sessionExpiry();
    await c.env.DB.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
    )
      .bind(sid, (user as any).id, expires)
      .run();
    setCookie(c, "sid", sid, { path: "/", httpOnly: true, maxAge: 60 * 60 * 24 * 7, sameSite: "Lax" });
    let publicId = (user as any).public_id;
    if (!publicId || String(publicId).trim() === "") {
      for (let attempt = 0; attempt < 5; attempt++) {
        publicId = generatePublicId();
        const r = await c.env.DB.prepare("UPDATE users SET public_id = ? WHERE id = ? AND (public_id IS NULL OR public_id = '')")
          .bind(publicId, (user as any).id)
          .run();
        if (r.meta && (r.meta as any).changes > 0) break;
      }
      const row = await c.env.DB.prepare("SELECT public_id FROM users WHERE id = ?").bind((user as any).id).first();
      const stored = (row as any)?.public_id;
      if (stored && String(stored).trim() !== "") publicId = stored;
    }
    return c.redirect(`/dashboard/${publicId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("public_id") || msg.includes("no such column")) {
      return c.html(
        LAYOUT("Login", html`
          <nav><a href="/signup">Sign up</a></nav>
          <h1>Log in</h1>
          <p class="error">Database schema is outdated. Run migrations on your D1 database:</p>
          <pre style="background:#18181b;padding:0.75rem;border-radius:6px;font-size:0.875rem;">npx wrangler d1 migrations apply i69-storage-db --remote</pre>
          <p><a href="/login">Try again</a> after applying migrations.</p>`),
        503
      );
    }
    throw err;
  }
});

app.get("/signup", (c) =>
  c.html(
    LAYOUT(
      "Sign up",
      html`
        <div class="auth-page">
          <div class="auth-card">
            <h1>Sign up</h1>
            <p class="usage" style="margin-bottom:1rem;">New accounts get ${DEFAULT_QUOTA_GB} GB storage (max ${MAX_QUOTA_GB} GB).</p>
            <form method="post" action="/signup">
              <input type="email" name="email" placeholder="Email" required />
              <input type="password" name="password" placeholder="Password" required minlength="8" />
              <button type="submit" class="btn btn-primary">Sign up</button>
            </form>
            <p class="link">Already have an account? <a href="/login">Log in</a></p>
            ${c.get("flash_error") ? html`<p class="error">${c.get("flash_error")}</p>` : null}
          </div>
        </div>
      `
    )
  )
);

app.post("/signup", async (c) => {
  const form = await c.req.parseBody();
  const email = String(form["email"] ?? "").trim().toLowerCase();
  const password = String(form["password"] ?? "");
  if (!email || !password) {
    return c.html(
      LAYOUT("Sign up", html`<nav><a href="/login">Log in</a></nav><h1>Sign up</h1>
        <form method="post" action="/signup">
          <input type="email" name="email" placeholder="Email" required />
          <input type="password" name="password" placeholder="Password" required minlength="8" />
          <button type="submit" class="btn btn-primary">Sign up</button>
        </form>
        <p class="error">Email and password required (min 8 characters).</p>`)
    );
  }
  if (password.length < 8) {
    return c.html(
      LAYOUT("Sign up", html`<nav><a href="/login">Log in</a></nav><h1>Sign up</h1>
        <form method="post" action="/signup">
          <input type="email" name="email" placeholder="Email" required />
          <input type="password" name="password" placeholder="Password" required minlength="8" />
          <button type="submit" class="btn btn-primary">Sign up</button>
        </form>
        <p class="error">Password must be at least 8 characters.</p>`)
    );
  }
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return c.html(
      LAYOUT("Sign up", html`<nav><a href="/login">Log in</a></nav><h1>Sign up</h1>
        <form method="post" action="/signup">
          <input type="email" name="email" placeholder="Email" required />
          <input type="password" name="password" placeholder="Password" required minlength="8" />
          <button type="submit" class="btn btn-primary">Sign up</button>
        </form>
        <p class="error">An account with this email already exists.</p>`)
    );
  }
  const passwordHash = await hashPassword(password);
  const publicId = generatePublicId();
  await c.env.DB.prepare(
    "INSERT INTO users (email, password_hash, quota_gb, public_id) VALUES (?, ?, ?, ?)"
  )
    .bind(email, passwordHash, DEFAULT_QUOTA_GB, publicId)
    .run();
  return c.redirect("/login");
});

app.get("/logout", async (c) => {
  const sid = getCookie(c, "sid");
  if (sid) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
  }
  deleteCookie(c, "sid", { path: "/" });
  return c.redirect("/login");
});

// ---------- Dashboard (auth required) ----------
const dashboard = new Hono<{ Bindings: Env; Variables: { user: User } }>();
requireAuth(dashboard);

dashboard.get("/dashboard", async (c) => {
  const user = c.get("user");
  return c.redirect(`/dashboard/${user.public_id}`);
});

dashboard.get("/dashboard/:userId", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const err = ensureUserMatch(c, userId);
  if (err) return err;
  return c.html(
    LAYOUT(
      "Dashboard",
      html`
        <div class="app">
          ${SIDEBAR(user, "dashboard", userId)}
          <main class="main">
            <h1>Dashboard ${user.is_root ? raw(`<span class="root-badge">root</span>`) : ""}</h1>
            <div class="cards">
              <div class="card"><h3>Total Images</h3><div class="value" id="stat-images">–</div></div>
              <div class="card"><h3>Total Audios</h3><div class="value" id="stat-audios">–</div></div>
              <div class="card"><h3>Total Videos</h3><div class="value" id="stat-videos">–</div></div>
              <div class="card"><h3>Monthly Bandwidth</h3><div class="value" id="stat-bandwidth">–</div></div>
              <div class="card"><h3>Total File Size</h3><div class="value" id="stat-totalsize">–</div></div>
            </div>
            <div class="chart-wrap">
              <h3>Monthly upload trends</h3>
              <p class="sub">Number of uploads by media type per month</p>
              <canvas id="chart-trends" width="600" height="280"></canvas>
            </div>
            <p><a href="/dashboard/${userId}/storage">Upload & manage files →</a></p>
          </main>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
        <script>
          (function() {
            fetch('/api/stats').then(r => r.json()).then(function(d) {
              document.getElementById('stat-images').textContent = d.totalImages ?? '0';
              document.getElementById('stat-audios').textContent = d.totalAudios ?? '0';
              document.getElementById('stat-videos').textContent = d.totalVideos ?? '0';
              document.getElementById('stat-bandwidth').textContent = (d.monthlyBandwidthBytes / 1e9).toFixed(2) + ' GB';
              document.getElementById('stat-totalsize').textContent = (d.totalFileSizeBytes / 1e9).toFixed(2) + ' GB';
              var trends = d.monthlyTrends || [];
              var labels = trends.map(function(t) { return t.month; });
              new Chart(document.getElementById('chart-trends'), {
                type: 'bar',
                data: {
                  labels: labels,
                  datasets: [
                    { label: 'Images', data: trends.map(function(t) { return t.images; }), backgroundColor: 'rgb(59, 130, 246)' },
                    { label: 'Videos', data: trends.map(function(t) { return t.videos; }), backgroundColor: 'rgb(249, 115, 22)' },
                    { label: 'Audios', data: trends.map(function(t) { return t.audios; }), backgroundColor: 'rgb(34, 197, 94)' }
                  ]
                },
                options: { scales: { x: { stacked: true }, y: { stacked: true } } }
              });
            });
          })();
        </script>
      `
    )
  );
});

dashboard.post("/upload", async (c) => {
  const user = c.get("user");
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!file || !(file instanceof File)) {
    return c.redirect(`/dashboard/${user.public_id}`);
  }
  const size = file.size;
  const quotaBytes = user.quota_gb * 1024 * 1024 * 1024;
  if (user.used_bytes + size > quotaBytes) {
    return c.html(
      LAYOUT("Dashboard", html`
        <nav><a href="/logout">Log out</a></nav>
        <h1>Dashboard</h1>
        <p class="error">Upload would exceed your ${user.quota_gb} GB quota. Used: ${(user.used_bytes / 1e9).toFixed(2)} GB.</p>
        <a href="/dashboard/${user.public_id}">Back to dashboard</a>`)
    );
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const r2Key = `users/${user.id}/${Date.now()}-${safeName}`;
  const mediaType = getMediaType(file);
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await c.env.DB.prepare(
    "INSERT INTO files (user_id, r2_key, filename, size_bytes, media_type) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(user.id, r2Key, file.name, size, mediaType)
    .run();
  await c.env.DB.prepare("UPDATE users SET used_bytes = used_bytes + ? WHERE id = ?")
    .bind(size, user.id)
    .run();
  return c.redirect(`/dashboard/${user.public_id}`);
});

// ---------- API: stats (for dashboard) ----------
dashboard.get("/api/stats", async (c) => {
  const user = c.get("user");
  const byType = await c.env.DB.prepare(
    "SELECT media_type, COUNT(*) as c, SUM(size_bytes) as total FROM files WHERE user_id = ? GROUP BY media_type"
  )
    .bind(user.id)
    .all();
  const monthBandwidth = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE user_id = ? AND strftime('%Y-%m', uploaded_at) = strftime('%Y-%m', 'now')"
  )
    .bind(user.id)
    .first();
  const trends = await c.env.DB.prepare(
    "SELECT strftime('%Y-%m', uploaded_at) as month, media_type, COUNT(*) as c FROM files WHERE user_id = ? AND uploaded_at >= datetime('now', '-12 months') GROUP BY month, media_type ORDER BY month"
  )
    .bind(user.id)
    .all();
  const counts = { image: 0, audio: 0, video: 0, other: 0 };
  let totalFileSize = 0;
  for (const row of (byType.results || []) as any[]) {
    counts[row.media_type] = row.c;
    totalFileSize += row.total || 0;
  }
  const monthlyBandwidthBytes = Number((monthBandwidth as any)?.total ?? 0);
  const months: Record<string, { images: number; audios: number; videos: number }> = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months[key] = { images: 0, audios: 0, videos: 0 };
  }
  for (const row of (trends.results || []) as any[]) {
    const key = row.month;
    if (!months[key]) months[key] = { images: 0, audios: 0, videos: 0 };
    if (row.media_type === "image") months[key].images += row.c;
    if (row.media_type === "audio") months[key].audios += row.c;
    if (row.media_type === "video") months[key].videos += row.c;
  }
  const monthlyTrends = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
  return c.json({
    totalImages: counts.image,
    totalAudios: counts.audio,
    totalVideos: counts.video,
    monthlyBandwidthBytes,
    totalFileSizeBytes: totalFileSize,
    monthlyTrends,
  });
});

// ---------- Redirects: /storage and /storage/:userId -> /dashboard/:userId/storage ----------
dashboard.get("/storage", async (c) => {
  const user = c.get("user");
  return c.redirect(`/dashboard/${user.public_id}/storage`);
});
dashboard.get("/storage/:userId", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const err = ensureUserMatch(c, userId);
  if (err) return err;
  return c.redirect(`/dashboard/${userId}/storage`);
});
dashboard.get("/dashboard/:userId/upload", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const err = ensureUserMatch(c, userId);
  if (err) return err;
  return c.redirect(`/dashboard/${userId}/storage`);
});

// ---------- Storage page: /dashboard/:userId/storage (upload + files in one place) ----------
dashboard.get("/dashboard/:userId/storage", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const err = ensureUserMatch(c, userId);
  if (err) return err;
  const files = await c.env.DB.prepare(
    "SELECT id, filename, r2_key, size_bytes, uploaded_at, media_type FROM files WHERE user_id = ? ORDER BY uploaded_at DESC"
  )
    .bind(user.id)
    .all();
  const usedGb = (user.used_bytes / (1024 * 1024 * 1024)).toFixed(2);
  const quotaGb = user.quota_gb;
  return c.html(
    LAYOUT(
      "Storage",
      html`
        <div class="app">
          ${SIDEBAR(user, "storage", userId)}
          <main class="main">
            <h1>Storage</h1>
            <p class="usage">${usedGb} GB of ${quotaGb} GB used</p>
            <div class="upload-zone" id="upload-zone">
              <div class="icon">↑</div>
              <p class="hint">Drag & drop image, video, or audio files here, or click to select</p>
            </div>
            <input type="file" id="upload-input" multiple accept="image/*,video/*,audio/*" style="display:none;" />
            <div id="upload-queue" style="margin-top:1rem;"></div>
            <div style="margin-top:1rem;display:flex;gap:0.5rem;align-items:center;">
              <button type="button" class="btn btn-primary" id="upload-all-btn" disabled>Upload all</button>
            </div>
            <h2 style="margin-top:2rem;">Files</h2>
            ${(files.results?.length ?? 0) === 0
              ? html`<div class="panel empty-state"><p>No files yet.</p><p>Add files using the area above.</p></div>`
              : html`
              <div class="panel">
                <table class="file-table">
                  <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
                  <tbody>
                    ${raw(
                      (files.results as any[]).map(
                        (f: any) =>
                          `<tr>
                            <td>${escapeHtml(f.filename)}</td>
                            <td><span class="type-pill">${escapeHtml(f.media_type || "other")}</span></td>
                            <td>${formatBytes(f.size_bytes)}</td>
                            <td>${escapeHtml(f.uploaded_at)}</td>
                            <td><div class="actions"><a href="/dashboard/${userId}/storage/download/${f.id}" class="btn btn-ghost">Download</a>
                              <form method="post" action="/dashboard/${userId}/storage/delete" style="display:inline" onsubmit="return confirm('Delete this file?');">
                                <input type="hidden" name="id" value="${f.id}" />
                                <button type="submit" class="btn btn-danger">Delete</button>
                              </form></div></td>
                          </tr>`
                      ).join("")
                    )}
                  </tbody>
                </table>
              </div>`}
          </main>
        </div>
        <script>
          (function() {
            var queue = [];
            var zone = document.getElementById('upload-zone');
            var input = document.getElementById('upload-input');
            var queueEl = document.getElementById('upload-queue');
            var uploadAllBtn = document.getElementById('upload-all-btn');
            function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
            function renderQueue() {
              queueEl.innerHTML = queue.map(function(item, i) {
                var status = item.status || 'Queued';
                if (item.progress != null) status = 'Uploading ' + item.progress + '%' + (item.eta != null ? ' – ' + item.eta + 's left' : '');
                if (item.done) status = 'Done';
                if (item.error) status = 'Failed';
                return '<div class="queue-item"><span class="name">' + esc(item.file.name) + '</span><span class="status">' + status + '</span>' +
                  (item.done || item.error ? '' : '<span class="remove" data-i="' + i + '">&times;</span>') + '</div>';
              }).join('');
              uploadAllBtn.disabled = queue.length === 0 || queue.every(function(x) { return x.done || x.error; });
              queueEl.querySelectorAll('.remove').forEach(function(el) {
                el.onclick = function() { queue.splice(parseInt(el.getAttribute('data-i'), 10), 1); renderQueue(); };
              });
            }
            function addFiles(files) {
              for (var i = 0; i < files.length; i++) {
                var f = files[i];
                if (!f.type || (!f.type.startsWith('image/') && !f.type.startsWith('video/') && !f.type.startsWith('audio/'))) continue;
                queue.push({ file: f, status: 'Queued' });
              }
              renderQueue();
            }
            zone.onclick = function() { input.click(); };
            zone.ondragover = function(e) { e.preventDefault(); };
            zone.ondragleave = function() {};
            zone.ondrop = function(e) { e.preventDefault(); addFiles(e.dataTransfer.files); };
            input.onchange = function() { addFiles(input.files || []); input.value = ''; };
            function uploadOne(item, onProgress) {
              return new Promise(function(resolve, reject) {
                var xhr = new XMLHttpRequest();
                var fd = new FormData();
                fd.append('file', item.file);
                var start = Date.now();
                var loaded = 0;
                xhr.upload.onprogress = function(e) {
                  if (e.lengthComputable) {
                    loaded = e.loaded;
                    item.progress = Math.round(100 * e.loaded / e.total);
                    var elapsed = (Date.now() - start) / 1000;
                    item.eta = elapsed > 0 && loaded > 0 ? Math.round((e.total - e.loaded) / (loaded / elapsed)) : null;
                    onProgress();
                  }
                };
                xhr.onload = function() {
                  if (xhr.status >= 200 && xhr.status < 300) { item.done = true; resolve(); }
                  else { item.error = true; reject(); }
                  onProgress();
                };
                xhr.onerror = function() { item.error = true; onProgress(); reject(); };
                xhr.open('POST', '/api/upload');
                xhr.send(fd);
              });
            }
            uploadAllBtn.onclick = function() {
              var pending = queue.filter(function(x) { return !x.done && !x.error; });
              if (pending.length === 0) return;
              uploadAllBtn.disabled = true;
              function runNext(idx) {
                if (idx >= pending.length) { uploadAllBtn.disabled = false; if (queue.every(function(x) { return x.done || x.error; })) setTimeout(function() { location.reload(); }, 600); return; }
                uploadOne(pending[idx], renderQueue).then(function() { runNext(idx + 1); }).catch(function() { runNext(idx + 1); });
              }
              runNext(0);
            };
          })();
        </script>
      `
    )
  );
});

// ---------- API: upload (JSON, for queue with progress) ----------
dashboard.post("/api/upload", async (c) => {
  const user = c.get("user");
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!file || !(file instanceof File)) {
    return c.json({ ok: false, error: "No file" }, 400);
  }
  const size = file.size;
  const quotaBytes = user.quota_gb * 1024 * 1024 * 1024;
  if (user.used_bytes + size > quotaBytes) {
    return c.json({ ok: false, error: "Quota exceeded" }, 400);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const r2Key = `users/${user.id}/${Date.now()}-${safeName}`;
  const mediaType = getMediaType(file);
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await c.env.DB.prepare(
    "INSERT INTO files (user_id, r2_key, filename, size_bytes, media_type) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(user.id, r2Key, file.name, size, mediaType)
    .run();
  const row = await c.env.DB.prepare("SELECT id FROM files WHERE user_id = ? AND r2_key = ?")
    .bind(user.id, r2Key)
    .first();
  const id = (row as any)?.id;
  await c.env.DB.prepare("UPDATE users SET used_bytes = used_bytes + ? WHERE id = ?")
    .bind(size, user.id)
    .run();
  return c.json({ ok: true, id, filename: file.name });
});

dashboard.post("/dashboard/:userId/storage/delete", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const err = ensureUserMatch(c, userId);
  if (err) return err;
  const form = await c.req.parseBody();
  const id = Number(form["id"]);
  if (!id) return c.redirect(`/dashboard/${userId}/storage`);
  const row = await c.env.DB.prepare(
    "SELECT id, r2_key, size_bytes FROM files WHERE user_id = ? AND id = ?"
  )
    .bind(user.id, id)
    .first();
  if (!row) return c.redirect(`/dashboard/${userId}/storage`);
  const r = row as { r2_key: string; size_bytes: number };
  await c.env.BUCKET.delete(r.r2_key);
  await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  await c.env.DB.prepare("UPDATE users SET used_bytes = used_bytes - ? WHERE id = ?")
    .bind(r.size_bytes, user.id)
    .run();
  return c.redirect(`/dashboard/${userId}/storage`);
});

dashboard.get("/dashboard/:userId/storage/download/:id", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("userId");
  const err = ensureUserMatch(c, userId);
  if (err) return err;
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    "SELECT r2_key, filename FROM files WHERE user_id = ? AND id = ?"
  )
    .bind(user.id, id)
    .first();
  if (!row) return c.notFound();
  const r = row as { r2_key: string; filename: string };
  const obj = await c.env.BUCKET.get(r.r2_key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${r.filename.replace(/"/g, '\\"')}"`,
    },
  });
});

// ---------- Admin (root only) ----------
const admin = new Hono<{ Bindings: Env; Variables: { user: User } }>();
requireAuth(admin);
admin.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user.is_root) return c.redirect(`/dashboard/${user.public_id}`);
  await next();
});

admin.get("/admin", async (c) => {
  const user = c.get("user");
  const users = await c.env.DB.prepare(
    "SELECT id, email, quota_gb, used_bytes, is_root, created_at FROM users ORDER BY id"
  ).all();
  return c.html(
    LAYOUT(
      "Admin",
      html`
        <div class="app">
          ${SIDEBAR(user, "admin", user.public_id)}
          <main class="main">
            <h1>Admin – All users</h1>
            <p class="usage"><strong>Root account:</strong> There is no separate “root” user or “admin” password. The root account is whichever normal account you promoted. So the root <em>username</em> = that user’s email, and the root <em>password</em> = the password they used when they signed up. To make an account root, run in D1: <code>UPDATE users SET is_root = 1 WHERE email = 'your@email.com';</code> (use the email you actually signed up with.)</p>
            <table>
              <thead><tr><th>ID</th><th>Email</th><th>Quota (GB)</th><th>Used</th><th>Root</th><th>Created</th></tr></thead>
              <tbody>
                ${raw(
                  (users.results as any[]).map(
                    (u: any) =>
                      `<tr>
                        <td>${u.id}</td>
                        <td>${escapeHtml(u.email)}</td>
                        <td>${u.quota_gb}</td>
                        <td>${(u.used_bytes / 1e9).toFixed(2)} GB</td>
                        <td>${u.is_root ? "✓" : ""}</td>
                        <td>${escapeHtml(u.created_at)}</td>
                      </tr>`
                  ).join("")
                )}
              </tbody>
            </table>
          </main>
        </div>
      `
    )
  );
});

app.route("/", dashboard);
app.route("/", admin);

// Helpers
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function formatBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function getMediaType(file: File): "image" | "audio" | "video" | "other" {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  return "other";
}

export default app;
