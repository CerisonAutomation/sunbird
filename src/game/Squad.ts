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

const API = (import.meta.env.VITE_SOCIAL_URL ?? (import.meta.env.DEV ? "/social" : "")).replace(/\/$/, "");

export type Friend = { name: string; code: string; club_id: number | null };
export type Club = { id: number; name: string; motto: string; members: number };
export type ChatMessage = { id: number; name: string; text: string; at: string };

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
};

export function emptySquadState(): SquadState {
  return {
    live: Boolean(API),
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
    return this.mutate(async () => {
      const t = text.trim();
      if (!t) return false;
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
