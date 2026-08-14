import { useEffect, useRef } from "react";
import type { CSSProperties, HTMLAttributes, RefObject } from "react";
import * as THREE from "three";

import { readOklchVar } from "@/lib/atmosphere/oklch";
import { subscribe } from "@/lib/motion/clock";
import { onReducedMotionChange, prefersReduced } from "@/lib/motion/reducedMotion";
import { cn } from "@/lib/utils";

export type CairnPortal = "seeker" | "recruiter";

/**
 * The scene intentionally accepts color representations instead of forcing a
 * particular token format. A page can leave the palette empty and inherit its
 * portal's CSS variables, or pass a small explicit palette when the scene sits
 * over photography or a campaign surface.
 */
export interface CairnScenePalette {
  accent: THREE.ColorRepresentation;
  accentSoft: THREE.ColorRepresentation;
  stone: THREE.ColorRepresentation;
  stoneLight: THREE.ColorRepresentation;
  stoneDark: THREE.ColorRepresentation;
  shadow: THREE.ColorRepresentation;
  background: THREE.ColorRepresentation;
}

export interface CairnSceneProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "color"> {
  /** Controls the material signal and the small orbit ring. */
  portal?: CairnPortal;
  /** A normalized page-scroll value or paint-level ref. 0 = scattered, 1 = assembled. */
  scrollProgress?: number | RefObject<number>;
  /** Optional material overrides. Unset values are resolved from CSS tokens. */
  palette?: Partial<CairnScenePalette>;
  /** Keeps the scene intentionally light on low-power devices. */
  quality?: "low" | "high";
  /** Extra inline styles, useful when the host is not an absolutely positioned hero. */
  style?: CSSProperties;
}

type ResolvedPalette = {
  accent: THREE.Color;
  accentSoft: THREE.Color;
  stone: THREE.Color;
  stoneLight: THREE.Color;
  stoneDark: THREE.Color;
  shadow: THREE.Color;
  background: THREE.Color;
};

type Stone = {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  material: THREE.MeshPhysicalMaterial;
  basePosition: THREE.Vector3;
  scatterPosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  scale: THREE.Vector3;
  phase: number;
};

const DEFAULTS: Record<CairnPortal, Omit<ResolvedPalette, "accent" | "accentSoft">> = {
  seeker: {
    stone: new THREE.Color("#b99b88"),
    stoneLight: new THREE.Color("#ead9ca"),
    stoneDark: new THREE.Color("#624d43"),
    shadow: new THREE.Color("#201512"),
    background: new THREE.Color("#efe7de"),
  },
  recruiter: {
    stone: new THREE.Color("#87a69f"),
    stoneLight: new THREE.Color("#d4e0da"),
    stoneDark: new THREE.Color("#3d5c57"),
    shadow: new THREE.Color("#10211f"),
    background: new THREE.Color("#e4eeea"),
  },
};

const TAU = Math.PI * 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function smoothstep(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function colorFromCss(host: HTMLElement, property: string, fallback: THREE.Color): THREE.Color {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
    return fallback.clone();
  }

  const raw = getComputedStyle(host).getPropertyValue(property).trim();
  if (!raw) return fallback.clone();

  // Three.Color does not understand CSS OKLCH in all supported browsers. The
  // existing token converter gives WebGL an unambiguous sRGB representation.
  if (raw.toLowerCase().startsWith("oklch(")) {
    const rgb = readOklchVar(host, property);
    if (rgb) return new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    return fallback.clone();
  }

  try {
    return new THREE.Color(raw);
  } catch {
    return fallback.clone();
  }
}

function resolvePalette(
  host: HTMLElement,
  portal: CairnPortal,
  overrides: Partial<CairnScenePalette> | undefined,
): ResolvedPalette {
  const defaults = DEFAULTS[portal];
  const cssSignal = colorFromCss(host, "--signal", portal === "seeker" ? new THREE.Color("#d87951") : new THREE.Color("#4eb9a5"));
  const cssSignalMuted = colorFromCss(host, "--signal-muted", cssSignal.clone().multiplyScalar(0.45));
  const cssPaper = colorFromCss(host, "--paper", defaults.background);
  const cssInk = colorFromCss(host, "--ink", defaults.shadow);

  return {
    accent: new THREE.Color(overrides?.accent ?? cssSignal),
    accentSoft: new THREE.Color(overrides?.accentSoft ?? cssSignalMuted),
    stone: new THREE.Color(overrides?.stone ?? defaults.stone),
    stoneLight: new THREE.Color(overrides?.stoneLight ?? defaults.stoneLight),
    stoneDark: new THREE.Color(overrides?.stoneDark ?? defaults.stoneDark),
    shadow: new THREE.Color(overrides?.shadow ?? cssInk),
    background: new THREE.Color(overrides?.background ?? cssPaper),
  };
}

