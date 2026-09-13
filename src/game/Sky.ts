import * as THREE from "three";
import { saturate } from "./math";
import { drawSunDisc } from "./Sunbird";
import { drawSunDisc } from "./Sunbird";
import type { TerrainPalette } from "./TerrainSystem";

type SkyStop = {
  top: number;
  horizon: number;
  bottom: number;
  fog: number;
  sun: number;
  farA: number;
  farB: number;
  farC: number;
  water: number;
  waterDeep: number;
  hemiSky: number;
  hemiGround: number;
};

/**
 * Time-of-day colour ramp, indexed by `dayT` (daylight remaining, 1 -> 0).
 * This table — not the sky material's initial uniform values — is what the
 * rendered sky is made of: `update()` writes topColor/horizonColor/bottomColor
 * from `sampleStops(dayT)` every frame. Exported so the palette's brightness
 * can be asserted rather than eyeballed.
 */
export const STOPS: { t: number; s: SkyStop }[] = [
  {
    t: 0,
    s: {
      top: 0x12102c,
      horizon: 0x1c1638,
      bottom: 0x0a0814,
      fog: 0x14101e,
      sun: 0xc8d0ff,
      farA: 0x1e2840,
      farB: 0x181e32,
      farC: 0x12141f,
      water: 0x142848,
      waterDeep: 0x0a1428,
      hemiSky: 0x32385e,
      hemiGround: 0x161820,
    },
  },
  {
    t: 0.18,
    s: {
      top: 0x603b9e,
      horizon: 0xeb6c56,
      bottom: 0x9a3a68,
      fog: 0xc85d8b,
      sun: 0xffb070,
      farA: 0x9a5480,
      farB: 0x6f3f84,
      farC: 0x433373,
      water: 0x3b659d,
      waterDeep: 0x1c305a,
      hemiSky: 0xe87850,
      hemiGround: 0x68384e,
    },
  },
  {
    t: 0.4,
    s: {
      top: 0xe07038,
      horizon: 0xffb888,
      bottom: 0xd06850,
      fog: 0xe8a070,
      sun: 0xffe0a0,
      farA: 0xc46a4a,
      farB: 0x8a4a62,
      farC: 0x4a3a62,
      water: 0x3a6a8a,
      waterDeep: 0x1a3a58,
      hemiSky: 0xffb080,
      hemiGround: 0x6a4030,
    },
  },
  {
    t: 0.7,
    s: {
      // Clear-sky pass: a deeper, more saturated blue overhead reads as *less*
      // cloud, not less light, and a brighter horizon + fog colour is what
      // actually removes the murky cast. Distance layers lifted to match, so
      // the horizon doesn't turn to grey sludge where the fog starts.
      top: 0x3f9ae8,
      horizon: 0xd8f2ff,
      bottom: 0x9fdcf5,
      fog: 0xcfeeff,
      sun: 0xfff8d0,
      farA: 0x86cf90,
      farB: 0x6aa8c4,
      farC: 0x6888ba,
      water: 0x52b0dc,
      waterDeep: 0x2270a4,
      hemiSky: 0xc8ecff,
      hemiGround: 0x6c9c5c,
    },
  },
  {
    t: 1,
    s: {
      // Every run starts here (dayT = 1), so this stop is the first
      // impression. Lifted across the board: warmer, brighter, less dusty.
      top: 0x6fc4f8,
      horizon: 0xffecc8,
      bottom: 0xf8dcb8,
      fog: 0xf6e8d4,
      sun: 0xfff6c4,
      farA: 0xa4e8ac,
      farB: 0x90c8dc,
      farC: 0x92a8d4,
      water: 0x5cc4e8,
      waterDeep: 0x3288b0,
      hemiSky: 0xffeada,
      hemiGround: 0x92c46e,
    },
  },
];

