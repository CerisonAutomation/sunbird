/**
 * Pet Companion System
 * 
 * Pets fly alongside the bird as companions:
 * - Each pet has unique flight patterns
 * - Pets react to gameplay events
 * - Legendary pets are tournament exclusives
 * - Pets provide small bonuses
 */

import * as THREE from "three";
import { lerp } from "./math";

export type PetType = 
  | 'phoenix' | 'bunny' | 'fox' | 'whale' 
  | 'deer' | 'hawk' | 'owl' | 'koi'
  | 'dragon' | 'fairy' | 'ghost' | 'star';

export type PetRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'tournament';

export type PetConfig = {
  id: string;
  name: string;
  emoji: string;
  type: PetType;
  rarity: PetRarity;
  color: number;
  secondaryColor: number;
  scale: number;
  speed: number; // Flight speed relative to bird
  pattern: 'follow' | 'circle' | 'weave' | 'hover' | 'hop' | 'soar' | 'swim' | 'graceful' | 'dive' | 'glide' | 'agile' | 'sparkle' | 'victory' | 'phase';
  bonus: {
    type: 'coins' | 'score' | 'speed' | 'altitude';
    amount: number;
  };
  description: string;
  tournament?: string; // Tournament name if legendary
};

// All available pets
export const PET_CONFIGS: PetConfig[] = [
  // Common pets (available in shop)
  {
    id: 'baby-phoenix',
    name: 'Baby Phoenix',
    emoji: '🐣',
    type: 'phoenix',
    rarity: 'common',
    color: 0xff6b35,
    secondaryColor: 0xffd93d,
    scale: 0.4,
    speed: 1.1,
    pattern: 'follow',
    bonus: { type: 'coins', amount: 5 },
    description: 'A tiny firebird learning to fly.',
  },
  {
    id: 'cloud-bunny',
    name: 'Cloud Bunny',
    emoji: '🐰',
    type: 'bunny',
    rarity: 'common',
    color: 0xffffff,
    secondaryColor: 0xffb6c1,
    scale: 0.35,
    speed: 1.0,
    pattern: 'hop',
    bonus: { type: 'altitude', amount: 10 },
    description: 'Hops on clouds for extra height.',
  },
  {
    id: 'forest-fox',
    name: 'Forest Fox',
    emoji: '🦊',
    type: 'fox',
    rarity: 'common',
    color: 0xff8c00,
    secondaryColor: 0xffffff,
    scale: 0.38,
    speed: 1.15,
    pattern: 'weave',
    bonus: { type: 'speed', amount: 3 },
    description: 'Quick and agile forest companion.',
  },

  // Rare pets (earned through achievements)
  {
    id: 'moon-rabbit',
    name: 'Moon Rabbit',
    emoji: '🐇',
    type: 'bunny',
    rarity: 'rare',
    color: 0xc0c0ff,
    secondaryColor: 0xe6e6fa,
    scale: 0.42,
    speed: 1.05,
    pattern: 'circle',
    bonus: { type: 'score', amount: 10 },
    description: 'Glows with lunar energy.',
  },
  {
    id: 'storm-hawk',
    name: 'Storm Hawk',
    emoji: '🦅',
    type: 'hawk',
    rarity: 'rare',
    color: 0x4169e1,
    secondaryColor: 0x87ceeb,
    scale: 0.45,
    speed: 1.2,
    pattern: 'soar',
    bonus: { type: 'speed', amount: 5 },
    description: 'Rides the wind currents.',
  },
  {
    id: 'crystal-owl',
    name: 'Crystal Owl',
    emoji: '🦉',
    type: 'owl',
    rarity: 'rare',
    color: 0x00ced1,
    secondaryColor: 0x40e0d0,
    scale: 0.4,
    speed: 0.9,
    pattern: 'hover',
    bonus: { type: 'coins', amount: 8 },
    description: 'Wise and observant companion.',
  },

  // Epic pets (earned through challenges)
  {
    id: 'golden-koi',
    name: 'Golden Koi',
    emoji: '🐟',
    type: 'koi',
    rarity: 'epic',
    color: 0xffd700,
    secondaryColor: 0xffa500,
    scale: 0.5,
    speed: 1.0,
    pattern: 'swim',
    bonus: { type: 'coins', amount: 15 },
    description: 'Swims through the air gracefully.',
  },
  {
    id: 'frost-fox',
    name: 'Frost Fox',
    emoji: '🦊',
    type: 'fox',
    rarity: 'epic',
    color: 0x87ceeb,
    secondaryColor: 0xb0e0e6,
    scale: 0.45,
    speed: 1.1,
    pattern: 'weave',
    bonus: { type: 'score', amount: 20 },
    description: 'Freezes obstacles briefly.',
  },
  {
    id: 'bloom-deer',
    name: 'Bloom Deer',
    emoji: '🦌',
    type: 'deer',
    rarity: 'epic',
    color: 0x90ee90,
    secondaryColor: 0x98fb98,
    scale: 0.55,
    speed: 0.95,
    pattern: 'graceful',
    bonus: { type: 'altitude', amount: 20 },
    description: 'Flowers bloom in your wake.',
  },

  // Legendary pets (tournament exclusives)
  {
    id: 'fire-phoenix',
    name: 'Fire Phoenix',
    emoji: '🔥',
    type: 'phoenix',
    rarity: 'legendary',
    color: 0xff4500,
    secondaryColor: 0xff6347,
    scale: 0.6,
    speed: 1.3,
    pattern: 'dive',
    bonus: { type: 'score', amount: 30 },
    description: 'Rises from the ashes with power.',
    tournament: 'Phoenix Rising Championship',
  },
  {
    id: 'cosmic-whale',
    name: 'Cosmic Whale',
    emoji: '🐋',
    type: 'whale',
    rarity: 'legendary',
    color: 0x4169e1,
    secondaryColor: 0x1e90ff,
    scale: 0.7,
    speed: 0.8,
    pattern: 'glide',
    bonus: { type: 'altitude', amount: 40 },
    description: 'Rides the solar winds.',
    tournament: 'Starlight Marathon',
  },
  {
    id: 'shadow-dragon',
    name: 'Shadow Dragon',
    emoji: '🐉',
    type: 'dragon',
    rarity: 'legendary',
    color: 0x2f1b4e,
    secondaryColor: 0x9370db,
    scale: 0.65,
    speed: 1.4,
    pattern: 'agile',
    bonus: { type: 'speed', amount: 10 },
    description: 'Commands the shadows.',
    tournament: 'Dragon\'s Peak Challenge',
  },
  {
    id: 'star-fairy',
    name: 'Star Fairy',
    emoji: '🧚',
    type: 'fairy',
    rarity: 'legendary',
    color: 0xffd700,
    secondaryColor: 0xffffff,
    scale: 0.35,
    speed: 1.2,
    pattern: 'sparkle',
    bonus: { type: 'coins', amount: 25 },
    description: 'Leaves a trail of stardust.',
    tournament: 'Fairy Dust Festival',
  },

  // Tournament exclusive pets
  {
    id: 'champion-griffin',
    name: 'Champion Griffin',
    emoji: '🦁',
    type: 'hawk',
    rarity: 'tournament',
    color: 0xffd700,
    secondaryColor: 0xdaa520,
    scale: 0.6,
    speed: 1.35,
    pattern: 'victory',
    bonus: { type: 'score', amount: 50 },
    description: 'Awarded to tournament champions.',
    tournament: 'Grand Championship',
  },
  {
    id: 'eternal-ghost',
    name: 'Eternal Ghost',
    emoji: '👻',
    type: 'ghost',
    rarity: 'tournament',
    color: 0xe6e6fa,
    secondaryColor: 0xffffff,
    scale: 0.5,
    speed: 1.1,
    pattern: 'phase',
    bonus: { type: 'score', amount: 40 },
    description: 'Haunts the leaderboard forever.',
    tournament: 'Ghost Runner Invitational',
  },
];