/** A tiny deterministic hash keeps every rock organic without a noise texture. */
function hash(index: number, seed: number): number {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createStoneGeometry(seed: number, quality: "low" | "high"): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(
    1,
    quality === "high" ? 48 : 28,
    quality === "high" ? 32 : 20,
  );
  const position = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  const direction = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    direction.copy(vertex).normalize();

    // Coherent, low-frequency deformation keeps the stones tactile without
    // turning the surface into a field of disconnected triangular shards.
    const broadNoise =
      Math.sin(direction.x * 3.1 + seed * 0.73) * 0.045 +
      Math.cos(direction.z * 3.8 - seed * 0.46) * 0.035 +
      Math.sin((direction.x + direction.y) * 4.4 + seed * 0.91) * 0.022;
    const surfaceNoise = Math.sin(direction.x * 7.3 + direction.z * 4.7 + seed * 0.41) * 0.012;
    const variation = 1 + broadNoise + surfaceNoise;
    vertex.copy(direction.multiplyScalar(variation));
    vertex.x *= 1 + Math.sin(direction.y * 2.6 + seed * 0.37) * 0.025;
    vertex.y *= 0.92;
    vertex.z *= 0.96 + Math.cos(direction.x * 2.9 - seed * 0.41) * 0.02;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createStone(
  index: number,
  count: number,
  palette: ResolvedPalette,
  quality: "low" | "high",
): Stone {
  const radius = 0.94 - index * 0.075;
  const seed = index * 17.31 + (quality === "high" ? 3 : 1);
  const geometry = createStoneGeometry(seed, quality);
  const tint =
    index === count - 1
      ? palette.accent.clone().lerp(palette.stoneLight, 0.28)
      : index % 3 === 0
        ? palette.stoneLight
        : index % 3 === 1
          ? palette.stone
          : palette.stoneDark;
  const material = new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.72 + index * 0.018,
    metalness: 0,
    clearcoat: 0.07,
    clearcoatRoughness: 0.86,
    sheen: 0.08,
    sheenColor: palette.stoneLight,
    sheenRoughness: 0.9,
    emissive: palette.accent,
    emissiveIntensity: 0.018,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  const angle = (index / count) * TAU + 0.42;
  const baseY = -1.34 + index * 0.56;
  const basePosition = new THREE.Vector3(
    Math.cos(angle) * (0.05 + (index % 2) * 0.08),
    baseY,
    Math.sin(angle) * (0.05 + (index % 2) * 0.08),
  );
  const scatterPosition = new THREE.Vector3(
    Math.cos(angle) * (0.75 + index * 0.08),
    baseY + (index - 2) * 0.62,
    Math.sin(angle) * (0.62 + index * 0.1),
  );
  const baseRotation = new THREE.Euler(
    -0.09 + hash(index, 4) * 0.18,
    angle + hash(index, 7) * 0.6,
    -0.08 + hash(index, 8) * 0.16,
  );
  const scale = new THREE.Vector3(
    radius * (1.14 - index * 0.03),
    radius * (0.63 + (index % 2) * 0.045),
    radius * (0.98 - index * 0.025),
  );
  mesh.scale.copy(scale);
  group.position.copy(scatterPosition);
  group.rotation.copy(baseRotation);

  return {
    group,
    mesh,
    material,
    basePosition,
    scatterPosition,
    baseRotation,
    scale,
    phase: hash(index, 15) * TAU,
  };
}

function createFallback(canvas: HTMLCanvasElement, palette: ResolvedPalette, progress: number): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;

  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  context.clearRect(0, 0, width, height);

  const scale = Math.min(width, height) / 560;
  const cx = width * 0.5;
  const cy = height * (0.56 - progress * 0.035);
  const stones = [
    { x: 0, y: 0, rx: 124, ry: 42, color: palette.stoneDark },
    { x: -7, y: -47, rx: 103, ry: 36, color: palette.stone },
    { x: 13, y: -91, rx: 84, ry: 31, color: palette.stoneLight },
    { x: -5, y: -130, rx: 64, ry: 25, color: palette.stone },
    { x: 9, y: -163, rx: 43, ry: 19, color: palette.accentSoft },
  ];

  context.save();
  context.translate(cx, cy);
  context.scale(scale, scale);
  context.globalAlpha = 0.22;
  context.fillStyle = `#${palette.shadow.getHexString()}`;
  context.beginPath();
  context.ellipse(0, 20, 168, 28, 0, 0, TAU);
  context.fill();
  context.globalAlpha = 1;

  for (const stone of stones) {
    const gradient = context.createRadialGradient(stone.x - stone.rx * 0.24, stone.y - stone.ry * 0.6, 4, stone.x, stone.y, stone.rx);
    const light = `#${stone.color.clone().offsetHSL(0, 0, 0.1).getHexString()}`;
    const dark = `#${stone.color.clone().offsetHSL(0, 0, -0.12).getHexString()}`;
    gradient.addColorStop(0, light);
    gradient.addColorStop(0.7, `#${stone.color.getHexString()}`);
    gradient.addColorStop(1, dark);
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(stone.x, stone.y, stone.rx, stone.ry, stone.x * 0.002, 0, TAU);
    context.fill();
  }
  context.restore();
  return true;
}