export class Sky {
  readonly group = new THREE.Group();
  readonly fogColor = new THREE.Color(0x8ed0ee);
  readonly hemi: THREE.HemisphereLight;
  readonly sunLight: THREE.DirectionalLight;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sun: THREE.Sprite;
  private readonly sunTex: THREE.CanvasTexture;
  private readonly sunGlow: THREE.Sprite;
  private readonly sunHalo: THREE.Sprite;
  private readonly moon: THREE.Mesh;
  private readonly moonGlow: THREE.Sprite;
  private readonly stars: THREE.Points;
  private readonly water: THREE.Mesh;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly palette: TerrainPalette;
  private readonly tmpA = new THREE.Color();
  private readonly tmpB = new THREE.Color();
  private readonly tmpC = new THREE.Color();
  private readonly _top = new THREE.Color();
  private readonly _horizon = new THREE.Color();
  private readonly _bottom = new THREE.Color();
  private tintTop = 0xffffff;
  private tintHorizon = 0xffffff;
  private tintMix = 0;
  private altT = 0;
  private auroraIntensity = 0;

  constructor() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        // Seeds only. STOPS (above) is authoritative: update() writes these
        // three every frame from sampleStops(dayT), so editing them here does
        // nothing to the rendered sky. Kept equal to the t=0.7 day stop.
        topColor: { value: new THREE.Color(0x3f9ae8) },
        horizonColor: { value: new THREE.Color(0xd8f2ff) },
        bottomColor: { value: new THREE.Color(0x9fdcf5) },
        time: { value: 0 },
        aurora: { value: 0 },
        // Direction to the sun, and how hard it blooms. Kept as uniforms so the
        // dome can light itself from the same sun the scene is lit by.
        sunDir: { value: new THREE.Vector3(48, 72, 36).normalize() },
        sunGlow: { value: 1 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float time;
        uniform float aurora;
        uniform vec3 sunDir;
        uniform float sunGlow;
        varying vec3 vWorld;

        // Blue-noise dithering — smooths gradient banding at no cost
        float dither4x4(vec2 pos) {
          int x = int(mod(pos.x, 4.0));
          int y = int(mod(pos.y, 4.0));
          int index = x + y * 4;
          float r = 0.0;
          if (index == 0) r = 0.0;
          else if (index == 1) r = 8.0;
          else if (index == 2) r = 2.0;
          else if (index == 3) r = 10.0;
          else if (index == 4) r = 12.0;
          else if (index == 5) r = 4.0;
          else if (index == 6) r = 14.0;
          else if (index == 7) r = 6.0;
          else if (index == 8) r = 3.0;
          else if (index == 9) r = 11.0;
          else if (index == 10) r = 1.0;
          else if (index == 11) r = 9.0;
          else if (index == 12) r = 15.0;
          else if (index == 13) r = 7.0;
          else if (index == 14) r = 13.0;
          else r = 5.0;
          return (r / 16.0 - 0.5) / 255.0;
        }

        void main() {
          vec3 dir = normalize(vWorld);
          float h = dir.y;
          vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.62, h));
          col = mix(bottomColor, col, smoothstep(-0.35, 0.08, h));

          // Atmospheric haze — warm glow at horizon, depth cues
          float haze = smoothstep(-0.12, 0.22, h) * (1.0 - smoothstep(0.22, 0.48, h));
          col = mix(col, horizonColor * 1.28, haze * 0.44);
          // Subtle god-ray shimmer just above horizon
          float ray = sin(dir.x * 8.5 + time * 0.18) * 0.5 + 0.5;
          float rayMask = smoothstep(0.04, 0.12, h) * smoothstep(0.22, 0.10, h);
          col += horizonColor * ray * rayMask * 0.10;

