# 🚀 PawTube - Deployment & Architecture Guide

PawTube is architected to deploy as **ONE repository + ONE Vercel project** with zero external database or Docker requirements.

---

## 🏗️ Architecture Overview

```
PawTube Repository
├── public/                Static public assets (PWA manifest, icons, service worker)
├── src/                   Frontend Single-Page Application (ES Modules)
│   ├── app/               Router, bootstrap, application lifecycle
│   ├── components/        UI components (video cards, search dropdown, toast)
│   ├── pages/             Views: Home, Shorts, Library, You, Watch, Search
│   ├── api/               Client-side API service with in-flight deduplication & TTL cache
│   ├── player/            Canonical Video ID parser & YouTube No-Cookie embed builder
│   ├── storage/           Local history, playlists, and user preferences (localStorage)
│   └── styles/            AMOLED liquid-glass design system (tokens, global, glass, responsive)
├── api/                   Vercel Serverless Functions
│   ├── _piped.js          Shared engine: instance pool, health checks, SSRF guard, latency scoring
│   ├── piped/             /api/piped/trending, search, video, channel, playlist, streams, suggestions
│   ├── instances.js       /api/instances (instance pool status & health)
│   └── health.js          /api/health (gateway health check)
├── vercel.json            Vercel configuration with serverless & SPA rewrite routing
├── index.html             Clean AMOLED entry point with semantic navigation
└── server.js              Local development & Cloud Run server (port 3000)
```

---

## ⚡ Vercel Deployment (One-Click)

### 1. Import Repository
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **"Add New..."** → **"Project"**.
3. Import the `PawTube` repository.

### 2. Configure Build & Output
- **Framework Preset**: `Other` (or leave default)
- **Root Directory**: `./`
- **Build Command**: `npm run build`
- **Output Directory**: Leave empty / default (root files and `/public` are served automatically)
- **Environment Variables**: None required! PawTube operates without requiring any API keys.

### 3. Deploy
Click **Deploy**.
Vercel automatically detects:
- All serverless functions in `/api/**` (e.g., `/api/piped/trending`, `/api/piped/video`, `/api/health`).
- Static assets and `index.html`.
- `vercel.json` rewrites that route all browser navigation to `/index.html` for client-side routing.

---

## 💻 Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run local server**:
   ```bash
   npm run dev
   # or
   npm start
   ```
   The local development server runs on `http://localhost:3000`.

3. **Verify API endpoints**:
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/piped/trending
   ```

4. **Verify lint & build**:
   ```bash
   npm run lint
   npm run build
   ```

---

## 🛡️ Security & SSRF Protection

- **SSRF Prevention**: The serverless helper (`api/_piped.js`) validates all custom instance URLs against private and internal IP ranges (`127.0.0.1`, `10.*`, `192.168.*`, `172.16.*`, `.internal`, `.local`).
- **No Arbitrary Proxy**: PawTube strictly routes media extraction to validated Piped endpoints.
- **Privacy-First Playback**: Video playback uses `https://www.youtube-nocookie.com/embed/VIDEO_ID` directly on the client, completely decoupled from Piped metadata.

---

## ⚙️ Custom Piped API Configuration

Users can customize their Piped instance from the **You** page inside the application:
1. Open PawTube and navigate to **You** (bottom nav or sidebar).
2. Under **Piped API Instance**, enter your custom instance URL (e.g., `https://api.piped.private.coffee`).
3. Click **Save**. The custom instance preference is stored locally in `localStorage` and sent with subsequent requests via the `X-Custom-Instance` header.
4. To revert to the high-availability default pool, click **Reset**.

---

## 🔍 Troubleshooting & Common Issues

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Feed fails to load** | Upstream Piped instance rate limit or temporary outage | PawTube automatically fails over to the next healthy instance. You can also specify a custom instance in **You**. |
| **Video playback blocked** | Video restricted by creator from embedding | Some videos (e.g. copyright restricted or age-gated) disallow embedding on third-party domains. Click "Watch on YouTube" if this occurs. |
| **Direct URL refresh 404 on Vercel** | Missing SPA rewrite rule | Ensure `vercel.json` includes `{"source": "/(.*)", "destination": "/index.html"}`. |
| **Local dev port conflict** | Another process is using port 3000 | Kill the existing process on port 3000 before running `npm start`. |

---

## 📄 License

MIT License &copy; 2026 PawTube