export class PetCompanion {
  private pet: PetConfig | null = null;
  private mesh: THREE.Group | null = null;
  private bodyMesh: THREE.Mesh | null = null;
  private wingL: THREE.Mesh | null = null;
  private wingR: THREE.Mesh | null = null;
  private trail: THREE.Points | null = null;
  private time = 0;
  private flapTime = 0;

  constructor() {
    this.createMesh();
  }

  /** Create the pet mesh */
  private createMesh(): void {
    this.mesh = new THREE.Group();

    // Body
    const bodyGeo = new THREE.SphereGeometry(0.3, 12, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.scale.set(1, 0.8, 1.2);
    this.mesh.add(this.bodyMesh);

    // Wings
    const wingGeo = new THREE.PlaneGeometry(0.4, 0.2);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.2,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    
    this.wingL = new THREE.Mesh(wingGeo, wingMat);
    this.wingL.position.set(0, 0.1, 0.25);
    this.wingL.rotation.x = 0.3;
    this.mesh.add(this.wingL);

    this.wingR = new THREE.Mesh(wingGeo, wingMat.clone());
    this.wingR.position.set(0, 0.1, -0.25);
    this.wingR.rotation.x = -0.3;
    this.mesh.add(this.wingR);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.2, 0.1, 0.15);
    this.mesh.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.2, 0.1, -0.15);
    this.mesh.add(eyeR);

    // Eye highlights
    const hlGeo = new THREE.SphereGeometry(0.025, 6, 4);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hlL = new THREE.Mesh(hlGeo, hlMat);
    hlL.position.set(0.24, 0.13, 0.17);
    this.mesh.add(hlL);
    const hlR = new THREE.Mesh(hlGeo, hlMat);
    hlR.position.set(0.24, 0.13, -0.13);
    this.mesh.add(hlR);