          // Animated cloud wisps — four layers: high cirrus + mid cumulus + low haze + detail
          float t = time;
          // High cirrus: fine streaks drifting fast
          float c1 = sin(dir.x * 3.2 + dir.z * 1.8 + t * 0.22) * 0.5 + 0.5;
          float c2 = cos(dir.x * 5.5 - dir.z * 2.4 + t * 0.14) * 0.5 + 0.5;
          // Mid cumulus: slow billowing masses
          float c3 = sin(dir.x * 1.8 + dir.z * 3.1 + t * 0.06 + cos(t * 0.04)) * 0.5 + 0.5;
          // Detail layer: fine texture within clouds
          float c4 = sin(dir.x * 9.1 + dir.z * 7.3 + t * 0.35) * 0.5 + 0.5;
          float cloudBand = c1 * c2 + c3 * 0.45 + c4 * 0.15;
          // Clouds visible from mid-sky up; clear near horizon for depth
          float cloudMask = smoothstep(0.10, 0.32, h) * smoothstep(0.90, 0.42, h);
          float cloudVis = cloudBand * cloudMask * 0.42;  // punchy clouds, clearly visible
          // Soft gold tint near edges for volumetric feel
          vec3 cloudColor = mix(vec3(1.0, 0.98, 0.94), vec3(1.0, 1.0, 1.0), cloudBand);
          col = mix(col, cloudColor, cloudVis);

          // Shimmering Aurora curtains in high altitude / polar skies
          if (aurora > 0.01 && h > 0.06) {
            float w1 = sin(dir.x * 6.5 + t * 1.3 + sin(dir.z * 4.5)) * 0.5 + 0.5;
            float w2 = cos(dir.x * 11.0 - t * 0.85 + dir.y * 5.5) * 0.5 + 0.5;
            float curtain = smoothstep(0.16, 0.74, w1 * w2) * smoothstep(0.06, 0.42, h) * smoothstep(0.96, 0.48, h);
            vec3 auroraCol = mix(vec3(0.18, 0.95, 0.7), vec3(0.85, 0.25, 0.95), w1);
            col += auroraCol * curtain * aurora * 0.92;
          }

          // Sun bloom in the dome itself. Tight core, broad warm halo, faint
          // crepuscular rays so the light has a direction.
          float sd = max(dot(dir, sunDir), 0.0);
          col += vec3(1.00, 0.88, 0.66) * pow(sd, 260.0) * 1.45 * sunGlow;
          col += vec3(1.00, 0.80, 0.52) * pow(sd, 11.0) * 0.30 * sunGlow;
          float ang = atan(dir.z, dir.x);
          float rays = 0.5 + 0.5 * sin(ang * 13.0 + time * 0.11);
          col += vec3(1.00, 0.90, 0.70) * pow(sd, 34.0) * rays * 0.15 * sunGlow;

          // Dithering to prevent color banding in smooth gradients
          col += dither4x4(gl_FragCoord.xy);

