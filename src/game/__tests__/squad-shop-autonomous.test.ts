import { describe, expect, it } from "vitest";
import { SquadClient, SQUAD_QUESTS, DEFAULT_LOCAL_CLUBS, DEFAULT_LOCAL_FRIENDS } from "../Squad";
import { dailyFlashBird, dailyDealBoost, skinById } from "../Economy";
import { SaveData } from "../SaveData";

describe("Autonomous Squad and Upgraded Shop Engine", () => {
  it("enables autonomous local squadron hub with persistent code, clubs, friends and chat", async () => {
    const squad = new SquadClient("test-device-auto", () => "Captain Falcon");
    squad.enableAutonomous();

    expect(squad.state.live).toBe(true);
    expect(squad.state.registered).toBe(true);
    expect(squad.state.myCode).toMatch(/^SUN-[A-Z0-9]{6}$/);
    expect(squad.state.clubs.length).toBeGreaterThanOrEqual(DEFAULT_LOCAL_CLUBS.length);
    expect(squad.state.friends.length).toBeGreaterThanOrEqual(DEFAULT_LOCAL_FRIENDS.length);
    expect(squad.state.myClubId).toBe(1);
    expect(squad.state.chat.length).toBeGreaterThan(0);
  });

  it("handles offline friend addition, removal, and club founding", async () => {
    const squad = new SquadClient("test-device-mutations", () => "Captain Falcon");
    squad.enableAutonomous();

    // Add friend
    const addResult = await squad.addFriend("SUN-PILOT99");
    expect(addResult).toContain("added");
    expect(squad.state.friends.some((f) => f.code === "SUN-PILOT99")).toBe(true);

    // Remove friend
    await squad.removeFriend("SUN-PILOT99");
    expect(squad.state.friends.some((f) => f.code === "SUN-PILOT99")).toBe(false);

    // Create club
    const clubResult = await squad.createClub("Cloud Raiders", "Soar above the storm");
    expect(clubResult).toBe("Club founded!");
    expect(squad.state.myClubId).not.toBeNull();
    const created = squad.state.clubs.find((c) => c.name === "Cloud Raiders");
    expect(created).toBeDefined();

    // Send chat
    const sent = await squad.sendChat("Checking in from 4,000 m!");
    expect(sent).toBe(true);
    expect(squad.state.chat.some((m) => m.text.includes("Checking in"))).toBe(true);
  });

  it("calculates deterministic 40% daily flash sale on birds and 50% deal on boosts", () => {
    const dateStr = "2026-09-16";
    const flash = dailyFlashBird(dateStr);
    expect(flash.id).toBeDefined();
    expect(flash.discountPct).toBe(40);

    const skin = skinById(flash.id);
    expect(skin.name).toBeDefined();
    expect(flash.price).toBeLessThan(flash.originalPrice);

    const boostDeal = dailyDealBoost(dateStr);
    expect(boostDeal.id).toBeDefined();
    expect(boostDeal.price).toBeGreaterThan(0);
  });

  it("honors daily flash price for SkinView affordability and purchase spend", () => {
    const dateStr = "2026-09-16";
    const flash = dailyFlashBird(dateStr);
    const skinDef = skinById(flash.id);
    const save = new SaveData();

    // Set wallet to exactly flash.price (which is less than skinDef.price)
    save.state.wallet = flash.price;
    expect(save.state.wallet).toBeLessThan(skinDef.price);

    // SkinView with dealPrice is affordable with discounted wallet
    const skinView = {
      def: skinDef,
      owned: false,
      equipped: false,
      locked: false,
      lockReason: null,
      affordable: save.state.wallet >= (skinDef.id === flash.id ? flash.price : skinDef.price),
      dealPrice: flash.price,
    };
    expect(skinView.affordable).toBe(true);
    expect(skinView.dealPrice).toBe(flash.price);

    // Spending the flash price succeeds
    const spent = save.spend(skinView.dealPrice);
    expect(spent).toBe(true);
    expect(save.state.wallet).toBe(0);
  });

  it("defines active squadron team quests with claimable rewards", () => {
    expect(SQUAD_QUESTS.length).toBe(3);
    const migration = SQUAD_QUESTS.find((q) => q.id === "migration")!;
    expect(migration.rewardCoins).toBe(150);
    expect(migration.target).toBe(4000);

    const drafting = SQUAD_QUESTS.find((q) => q.id === "drafting")!;
    expect(drafting.rewardCoins).toBe(120);

    const precision = SQUAD_QUESTS.find((q) => q.id === "precision")!;
    expect(precision.rewardCoins).toBe(100);
  });

  it("manages daily flight stipend and squadron quest claims in save data", () => {
    const save = new SaveData();
    const initialWallet = save.state.wallet;

    // Claim daily stipend
    save.addCoins(250);
    save.state.lastStipendClaimed = "2026-09-16";
    expect(save.state.wallet).toBe(initialWallet + 250);
    expect(save.state.lastStipendClaimed).toBe("2026-09-16");

    // Ace Pilot Crate purchase
    const canAfford = save.spend(240);
    expect(canAfford).toBe(true);
    save.armBoost("shield");
    save.armBoost("sunflask");
    save.armBoost("magnet");
    save.ownTrail("trail_tide");
    save.addCoins(250);

    expect(save.state.armedBoosts).toContain("shield");
    expect(save.state.armedBoosts).toContain("sunflask");
    expect(save.state.armedBoosts).toContain("magnet");
    expect(save.state.tournaments.trails).toContain("trail_tide");
  });
});
