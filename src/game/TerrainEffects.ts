import * as THREE from "three";
import { WATER_Y } from "./constants";
import { hash01 } from "./math";
import type { TerrainSystem } from "./TerrainSystem";

/**
 * Ambient terrain visual effects:
 *  - Waterline foam: glowing foam strip where terrain meets ocean
 *  - Snow sparkles: twinkling white dots above the snow line in aurora biome
 *  - Heat haze: subtle distortion shimmer near the ground in desert biome
 */
export class TerrainEffects {
  readonly group = new THREE.Group();
  private readonly foamMat: THREE.ShaderMaterial;
  private readonly sparkleGeo: THREE.BufferGeometry;
  private readonly sparkleMat: THREE.PointsMaterial;
  private readonly hazeMat: THREE.ShaderMaterial;
  private readonly hazeMesh: THREE.Mesh;
  private time = 0;

  constructor() {
    // --- Waterline foam shader ---
    this.foamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      uniforms: {
        time: { value: 0 },
        camX: { value: 0 },
      },
      vertexShader: `
        uniform float time;
        uniform float camX;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          float worldX = position.x + camX;
          vWave = sin(worldX * 0.18 + time * 2.2) * 0.5 + 0.5;
          vec3 p = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          float foam = smoothstep(0.3, 0.8, vWave);
          float sparkle = sin(vUv.x * 60.0 + time * 3.0) * 0.5 + 0.5;
          float alpha = foam * 0.35 + sparkle * foam * 0.15;
          vec3 col = vec3(0.88, 0.96, 1.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const foamGeo = new THREE.PlaneGeometry(300, 1.8, 80, 1);
    this.group.add(new THREE.Mesh(foamGeo, this.foamMat));
    this.group.children[0]!.rotation.x = -Math.PI / 2;

    // --- Snow sparkles (points above snow line) ---
    const sparkCount = 120;
    const sparkPos = new Float32Array(sparkCount * 3);
    const sparkAlpha = new Float32Array(sparkCount);
    for (let i = 0; i < sparkCount; i++) {
      sparkPos[i * 3] = (Math.random() - 0.5) * 600;
      sparkPos[i * 3 + 1] = 28 + Math.random() * 20;
      sparkPos[i * 3 + 2] = -8 + Math.random() * 16;
      sparkAlpha[i] = Math.random();
    }
    this.sparkleGeo = new THREE.BufferGeometry();
    this.sparkleGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    this.sparkleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.35,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.group.add(new THREE.Points(this.sparkleGeo, this.sparkleMat));

    // --- Heat haze distortion (screen-space shimmer via a transparent overlay) ---
    this.hazeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        void main() {
          float shimmer = sin(vUv.x * 30.0 + time * 4.0) * sin(vUv.y * 20.0 + time * 2.5);
          float alpha = abs(shimmer) * 0.06;
          vec3 col = vec3(1.0, 0.95, 0.8);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.hazeMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 12), this.hazeMat);
    this.hazeMesh.rotation.x = -Math.PI / 2;
    this.hazeMesh.visible = false;
    this.group.add(this.hazeMesh);
  }

  update(dt: number, time: number, camX: number, _terrain: TerrainSystem, biomeId: string): void {
    this.time += dt;

    // --- Foam at waterline ---
    this.foamMat.uniforms.time!.value = time;
    this.foamMat.uniforms.camX!.value = camX;
    const foamMesh = this.group.children[0] as THREE.Mesh;
    foamMesh.position.set(camX, WATER_Y + 0.3, 6);

    // --- Snow sparkles (aurora biome) ---
    const isSnowy = biomeId === "aurora";
    this.sparkleMat.opacity = isSnowy ? 0.8 : 0;
    if (isSnowy) {
      const positions = this.sparkleGeo.getAttribute("position") as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        // Twinkle: vary Y position over time for a living feel
        const base = 28 + hash01(i, 42) * 20;
        arr[i * 3 + 1] = base + Math.sin(time * 1.8 + hash01(i, 99) * 6.28) * 0.4;
        // Slowly scroll with camera
        arr[i * 3] = camX - 300 + hash01(i, 77) * 600;
      }
      positions.needsUpdate = true;
    }

    // --- Heat haze (desert biome) ---
    const isDesert = biomeId === "desert";
    this.hazeMesh.visible = isDesert;
    if (isDesert) {
      this.hazeMat.uniforms.time!.value = time;
      this.hazeMesh.position.set(camX + 30, 4, 0);
    }
  }

  dispose(): void {
    this.foamMat.dispose();
    this.sparkleGeo.dispose();
    this.sparkleMat.dispose();
    this.hazeMat.dispose();
    this.hazeMesh.geometry.dispose();
  }
}
