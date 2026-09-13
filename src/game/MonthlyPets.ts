/**
 * Monthly Unique Special Pets System
 * 
 * Each month features a unique special pet that:
 * - Appears in the game as a companion
 - Can be won through leaderboard prizes
 * - Has special abilities or visual effects
 * - Creates FOMO and monthly engagement
 */

export type PetDef = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  ability?: string;
  visualEffect?: 'glow' | 'trail' | 'sparkle' | 'aura';
  color: number;
  month: string; // YYYY-MM format
};

export type PetView = PetDef & {
  owned: boolean;
  equipped: boolean;
  available: boolean; // Can still be won this month
};

// Monthly pet definitions - each month gets a unique pet
export const MONTHLY_PETS: PetDef[] = [
  {
    id: 'phoenix-september',
    name: 'Phoenix Chick',
    emoji: '🔥',
    description: 'A tiny firebird that rises from the ashes. +10% score in sunset biomes.',
    rarity: 'legendary',
    ability: 'Fire Trail',
    visualEffect: 'glow',
    color: 0xff4500,
    month: '2026-09',
  },
  {
    id: 'moon-bunny-october',
    name: 'Moon Bunny',
    emoji: '🐰',
    description: 'A celestial rabbit that hops between islands. +15% coin collection.',
    rarity: 'epic',
    ability: 'Lunar Jump',
    visualEffect: 'sparkle',
    color: 0xc0c0ff,
    month: '2026-10',
  },
  {
    id: 'frost-fox-november',
    name: 'Frost Fox',
    emoji: '🦊',
    description: 'An icy fox that freezes time briefly. Slows obstacles by 20%.',
    rarity: 'epic',
    ability: 'Ice Shield',
    visualEffect: 'aura',
    color: 0x87ceeb,
    month: '2026-11',
  },
  {
    id: 'star-whale-december',
    name: 'Star Whale',
    emoji: '🐋',
    description: 'A cosmic whale that rides the solar winds. +25% altitude bonus.',
    rarity: 'legendary',
    ability: 'Gravity Well',
    visualEffect: 'trail',
    color: 0x4169e1,
    month: '2026-12',
  },
  {
    id: 'bloom-deer-january',
    name: 'Bloom Deer',
    emoji: '🦌',
    description: 'A spring deer that brings new life. Flowers bloom in your wake.',
    rarity: 'rare',
    ability: 'Nature\'s Blessing',
    visualEffect: 'sparkle',
    color: 0x90ee90,
    month: '2027-01',
  },
  {
    id: 'storm-hawk-february',
    name: 'Storm Hawk',
    emoji: '🦅',
    description: 'A thunderous raptor that commands the winds. +10% speed boost.',
    rarity: 'epic',
    ability: 'Wind Rider',
    visualEffect: 'trail',
    color: 0x9370db,
    month: '2027-02',
  },
  {
    id: 'crystal-owl-march',
    name: 'Crystal Owl',
    emoji: '🦉',
    description: 'A wise owl made of living crystal. Reveals hidden paths.',
    rarity: 'rare',
    ability: 'True Sight',
    visualEffect: 'glow',
    color: 0x00ced1,
    month: '2027-03',
  },
  {
    id: 'golden-koi-april',
    name: 'Golden Koi',
    emoji: '🐟',
    description: 'A lucky fish that swims through air. +20% coin value.',
    rarity: 'epic',
    ability: 'Fortune Flow',
    visualEffect: 'sparkle',
    color: 0xffd700,
    month: '2027-04',
  },
];

// Leaderboard prize tiers
export const PRIZE_TIERS = [
  { rank: 1, prize: 'legendary', coins: 500, title: 'Champion' },
  { rank: 2, prize: 'epic', coins: 300, title: 'Runner-up' },
  { rank: 3, prize: 'epic', coins: 200, title: 'Third Place' },
  { rank: 10, prize: 'rare', coins: 100, title: 'Top 10' },
  { rank: 50, prize: 'common', coins: 50, title: 'Top 50' },
  { rank: 100, prize: 'common', coins: 25, title: 'Top 100' },
];

export class MonthlyPets {
  private currentMonth: string;
  private currentPet: PetDef | null;

  constructor() {
    this.currentMonth = this.getCurrentMonth();
    this.currentPet = this.getPetForMonth(this.currentMonth);
  }

  /** Get current month in YYYY-MM format */
  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Get pet definition for a specific month */
  getPetForMonth(month: string): PetDef | null {
    return MONTHLY_PETS.find(p => p.month === month) || null;
  }

  /** Get current month's pet */
  getCurrentPet(): PetDef | null {
    return this.currentPet;
  }

  /** Get time until next month */
  getTimeUntilReset(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diff = nextMonth.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  }

  /** Check if player qualifies for pet based on leaderboard rank */
  getQualifyingPrize(rank: number): { pet: PetDef; coins: number; title: string } | null {
    if (!this.currentPet) return null;

    for (const tier of PRIZE_TIERS) {
      if (rank <= tier.rank) {
        return {
          pet: this.currentPet,
          coins: tier.coins,
          title: tier.title,
        };
      }
    }
    return null;
  }

  /** Get all available pets (for collection view) */
  getAllPets(): PetDef[] {
    return [...MONTHLY_PETS];
  }

  /** Get pet by ID */
  getPetById(id: string): PetDef | null {
    return MONTHLY_PETS.find(p => p.id === id) || null;
  }

  /** Get rarity color */
  getRarityColor(rarity: string): string {
    switch (rarity) {
      case 'legendary': return '#ffd700';
      case 'epic': return '#9370db';
      case 'rare': return '#87ceeb';
      default: return '#90ee90';
    }
  }

  /** Get rarity name */
  getRarityName(rarity: string): string {
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  }
}

export default MonthlyPets;
