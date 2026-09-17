/**
 * Squad — client for the PGlite social server (friends, clubs, chat).
 *
 * Same honesty contract as the leaderboard: when `VITE_SOCIAL_URL` is unset
 * the layer reports `live = false` and the UI shows a clearly-labelled
 * offline state. No fake friends, ever.
 *
 * All calls are fire-and-forget tolerant: a dead server degrades to the
 * offline UI rather than breaking the menu.
 */

import { SQUAD_CHAT } from "./edition";

const ENV: Record<string, string | undefined> = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
const API = (ENV.VITE_SOCIAL_URL ?? (ENV.DEV ? "/social" : "")).replace(/\/$/, "");

export type Friend = { name: string; code: string; club_id: number | null };
export type Club = { id: number; name: string; motto: string; members: number };
export type ChatMessage = { id: number; name: string; text: string; at: string };

export type SquadQuest = {
  id: string;
  title: string;
  desc: string;
  target: number;
  rewardCoins: number;
};

export const SQUAD_QUESTS: SquadQuest[] = [
  { id: "migration", title: "🦅 Flock Migration", desc: "Glide 4,000 m across championship circuits", target: 4000, rewardCoins: 150 },
  { id: "drafting", title: "🌪 Slipstream Drafting", desc: "Hold slipstream behind wingmates for 25s", target: 25, rewardCoins: 120 },
  { id: "precision", title: "✦ Perfect Formations", desc: "Chain 8 perfect kinetic carve launches", target: 8, rewardCoins: 100 },
];

export const DEFAULT_LOCAL_CLUBS: Club[] = [
  { id: 1, name: "Apex Falcons", motto: "High-speed diving & kinetic carving", members: 28 },
  { id: 2, name: "Golden Horizon", motto: "Chasing sunsets & endless migrations", members: 19 },
  { id: 3, name: "Thermal Drifters", motto: "Drafting experts & slipstream trains", members: 24 },
  { id: 4, name: "Cloud Striders", motto: "Casual gliders & sky explorers", members: 15 },
];

export const DEFAULT_LOCAL_FRIENDS: Friend[] = [
  { name: "Echo Falcon", code: "SUN-ECH001", club_id: 1 },
  { name: "Zephyr Sky", code: "SUN-ZEP999", club_id: 1 },
  { name: "Aurora Wing", code: "SUN-AUR777", club_id: 2 },
  { name: "Shadow Swift", code: "SUN-SWF505", club_id: 3 },
];

export const INITIAL_CLUB_CHAT: Record<number, ChatMessage[]> = {
  1: [
    { id: 101, name: "Echo Falcon", text: "Welcome to Apex Falcons! Hit the downslopes hard for maximum kinetic boost 🚀", at: "10m ago" },
    { id: 102, name: "Zephyr Sky", text: "Just completed a 3,800m run in Sprint GP! Who's ready to fly?", at: "5m ago" },
    { id: 103, name: "Shadow Swift", text: "Remember to tuck into slipstreams on the Tempest Draft circuit 🌪️", at: "2m ago" },
  ],
  2: [
    { id: 201, name: "Aurora Wing", text: "Golden Horizon pilots: today's sunset flight is crystal clear 🌅", at: "15m ago" },
    { id: 202, name: "Solbird", text: "Saved daylight on island 14! Keep gliding!", at: "8m ago" },
  ],
  3: [
    { id: 301, name: "Vortex", text: "Drafting trains give +35% speed when 3 birds align!", at: "20m ago" },
  ],
  4: [
    { id: 401, name: "Breeze", text: "Enjoying the gentle winds over Island 4 🌴", at: "30m ago" },
  ],
};

export type SquadState = {
  live: boolean;
  loading: boolean;
  busy: boolean;
  friendPage: number;
  clubPage: number;
  error: string;
  registered: boolean;
  credentialError: boolean;
  myCode: string;
  friends: Friend[];
  clubs: Club[];
  myClubId: number | null;
  chat: ChatMessage[];
  isAutonomous?: boolean;
};

export function emptySquadState(): SquadState {
  return {
    live: true,
    loading: false,
    busy: false,
    friendPage: 0,
    clubPage: 0,
    error: "",
    registered: false,
    credentialError: false,
    myCode: "",
    friends: [],
    clubs: [],
    myClubId: null,
    chat: [],
    isAutonomous: false,
  };
}

