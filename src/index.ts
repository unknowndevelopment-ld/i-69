import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { hashPassword, verifyPassword, randomSessionId, sessionExpiry } from "./auth";
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
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 1.5rem; background: #0f0f12; color: #e4e4e7; }
    a { color: #a78bfa; }
    h1 { font-size: 1.5rem; margin-top: 0; }
    form { display: flex; flex-direction: column; gap: 0.75rem; max-width: 320px; }
    input[type=email], input[type=password], input[type=text] { padding: 0.5rem 0.75rem; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b; color: #fff; }
    button, .btn { padding: 0.5rem 1rem; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; display: inline-block; font-size: 0.875rem; }
    .btn-primary { background: #7c3aed; color: #fff; }
    .btn-primary:hover { background: #6d28d9; }
    .btn-ghost { background: transparent; color: #a78bfa; }
    .btn-danger { background: #dc2626; color: #fff; }
    .error { color: #f87171; font-size: 0.875rem; }
    .success { color: #4ade80; font-size: 0.875rem; }
    nav { margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #27272a; }
    .usage { font-size: 0.875rem; color: #a1a1aa; margin-bottom: 1rem; }
    .root-badge { background: #7c3aed; color: #fff; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;

async function getCurrentUser(c: any): Promise<User | null> {
  const sid = getCookie(c, "sid");
  if (!sid) return null;
  const row = await c.env.DB.prepare(
    "SELECT u.id, u.email, u.quota_gb, u.used_bytes, u.is_root FROM users u INNER JOIN sessions s ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime('now')"
  )
    .bind(sid)
    .first();
  if (!row) return null;
  return row as User;
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

// ---------- Public routes ----------
app.get("/", async (c) => {
  const user = await getCurrentUser(c);
  if (user) return c.redirect("/dashboard");
  return c.redirect("/login");
});

app.get("/login", (c) =>
  c.html(
    LAYOUT(
      "Login",
      html`
        <nav><a href="/signup">Sign up</a></nav>
        <h1>Log in</h1>
        <form method="post" action="/login">
          <input type="email" name="email" placeholder="Email" required />
          <input type="password" name="password" placeholder="Password" required />
          <button type="submit" class="btn btn-primary">Log in</button>
        </form>
        ${c.get("flash_error") ? html`<p class="error">${c.get("flash_error")}</p>` : null}
      `
    )
  )
);

app.post("/login", async (c) => {
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
    "SELECT id, email, password_hash, quota_gb, used_bytes, is_root FROM users WHERE email = ?"
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
  return c.redirect("/dashboard");
});

app.get("/signup", (c) =>
  c.html(
    LAYOUT(
      "Sign up",
      html`
        <nav><a href="/login">Log in</a></nav>
        <h1>Sign up</h1>
        <p class="usage">New accounts get ${DEFAULT_QUOTA_GB} GB storage (max ${MAX_QUOTA_GB} GB).</p>
        <form method="post" action="/signup">
          <input type="email" name="email" placeholder="Email" required />
          <input type="password" name="password" placeholder="Password" required minlength="8" />
          <button type="submit" class="btn btn-primary">Sign up</button>
        </form>
        ${c.get("flash_error") ? html`<p class="error">${c.get("flash_error")}</p>` : null}
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
  await c.env.DB.prepare(
    "INSERT INTO users (email, password_hash, quota_gb) VALUES (?, ?, ?)"
  )
    .bind(email, passwordHash, DEFAULT_QUOTA_GB)
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
  const files = await c.env.DB.prepare(
    "SELECT id, filename, r2_key, size_bytes, uploaded_at FROM files WHERE user_id = ? ORDER BY uploaded_at DESC"
  )
    .bind(user.id)
    .all();
  const usedGb = (user.used_bytes / (1024 * 1024 * 1024)).toFixed(2);
  const quotaGb = user.quota_gb;
  return c.html(
    LAYOUT(
      "Dashboard",
      html`
        <nav>
          ${user.is_root ? html`<a href="/admin">Admin</a> | ` : ""}
          <a href="/logout">Log out</a>
        </nav>
        <h1>Dashboard ${user.is_root ? raw(`<span class="root-badge">root</span>`) : ""}</h1>
        <p class="usage">Storage: ${usedGb} GB / ${quotaGb} GB</p>
        <form method="post" action="/upload" enctype="multipart/form-data">
          <input type="file" name="file" required />
          <button type="submit" class="btn btn-primary">Upload</button>
        </form>
        <h2>Your files</h2>
        ${(files.results?.length ?? 0) === 0
          ? html`<p>No files yet.</p>`
          : html`
          <table>
            <thead><tr><th>Name</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
            <tbody>
              ${raw(
                (files.results as any[]).map(
                  (f: any) =>
                    `<tr>
                      <td>${escapeHtml(f.filename)}</td>
                      <td>${formatBytes(f.size_bytes)}</td>
                      <td>${escapeHtml(f.uploaded_at)}</td>
                      <td><a href="/download/${f.id}" class="btn btn-ghost">Download</a>
                        <form method="post" action="/delete" style="display:inline" onsubmit="return confirm('Delete this file?');">
                        <input type="hidden" name="id" value="${f.id}" />
                        <button type="submit" class="btn btn-danger">Delete</button>
                      </form></td>
                    </tr>`
                ).join("")
              )}
            </tbody>
          </table>`}
      `
    )
  );
});

dashboard.post("/upload", async (c) => {
  const user = c.get("user");
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!file || !(file instanceof File)) {
    return c.redirect("/dashboard");
  }
  const size = file.size;
  const quotaBytes = user.quota_gb * 1024 * 1024 * 1024;
  if (user.used_bytes + size > quotaBytes) {
    return c.html(
      LAYOUT("Dashboard", html`
        <nav><a href="/logout">Log out</a></nav>
        <h1>Dashboard</h1>
        <p class="error">Upload would exceed your ${user.quota_gb} GB quota. Used: ${(user.used_bytes / 1e9).toFixed(2)} GB.</p>
        <a href="/dashboard">Back to dashboard</a>`)
    );
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const r2Key = `users/${user.id}/${Date.now()}-${safeName}`;
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await c.env.DB.prepare(
    "INSERT INTO files (user_id, r2_key, filename, size_bytes) VALUES (?, ?, ?, ?)"
  )
    .bind(user.id, r2Key, file.name, size)
    .run();
  await c.env.DB.prepare("UPDATE users SET used_bytes = used_bytes + ? WHERE id = ?")
    .bind(size, user.id)
    .run();
  return c.redirect("/dashboard");
});

dashboard.post("/delete", async (c) => {
  const user = c.get("user");
  const form = await c.req.parseBody();
  const id = Number(form["id"]);
  if (!id) return c.redirect("/dashboard");
  const row = await c.env.DB.prepare(
    "SELECT id, r2_key, size_bytes FROM files WHERE user_id = ? AND id = ?"
  )
    .bind(user.id, id)
    .first();
  if (!row) return c.redirect("/dashboard");
  const r = row as { r2_key: string; size_bytes: number };
  await c.env.BUCKET.delete(r.r2_key);
  await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  await c.env.DB.prepare("UPDATE users SET used_bytes = used_bytes - ? WHERE id = ?")
    .bind(r.size_bytes, user.id)
    .run();
  return c.redirect("/dashboard");
});

dashboard.get("/download/:id", async (c) => {
  const user = c.get("user");
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
  if (!c.get("user").is_root) return c.redirect("/dashboard");
  await next();
});

admin.get("/admin", async (c) => {
  const users = await c.env.DB.prepare(
    "SELECT id, email, quota_gb, used_bytes, is_root, created_at FROM users ORDER BY id"
  ).all();
  return c.html(
    LAYOUT(
      "Admin",
      html`
        <nav><a href="/dashboard">Dashboard</a> | <a href="/logout">Log out</a></nav>
        <h1>Admin – All users</h1>
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
        <p>To create a root account, run in D1: <code>UPDATE users SET is_root = 1 WHERE email = 'your@email.com';</code></p>
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

export default app;