    // Trail particles
    const trailGeo = new THREE.BufferGeometry();
    const trailCount = 20;
    const trailPositions = new Float32Array(trailCount * 3);
    const trailColors = new Float32Array(trailCount * 4);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 4));
    
    const trailMat = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    this.trail = new THREE.Points(trailGeo, trailMat);
    this.mesh.add(this.trail);
  }

  /** Set the pet type */
  setPet(config: PetConfig): void {
    this.pet = config;
    
    if (this.bodyMesh && this.wingL && this.wingR) {
      // Update colors
      (this.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(config.color);
      (this.wingL.material as THREE.MeshStandardMaterial).color.setHex(config.secondaryColor);
      (this.wingR.material as THREE.MeshStandardMaterial).color.setHex(config.secondaryColor);
      
      // Update scale
      this.mesh?.scale.setScalar(config.scale);
    }
  }

  /** Add to scene */
  addTo(scene: THREE.Scene): void {
    if (this.mesh) scene.add(this.mesh);
  }

  /** Remove from scene */
  removeFromScene(scene: THREE.Scene): void {
    if (this.mesh) scene.remove(this.mesh);
  }

  /** Update pet position and animation */
  update(dt: number, birdX: number, birdY: number, birdSpeed: number, birdRotation: number): void {
    if (!this.pet || !this.mesh) return;
    
    this.time += dt;
    this.flapTime += dt * (8 + birdSpeed * 0.1);

    // Calculate offset based on pattern
    const patternOffset = this.getPatternOffset();
    
    // Target position (behind and to the side of bird)
    const targetX = birdX - 2 + patternOffset.x;
    const targetY = birdY + 1.5 + patternOffset.y;
    const targetZ = patternOffset.z;

    // Smooth follow
    this.mesh.position.x = lerp(this.mesh.position.x, targetX, 0.05);
    this.mesh.position.y = lerp(this.mesh.position.y, targetY, 0.08);
    this.mesh.position.z = lerp(this.mesh.position.z, targetZ, 0.06);

    // Face direction of travel
    this.mesh.rotation.y = lerp(this.mesh.rotation.y, -birdRotation * 0.5, 0.1);

    // Wing flapping
    const flapAmount = Math.sin(this.flapTime) * 0.4;
    if (this.wingL) this.wingL.rotation.z = 0.3 + flapAmount;
    if (this.wingR) this.wingR.rotation.z = -0.3 - flapAmount;

    // Body bob
    if (this.bodyMesh) {
      this.bodyMesh.position.y = Math.sin(this.time * 3) * 0.05;
    }

    // Update trail
    this.updateTrail();
  }

  /** Get pattern-specific offset */
  private getPatternOffset(): { x: number; y: number; z: number } {
    const t = this.time;
    
    switch (this.pet?.pattern) {
      case 'circle':
        return {
          x: Math.sin(t * 2) * 1.5,
          y: Math.cos(t * 2) * 0.8,
          z: Math.sin(t * 2) * 1.5,
        };
      case 'weave':
        return {
          x: Math.sin(t * 3) * 0.8,
          y: Math.sin(t * 2) * 0.5,
          z: Math.cos(t * 1.5) * 1.2,
        };
      case 'hover':
        return {
          x: Math.sin(t * 1.5) * 0.3,
          y: Math.sin(t * 2.5) * 0.4,
          z: 0,
        };
      case 'soar':
        return {
          x: Math.sin(t * 0.8) * 2,
          y: Math.sin(t * 0.5) * 1.5,
          z: Math.cos(t * 0.8) * 1.5,
        };
      default: // follow
        return {
          x: Math.sin(t * 2) * 0.5,
          y: Math.sin(t * 3) * 0.3,
          z: 0,
        };
    }
  }

  /** Update trail particles */
  private updateTrail(): void {
    if (!this.trail || !this.pet) return;
    
    const positions = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const colors = this.trail.geometry.attributes.color as THREE.BufferAttribute;
    
    // Shift trail positions
    for (let i = positions.count - 1; i > 0; i--) {
      positions.setXYZ(
        i,
        positions.getX(i - 1),
        positions.getY(i - 1),
        positions.getZ(i - 1),
      );
    }
    
    // Set new head position
    positions.setXYZ(0, this.mesh!.position.x, this.mesh!.position.y, this.mesh!.position.z);
    positions.needsUpdate = true;
    
    // Update colors (fade from pet color to transparent)
    const color = new THREE.Color(this.pet.color);
    for (let i = 0; i < colors.count; i++) {
      const alpha = 1 - i / colors.count;
      colors.setXYZW(i, color.r, color.g, color.b, alpha * 0.5);
    }
    colors.needsUpdate = true;
  }

  /** Get pet config */
  getPet(): PetConfig | null {
    return this.pet;
  }

  /** Check if pet is active */
  isActive(): boolean {
    return this.pet !== null;
  }

  /** Dispose */
  dispose(): void {
    if (this.mesh) {
      this.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }
  }
}

export default PetCompanion;
