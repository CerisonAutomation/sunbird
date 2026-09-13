import * as THREE from "three";

/**
 * Lightweight god rays effect using additive blended sprites.
 * Creates volumetric light shafts from the sun position.
 * Rays pulse with the bird's speed and shift warmer during sunset biomes.
 */
export class GodRays {
  readonly group = new THREE.Group();
  private readonly rays: THREE.Mesh[] = [];
  private readonly rayMat: THREE.MeshBasicMaterial;
  private readonly rayColor = new THREE.Color();
  private readonly baseColor = new THREE.Color(1.0, 0.96, 0.78);
  private readonly sunsetColor = new THREE.Color(1.0, 0.68, 0.35);
  private time = 0;

  constructor() {
    this.group.renderOrder = 100;
    this.group.frustumCulled = false;

    // Create a soft ray texture via canvas — higher res for smoother gradients
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(64, 0, 64, 512);
    grad.addColorStop(0, "rgba(255,245,200,0.35)");
    grad.addColorStop(0.15, "rgba(255,230,160,0.2)");
    grad.addColorStop(0.4, "rgba(255,210,120,0.08)");
    grad.addColorStop(0.7, "rgba(255,190,80,0.03)");
    grad.addColorStop(1, "rgba(255,170,40,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    this.rayMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.18,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });

    // Create 8 ray shafts — reduced count for softer look
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.PlaneGeometry(1.5 + Math.random() * 3, 45 + Math.random() * 35);
      const mesh = new THREE.Mesh(geo, this.rayMat.clone());
      mesh.userData = {
        baseAngle: (i / 8) * Math.PI * 0.5 - Math.PI * 0.25,
        baseOpacity: 0.06 + Math.random() * 0.10,
        speed: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      };
      this.rays.push(mesh);
      this.group.add(mesh);
    }
  }

  update(dt: number, sunX: number, sunY: number, daylight: number, birdSpeed = 0, biomeId = ""): void {
    this.time += dt;

    // Fade out god rays at night — gradual ramp
    const dayFactor = Math.min(1, daylight / 40);
    this.group.visible = dayFactor > 0.03;
    if (!this.group.visible) return;

    // Speed-based intensity: faster bird = more dramatic rays
    const speedFactor = 1 + Math.min(0.8, birdSpeed / 120);

    // Sunset color shift — rays become warmer (more orange) in sunset biome
    const sunsetMix = biomeId === "sunset" ? 0.7 : biomeId === "desert" ? 0.4 : 0;
    this.rayColor.copy(this.baseColor).lerp(this.sunsetColor, sunsetMix);

    for (const ray of this.rays) {
      const ud = ray.userData;
      const angle = ud.baseAngle + Math.sin(this.time * ud.speed + ud.phase) * 0.15;
      const pulse = 0.7 + 0.3 * Math.sin(this.time * ud.speed * 1.5 + ud.phase);
      const opacity = ud.baseOpacity * dayFactor * pulse * speedFactor;

      ray.position.set(sunX + Math.cos(angle) * 15, sunY - 20, -15);
      ray.rotation.z = angle + Math.PI / 2;
      const mat = ray.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;
      mat.color.copy(this.rayColor);
    }
  }

  dispose(): void {
    this.rayMat.dispose();
    for (const ray of this.rays) {
      ray.geometry.dispose();
      (ray.material as THREE.Material).dispose();
    }
  }
}
