# 🚀 Quick Start Guide

## 1. Install & Run

```bash
cd /Users/cb/Developer/projects/sunbird
npm install
npm run dev
```

## 2. Build for All Platforms

```bash
./scripts/build-all.sh
```

This creates:
- `dist-poki/` — Poki build
- `dist-crazy/` — CrazyGames build
- `dist-gamepix/` — GamePix build
- `dist-y8/` — Y8 build
- `dist-newgrounds/` — Newgrounds build
- `dist-itch/` — itch.io build
- `dist-standalone/` — Self-hosted build
- `dist-ghpages/` — GitHub Pages build

## 3. Submit to Platforms

### Poki (highest revenue)
1. Go to https://app.poki.dev
2. Upload `dist-poki/index.html`
3. Test in Poki Inspector
4. Submit for review

### CrazyGames (highest eCPMs)
1. Go to https://developer.crazygames.com
2. Upload `dist-crazy/index.html`
3. Test in sandbox
4. Submit for review

### itch.io (exposure + tips)
1. Go to https://itch.io/dashboard
2. Create new game project
3. Upload `dist-itch/index.html`
4. Set pay-what-you-want pricing

### GameDistribution (massive reach)
1. Go to https://gamedistribution.com
2. Upload `dist-standalone/index.html`
3. Configure ad placements

## 4. Deploy to Vercel (self-hosted)

```bash
npm i -g vercel
vercel --prod
```

## 5. Start Multiplayer Server

```bash
cd server
npm install
npm run dev
```

Server runs on `ws://localhost:3001`

## 6. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
# Edit .env with your Stripe keys (standalone only)
```

## 📊 Platform Revenue Ranking

1. **CrazyGames** — $8-16 per 1000 plays
2. **Poki** — $6-12 per 1000 plays
3. **GameDistribution** — $5-10 per 1000 plays
4. **GamePix** — $5-10 per 1000 plays
5. **Y8** — $3-7 per 1000 plays
6. **Newgrounds** — $2-5 per 1000 plays
7. **itch.io** — Variable (tips + sales)

## 🎯 Submission Priority

1. Poki (largest audience)
2. CrazyGames (highest eCPMs)
3. GameDistribution (massive reach)
4. GamePix (easy integration)
5. itch.io (exposure + community)
6. Newgrounds (dev community)

## 📁 Project Structure

```
sunbird/
├── src/
│   ├── game/           # Game engine (37+ files)
│   ├── sdk/            # Platform SDK adapters
│   └── utils/          # Shared utilities
├── server/             # WebSocket multiplayer server
├── scripts/            # Build scripts
├── public/             # Static assets
├── dist/               # Build output
└── dist-*/             # Platform-specific builds
```
