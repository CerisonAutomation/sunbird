/**
 * Multiplayer Race Preview System
 * 
 * Creates exciting previews of multiplayer races for:
 * - Promotional content
 * - Social media sharing
 * - In-game highlights
 * - Community engagement
 */

export type RacePreview = {
  id: string;
  timestamp: number;
  players: PlayerHighlight[];
  winner: string;
  distance: number;
  duration: number;
  biome: string;
  highlights: string[];
};

export type PlayerHighlight = {
  name: string;
  color: number;
  rank: number;
  distance: number;
  bestMoment: string;
  skin: string;
};

export type PreviewFrame = {
  time: number;
  positions: { x: number; y: number; name: string; color: number }[];
  event?: string;
};

export class MultiplayerPreview {
  private previews: RacePreview[] = [];
  private maxPreviews = 10;

  /** Create a new race preview from completed race */
  createPreview(race: {
    players: { name: string; color: number; distance: number; skin: string }[];
    winner: string;
    distance: number;
    duration: number;
    biome: string;
  }): RacePreview {
    const highlights = this.generateHighlights(race);
    
    const preview: RacePreview = {
      id: `race-${Date.now()}`,
      timestamp: Date.now(),
      players: race.players.map((p, i) => ({
        ...p,
        rank: i + 1,
        bestMoment: highlights[i] || 'Great flight!',
      })),
      winner: race.winner,
      distance: race.distance,
      duration: race.duration,
      biome: race.biome,
      highlights,
    };

    this.previews.unshift(preview);
    if (this.previews.length > this.maxPreviews) {
      this.previews.pop();
    }

    return preview;
  }

  /** Generate exciting highlights for each player */
  private generateHighlights(race: { players: { name: string; distance: number }[] }): string[] {
    const highlights: string[] = [];
    const maxDist = Math.max(...race.players.map(p => p.distance));

    for (const player of race.players) {
      if (player.distance === maxDist) {
        highlights.push('Flew the farthest!');
      } else if (player.distance > maxDist * 0.9) {
        highlights.push('Almost caught the leader!');
      } else if (player.distance > maxDist * 0.7) {
        highlights.push('Strong finish!');
      } else {
        highlights.push('Good effort!');
      }
    }

    return highlights;
  }

  /** Get all previews */
  getPreviews(): RacePreview[] {
    return [...this.previews];
  }

  /** Get latest preview */
  getLatestPreview(): RacePreview | null {
    return this.previews[0] || null;
  }

  /** Generate promotional text for a preview */
  generatePromoText(preview: RacePreview): string {
    const winner = preview.players.find(p => p.rank === 1);
    const runnerUp = preview.players.find(p => p.rank === 2);
    
    let text = `🏆 Epic Race on ${preview.biome}!\n`;
    text += `🥇 ${winner?.name} flew ${Math.round(preview.distance)}m!\n`;
    
    if (runnerUp) {
      text += `🥈 ${runnerUp.name} was close behind!\n`;
    }
    
    text += `⚡ ${preview.players.length} players competed!\n`;
    text += `🎯 Can you beat ${Math.round(preview.distance)}m?\n`;
    text += `#Sunbird #Multiplayer #Gaming`;

    return text;
  }

  /** Generate shareable image data URL */
  async generatePreviewImage(preview: RacePreview): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d')!;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 630);
    gradient.addColorStop(0, '#1a1430');
    gradient.addColorStop(0.5, '#2d1b4e');
    gradient.addColorStop(1, '#4a2c6e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 630);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 48px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 EPIC RACE 🏆', 600, 80);

    // Biome
    ctx.fillStyle = '#fff';
    ctx.font = '28px Fredoka, sans-serif';
    ctx.fillText(preview.biome, 600, 130);

    // Players
    const startY = 180;
    for (let i = 0; i < Math.min(5, preview.players.length); i++) {
      const player = preview.players[i]!;
      const y = startY + i * 80;
      
      // Rank badge
      const badgeColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#90ee90', '#87ceeb'];
      ctx.fillStyle = badgeColors[i] || '#90ee90';
      ctx.beginPath();
      ctx.arc(100, y + 20, 25, 0, Math.PI * 2);
      ctx.fill();
      
      // Rank number
      ctx.fillStyle = '#000';
      ctx.font = 'bold 24px Fredoka, sans-serif';
      ctx.fillText(`#${i + 1}`, 100, y + 28);
      
      // Player name
      ctx.fillStyle = '#fff';
      ctx.font = '28px Fredoka, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(player.name, 150, y + 28);
      
      // Distance
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(player.distance)}m`, 1100, y + 28);
      
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '18px Fredoka, sans-serif';
      ctx.fillText(player.bestMoment, 150, y + 55);
    }

    // Call to action
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Can you beat this score?', 600, 580);

    return canvas.toDataURL('image/png');
  }

  /** Clean up old previews */
  cleanup(): void {
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.previews = this.previews.filter(p => p.timestamp > oneMonthAgo);
  }
}

export default MultiplayerPreview;