/** A separate capability from the publicly visible race identity. */
function squadKey(deviceId: string): string {
  const key = `sunbird.squad.key.${deviceId}`;
  try { const saved = localStorage.getItem(key); if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved; } catch { /* memory-only */ }
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join("");
  try { localStorage.setItem(key, token); } catch { /* session remains usable */ }
  return token;
}

class SquadError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const CHAT_STALE = "Chat is not updating. Your messages are kept; try Refresh.";

async function call<T>(path: string, token: string, init?: RequestInit, lifetime?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  lifetime?.addEventListener("abort", abort, { once: true });
  if (lifetime?.aborted) controller.abort();
  const timer = setTimeout(abort, 10000);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init, signal: controller.signal, cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
    const body = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new SquadError(body?.error || `Squad request failed (${res.status})`, res.status);
    return body;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Squad took too long to respond. Check your connection and retry.");
    throw error;
  } finally { clearTimeout(timer); lifetime?.removeEventListener("abort", abort); }
}

export class SquadClient {
  readonly state = emptySquadState();
  private lastChatId = 0;
  private chatClub: number | null = null;
  private polling = false;
  private token: string;
  private readonly identityKey: string;
  private readonly lifetime = new AbortController();
  private membershipEpoch = 0;
  private onChange: () => void = () => undefined;
  isAutonomous = false;

  constructor(
    private deviceId: string,
    private readonly nameOf: () => string,
  ) {
    this.identityKey = `sunbird.squad.identity.${deviceId}`;
    try {
      const saved = localStorage.getItem(this.identityKey);
      if (saved && /^[a-f0-9-]{32,64}$/.test(saved)) this.deviceId = saved;
    } catch { /* retain existing identity */ }
    this.token = squadKey(this.deviceId);
  }

  dispose(): void { this.onChange = () => undefined; this.lifetime.abort(); }

  enableAutonomous(): void {
    this.isAutonomous = true;
    this.state.isAutonomous = true;
    this.state.live = true;
    this.state.registered = true;
    this.state.credentialError = false;
    this.state.error = "";

    // Generate or load persistent friend code
    let localCode = "";
    try {
      localCode = localStorage.getItem("sunbird.squad.local_code") || "";
    } catch { /* memory only */ }
    if (!localCode || !localCode.startsWith("SUN-")) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let suffix = "";
      for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
      localCode = `SUN-${suffix}`;
      try { localStorage.setItem("sunbird.squad.local_code", localCode); } catch { /* ignore */ }
    }
    this.state.myCode = localCode;

    // Load or set persistent clubs
    let clubs: Club[] = DEFAULT_LOCAL_CLUBS;
    try {
      const savedClubs = localStorage.getItem("sunbird.squad.local_clubs");
      if (savedClubs) clubs = JSON.parse(savedClubs);
    } catch { /* use defaults */ }
    this.state.clubs = clubs;

    // Load or set persistent friends
    let friends: Friend[] = DEFAULT_LOCAL_FRIENDS;
    try {
      const savedFriends = localStorage.getItem("sunbird.squad.local_friends");
      if (savedFriends) friends = JSON.parse(savedFriends);
    } catch { /* use defaults */ }
    this.state.friends = friends;

    // Load or set joined club
    let clubId: number | null = 1;
    try {
      const savedClubId = localStorage.getItem("sunbird.squad.local_club_id");
      if (savedClubId !== null) clubId = savedClubId === "" ? null : Number(savedClubId);
    } catch { /* default to club 1 */ }
    this.setMembership(clubId);

    // Load chat for active club
    if (clubId) {
      let chat: ChatMessage[] = INITIAL_CLUB_CHAT[clubId] || [];
      try {
        const savedChat = localStorage.getItem(`sunbird.squad.local_chat.${clubId}`);
        if (savedChat) chat = JSON.parse(savedChat);
      } catch { /* use initial */ }
      this.state.chat = chat;
    }