          // Sun bloom in the dome itself. A flat three-stop gradient is most of
          // why a bright day still reads as overcast: there is no bright point
          // for the eye to anchor on. Tight core, broad warm halo, and faint
          // crepuscular rays so the light has a direction.
          float sd = max(dot(dir, sunDir), 0.0);
          col += vec3(1.00, 0.88, 0.66) * pow(sd, 260.0) * 1.45 * sunGlow;
          col += vec3(1.00, 0.80, 0.52) * pow(sd, 11.0) * 0.30 * sunGlow;
          float ang = atan(dir.z, dir.x);
          float rays = 0.5 + 0.5 * sin(ang * 13.0 + time * 0.11);
          col += vec3(1.00, 0.90, 0.70) * pow(sd, 34.0) * rays * 0.15 * sunGlow;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), this.skyMat);
    this.group.add(skyMesh);

    // The in-flight sun is the same disc as the title screen's: painted by
    // drawSunDisc from SUN_STOPS, so the sun you start under and the sun you
    // fly toward are one object rather than a flat yellow ball.
    const sunCanvas = document.createElement("canvas");
    sunCanvas.width = 256;
    sunCanvas.height = 256;
    drawSunDisc(sunCanvas.getContext("2d")!, 128, 128, 128);
    this.sunTex = new THREE.CanvasTexture(sunCanvas);
    this.sunTex.colorSpace = THREE.SRGBColorSpace;
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.sunTex,
        color: 0xfff2b0,
        fog: false,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.group.add(this.sun);

    this.sunGlow = makeGlow(0xffe08a, 32);
    this.group.add(this.sunGlow);

    // Pulsing sun halo — a bright ring that breathes around the sun
    this.sunHalo = makeSunHalo();
    this.group.add(this.sunHalo);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(7, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xe8eefc, fog: false, toneMapped: false }),
    );
    this.group.add(this.moon);
    this.moonGlow = makeGlow(0xb8c8ff, 32);
    this.group.add(this.moonGlow);

    this.stars = this.makeStars();
    this.group.add(this.stars);

    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      fog: false,
      uniforms: {
        time: { value: 0 },
        colorA: { value: new THREE.Color(0x3a98c8) },
        colorB: { value: new THREE.Color(0x1a5888) },
        skyColor: { value: new THREE.Color(0x7ec8f5) },
        camX: { value: 0 },
      },
      vertexShader: `
        uniform float time;
        uniform float camX;
        varying vec2 vUv;
        varying float vWave;
        varying float vCrest;
        void main() {
          vUv = uv;
          float worldX = position.x + camX;
          // Multi-layer wave system for more dynamic water
          float w1 = sin(worldX * 0.11 + time * 1.8) * 0.4;
          float w2 = sin(worldX * 0.04 + time * 0.8) * 0.26;
          float w3 = cos(worldX * 0.18 + time * 2.4) * 0.12;
          float w4 = sin(worldX * 0.07 - time * 1.2) * 0.18;
          vWave = w1 + w2 + w3 + w4;
          vCrest = smoothstep(0.2, 0.6, vWave);
          vec3 p = position;
          p.y += vWave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 colorA;
        uniform vec3 colorB;
        uniform vec3 skyColor;
        varying vec2 vUv;
        varying float vWave;
        varying float vCrest;
        void main() {
          float foam = smoothstep(0.52, 0.95, vUv.y + vWave * 0.08);
          float crest = vCrest;
          vec3 col = mix(colorB, colorA, vUv.y);

          // Sky reflection blended onto the water surface
          float skyRefl = smoothstep(0.1, 0.5, vUv.y) * 0.25;
          col = mix(col, skyColor, skyRefl);

          // Sun specular streak on the water
          float spec = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 3.0), 4.0) * crest * 0.3;
          col += vec3(1.0, 0.95, 0.8) * spec;

          // Foam highlight at wave crests with animated sparkle
          float sparkle = sin(vUv.x * 80.0 + vUv.y * 40.0 + vWave * 5.0) * 0.5 + 0.5;
          float sparkle2 = cos(vUv.x * 55.0 - vUv.y * 30.0 + vWave * 3.0) * 0.5 + 0.5;
          float foamDetail = foam * 0.35 + crest * 0.25 + (sparkle * sparkle2) * crest * 0.1;
          col = mix(col, vec3(0.94, 0.98, 1.0), foamDetail);

          // Crest glow: brighter highlights on wave tops
          col += vec3(0.7, 0.85, 0.95) * crest * 0.08;

          gl_FragColor = vec4(col, 0.88);
        }
      `,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2600, 260, 100, 1), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.25, 6);
    this.group.add(this.water);

    this.hemi = new THREE.HemisphereLight(0xb0e0ff, 0x5a8a50, 1.1);
    this.sunLight = new THREE.DirectionalLight(0xfff4d0, 1.0);
    this.sunLight.position.set(40, 60, 30);
    this.sunLight.castShadow = true;
    // 2048 rather than 1024. Shadow-map resolution is the other half of why
    // shadows read as cheap: at 1024 the whole terrain shares a coarse grid, so
    // edges stair-step. One directional light, so this is a single 16 MB buffer.
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 280;
    this.sunLight.shadow.camera.left = -80;
    this.sunLight.shadow.camera.right = 80;
    this.sunLight.shadow.camera.top = 80;
    this.sunLight.shadow.camera.bottom = -80;
    this.sunLight.shadow.bias = -0.0006;

    this.palette = { farA: new THREE.Color(), farB: new THREE.Color(), farC: new THREE.Color() };
  }

  addLights(scene: THREE.Scene): void {
    scene.add(this.hemi);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);
    scene.add(new THREE.AmbientLight(0xffecd6, 0.45));
  }

  /** Blend a world's signature sky over the time-of-day gradient. */
  setBiomeTint(top: number, horizon: number, mix: number): void {
    this.tintTop = top;
    this.tintHorizon = horizon;
    this.tintMix = mix;
  }

  /** 0..1 how far into space the bird is — deepens the blue and shows stars. */
  setAltitude(t: number): void {
    this.altT = t;
  }

  setAurora(intensity: number): void {
    this.auroraIntensity = saturate(intensity);
  }

  update(daylight: number, camX: number, time: number): TerrainPalette {
    (this.skyMat.uniforms.time!.value as number) = time;
    (this.skyMat.uniforms.aurora!.value as number) = this.auroraIntensity;
    const t = saturate(daylight);
    const { a, b, u } = sampleStops(t);
    const top = this._top.copy(this.mixHex(a.top, b.top, u));
    const horizon = this._horizon.copy(this.mixHex(a.horizon, b.horizon, u));
    const bottom = this._bottom.copy(this.mixHex(a.bottom, b.bottom, u));
    if (this.tintMix > 0) {
      top.lerp(this.tmpC.setHex(this.tintTop), this.tintMix);
      horizon.lerp(this.tmpC.setHex(this.tintHorizon), this.tintMix * 0.85);
      bottom.lerp(this.tmpC.setHex(this.tintHorizon), this.tintMix * 0.5);
    }
    // Climbing drains the sky toward deep space.
    if (this.altT > 0) {
      const deep = this.tmpC.setHex(0x0a1038);
      top.lerp(deep, this.altT * 0.9);
      horizon.lerp(this.tmpC.setHex(0x27407e), this.altT * 0.7);
    }
    (this.skyMat.uniforms.topColor!.value as THREE.Color).copy(top);
    (this.skyMat.uniforms.horizonColor!.value as THREE.Color).copy(horizon);
    (this.skyMat.uniforms.bottomColor!.value as THREE.Color).copy(bottom);
    this.fogColor.copy(this.mixHex(a.fog, b.fog, u));

    this.hemi.color.copy(this.mixHex(a.hemiSky, b.hemiSky, u));
    this.hemi.groundColor.copy(this.mixHex(a.hemiGround, b.hemiGround, u));
    this.sunLight.color.copy(this.mixHex(a.sun, b.sun, u));
    // Day grade lifted ~15% for a premium well-lit look.
    this.sunLight.intensity = 0.8 + t * 0.95;
    this.hemi.intensity = 1.1 + t * 0.45;

    const elev = 22 + t * 78;
    this.sun.position.set(36 + (1 - t) * 28, elev, -110);
    this.sunGlow.position.copy(this.sun.position);
    // Sun halo: pulses gently in size and opacity
    this.sunHalo.position.copy(this.sun.position);
    const haloPulse = 1 + Math.sin(time * 0.8) * 0.12;
    this.sunHalo.scale.setScalar(56 * this.sun.scale.x * haloPulse);
    (this.sunHalo.material as THREE.SpriteMaterial).opacity = 0.15 + Math.sin(time * 1.2) * 0.04;
    (this.sun.material as THREE.SpriteMaterial).color.copy(this.mixHex(a.sun, b.sun, u));
    this.sun.scale.setScalar((0.85 + t * 0.4) * 26);

    this.moon.position.set(-8, 20 + (1 - t) * 68, -120);
    this.moonGlow.position.copy(this.moon.position);
    const night = 1 - t;
    this.moon.visible = night > 0.15;
    this.moonGlow.material.opacity = night * 0.55;
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(saturate((0.35 - t) / 0.35), this.altT * 0.85);
    this.stars.position.set(0, 0, 0);

    this.group.position.set(camX, 0, 0);
    this.sunLight.position.set(camX + 48, 72, 36);
    this.sunLight.target.position.set(camX + 8, 10, 0);
    this.sunLight.target.updateMatrixWorld();
    // Point the dome's bloom at the same sun the scene is lit by, and fade it
    // with the daylight clock so dusk dims instead of glowing like noon.
    (this.skyMat.uniforms.sunDir!.value as THREE.Vector3).set(48, 72, 36).normalize();
    this.skyMat.uniforms.sunGlow!.value = 0.35 + t * 0.65;

    this.water.position.set(0, 0.25, 6);
    this.waterMat.uniforms.time!.value = time;
    this.waterMat.uniforms.camX!.value = camX;
    (this.waterMat.uniforms.colorA!.value as THREE.Color).copy(this.mixHex(a.water, b.water, u));
    (this.waterMat.uniforms.colorB!.value as THREE.Color).copy(this.mixHex(a.waterDeep, b.waterDeep, u));
    // Sky reflection on water surface
    (this.waterMat.uniforms.skyColor!.value as THREE.Color).copy(horizon);

    this.palette.farA.copy(this.mixHex(a.farA, b.farA, u));
    this.palette.farB.copy(this.mixHex(a.farB, b.farB, u));
    this.palette.farC.copy(this.mixHex(a.farC, b.farC, u));
    return this.palette;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.sunTex.dispose();
  }

  private mixHex(ha: number, hb: number, t: number): THREE.Color {
    return this.tmpA.setHex(ha).lerp(this.tmpB.setHex(hb), t);
  }

  private makeStars(): THREE.Points {
    const n = 180;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 380;
      pos[i * 3 + 1] = 20 + Math.random() * 140;
      pos[i * 3 + 2] = -150 - Math.random() * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    return new THREE.Points(geo, mat);
  }
}

