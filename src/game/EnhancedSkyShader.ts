/**
 * Enhanced Sky Shader — Emotional, Breathtaking Visuals
 * 
 * Adds emotional depth to the sky with:
 * - Emotional color arcs (dawn hope, day freedom, sunset nostalgia, night mystery)
 * - Reactive clouds that respond to gameplay
 * - Dramatic god-ray shimmer
 * - Magical aurora with shimmering intensity
 * - Golden horizon glow
 */

export const EnhancedSkyFragmentShader = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform float time;
  uniform float aurora;
  uniform float birdSpeed;
  uniform float birdAltitude;
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

    // ═══════════════════════════════════════════════════════════════
    // EMOTIONAL ATMOSPHERIC HAZE — Warm glow at horizon, depth cues
    // ═══════════════════════════════════════════════════════════════
    float haze = smoothstep(-0.12, 0.22, h) * (1.0 - smoothstep(0.22, 0.48, h));
    col = mix(col, horizonColor * 1.22, haze * 0.38);
    
    // ═══════════════════════════════════════════════════════════════
    // EMOTIONAL GOD-RAY SHIMMER — More dramatic, more beautiful
    // ═══════════════════════════════════════════════════════════════
    float ray = sin(dir.x * 8.5 + time * 0.18) * 0.5 + 0.5;
    float rayMask = smoothstep(0.04, 0.12, h) * smoothstep(0.22, 0.10, h);
    col += horizonColor * ray * rayMask * 0.15;
    
    // ═══════════════════════════════════════════════════════════════
    // GOLDEN HORIZON GLOW — Emotional magic at the edge of the world
    // ═══════════════════════════════════════════════════════════════
    float horizonGlow = smoothstep(0.0, 0.15, h) * smoothstep(0.3, 0.1, h);
    col += vec3(1.0, 0.95, 0.85) * horizonGlow * 0.08;

    // ═══════════════════════════════════════════════════════════════
    // EMOTIONAL CLOUDS — Reactive, living, beautiful
    // ═══════════════════════════════════════════════════════════════
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
    float cloudMask = smoothstep(0.18, 0.40, h) * smoothstep(0.85, 0.45, h);
    float cloudVis = cloudBand * cloudMask * 0.35;
    
    // ═══════════════════════════════════════════════════════════════
    // EMOTIONAL CLOUD COLORS — Warm edges, cool centers, golden glow
    // ═══════════════════════════════════════════════════════════════
    vec3 cloudColor = mix(vec3(1.0, 0.97, 0.92), vec3(1.0, 1.0, 1.0), cloudBand);
    // Add golden edge glow for volumetric feel
    cloudColor = mix(cloudColor, vec3(1.0, 0.95, 0.85), (1.0 - cloudBand) * 0.3);
    
    // ═══════════════════════════════════════════════════════════════
    // REACTIVE CLOUDS — Respond to bird speed and altitude
    // ═══════════════════════════════════════════════════════════════
    float speedEffect = smoothstep(30.0, 100.0, birdSpeed);
    float altEffect = smoothstep(50.0, 150.0, birdAltitude);
    
    // Clouds part slightly at high speed (wind effect)
    cloudVis *= (1.0 - speedEffect * 0.2);
    
    // Clouds become more dramatic at high altitude
    cloudVis *= (1.0 + altEffect * 0.3);
    
    col = mix(col, cloudColor, cloudVis);

    // ═══════════════════════════════════════════════════════════════
    // MAGICAL AURORA — Shimmering, ethereal, unforgettable
    // ═══════════════════════════════════════════════════════════════
    if (aurora > 0.01 && h > 0.06) {
      float w1 = sin(dir.x * 6.5 + t * 1.3 + sin(dir.z * 4.5)) * 0.5 + 0.5;
      float w2 = cos(dir.x * 11.0 - t * 0.85 + dir.y * 5.5) * 0.5 + 0.5;
      float curtain = smoothstep(0.16, 0.74, w1 * w2) * smoothstep(0.06, 0.42, h) * smoothstep(0.96, 0.48, h);
      
      // More vibrant, more magical aurora colors
      vec3 auroraCol = mix(vec3(0.18, 0.95, 0.7), vec3(0.85, 0.25, 0.95), w1);
      
      // Add shimmering intensity variation — makes aurora feel alive
      float shimmer = sin(dir.x * 15.0 + t * 2.5) * 0.3 + 0.7;
      col += auroraCol * curtain * aurora * 1.2 * shimmer;
    }

    // ═══════════════════════════════════════════════════════════════
    // DITHERING — Prevents color banding in smooth gradients
    // ═══════════════════════════════════════════════════════════════
    col += dither4x4(gl_FragCoord.xy);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const EnhancedSkyVertexShader = `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
