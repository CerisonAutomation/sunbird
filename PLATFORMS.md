# 🌐 Sunbird — Platform Distribution Guide

## 📊 Platform Comparison

| Platform | Revenue Model | eCPM Range | Audience | Difficulty |
|----------|--------------|------------|----------|------------|
| **Poki** | Rev share (55/45) | $2-8 | 50M+ monthly | Medium |
| **CrazyGames** | Rev share (60/40) | $3-10 | 30M+ monthly | Medium |
| **GamePix** | Rev share (70/30) | $2-6 | 10M+ monthly | Easy |
| **Y8** | Rev share (50/50) | $1-4 | 30M+ monthly | Easy |
| **Newgrounds** | Tips + ad revenue | $1-3 | 5M+ monthly | Easy |
| **itch.io** | Pay-what-you-want | Variable | 10M+ monthly | Easy |
| **Vercel** | Self-hosted (100%) | N/A | Your audience | Easy |
| **GitHub Pages** | Self-hosted (100%) | N/A | Your audience | Easy |
| **GameDistribution** | Rev share (70/30) | $2-6 | 100M+ monthly | Medium |
| **CrazyGames** | Rev share (60/40) | $3-10 | 30M+ monthly | Medium |

## 🎯 Recommended Distribution Strategy

### Tier 1: High Revenue (submit first)
1. **Poki** — Largest audience, best rev share for casual games
2. **CrazyGames** — Highest eCPMs, great for arcade games
3. **GameDistribution** — Massive reach via portal network

### Tier 2: Good Revenue (submit after Tier 1)
4. **GamePix** — Easy integration, good European audience
5. **Y8** — Large Asian audience
6. **Newgrounds** — Dev community, tips + ads

### Tier 3: Exposure & Portfolio
7. **itch.io** — Best for building fanbase, pay-what-you-want
8. **VNDev.games** — Emerging platform, easy submission
9. **iDev.Games** — Free hosting, embeddable

### Tier 4: Self-Hosted (100% revenue)
10. **Vercel** — Best for custom domains, Stripe integration
11. **GitHub Pages** — Free, good for portfolio
12. **Netlify** — Free tier, good for showcasing

## 🔧 Build Commands

```bash
# Build for specific platform
npm run build:poki      # Poki build
npm run build:crazy     # CrazyGames build

# Build for all platforms
./scripts/build-all.sh  # Creates dist-poki/, dist-crazy/, etc.

# Self-hosted
npm run build           # Standard Vite build to dist/
```

## 📋 Submission Checklist

### Poki
- [ ] Upload dist/index.html to Poki Inspector
- [ ] Ensure PokiSDK.init() is called
- [ ] Ensure gameLoadingFinished() is called
- [ ] Ensure gameplayStart/gameplayStop bracket play sessions
- [ ] No external ads, no other portal branding
- [ ] Content moderation check passes

### CrazyGames
- [ ] Upload dist/index.html to CrazyGames dashboard
- [ ] Ensure CrazyGames.SDK.init() is called
- [ ] Ensure loadingStart/loadingStop are called
- [ ] Ensure gameplayStart/gameplayStop bracket play sessions
- [ ] Sitelock includes crazygames.com
- [ ] No manual payment buttons in portal builds

### GamePix
- [ ] Upload to GamePix developer portal
- [ ] Include GamePix SDK script tag
- [ ] Implement ad breaks at natural pauses

### Y8
- [ ] Upload to Y8 developer portal
- [ ] Include Y8 SDK script tag
- [ ] Implement ad integration

### Newgrounds
- [ ] Upload to Newgrounds portal
- [ ] Include NG API script tag
- [ ] Implement Medals (achievements) for engagement

### itch.io
- [ ] Upload dist/index.html as HTML embed
- [ ] Set up pay-what-you-want pricing
- [ ] Add screenshots and description

## 💰 Revenue Estimates (per 1000 plays)

| Platform | Rewarded | Midgame | Banner | Total |
|----------|----------|---------|--------|-------|
| Poki | $4-8 | $2-4 | $0.50 | $6-12 |
| CrazyGames | $5-10 | $3-6 | $0.75 | $8-16 |
| GamePix | $3-6 | $2-4 | $0.50 | $5-10 |
| Y8 | $2-4 | $1-3 | $0.25 | $3-7 |

*Estimates based on casual arcade genre, 2-3 min avg session*

## 🚀 Quick Start

```bash
# 1. Build for all platforms
./scripts/build-all.sh

# 2. Test locally
npm run dev

# 3. Submit to platforms (one at a time)
# Upload dist-poki/index.html to Poki Inspector
# Upload dist-crazy/index.html to CrazyGames dashboard

# 4. Monitor performance
# Check each platform's developer dashboard for analytics
```

## 📊 Key Metrics to Track

- **Retention**: Day 1, Day 7, Day 30
- **Session length**: Average time per play
- **Plays per user**: How often they return
- **Ad engagement**: Rewarded vs midgame opt-in rate
- **Revenue per 1000 plays**: Primary monetization metric
- **Conversion**: % of players who play for 1+ minute