function sampleStops(daylight: number): { a: SkyStop; b: SkyStop; u: number } {
  const t = saturate(daylight);
  for (let i = 0; i < STOPS.length - 1; i++) {
    const cur = STOPS[i]!;
    const next = STOPS[i + 1]!;
    if (t >= cur.t && t <= next.t) {
      const u = (t - cur.t) / (next.t - cur.t);
      return { a: cur.s, b: next.s, u };
    }
  }
  const last = STOPS[STOPS.length - 1]!;
  return { a: last.s, b: last.s, u: 0 };
}

function makeGlow(color: number, size: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  // Multi-layer radial gradient for richer sun glow
  const grd = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,0.28)");
  grd.addColorStop(0.12, hexAlpha(color, 0.28));
  grd.addColorStop(0.35, hexAlpha(color, 0.14));
  grd.addColorStop(0.65, hexAlpha(color, 0.05));
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // Outer halo for atmospheric scattering
  const grd2 = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grd2.addColorStop(0, "rgba(255,240,200,0.08)");
  grd2.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = grd2;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

function hexAlpha(hex: number, a: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}

function makeSunHalo(): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  // Bright ring halo — a luminous ring around the sun center
  const grd = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,230,0.0)");
  grd.addColorStop(0.3, "rgba(255,245,200,0.30)");
  grd.addColorStop(0.5, "rgba(255,230,160,0.14)");
  grd.addColorStop(0.7, "rgba(255,210,120,0.05)");
  grd.addColorStop(1, "rgba(255,190,80,0.0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(56, 56, 1);
  return s;
}


