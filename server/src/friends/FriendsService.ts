/**
 * FriendsService — friend request lifecycle, blocking, invite permissions.
 *
 * There is NO unrestricted player search: the only way to address another
 * player is their exact player code (`SUN-XXXXXX`) or an invite link.
 * Every read path routes through `IdentityService.publicView`, so privacy
 * (presence, name masking) and suspension are enforced uniformly.
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError } from "../util/http.js";
import { randomId } from "../util/id.js";
import { friendshipKey } from "../store/db.js";
import type { FriendRequest, FriendView, InvitePermission } from "../types.js";

const REQUEST_TTL_MS = 14 * 86_400_000;
const MAX_PENDING_INCOMING = 50;

export class FriendsService {
  constructor(private ctx: Ctx) {}

  /* ------------------------------------------------------------- requests */

  sendRequest(fromId: string, playerCode: string): FriendRequest {
    if (this.ctx.identity.isSuspended(fromId)) throw new HttpError(403, "account suspended", "suspended");
    const target = this.ctx.identity.byCode(playerCode);
    if (!target) throw new HttpError(404, "player code not found", "playerNotFound");
    if (target.playerId === fromId) throw new HttpError(400, "cannot friend yourself", "self");
    const targetProfile = this.ctx.db.state.profiles[target.playerId]!;
    if (targetProfile.moderation.status === "suspended") throw new HttpError(403, "player unavailable", "suspended");
    if (this.ctx.identity.isBlocked(fromId, target.playerId)) throw new HttpError(403, "you blocked this player", "blocked");
    if (this.ctx.identity.isBlocked(target.playerId, fromId)) throw new HttpError(403, "not available", "rejected");
    if (!targetProfile.privacy.allowFriendRequests) throw new HttpError(403, "player does not accept friend requests", "privacy");
    if (this.areFriends(fromId, target.playerId)) throw new HttpError(409, "already friends", "alreadyFriends");
    if (this.pendingBetween(fromId, target.playerId)) throw new HttpError(409, "a request is already pending", "duplicateRequest");
    const incoming = this.listPending(target.playerId).filter((r) => r.status === "pending");
    if (incoming.length >= MAX_PENDING_INCOMING) throw new HttpError(429, "that pilot's inbox is full", "inboxFull");

    const req: FriendRequest = {
      id: randomId("fr"),
      fromId,
      toId: target.playerId,
      createdAt: new Date(this.ctx.now()).toISOString(),
      status: "pending",
    };
    this.ctx.db.state.friendRequests[req.id] = req;
    this.ctx.db.touch();
    this.ctx.audit.log(fromId, "friends.request_sent", target.playerCode);
    return req;
  }

  listPending(playerId: string): FriendRequest[] {
    const all = Object.values(this.ctx.db.state.friendRequests).filter(
      (r) => r.toId === playerId && r.status === "pending",
    );
    // Expire stale requests lazily.
    let dirty = false;
    for (const r of all) {
      if (this.ctx.now() - Date.parse(r.createdAt) > REQUEST_TTL_MS) {
        r.status = "expired";
        r.resolvedAt = new Date(this.ctx.now()).toISOString();
        dirty = true;
      }
    }
    if (dirty) this.ctx.db.touch();
    return all
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => ({ ...r }));
  }

  listOutgoing(playerId: string): FriendRequest[] {
    return Object.values(this.ctx.db.state.friendRequests)
      .filter((r) => r.fromId === playerId && r.status === "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r }));
  }

  /** The requester must own the request. */
  cancelRequest(playerId: string, requestId: string): FriendRequest {
    const req = this.requireRequest(requestId);
    if (req.fromId !== playerId || req.status !== "pending") {
      throw new HttpError(409, "request is not cancellable", "notPending");
    }
    req.status = "canceled";
    req.resolvedAt = new Date(this.ctx.now()).toISOString();
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "friends.request_canceled", req.toId);
    return req;
  }

  /** The recipient must own the request. */
  respond(playerId: string, requestId: string, accept: boolean): { status: string } {
    const req = this.requireRequest(requestId);
    if (req.toId !== playerId || req.status !== "pending") {
      throw new HttpError(409, "request is not answerable", "notPending");
    }
    if (accept) {
      if (this.ctx.identity.isBlocked(playerId, req.fromId) || this.ctx.identity.isBlocked(req.fromId, playerId)) {
        req.status = "declined";
        req.resolvedAt = new Date(this.ctx.now()).toISOString();
        this.ctx.db.touch();
        throw new HttpError(403, "cannot accept — blocked", "blocked");
      }
      const fromProfile = this.ctx.db.state.profiles[req.fromId];
      if (!fromProfile || fromProfile.moderation.status === "suspended") {
        req.status = "expired";
        req.resolvedAt = new Date(this.ctx.now()).toISOString();
        this.ctx.db.touch();
        throw new HttpError(403, "sender no longer available", "senderUnavailable");
      }
      req.status = "accepted";
      req.resolvedAt = new Date(this.ctx.now()).toISOString();
      this.ctx.db.state.friendships[friendshipKey(req.fromId, playerId)] = req.resolvedAt;
    } else {
      req.status = "declined";
      req.resolvedAt = new Date(this.ctx.now()).toISOString();
    }
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, accept ? "friends.request_accepted" : "friends.request_declined", req.fromId);
    return { status: req.status };
  }

  /* -------------------------------------------------------------- friends */

  areFriends(a: string, b: string): boolean {
    return Boolean(this.ctx.db.state.friendships[friendshipKey(a, b)]);
  }

  friendIds(playerId: string): string[] {
    const out: string[] = [];
    for (const [key] of Object.entries(this.ctx.db.state.friendships)) {
      const [a, b] = key.split("|") as [string, string];
      if (a === playerId) out.push(b);
      else if (b === playerId) out.push(a);
    }
    return out;
  }

  /**
   * Friend list with privacy-filtered profiles. Suspended friends appear
   * masked; presence is only shown when the friend allows it.
   */
  listFriends(playerId: string): FriendView[] {
    const friends = this.friendIds(playerId);
    const views: FriendView[] = [];
    for (const id of friends) {
      const profile = this.ctx.db.state.profiles[id];
      if (!profile) continue;
      const pub = this.ctx.identity.publicView(id, playerId);
      const best = this.ctx.leaderboards.bestDistanceFor(id);
      views.push({
        ...pub,
        friendSince: this.ctx.db.state.friendships[friendshipKey(playerId, id)] ?? profile.createdAt,
        lastSeen: profile.lastSeenAt,
        bestDistance: best,
      });
    }
    return views.sort((a, b) => b.bestDistance - a.bestDistance || a.playerCode.localeCompare(b.playerCode));
  }

  removeFriend(playerId: string, otherId: string): void {
    if (!this.areFriends(playerId, otherId)) throw new HttpError(404, "not friends", "notFriends");
    delete this.ctx.db.state.friendships[friendshipKey(playerId, otherId)];
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "friends.removed", otherId);
  }

  block(playerId: string, playerCode: string): void {
    const target = this.ctx.identity.byCode(playerCode);
    if (!target) throw new HttpError(404, "player code not found", "playerNotFound");
    if (target.playerId === playerId) throw new HttpError(400, "cannot block yourself", "self");
    this.ctx.identity.block(playerId, target.playerId);
  }

  unblock(playerId: string, otherId: string): void {
    if (!this.ctx.identity.isBlocked(playerId, otherId)) throw new HttpError(404, "not blocked", "notBlocked");
    this.ctx.identity.unblock(playerId, otherId);
  }

  /* ----------------------------------------------------------- invites */

  /**
   * Invite permission: can `inviterId` invite `inviteeId` to a room/event?
   * Rules: invitee hasn't disabled invites, nobody blocked the other,
   * invitee isn't suspended. Friendship is NOT required — a shared invite
   * link is a consent surface in itself.
   */
  canInvite(inviterId: string, inviteeId: string): InvitePermission {
    if (inviterId === inviteeId) return { canInvite: false, reason: "self" };
    const profile = this.ctx.db.state.profiles[inviteeId];
    if (!profile) return { canInvite: false, reason: "unknown" };
    if (profile.moderation.status === "suspended") return { canInvite: false, reason: "suspended" };
    if (this.ctx.identity.isBlocked(inviterId, inviteeId)) return { canInvite: false, reason: "blocked" };
    if (this.ctx.identity.isBlocked(inviteeId, inviterId)) return { canInvite: false, reason: "blocked" };
    if (!profile.privacy.allowInvites) return { canInvite: false, reason: "privacy" };
    return { canInvite: true, reason: "ok" };
  }

  /* -------------------------------------------------------------- helpers */

  private requireRequest(requestId: string): FriendRequest {
    const req = this.ctx.db.state.friendRequests[requestId];
    if (!req) throw new HttpError(404, "request not found", "notFound");
    return req;
  }

  private pendingBetween(a: string, b: string): boolean {
    return Object.values(this.ctx.db.state.friendRequests).some(
      (r) => r.status === "pending" && ((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)),
    );
  }
}
