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
  error: string;
  registered: boolean;
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
    error: "",
    registered: false,
    myCode: "",
    friends: [],
    clubs: [],
    myClubId: null,
    chat: [],
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export class SquadClient {
  readonly state = emptySquadState();
  private lastChatId = 0;
  private onChange: () => void = () => undefined;

  constructor(
    private readonly deviceId: string,
    private readonly nameOf: () => string,
  ) {}

  get live(): boolean {
    return this.state.live;
  }

  setOnChange(fn: () => void): void {
    this.onChange = fn;
  }

  /** Register + load profile & clubs. Called when the Squad screen opens. */
  async refresh(): Promise<void> {
    if (!this.state.live || this.state.loading) return;
    this.state.loading = true;
    this.state.error = "";
    this.onChange();
    try {
      const reg = await call<{ code: string }>("/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: this.deviceId, name: this.nameOf() }),
      });
      this.state.registered = true;
      this.state.myCode = reg.code;
      const [profile, clubs] = await Promise.all([
        call<{ friends: Friend[]; clubId: number | null }>(`/profile?device=${encodeURIComponent(this.deviceId)}`),
        call<{ clubs: Club[]; mine: number | null }>(`/clubs?device=${encodeURIComponent(this.deviceId)}`),
      ]);
      this.state.friends = Array.isArray(profile.friends) ? profile.friends : [];
      this.state.myClubId = profile.clubId;
      this.state.clubs = Array.isArray(clubs.clubs) ? clubs.clubs : [];
      if (this.state.myClubId) await this.pollChat(true);
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : "Social server unreachable";
    } finally {
      this.state.loading = false;
      this.onChange();
    }
  }

  async addFriend(code: string): Promise<string> {
    try {
      const r = await call<{ friend: Friend }>("/friends/add", {
        method: "POST",
        body: JSON.stringify({ deviceId: this.deviceId, code }),
      });
      await this.refresh();
      return `${r.friend.name} added!`;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not add friend";
    }
  }

  async removeFriend(code: string): Promise<void> {
    try {
      await call("/friends/remove", { method: "POST", body: JSON.stringify({ deviceId: this.deviceId, code }) });
    } catch {
      /* tolerated */
    }
    await this.refresh();
  }

  async createClub(name: string, motto: string): Promise<string> {
    try {
      await call("/clubs/create", {
        method: "POST",
        body: JSON.stringify({ deviceId: this.deviceId, name, motto, playerName: this.nameOf() }),
      });
      await this.refresh();
      return "Club founded!";
    } catch (err) {
      return err instanceof Error ? err.message : "Could not create club";
    }
  }

  async joinClub(clubId: number): Promise<string> {
    try {
      await call("/clubs/join", {
        method: "POST",
        body: JSON.stringify({ deviceId: this.deviceId, clubId, playerName: this.nameOf() }),
      });
      await this.refresh();
      return "Joined!";
    } catch (err) {
      return err instanceof Error ? err.message : "Could not join";
    }
  }

  async leaveClub(): Promise<void> {
    try {
      await call("/clubs/leave", { method: "POST", body: JSON.stringify({ deviceId: this.deviceId }) });
    } catch {
      /* tolerated */
    }
    this.state.chat = [];
    this.lastChatId = 0;
    await this.refresh();
  }

  async sendChat(text: string): Promise<void> {
    const t = text.trim();
    if (!t) return;
    try {
      await call("/chat", { method: "POST", body: JSON.stringify({ deviceId: this.deviceId, text: t }) });
      await this.pollChat(false);
    } catch {
      /* tolerated */
    }
  }

  async pollChat(reset: boolean): Promise<void> {
    if (!this.state.myClubId) return;
    if (reset) {
      this.state.chat = [];
      this.lastChatId = 0;
    }
    try {
      const r = await call<{ messages: ChatMessage[] }>(`/chat?club=${this.state.myClubId}&after=${this.lastChatId}`);
      if (r.messages.length) {
        this.state.chat = [...this.state.chat, ...r.messages].slice(-50);
        this.lastChatId = r.messages[r.messages.length - 1]!.id;
        this.onChange();
      }
    } catch {
      /* tolerated */
    }
  }
}
