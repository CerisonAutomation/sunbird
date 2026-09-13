import * as THREE from "three";

/**
 * GPU-accelerated speed lines effect using a custom shader.
 * Creates dynamic streaks that intensify with bird speed.
 */
export class SpeedLines {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly alpha: Float32Array;
  private readonly count: number;
  private time = 0;

  constructor(count = 120) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count);
    this.alpha = new Float32Array(count);

    // Initialize random positions
    for (let i = 0; i < count; i++) {
      this.resetLine(i);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uSpeed: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, alpha * 4.0) * (200.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uSpeed;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          // Elongate for streak effect — longer at high speed
          p.y *= 2.5 + uSpeed * 1.5;
          p.x *= 0.7;
          float d = length(p);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vAlpha * uSpeed;
          // Slight warm tint for speed lines
          vec3 col = mix(uColor, vec3(1.0, 0.95, 0.85), 0.2);
          gl_FragColor = vec4(col, a * 0.55);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1000;
  }

  private resetLine(i: number): void {
    const i3 = i * 3;
    this.pos[i3] = (Math.random() - 0.5) * 60;
    this.pos[i3 + 1] = Math.random() * 30 + 5;
    this.pos[i3 + 2] = (Math.random() - 0.5) * 20 - 10;
    this.vel[i] = 20 + Math.random() * 40;
    this.alpha[i] = 0.3 + Math.random() * 0.7;
  }

  update(dt: number, speed: number, birdX: number, birdY: number): void {
    this.time += dt;

    const speedFactor = Math.min(1, (speed - 40) / 60); // Only show above speed 40
    (this.points.material as THREE.ShaderMaterial).uniforms.uSpeed.value = Math.max(0, speedFactor);

    if (speedFactor <= 0) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      // Move lines toward camera (negative Z = toward viewer)
      this.pos[i3 + 2] += this.vel[i] * dt * speedFactor;

      // Reset when past camera
      if (this.pos[i3 + 2] > 10) {
        this.pos[i3] = birdX + (Math.random() - 0.5) * 50;
        this.pos[i3 + 1] = birdY + Math.random() * 25 + 5;
        this.pos[i3 + 2] = -30 - Math.random() * 20;
        this.alpha[i] = 0.3 + Math.random() * 0.7;
      }
    }

    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  setColor(color: THREE.Color): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uColor.value.copy(color);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
