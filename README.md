# 🐾 PawTube

> **PawTube** is a minimalist, distraction-free, and privacy-enhanced YouTube video experience built with an AMOLED liquid-glass design system.  
> No ads. No algorithm rabbit holes. No tracking. Pure video playback powered by YouTube No-Cookie embeds and high-availability Piped API metadata.

---

## ⚡ Highlights

- **🔒 Privacy-First Playback**: Direct playback using `https://www.youtube-nocookie.com/embed/VIDEO_ID` with zero tracking cookies.
- **⚡ Decoupled Player Architecture**: Video playback initializes instantly upon URL paste without waiting for upstream metadata.
- **💎 AMOLED Liquid-Glass UI**: Deep blacks (`#000000`), backdrop-blur glass panels, and fluid responsive design for mobile, tablet, and desktop.
- **🛡️ Piped-Only Backend Engine**: Vercel-ready serverless API gateway (`api/piped/*`) with multi-instance failover, health tracking, and SSRF prevention.
- **📱 PWA Ready**: Installable Progressive Web App with manifest, service worker caching, and offline support.
- **☁️ Zero-Config Vercel Deployment**: Deploy as **ONE repository + ONE Vercel project** without database or external infrastructure dependencies.

---

## 🧭 Navigation & Layout

- **Home**: Trending & topic category feeds (Music, Gaming, News, Tech, Animation, Podcasts) + Continue Watching rail.
- **Shorts**: Distraction-free vertical video stream.
- **Library**: Local watch history & custom playlists (Watch Later, Favorites).
- **You**: Profile, channel subscriptions, content region settings, and custom Piped API instance configuration.
- **Top Bar**: Search bar with real-time query suggestions and direct video link detection.

---

## 🚀 Quick Start

### Local Development
```bash
# Clone repository
git clone https://github.com/pawjects/PawTube.git
cd PawTube

# Install dependencies
npm install

# Start local dev server (port 3000)
npm run dev
```
Visit `http://localhost:3000` in your browser.

### Verification
```bash
# Run syntax and lint checks
npm run lint

# Run build check
npm run build
```

---

## ☁️ Deployment

PawTube is ready for immediate deployment on Vercel:

1. Import this repository into [Vercel](https://vercel.com).
2. Set Framework Preset to `Other`.
3. Click **Deploy**.

For detailed deployment instructions and architecture notes, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 📄 License

MIT &copy; 2026 PawTube
