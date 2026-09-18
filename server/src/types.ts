/**
 * Canonical server-side domain types for the Sunbird social backend.
 *
 * `PlayerProfile` mirrors the client type in `src/game/PlayerProfile.ts`
 * (the wire subset) and extends it with server-owned fields (playerCode,
 * platform link, counters). Keep the shared fields in lockstep with the
 * client — a contract test pins the overlap.
 */

/* ---------------------------------------------------------------- identity */

export type PrivacySettings = {
  showOnLeaderboards: boolean;
  allowFriendRequests: boolean;
  allowInvites: boolean;
  showPresence: boolean;
  /** Who may fetch your published replays: public | friends | private. */
  replays: "public" | "friends" | "private";
};

export type ModerationState = {
  status: "clear" | "muted" | "suspended";
  reasonCode?: string;
  /** ISO timestamp when a temporary suspension/mute expires. */
  expiresAt?: string;
};

export type PlatformLink = { name: string; platformId: string; linkedAt: string };

/** Server-side lifetime counters, fed by verified run reports. */
export type AchievementCounters = {
  runsPlayed: number;
  lifetimeDistance: number;
  lifetimeCoins: number;
  zeniths: number;
  ghostBeats: number;
  duelWins: number;
  racesRun: number;
  streakDays: number;
  bestAltitude: number;
};

export type PlayerProfile = {
  playerId: string;
  /** Human-shareable code, e.g. `SUN-9F3K2A`. The ONLY lookup surface. */
  playerCode: string;
  displayName: string;
  avatarUrl?: string;
  guest: boolean;
  platform?: PlatformLink;
  countryCode?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  privacy: PrivacySettings;
  moderation: ModerationState;
  counters: AchievementCounters;
  /** Most recent unlocked achievements: id → ISO unlock time. */
  achievements: Record<string, string>;
  /** Season-scoped achievement ids (reset per season). */
  seasonalAchievements: Record<string, string[]>;
};

/** Privacy-safe view of a profile returned to other players. */
export type PublicProfile = {
  playerId: string;
  playerCode: string;
  displayName: string;
  avatarUrl?: string;
  guest: boolean;
  countryCode?: string;
  moderation: "clear" | "suspended";
  online: boolean;
  recentAchievements: { id: string; at: string }[];
};

export type IdentityCredentials = {
  playerId: string;
  /** Short-lived signed session token. */
  token: string;
  profile: PlayerProfile;
};

/* ----------------------------------------------------------------- friends */

export type FriendRequestStatus = "pending" | "accepted" | "declined" | "canceled" | "expired";

export type FriendRequest = {
  id: string;
  fromId: string;
  toId: string;
  createdAt: string;
  status: FriendRequestStatus;
  resolvedAt?: string;
};

export type FriendView = PublicProfile & {
  friendSince: string;
  lastSeen: string;
  bestDistance: number;
};

export type InvitePermission = { canInvite: boolean; reason: string };

/* ------------------------------------------------------------------- rooms */

export type RoomStatus = "lobby" | "racing" | "finished" | "canceled";

/** Public room row — safe for any visitor, carries no pilot identity. */
export type PublicRoom = {
  code: string;
  seed: string;
  status: RoomStatus;
  capacity: number;
  seated: number;
  host: string;
  joinable: boolean;
  ageSeconds: number;
};

export type RoomView = {
  roomId: string;
  code: string;
  seed: string;
  matchId: string;
  capacity: number;
  status: RoomStatus;
  hostSeatId: string;
  startAtMs: number;
  inviteUrl: string;
  pilots: {
    seatId: string;
    playerId: string;
    name: string;
    skin: string;
    hue: number;
    ready: boolean;
    connected: boolean;
    host: boolean;
    finished: boolean;
  }[];
};

export type SeatGrant = {
  roomId: string;
  seatId: string;
  playerId: string;
  generation: number;
  /** Opaque token to reclaim the seat after a dropped connection. */
  reconnectToken: string;
  inviteUrl: string;
};

export type RaceResult = {
  matchId: string;
  roomId: string;
  code: string;
  seed: string;
  finishedAt: string;
  standings: {
    seatId: string;
    playerId: string;
    name: string;
    place: number;
    distance: number;
    score: number;
    timeMs: number | null;
    dnf: boolean;
  }[];
};

/* ------------------------------------------------------------- leaderboards */

export type BoardScope = "global" | "daily" | "friends";
export type BoardMetric = "distance" | "altitude" | "perfects" | "coins" | "score";
export type ScoreStatus = "active" | "quarantined" | "invalidated";

export type ScoreRow = {
  runId: string;
  playerId: string;
  name: string;
  skin: string;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  durationMs: number;
  seed: string;
  mode: string;
  /** Client-local day (YYYY-MM-DD) — the daily board keys off this. */
  date: string;
  createdAt: string;
  seasonId: string;
  status: ScoreStatus;
  quarantinedReason?: string;
};

export type BoardEntry = {
  rank: number;
  playerId: string;
  name: string;
  skin: string;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  date: string;
  you: boolean;
};

export type BoardPage = {
  scope: BoardScope;
  metric: BoardMetric;
  entries: BoardEntry[];
  yourRank: number;
  total: number;
  nextCursor: string | null;
};

export type SeasonSnapshot = {
  seasonId: string;
  capturedAt: string;
  reason: "season-end" | "manual" | "rollback";
  perMetric: Record<string, { top: Omit<BoardEntry, "rank" | "you">[]; total: number }>;
};

