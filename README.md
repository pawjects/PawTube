# 🐾 PawTube

[![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=flat-square&logo=html5&logoColor=white)](https://pawtube.localplayer.dev/)
[![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=flat-square&logo=css3&logoColor=white)](https://pawtube.localplayer.dev/)
[![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat-square&logo=javascript&logoColor=%23F7DF1E)](https://pawtube.localplayer.dev/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Telegram Bot](https://img.shields.io/badge/Telegram%20Bot-PawTubeRobot-2CA5E0?style=flat-square&logo=telegram)](https://t.me/PawTubeRobot)

> **PawTube** is a minimalist, distraction-free, and privacy-enhanced YouTube video player.  
> No ads. No algorithm. No tracking. Just the video. 🐾

---

## 🌐 Live App

**[▶ https://pawtube.localplayer.dev/](https://pawtube.localplayer.dev/)**

---

## ✨ Features

### 🔒 Privacy-First Playback
Uses YouTube's official **`youtube-nocookie.com`** embed API — no tracking cookies are set unless you directly interact with the player. Your watch history stays *yours*.

### 🔗 Unique Shareable Video URLs
Every video you load gets its own **unique, shareable URL** — for example:
```
https://pawtube.localplayer.dev/?v=dQw4w9WgXcW
```
You can copy and share this link with anyone. They'll land directly on that video inside PawTube, with no YouTube interface, ads, or recommendations in the way. Timestamps are also supported:
```
https://pawtube.localplayer.dev/?v=dQw4w9WgXcW&t=42
```
This makes PawTube perfect for sharing clean, focused viewing experiences.

### 🤖 PawTube Telegram Bot
**[@PawTubeRobot](https://t.me/PawTubeRobot)** — the companion bot for PawTube!

Just send any YouTube URL to the bot in Telegram, and it will instantly reply with the equivalent **PawTube playback link** — ready to watch, ad-free and privacy-safe.

**Supported URL formats:**
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://youtube.com/shorts/VIDEO_ID`
- `https://m.youtube.com/watch?v=VIDEO_ID`

> 👉 **[Open @PawTubeRobot on Telegram](https://t.me/PawTubeRobot)**

### 🎧 Audio / Background Mode
Instantly hide the video screen to save battery and reduce visual distraction while keeping audio active — great for music and podcasts.

### 🎬 Theater Mode
Expand the player to a cinematic, edge-to-edge viewing experience with a single click.

### 🖼️ Picture-in-Picture
Supports floating window playback so you can multitask without interrupting your video.

### 🕰️ Local Watch History
Automatically saves recently watched videos with thumbnail previews. Data is stored strictly in your **browser's `localStorage`** — it never leaves your device. Clear it with one click anytime.

### ⚙️ Autoplay Toggle
Set your autoplay preference once — PawTube remembers it locally across sessions.

### ✨ Material 3 Dark UI
Custom dark-teal aesthetic with glassmorphism, floating icons, gradient headings, dot-grid texture, and smooth animations — including error shaking and staggered loading effects.

---

## 🚀 Getting Started

PawTube is a **100% static, front-end application** — no build steps, no npm, no dependencies.

### Clone & Run Locally

```bash
git clone https://github.com/pawjects/PawTube.git
cd PawTube
# Open index.html directly in your browser
```

That's it. No server needed.

### Prerequisites

Any modern web browser (Chrome, Firefox, Safari, Edge).

---

## 🔗 How Shareable Links Work

When you paste a YouTube URL or Video ID into PawTube, the browser address bar updates automatically to reflect the video:

```
https://pawtube.localplayer.dev/?v=VIDEO_ID
```

This URL is **fully shareable** — send it to a friend, post it anywhere, or bookmark it. When opened, PawTube loads that video directly without needing any input. Timestamps (`&t=SECONDS`) are also preserved so viewers start exactly where you want them to.

---

## 🤖 Telegram Bot Integration

The **[@PawTubeRobot](https://t.me/PawTubeRobot)** makes converting YouTube links effortless from Telegram.

**How it works:**

1. Open [@PawTubeRobot](https://t.me/PawTubeRobot) on Telegram
2. Send any YouTube video URL or use @vid official inline search
3. The bot instantly replies with a **Watch on PawTube** button message 
4. Tap it — you're watching instantly, ad-free 🐾

No setup. No account. No sucking of privacy.

---

## 🤝 Contributing

Contributions are welcome and appreciated! Here's how to get involved:

1. Fork the repository
2. Create your feature branch:
   ```bash
   git checkout -b feature/YourFeature
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add YourFeature"
   ```
4. Push to your branch:
   ```bash
   git push origin feature/YourFeature
   ```
5. Open a Pull Request

---

## 📜 License

Distributed under the **MIT License with YouTube Compliance Addendum**.  
See [`LICENSE`](LICENSE) for full terms — including important notes on YouTube ToS compliance and `youtube-nocookie.com` usage.

---

## 🐾 About PawDevs

PawTube is a project by **PAWJECTS** — a small indie dev brand building privacy-first, minimal tools.

- 🌐 Website: [Pawjects](https://pawjects.github.io/)
- 📺 PawTube: [pawtube.localplayer.dev/](https://pawtube.localplayer.dev/)
- 🤖 Telegram Bot: [@PawTubeRobot](https://t.me/PawTubeRobot)

---

> **Disclaimer:** PawTube is an independent, experimental project created for privacy and testing purposes.  
> It does not violate YouTube's Terms of Service and exclusively uses official, permitted embedding methods via `youtube-nocookie.com`.  
> PawTube is not affiliated with, endorsed by, or connected to YouTube or Google LLC in any way.
> 
