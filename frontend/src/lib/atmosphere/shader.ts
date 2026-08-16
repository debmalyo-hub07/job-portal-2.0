/**
 * The ambient field's two shaders, kept as strings in their own module.
 *
 * Why a hand-written shader rather than three.js: this draws one full-screen
 * triangle pair with no geometry, no camera, no lighting and no loader. three.js
 * is ~170 kB gzipped to provide a scene graph nothing here has.
 *
 * Terser does not minify string contents, so this is roughly its shipped size.
 * That is the honest cost of the effect: a couple of kB, not a rendering engine.
 */

export const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Two octaves of value noise, advected slowly, then masked twice.
 *
 * Two octaves rather than five: the field is deliberately out of focus, so the
 * higher octaves contribute detail no viewer can resolve while costing a
 * proportional share of every fragment. This is a soft wash, not terrain.
 *
 * The two masks are the accessibility mechanism, and they are in the shader
 * rather than in CSS so that nothing downstream can composite them away:
 *
 * - uEdge fades the field out at the bottom of its own box, so the boundary
 *   between an atmospheric hero and ordinary page background is a gradient
 *   rather than a visible seam.
 * - uTextBand pushes it to zero across the vertical band where copy sits.
 *   Measured in Chrome, light-mode --ink-muted on --paper is 5.35:1 — 0.85 of
 *   headroom over WCAG 4.5:1 — and compositing the signal over paper at only
 *   alpha 0.15 drops the admin portal to 4.39:1, a fail. So the field does not
 *   go behind body copy at all. Capping the alpha globally would have meant
 *   capping it at roughly 0.10, which is close enough to nothing to not be
 *   worth drawing.
 */
export const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uSignal;
uniform vec3  uPaper;
uniform float uAmplitude;
uniform vec2  uTextBand;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Correct for aspect so the field does not stretch on a wide viewport.
  vec2 p = vec2(uv.x * (uResolution.x / uResolution.y), uv.y);

  float t = uTime * 0.04;
  float n = valueNoise(p * 2.2 + vec2(t, t * 0.6)) * 0.65
          + valueNoise(p * 4.6 - vec2(t * 0.8, t * 0.4)) * 0.35;

  // Bias toward the top-left, where the eye enters the page and where no
  // section places its copy.
  float pool = smoothstep(0.85, 0.0, length(uv - vec2(0.12, 0.94)));

  float edge     = smoothstep(0.0, 0.42, uv.y);
  float textBand = 1.0 - smoothstep(uTextBand.x, uTextBand.y, 1.0 - uv.y);

  // The ceiling is the accessibility budget, measured rather than chosen. Compositing
  // --signal over --paper and testing every token pairing in Chrome, the maximum
  // alpha that keeps light-mode --ink-muted above WCAG 4.5:1 is 0.135 for the seeker
  // signal and 0.125 for admin; dark mode tolerates ~0.30. A single ceiling of 0.12
  // is under the tightest of those, so the field is safe on every portal in both
  // themes without the component needing to know which it is on.
  //
  // Without it the masks alone peaked near 0.58 — a half-strength signal wash that
  // measured 4.03:1 behind the hero's badge, a real fail. The masks shape WHERE the
  // field falls; this bounds HOW FAR it can go anywhere.
  float field = n * pool * edge * textBand * uAmplitude * 0.12;

  gl_FragColor = vec4(mix(uPaper, uSignal, clamp(field, 0.0, 1.0)), 1.0);
}
`;