/* ------------------------------------------------------------------ ghosts */

export type GhostStatus = "active" | "featured" | "taken_down";

export type GhostMeta = {
  id: string;
  playerId: string;
  name: string;
  seed: string;
  /** Track key (e.g. "daily:2026-09-15" / "public"). */
  track: string;
  distance: number;
  durationMs: number;
  sampleCount: number;
  hash: string;
  status: GhostStatus;
  createdAt: string;
  expiresAt: string;
  /** objectStore key — samples live in the object store, not in the DB. */
  objectKey: string;
  sizeBytes: number;
  reports: { byId: string; reason: string; at: string }[];
  takedownReason?: string;
};

export type GhostRecord = {
  id: string;
  name: string;
  seed: string;
  track: string;
  distance: number;
  durationMs: number;
  hash: string;
  samples: number[][];
  url?: string;
};

/* ------------------------------------------------------------- tournaments */

export type TrophyTier = "bronze" | "silver" | "gold" | "diamond";
export type TournamentPhase = "draft" | "registration" | "active" | "finished" | "canceled";
export type Prize = { kind: "coins" | "skin" | "boost" | "trail" | "title"; id: string; amount: number; label: string };

export type TournamentEntry = {
  playerId: string;
  best: number;
  attempts: number;
  runId: string | null;
  submittedAt: string | null;
  registeredAt: string;
  /**
   * Highest tier cut already banked for this player (via claim or
   * distribute). A reward is only claimable for cuts ABOVE this — so one
   * run cannot be double-banked across tiers, while a genuinely improved
   * best still unlocks the next tier.
   */
  claimedBest: number;
};

export type Tournament = {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  mode: string;
  metric: BoardMetric;
  seasonId: string;
  phase: TournamentPhase;
  createdAt: string;
  startsAt: string;
  endsAt: string;
  registrationClosesAt: string;
  cuts: Record<TrophyTier, number>;
  prizes: Record<TrophyTier, Prize>;
  entries: Record<string, TournamentEntry>;
  /** Reward ledger: grantKey → ISO time. Grant keys are stable per player+tier. */
  rewardLedger: Record<string, string>;
  standingsSnapshot: { rank: number; playerId: string; best: number; tier: TrophyTier | null }[] | null;
  distributedAt: string | null;
  maxEntries: number;
};

export type TournamentStanding = {
  rank: number;
  playerId: string;
  name: string;
  best: number;
  attempts: number;
  tier: TrophyTier | null;
  you: boolean;
};

/* ------------------------------------------------------------------ squads */

export type SquadVisibility = "public" | "invite" | "private";
export type SquadRole = "owner" | "admin" | "member" | "probation";

export type SquadMember = {
  playerId: string;
  name: string;
  role: SquadRole;
  joinedAt: string;
  lastActiveAt: string;
  contribution: number;
  mutedUntil: string | null;
  probationUntil: string | null;
};

export type SquadGoal = {
  weekKey: string;
  kind: "total_distance" | "total_coins" | "total_perfects";
  target: number;
  progress: number;
  claimedAt: string | null;
};

export type Squad = {
  id: string;
  name: string;
  description: string;
  emblem: string;
  visibility: SquadVisibility;
  inviteCode: string;
  ownerId: string;
  createdAt: string;
  members: SquadMember[];
  cap: number;
  /** Join approvals for invite/private squads: playerId → request time. */
  pending: Record<string, string>;
  /** Players blocked from ever joining. */
  blocked: string[];
  goal: SquadGoal | null;
  /** Event participation: tournament ids squad members entered this week. */
  eventTournaments: string[];
  /** Structured shouts (emotes only) — the anti-spam policy, not free text. */
  shouts: { byId: string; byName: string; emote: string; at: string }[];
  reports: { byId: string; reason: string; at: string }[];
  /** Contribution ledger: runId → ISO time (idempotent contribution). */
  contributionLedger: Record<string, string>;
};

/* ------------------------------------------------------------- achievements */

export type Rarity = "bronze" | "silver" | "gold" | "platinum";

export type AchievementDef = {
  id: string;
  title: string;
  desc: string;
  rarity: Rarity;
  /** "lifetime" counters never reset; "seasonal" reset each season. */
  scope: "lifetime" | "seasonal";
  target: number;
  counter: keyof AchievementCounters;
};

export type AchievementProgress = {
  id: string;
  title: string;
  rarity: Rarity;
  scope: "lifetime" | "seasonal";
  target: number;
  current: number;
  unlocked: boolean;
  unlockedAt?: string;
};

/* ------------------------------------------------------------------- saves */

export type CloudSave = {
  playerId: string;
  version: number;
  updatedAt: string;
  sizeBytes: number;
  payload: string;
};

/* ------------------------------------------------------------ moderation */

export type ModerationCaseKind = "quarantinedScore" | "ghostReport" | "squadReport" | "flaggedPlayer";

export type ModerationCase = {
  id: string;
  kind: ModerationCaseKind;
  targetId: string;
  byId: string | null;
  reason: string;
  createdAt: string;
  status: "open" | "approved" | "dismissed";
  decidedAt?: string;
  note?: string;
};

export type AuditEntry = {
  at: string;
  actor: string;
  action: string;
  target: string;
  meta?: Record<string, unknown>;
};