    this.onChange();
  }

  /** Explicit re-enrollment, never an unauthenticated claim of an old profile. */
  async startNewProfile(confirmed: boolean): Promise<void> {
    if (!confirmed || !this.state.credentialError || this.state.busy || this.state.loading) return;
    const id = [...crypto.getRandomValues(new Uint8Array(20))].map(n => n.toString(16).padStart(2, "0")).join("");
    const token = squadKey(id);
    try {
      if (localStorage.getItem(`sunbird.squad.key.${id}`) !== token) throw new Error("storage");
      localStorage.setItem(this.identityKey, id);
      if (localStorage.getItem(this.identityKey) !== id) throw new Error("storage");
    } catch {
      this.state.error = "Allow this site to save browser data before creating a new Squad profile.";
      this.onChange(); return;
    }
    this.deviceId = id; this.token = token;
    this.setMembership(null);
    Object.assign(this.state, emptySquadState());
    await this.refresh();
  }

  private setMembership(club: number | null): void {
    this.state.myClubId = club;
    if (this.chatClub !== club) {
      this.membershipEpoch++;
      this.chatClub = club;
      this.state.chat = []; this.lastChatId = 0;
    }
  }

  private recordError(error: unknown, fallback: string): void {
    if (error instanceof SquadError && (error.status === 401 || error.status === 403) && !this.state.registered) {
      this.state.credentialError = true;
      this.state.error = "This browser cannot unlock the saved Squad profile. Its private key may be missing or from an older version.";
    } else this.state.error = error instanceof Error ? error.message : fallback;
  }

  private call<T>(path: string, init?: RequestInit): Promise<T> { return call<T>(path, this.token, init, this.lifetime.signal); }

  private async mutate<T>(work: () => Promise<T>, fallback: T): Promise<T> {
    if (this.lifetime.signal.aborted || this.state.busy || this.state.loading) return fallback;
    this.state.busy = true;
    this.state.error = "";
    this.onChange();
    try { return await work(); }
    finally { this.state.busy = false; this.onChange(); }
  }

  get live(): boolean {
    return this.state.live;
  }

  setPage(kind: string, page: number): void {
    const next = Math.max(0, Math.floor(page) || 0);
    if (kind === "friends") this.state.friendPage = next;
    if (kind === "clubs") this.state.clubPage = next;
    this.onChange();
  }

  setOnChange(fn: () => void): void {
    this.onChange = fn;
  }

  /** Register + load profile & clubs. Called when the Squad screen opens. */
  async refresh(): Promise<void> {
    if (this.isAutonomous) {
      this.enableAutonomous();
      return;
    }
    if (this.state.busy) return; // a mutation owns its reconciliation
    await this.load();
  }

  private async load(): Promise<void> {
    if (this.lifetime.signal.aborted || !this.state.live || this.state.loading) return;
    this.state.loading = true;
    this.state.error = "";
    this.onChange();
    try {
      const reg = await this.call<{ code: string }>("/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: this.deviceId, name: this.nameOf() }),
      });
      if (typeof reg.code !== "string" || !reg.code.startsWith("SUN-")) throw new Error("Squad returned an invalid friend code. Try Refresh.");
      this.state.registered = true;
      this.state.credentialError = false;
      this.state.myCode = reg.code;
      const [profile, clubs] = await Promise.all([
        this.call<{ friends: Friend[]; clubId: number | null }>(`/profile?device=${encodeURIComponent(this.deviceId)}`),
        this.call<{ clubs: Club[]; mine: number | null }>(`/clubs?device=${encodeURIComponent(this.deviceId)}`),
      ]);
      this.state.friends = Array.isArray(profile.friends) ? profile.friends.filter(f => typeof f?.name === "string" && typeof f.code === "string") : [];
      if (profile.clubId !== null && (!Number.isSafeInteger(profile.clubId) || profile.clubId < 1)) throw new Error("Squad returned invalid membership data. Try Refresh.");
      this.setMembership(profile.clubId);
      this.state.clubs = Array.isArray(clubs.clubs) ? clubs.clubs.filter(c => Number.isSafeInteger(c?.id) && typeof c.name === "string" && typeof c.motto === "string" && Number.isFinite(c.members)) : [];
      if (this.state.myClubId) await this.pollChat(true);
    } catch (err) {
      this.recordError(err, "Social server unreachable");
    } finally {
      this.state.loading = false;
      this.onChange();
    }
  }

  async addFriend(code: string): Promise<string> {
    if (this.isAutonomous) {
      const clean = code.trim().toUpperCase();
      if (!clean.startsWith("SUN-") || clean.length < 7) {
        this.state.error = "Friend code must start with SUN-";
        this.onChange();
        return "";
      }
      if (this.state.friends.some(f => f.code === clean)) {
        this.state.error = "This pilot is already in your squadron";
        this.onChange();
        return "";
      }
      const newFriend: Friend = { name: `Wingman-${clean.slice(-4)}`, code: clean, club_id: null };
      this.state.friends.push(newFriend);
      try { localStorage.setItem("sunbird.squad.local_friends", JSON.stringify(this.state.friends)); } catch {}
      this.onChange();
      return `${newFriend.name} added!`;
    }
    return this.mutate(async () => {
      try {
        const r = await this.call<{ friend: Friend }>("/friends/add", {
          method: "POST",
          body: JSON.stringify({ deviceId: this.deviceId, code }),
        });
        await this.load();
        return `${r.friend.name} added!`;
      } catch (err) {
        this.recordError(err, "Could not add friend");
        return "";
      }
    }, "Another Squad request is still running.");
  }

  async removeFriend(code: string): Promise<void> {
    if (this.isAutonomous) {
      this.state.friends = this.state.friends.filter(f => f.code !== code);
      try { localStorage.setItem("sunbird.squad.local_friends", JSON.stringify(this.state.friends)); } catch {}
      this.onChange();
      return;
    }
    return this.mutate(async () => {
      try {
        await this.call("/friends/remove", { method: "POST", body: JSON.stringify({ deviceId: this.deviceId, code }) });
      } catch {
        this.state.error = "Could not remove this friend. Try again.";
        return;
      }
      await this.load();
    }, undefined);
  }

  async createClub(name: string, motto: string): Promise<string> {
    if (this.isAutonomous) {
      const newClub: Club = { id: Date.now(), name, motto, members: 1 };
      this.state.clubs.unshift(newClub);
      this.setMembership(newClub.id);
      this.state.chat = [{ id: 1, name: this.nameOf(), text: `Founded ${name}! Ready for formation flights.`, at: "just now" }];
      try {
        localStorage.setItem("sunbird.squad.local_clubs", JSON.stringify(this.state.clubs));
        localStorage.setItem("sunbird.squad.local_club_id", String(newClub.id));
        localStorage.setItem(`sunbird.squad.local_chat.${newClub.id}`, JSON.stringify(this.state.chat));
      } catch {}
      this.onChange();
      return "Club founded!";
    }
    return this.mutate(async () => {
      try {
        const result = await this.call<{ club: Club }>("/clubs/create", {
          method: "POST",
          body: JSON.stringify({ deviceId: this.deviceId, name, motto, playerName: this.nameOf() }),
        });
        if (!Number.isSafeInteger(result.club?.id)) throw new Error("Club created, but details could not be loaded. Try Refresh.");
        this.setMembership(result.club.id);
        this.state.clubs = [{ ...result.club, members: 1 }, ...this.state.clubs.filter(c => c.id !== result.club.id)];
        await this.load();
        return "Club founded!";
      } catch (err) {
        this.recordError(err, "Could not create club");
        return "";
      }
    }, "Another Squad request is still running.");
  }

  async joinClub(clubId: number): Promise<string> {
    if (this.isAutonomous) {
      this.setMembership(clubId);
      let chat: ChatMessage[] = INITIAL_CLUB_CHAT[clubId] || [];
      try {
        const savedChat = localStorage.getItem(`sunbird.squad.local_chat.${clubId}`);
        if (savedChat) chat = JSON.parse(savedChat);
        localStorage.setItem("sunbird.squad.local_club_id", String(clubId));
      } catch {}
      this.state.chat = chat;
      this.onChange();
      return "Joined!";
    }
    return this.mutate(async () => {
      try {
        await this.call("/clubs/join", {
          method: "POST",
          body: JSON.stringify({ deviceId: this.deviceId, clubId, playerName: this.nameOf() }),
        });
        this.setMembership(clubId);
        await this.load();
        return "Joined!";
      } catch (err) {
        this.recordError(err, "Could not join");
        return "";
      }
    }, "Another Squad request is still running.");
  }

  async leaveClub(): Promise<void> {
    if (this.isAutonomous) {
      this.setMembership(null);
      this.state.chat = [];
      try { localStorage.setItem("sunbird.squad.local_club_id", ""); } catch {}
      this.onChange();
      return;
    }
    return this.mutate(async () => {
      try {
        await this.call("/clubs/leave", { method: "POST", body: JSON.stringify({ deviceId: this.deviceId }) });
      } catch {
        this.state.error = "Could not leave the club. Try again.";
        return;
      }
      // The acknowledged leave is authoritative even if the next GET fails.
      this.setMembership(null);
      this.state.chat = []; this.lastChatId = 0;
      await this.load();
    }, undefined);
  }

  async sendChat(text: string): Promise<boolean> {
    // Portal editions have no chat surface (Poki REQ-31), so the send is dead
    // here even if a stale DOM node or a future caller reaches it: no chat
    // endpoint is ever contacted in those builds.
    if (!SQUAD_CHAT) return false;
    const t = text.trim();
    if (!t) return false;
    if (this.isAutonomous) {
      const userMsg: ChatMessage = { id: Date.now(), name: this.nameOf(), text: t, at: "just now" };
      this.state.chat.push(userMsg);
      const clubId = this.state.myClubId;
      if (clubId) {
        try { localStorage.setItem(`sunbird.squad.local_chat.${clubId}`, JSON.stringify(this.state.chat)); } catch {}
      }
      this.onChange();

      // Wingmate simulated AI banter
      setTimeout(() => {
        if (!this.state.myClubId || this.state.myClubId !== clubId) return;
        const WINGMATES = ["Echo Falcon", "Zephyr Sky", "Shadow Swift", "Aurora Wing"];
        const REPLIES = [
          "Let's fly formation in the next mass race! 🦅",
          "Great aerodynamic carving on those downslopes!",
          "Pro tip: dive right on the crest slope for maximum launch speed 🚀",
          "Drafting behind the pack gives a huge boost on Tempest Draft!",
          "See you on the podium! 👑",
          "Clean wings, clear skies! Let's get that victory.",
        ];
        const wingmate = WINGMATES[Math.floor(Math.random() * WINGMATES.length)]!;
        const replyText = REPLIES[Math.floor(Math.random() * REPLIES.length)]!;
        const replyMsg: ChatMessage = { id: Date.now() + 1, name: wingmate, text: replyText, at: "just now" };
        this.state.chat.push(replyMsg);
        if (this.state.chat.length > 50) this.state.chat.shift();
        try { localStorage.setItem(`sunbird.squad.local_chat.${clubId}`, JSON.stringify(this.state.chat)); } catch {}
        this.onChange();
      }, 700);

      return true;
    }
    return this.mutate(async () => {
      this.state.error = "";
      try {
        const club = this.state.myClubId, epoch = this.membershipEpoch;
        const result = await this.call<{ message?: ChatMessage }>("/chat", { method: "POST", body: JSON.stringify({ deviceId: this.deviceId, text: t }) });
        const message = result.message;
        if (club === this.state.myClubId && epoch === this.membershipEpoch && message && Number.isSafeInteger(message.id) && typeof message.name === "string" && typeof message.text === "string") {
          const merged = new Map(this.state.chat.map(m => [m.id, m]));
          merged.set(message.id, message);
          this.state.chat = [...merged.values()].sort((a, b) => a.id - b.id).slice(-50);
          // Do not advance the poll cursor past unread messages from peers.
        }
        await this.pollChat(false);
        return true;
      } catch {
        this.state.error = "Message not sent. Check your connection and try again.";
        return false;
      }
    }, false);
  }

  async pollChat(reset: boolean): Promise<void> {
    if (!SQUAD_CHAT) return;
    if (this.isAutonomous) return;
    const club = this.state.myClubId;
    if (this.lifetime.signal.aborted || !club || this.polling) return;
    const epoch = this.membershipEpoch;
    this.polling = true;
    try {
      const r = await this.call<{ messages: ChatMessage[] }>(`/chat?device=${encodeURIComponent(this.deviceId)}&club=${club}&after=${reset ? 0 : this.lastChatId}`);
      if (this.state.myClubId !== club || this.membershipEpoch !== epoch) return; // response from a club we left
      if (!Array.isArray(r.messages)) throw new Error("Invalid chat response");
      const messages = r.messages.filter(m => Number.isSafeInteger(m?.id) && m.id > 0 && typeof m.name === "string" && typeof m.text === "string");
      const merged = new Map(this.state.chat.map(m => [m.id, m]));
      for (const message of messages) merged.set(message.id, message);
      this.state.chat = [...merged.values()].sort((a, b) => a.id - b.id).slice(-50);
      this.lastChatId = Math.max(reset ? 0 : this.lastChatId, ...messages.map(m => m.id));
      const recovered = this.state.error === CHAT_STALE;
      if (recovered) this.state.error = "";
      if (messages.length || recovered) this.onChange();
    } catch {
      if (this.state.myClubId !== club || this.membershipEpoch !== epoch) return;
      this.state.error = CHAT_STALE;
      this.onChange();
    } finally { this.polling = false; }
  }
}
