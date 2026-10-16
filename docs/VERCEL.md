# Deploying the frontend on Vercel

The React app is a static Vite build, so Vercel hosts it directly. The FastAPI backend keeps running
on the EC2 instance from [`deploy/ec2`](../deploy/ec2/README.md). Vercel forwards every `/api/...`
request to it, so the browser only ever talks to one HTTPS origin: no CORS, no mixed-content errors,
and the frontend is built with an empty API base URL.

```
Browser ──HTTPS──► Vercel (static SPA)
                      └─ /api/*  ──HTTP rewrite──► EC2 (nginx ─► FastAPI) ──► Supabase Postgres
```

The rule lives in [`frontend/vercel.json`](../frontend/vercel.json): `/api/:path*` is rewritten to the
EC2 address, and every other path falls back to `index.html` for client-side routing.

## 1. Before you start

* The backend answers at `http://<ec2-ip>/health` (open it in a browser: it should say `ok`).
* `frontend/vercel.json` has that same address in its `destination`. Edit it if the address differs,
  and send the change through a pull request.
* You have the two **public** Supabase values from your `.env`: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. Never use the service-role key here.

## 2. Create the project

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New… → Project**, then **Import** the repository `Avishkar74/StudAura`
   (allow the Vercel GitHub app to read it when asked).
3. On the configure screen:

   | Setting | Value |
   |---|---|
   | Framework Preset | Vite (detected) |
   | **Root Directory** | `frontend` (click Edit and pick the folder) |
   | Build and Output Settings | leave the defaults; `vercel.json` sets them |
   | Environment Variables | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (all environments) |

   Do **not** add `VITE_API_BASE_URL`. Leaving it unset makes the app call `/api/...` on its own
   origin, which is what the rewrite expects.
4. Open **Settings → General → Node.js Version** and choose **24.x**. The project requires Node 24.15
   or newer (`frontend/.nvmrc`, `engines` in `package.json`).
5. Click **Deploy**. It takes about a minute and ends with an address like
   `https://studaura-xxxx.vercel.app`.

Every push to `main` now redeploys production, and every pull request gets its own preview URL.

## 3. Tell Supabase about the new address

In the Supabase dashboard, **Authentication → URL Configuration**:

* **Site URL**: `https://studaura-xxxx.vercel.app` (your production address).
* **Redirect URLs**: add `https://studaura-xxxx.vercel.app/**`. For preview deployments also add
  `https://*-avishkar74.vercel.app/**` (use your Vercel team or account slug).

Without this, sign-up confirmation links and sign-in redirects point at the wrong place.

## 4. Check it works

1. Open the Vercel address: the sign-in page renders.
2. Check the proxy from a terminal. A `401` with a JSON body means the request reached the backend:

   ```bash
   curl -i https://studaura-xxxx.vercel.app/api/v1/me
   ```
3. Create an account, sign in, create a learning path, import a video.

## 5. When something is off

| Symptom | Likely cause |
|---|---|
| Blank page, console says the Supabase URL is invalid | The two `VITE_SUPABASE_*` variables are missing or were added after the build. Add them, then **Redeploy**. |
| `/api/...` returns 404 or an HTML page | Root Directory is not `frontend`, so `vercel.json` was not read. |
| `/api/...` returns 502 or 504 | The EC2 instance is stopped, or its address changed. Start it and update `destination`. |
| Install fails with an engine error | Node.js Version is not 24.x (step 2.4). |
| Sign-up link goes to `localhost` or errors | Supabase Site URL and Redirect URLs (step 3). |
| Pages are slow | The database is in Mumbai and the instance in Sydney (about 260 ms per query). Host both in the same region for a faster app. |

## Limits worth knowing

* **The hop from Vercel to EC2 is plain HTTP.** The browser side is HTTPS, but login tokens cross the
  internet unencrypted between Vercel and the instance. For anything beyond a demo, put HTTPS on the
  instance (a domain plus Caddy or nginx with Let's Encrypt) and change the `destination` to `https://`.
* **The EC2 address must stay put.** A stop and start gives it a new public IP unless you attach an
  Elastic IP (about $3.65 a month, the same as the auto-assigned public address).
* **Vercel's free Hobby plan** is for non-commercial use, and proxied requests have a time limit
  (tens of seconds). Importing a very large playlist is the request most likely to hit it.
* **Cost:** Vercel Hobby is free; the EC2 instance is about $14 to $15 a month, paid from AWS credits.