/**
 * A full-bleed, transparent Three.js cairn for hero surfaces. It is deliberately
 * unframed: the host page supplies the photograph, paper, or color field behind
 * it, while the stones provide a tactile depth cue and a scroll narrative.
 */
export function CairnScene({
  className,
  style,
  portal = "seeker",
  scrollProgress = 1,
  palette,
  quality = "high",
  ...rest
}: CairnSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressSourceRef = useRef(scrollProgress);
  progressSourceRef.current = scrollProgress;
  const requestRenderRef = useRef<(() => void) | null>(null);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const paletteKey = [
    palette?.accent,
    palette?.accentSoft,
    palette?.stone,
    palette?.stoneLight,
    palette?.stoneDark,
    palette?.shadow,
    palette?.background,
  ].map((value) => (value instanceof THREE.Color ? value.getHexString() : String(value ?? ""))).join("|");

  useEffect(() => {
    if (typeof scrollProgress === "number") requestRenderRef.current?.();
  }, [scrollProgress]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let disposed = false;
    let reduced = prefersReduced();
    let unsubscribeClock: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let fallback = false;
    let visible = true;
    let lastElapsed = 0;

    const readProgress = () => {
      const source = progressSourceRef.current;
      return clamp01(typeof source === "number" ? source : source.current);
    };

    const resolved = resolvePalette(host, portal, paletteRef.current);
    const root = new THREE.Group();
    root.position.y = 0.08;
    root.scale.setScalar(0.92);
    const stones: Stone[] = [];
    const stoneCount = quality === "high" ? 5 : 4;
    const particleCount = quality === "high" ? 42 : 22;

    const setReady = (value: boolean) => {
      const marker = String(value);
      host.dataset.canvasReady = marker;
      canvas.dataset.canvasReady = marker;
    };
    setReady(false);

    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || host.clientWidth || window.innerWidth));
      const height = Math.max(1, Math.round(rect.height || host.clientHeight || window.innerHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (renderer && camera) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.position.z = 8.2 * Math.max(1, Math.min(1.35, 0.72 / camera.aspect));
        camera.updateProjectionMatrix();
      }
      if (fallback && createFallback(canvas, resolved, readProgress())) setReady(true);
    };

    const createRenderer = (): THREE.WebGLRenderer | null => {
      try {
        const contextAttributes: WebGLContextAttributes = {
          alpha: true,
          antialias: quality === "high",
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        };
        const instance = new THREE.WebGLRenderer({
          canvas,
          ...contextAttributes,
        });
        instance.outputColorSpace = THREE.SRGBColorSpace;
        instance.toneMapping = THREE.ACESFilmicToneMapping;
        instance.toneMappingExposure = 1.08;
        instance.setClearColor(resolved.background, 0);
        instance.shadowMap.enabled = true;
        instance.shadowMap.type = THREE.PCFShadowMap;
        return instance;
      } catch {
        return null;
      }
    };

    renderer = createRenderer();
    if (!renderer) {
      fallback = true;
      host.dataset.canvasFallback = "true";
      canvas.dataset.canvasFallback = "true";
      updateSize();
    } else {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(0, 0.12, 8.2);
      camera.lookAt(0, 0.05, 0);

      const hemi = new THREE.HemisphereLight(resolved.stoneLight, resolved.shadow, 1.85);
      const key = new THREE.DirectionalLight(resolved.stoneLight, 2.8);
      key.position.set(-3.5, 5.6, 5.4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 18;
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 5;
      key.shadow.camera.bottom = -4;
      const fill = new THREE.DirectionalLight(resolved.accent, 0.9);
      fill.position.set(4.6, 1.8, 2.5);
      const rim = new THREE.PointLight(resolved.accentSoft, 1.35, 8, 2);
      rim.position.set(-2.8, 1.2, -2.6);
      scene.add(hemi, key, fill, rim, root);

      for (let index = 0; index < stoneCount; index += 1) {
        const stone = createStone(index, stoneCount, resolved, quality);
        stones.push(stone);
        root.add(stone.group);
      }

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.75, quality === "high" ? 64 : 32),
        new THREE.MeshBasicMaterial({
          color: resolved.shadow,
          transparent: true,
          opacity: 0.23,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, -1.72, 0);
      shadow.scale.set(1.35, 0.42, 1);
      root.add(shadow);

      const orbit = new THREE.Mesh(
        new THREE.TorusGeometry(1.64, 0.012, 8, quality === "high" ? 128 : 64),
        new THREE.MeshBasicMaterial({
          color: resolved.accent,
          transparent: true,
          opacity: 0.33,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      orbit.rotation.set(0.92, 0.12, -0.26);
      orbit.position.y = 0.08;
      root.add(orbit);

      const particlePositions = new Float32Array(particleCount * 3);
      for (let index = 0; index < particleCount; index += 1) {
        const angle = hash(index, 32) * TAU;
        const radius = 1.55 + hash(index, 33) * 1.1;
        particlePositions[index * 3] = Math.cos(angle) * radius;
        particlePositions[index * 3 + 1] = -1.3 + hash(index, 34) * 3.15;
        particlePositions[index * 3 + 2] = Math.sin(angle) * radius * 0.56;
      }
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
      const particles = new THREE.Points(
        particleGeometry,
        new THREE.PointsMaterial({
          color: resolved.accent,
          size: quality === "high" ? 0.028 : 0.022,
          transparent: true,
          opacity: 0.44,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        }),
      );
      root.add(particles);

      const pointer = new THREE.Vector2();
      const pointerTarget = new THREE.Vector2();
      const onPointerMove = (event: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const withinHost =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (!withinHost) {
          pointerTarget.set(0, 0);
          return;
        }
        pointerTarget.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -(((event.clientY - rect.top) / rect.height) * 2 - 1),
        );
        pointerTarget.x = Math.max(-1, Math.min(1, pointerTarget.x));
        pointerTarget.y = Math.max(-1, Math.min(1, pointerTarget.y));
      };
      const onPointerLeave = () => pointerTarget.set(0, 0);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave, { passive: true });

      const applyFrame = (time: number) => {
        const progress = readProgress();
        const assembly = smoothstep(0.28 + progress * 0.72);
        const seconds = time * 0.001;
        const motion = reduced ? 0 : 1;
        host.dataset.sceneProgress = progress.toFixed(3);
        pointer.lerp(pointerTarget, reduced ? 1 : 0.075);

        root.position.x = pointer.x * 0.16 * motion;
        root.position.y = 0.08 + pointer.y * 0.11 * motion;
        root.rotation.x = -pointer.y * 0.075 * motion;
        root.rotation.y = (progress - 0.5) * 0.54 + pointer.x * 0.16 * motion;
        root.rotation.z = Math.sin(seconds * 0.28) * 0.012 * motion;

        stones.forEach((stone, index) => {
          const float = Math.sin(seconds * 0.65 + stone.phase) * 0.035 * motion;
          stone.group.position.lerpVectors(stone.scatterPosition, stone.basePosition, assembly);
          stone.group.position.y += float;
          stone.group.rotation.set(
            stone.baseRotation.x + Math.sin(seconds * 0.34 + stone.phase) * 0.018 * motion,
            stone.baseRotation.y + Math.cos(seconds * 0.3 + stone.phase) * 0.035 * motion + (1 - assembly) * 0.2,
            stone.baseRotation.z + Math.sin(seconds * 0.28 + index) * 0.014 * motion,
          );
          const hover = Math.max(0, 1 - Math.hypot(pointer.x * 0.72, pointer.y * 0.72));
          stone.material.emissiveIntensity = 0.014 + hover * 0.026 * motion;
        });
        orbit.rotation.y = seconds * 0.08 * motion + progress * 0.8;
        orbit.rotation.z = -0.26 + pointer.x * 0.12 * motion;
        particles.rotation.y = seconds * 0.035 * motion;
        particles.rotation.x = pointer.y * 0.05 * motion;
      };

      const renderFrame = (time: number) => {
        if (disposed || !renderer || !scene || !camera) return;
        applyFrame(time);
        renderer.render(scene, camera);
        if (host.dataset.canvasReady !== "true") setReady(true);
      };

      const requestRender = () => {
        if (disposed || fallback) return;
        renderFrame(lastElapsed);
      };
      requestRenderRef.current = requestRender;

      const startClock = () => {
        if (reduced || !visible || unsubscribeClock) return;
        unsubscribeClock = subscribe((_dt, elapsed) => {
          lastElapsed = elapsed;
          renderFrame(elapsed);
        });
      };
      const stopClock = () => {
        unsubscribeClock?.();
        unsubscribeClock = null;
      };

      const onReducedChange = (value: boolean) => {
        reduced = value;
        if (reduced) stopClock();
        else startClock();
        requestRender();
      };
      const unsubscribeReduced = onReducedMotionChange(onReducedChange);

      updateSize();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          updateSize();
          requestRender();
        });
        resizeObserver.observe(host);
      } else {
        window.addEventListener("resize", updateSize, { passive: true });
      }
      if (typeof IntersectionObserver !== "undefined") {
        intersectionObserver = new IntersectionObserver(
          ([entry]) => {
            visible = entry?.isIntersecting ?? false;
            if (visible) {
              requestRender();
              startClock();
            } else {
              stopClock();
            }
          },
          { rootMargin: "12% 0px" },
        );
        intersectionObserver.observe(host);
      }

      requestRender();
      startClock();

      return () => {
        disposed = true;
        requestRenderRef.current = null;
        stopClock();
        unsubscribeReduced();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerleave", onPointerLeave);
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener("resize", updateSize);
        intersectionObserver?.disconnect();
        scene?.traverse((object) => {
          const drawable = object as THREE.Mesh | THREE.Points;
          if ("geometry" in drawable && drawable.geometry) drawable.geometry.dispose();
          const material = drawable.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else if (material) material.dispose();
        });
        // `dispose()` releases GPU resources. Do not force the context here:
        // React StrictMode intentionally mounts effects twice in development,
        // and a forced loss would make the second setup unable to acquire a
        // WebGL context or its 2D fallback on the same canvas.
        renderer?.dispose();
        renderer = null;
        scene = null;
        camera = null;
      };
    }

    // A 2D fallback still gets a real first frame and remains legible when a
    // browser, privacy mode, or test environment blocks WebGL entirely.
    const renderFallback = () => {
      if (fallback) {
        updateSize();
      }
    };
    requestRenderRef.current = renderFallback;
    renderFallback();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(renderFallback);
      resizeObserver.observe(host);
    } else {
      window.addEventListener("resize", renderFallback, { passive: true });
    }

    return () => {
      requestRenderRef.current = null;
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener("resize", renderFallback);
    };
  }, [paletteKey, portal, quality]);

  return (
    <div
      {...rest}
      ref={hostRef}
      aria-hidden="true"
      data-cairn-scene={portal}
      data-canvas-ready="false"
      data-scene-progress="0.000"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={style}
    >
      <canvas ref={canvasRef} className="block size-full" data-canvas-ready="false" />
    </div>
  );
}

export default CairnScene;
