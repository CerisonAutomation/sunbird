# 🛠️ Tech Stack Compatibility Guide

## Current Stack
- **React 19** — UI layer
- **Three.js 0.186** — 3D rendering
- **Vite 7** — Build tool
- **Tailwind 4** — CSS framework
- **TypeScript 5.9** — Type safety
- **Web Audio API** — Procedural music

## ✅ Compatible & Recommended additions

### Backend & Database
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Supabase** | Auth, DB, Realtime | Free tier, PostgreSQL, realtime subscriptions, Edge Functions |
| **Firebase** | Auth, DB, Hosting | Google integration, free tier, easy setup |
| **Neon** | PostgreSQL serverless | Free tier, scales to zero, great for leaderboards |
| **Turso** | SQLite edge database | Fast reads, global replication |
| **PlanetScale** | MySQL serverless | Branching, free tier |

### Realtime & Multiplayer
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Socket.io** | WebSocket rooms | Already using WebSocket server, easy upgrade |
| **Ably** | Realtime messaging | Free tier, reliable, game-ready |
| **Pusher** | Realtime channels | Easy integration, free tier |
| **Liveblocks** | Collaborative state | Good for multiplayer sync |

### Analytics & Monitoring
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **PostHog** | Product analytics | Free tier, session replay, feature flags |
| **Mixpanel** | User analytics | Free tier, funnel analysis |
| **Sentry** | Error tracking | Free tier, source maps, performance |
| **GlitchTip** | Error tracking (free Sentry alt) | Self-hosted, free |

### Payments & Monetization
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Stripe** | Payments | Already integrated, best in class |
| **LemonSqueezy** | Digital sales | Tax handling, easier than Stripe |
| **Gumroad** | Digital sales | Simple, good for indie games |

### CI/CD & Deployment
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Vercel** | Hosting | Free tier, instant deploys, edge functions |
| **Netlify** | Hosting | Free tier, good for static |
| **Cloudflare Pages** | Hosting | Free, fast global CDN |
| **GitHub Actions** | CI/CD | Free for public repos |

### Testing
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Vitest** | Unit tests | Vite-native, fast, ESM-first |
| **Playwright** | E2E tests | Cross-browser, visual testing |
| **Storybook** | Component docs | Visual testing, documentation |

### State Management
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Zustand** | Client state | Lightweight, works with React |
| **Jotai** | Atomic state | Good for game state |
| **Valtio** | Proxy state | Easy to use, reactive |

### UI Components
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Radix UI** | Accessible components | Unstyled, composable |
| **shadcn/ui** | UI components | Copy-paste, customizable |
| **Framer Motion** | Animations | Works with React, smooth |

### Audio & Music
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **Tone.js** | Web Audio framework | Already using Web Audio, more features |
| **Howler.js** | Audio library | Easy playback, spatial audio |
| **Pizzicato.js** | Sound effects | Simple API, effects |

### 3D & Graphics
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **React Three Fiber** | React + Three.js | Declarative 3D, great DX |
| **Drei** | R3F helpers | Useful components for R3F |
| **postprocessing** | Effects library | Bloom, SSAO, etc. (already using EffectComposer) |
| **three.quarks** | Particle system | High-performance VFX |

### Internationalization
| Tech | Use Case | Why It Works |
|------|----------|--------------|
| **react-i18next** | i18n | Already built custom i18n, could use this |
| **FormatJS** | i18n | ICU message format |
| **LinguiJS** | i18n | Macro-based, lightweight |

## 🎮 Recommended Stack for Game Features

### Leaderboard & Cloud Save
```
Supabase (PostgreSQL + Auth + Realtime)
  ├── Leaderboard table (ranked queries)
  ├── Save data table (cloud saves)
  ├── User profiles (stats, achievements)
  └── Realtime subscriptions (live multiplayer)
```

### Multiplayer
```
Socket.io (WebSocket server)
  ├── Room management (create/join/leave)
  ├── Position sync (20Hz)
  ├── Chat system
  └── Race state management
```

### Analytics
```
PostHog (product analytics)
  ├── Session replay (see how players play)
  ├── Funnel analysis (onboarding drop-off)
  ├── Feature flags (A/B testing)
  └── Custom events (fever, perfect landing, etc.)
```

### Error Tracking
```
Sentry (error tracking)
  ├── Source maps (readable stack traces)
  ├── Performance monitoring (frame drops)
  ├── Session replay (reproduce bugs)
  └── Alerts (critical errors)
```

## 🚀 Quick Wins (add in 1 hour)

1. **Supabase** — Cloud saves + leaderboard (free tier)
2. **PostHog** — Analytics + session replay (free tier)
3. **Sentry** — Error tracking (free tier)
4. **Vercel** — Hosting + instant deploys (free tier)

## 📊 Full Stack Diagram

```
┌─────────────────────────────────────────────────┐
│                    CLIENT                        │
├─────────────────────────────────────────────────┤
│  React 19 + Three.js 0.186 + Vite 7            │
│  ├── Game Engine (Bird, Terrain, Particles)     │
│  ├── UI Layer (HUD, Menus, Settings)            │
│  ├── Audio (Web Audio procedural music)         │
│  ├── State (SaveData, Leaderboard)              │
│  └── Platform SDKs (Poki, CrazyGames)           │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                   BACKEND                        │
├─────────────────────────────────────────────────┤
│  Supabase (PostgreSQL + Auth + Realtime)        │
│  ├── Leaderboard (ranked queries)               │
│  ├── Cloud Saves (user data sync)               │
│  ├── User Profiles (stats, achievements)        │
│  └── Realtime (live multiplayer state)          │
│                                                 │
│  Socket.io Server (WebSocket relay)             │
│  ├── Room Management (create/join/leave)        │
│  ├── Position Sync (20Hz)                       │
│  ├── Chat System                                │
│  └── Race State                                 │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                 SERVICES                         │
├─────────────────────────────────────────────────┤
│  PostHog (Analytics)                            │
│  ├── Session Replay                             │
│  ├── Funnel Analysis                            │
│  └── Feature Flags                              │
│                                                 │
│  Sentry (Error Tracking)                        │
│  ├── Source Maps                                │
│  ├── Performance Monitoring                     │
│  └── Alerts                                     │
│                                                 │
│  Vercel (Hosting)                               │
│  ├── Static Assets (CDN)                        │
│  ├── Edge Functions                             │
│  └── Instant Deploys                            │
└─────────────────────────────────────────────────┘
```
