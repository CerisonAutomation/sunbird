import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Cinematic color grading shader — warm shadows, cool highlights, subtle vignette.
 */
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.28 },
    contrast: { value: 1.12 },
    brightness: { value: 0.03 },
    vignetteStrength: { value: 0.18 },
    warmth: { value: 0.11 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    uniform float vignetteStrength;
    uniform float warmth;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Brightness
      color.rgb += brightness;

      // Warmth — shift shadows toward orange, highlights toward blue
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.r += warmth * (1.0 - lum);
      color.b += warmth * lum;

      // Saturation
      float grey = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(grey), color.rgb, saturation);

      // Contrast
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;

      // Cinematic vignette — dual-layer for richer falloff
      vec2 center = vUv - 0.5;
      float dist = length(center);
      // Outer ring: darkens the corners
      float vigOuter = smoothstep(0.7, 0.15, dist * vignetteStrength * 2.2);
      // Inner ring: subtle warm glow near center
      float vigInner = smoothstep(0.55, 0.0, dist * vignetteStrength * 1.8);
      float vig = mix(vigOuter, 1.0, vigInner * 0.12);
      color.rgb *= vig;
      // Slight desaturation in the dark edges for filmic feel
      float edgeGrey = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(color.rgb, vec3(edgeGrey), smoothstep(0.3, 0.7, dist) * 0.15);

      // Clamp
      color.rgb = clamp(color.rgb, 0.0, 1.0);

      gl_FragColor = color;
    }
  `,
};

const ChromaticAberrationShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.003 }, angle: { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; uniform float angle; varying vec2 vUv;
    void main(){
      vec2 off=amount*vec2(cos(angle),sin(angle));
      float r=texture2D(tDiffuse,vUv+off).r, g=texture2D(tDiffuse,vUv).g, b=texture2D(tDiffuse,vUv-off).b;
      gl_FragColor=vec4(r,g,b,1.0);
    }`,
};

const FilmGrainShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, intensity: { value: 0.045 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float intensity; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec4 color=texture2D(tDiffuse,vUv);
      float grain=rand(vUv+time)*intensity;
      color.rgb+=grain-intensity*0.5;
      gl_FragColor=color;
    }`,
};

export class PostProcessing {
  readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly colorPass: ShaderPass;
  private readonly chromaPass: ShaderPass;
  private readonly grainPass: ShaderPass;
  private readonly fxaaPass: ShaderPass;
  private readonly renderPass: RenderPass;
  private readonly outputPass: OutputPass;
  private enabled = true;
  private pulseRaf = 0;
  private elapsed = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);

    // 1. Render scene
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // 2. Bloom — half-resolution for 60% cost reduction (bloom is naturally blurry)
    const bloomW = Math.floor(window.innerWidth / 2);
    const bloomH = Math.floor(window.innerHeight / 2);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      0.60,  // strength — visible glow on sun and bright elements
      0.32,  // radius — slightly wider halo
      0.86,  // threshold — catches sun, bright water, game juice particles
    );
    this.composer.addPass(this.bloomPass);

    // 3. Color grading — cinematic look
    this.colorPass = new ShaderPass(ColorGradingShader);
    this.composer.addPass(this.colorPass);

    // 4. Chromatic aberration — subtle RGB split at screen edges
    this.chromaPass = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.chromaPass);

    // 5. Film grain — texture and anti-banding
    this.grainPass = new ShaderPass(FilmGrainShader);
    this.composer.addPass(this.grainPass);

    // 6. FXAA — anti-aliasing (replaces hardware MSAA which is discarded by post-processing)
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms["resolution"].value.set(1 / window.innerWidth, 1 / window.innerHeight);
    this.composer.addPass(this.fxaaPass);

    // 7. Output — tone mapping + sRGB conversion
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  /** Call instead of renderer.render() */
  render(dt = 1 / 60): void {
    if (this.enabled) {
      this.elapsed += dt;
      this.grainPass.uniforms["time"].value = this.elapsed;
      this.composer.render();
    }
  }

  resize(width: number, height: number, pixelRatio: number): void {
    const scaledWidth = Math.max(1, Math.round(width * pixelRatio));
    const scaledHeight = Math.max(1, Math.round(height * pixelRatio));
    this.composer.setSize(scaledWidth, scaledHeight);
    this.composer.setPixelRatio(1);
    this.fxaaPass.uniforms["resolution"].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    // Half-resolution bloom — saves ~60% of bloom cost
    this.bloomPass.resolution.set(
      Math.floor((width * pixelRatio) / 2),
      Math.floor((height * pixelRatio) / 2),
    );
  }

  /** Disable bloom entirely for low-end devices — saves a full render pass */
  setBloomEnabled(on: boolean): void {
    this.bloomPass.enabled = on;
  }

  /** Boost bloom for fever mode, golden wings, etc. */
  setBloomStrength(strength: number): void {
    this.bloomPass.strength = strength;
  }

  /** Temporarily boost bloom for dramatic moments (landing, fever, launch) */
  pulseBloom(_duration = 0.3, peak = 1.5): void {
    cancelAnimationFrame(this.pulseRaf);
    const base = this.bloomPass.strength;
    this.bloomPass.strength = peak;
    const fade = () => {
      this.bloomPass.strength = THREE.MathUtils.lerp(this.bloomPass.strength, base, 0.1);
      if (Math.abs(this.bloomPass.strength - base) > 0.01) {
        this.pulseRaf = requestAnimationFrame(fade);
      } else {
        this.bloomPass.strength = base;
      }
    };
    this.pulseRaf = requestAnimationFrame(fade);
  }

  setSaturation(v: number): void {
    this.colorPass.uniforms["saturation"].value = v;
  }

  setVignette(v: number): void {
    this.colorPass.uniforms["vignetteStrength"].value = v;
  }

  /** Set chromatic aberration amount (0 = off, 0.003 = default, higher = more split) */
  setChromaticAberration(amount: number): void {
    this.chromaPass.uniforms["amount"].value = amount;
  }

  /** Set chromatic aberration angle in radians */
  setChromaticAberrationAngle(angle: number): void {
    this.chromaPass.uniforms["angle"].value = angle;
  }

  /** Set film grain intensity (0 = off, 0.06 = default) */
  setFilmGrain(intensity: number): void {
    this.grainPass.uniforms["intensity"].value = intensity;
  }

  /** Strip expensive/ugly passes for mobile — call once after construction */
  setMobileMode(on: boolean): void {
    this.chromaPass.enabled = !on;   // no 3D-glasses fringing
    this.grainPass.enabled = !on;    // no blur/noise
    if (on) {
      this.bloomPass.strength = 0.25; // faint glow only
      this.bloomPass.threshold = 0.95;
    }
  }

  dispose(): void {
    if (this.pulseRaf) cancelAnimationFrame(this.pulseRaf);
    this.composer.dispose();
  }
}
