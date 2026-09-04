import { useEffect, useRef } from "react";

import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shader";
import { subscribe } from "@/lib/motion/clock";
import { prefersReduced } from "@/lib/motion/reducedMotion";
import { readOklchVar } from "./oklch";

/** The ground the field paints on, and the measured budget that comes with it. */
export type ShaderGround = "paper" | "media";

const GROUND: Record<
  ShaderGround,
  { token: string; ceiling: number; fallback: { r: number; g: number; b: number } }
> = {
  // The budgets and their measurements are documented in shader.ts, beside the
  // uniform that consumes them. These numbers only route each ground to its own.
  //
  // The fallback is the colour painted when the ground token cannot be parsed —
  // a path a real browser never takes, since --paper and --media-shade are
  // plain oklch literals, but one that must still look like its ground: white
  // behind a flash of a dark panel would be worse than no field at all.
  paper: { token: "--paper", ceiling: 0.12, fallback: { r: 255, g: 255, b: 255 } },
  media: { token: "--media-shade", ceiling: 0.3, fallback: { r: 16, g: 14, b: 12 } },
};

/**
 * Mounts the fragment shader on a full-bleed canvas that fills its parent.
 *
 * The parent is expected to be `relative` — the component only paints, it never
 * asks for its own layer. All sizing, placement and the off-screen pause come
 * from the caller, because the caller knows whether its section is visible and
 * the shader does not. The contrast mask lives in GLSL (see shader.ts), so
 * nothing downstream can composite it away.
 *
 * Rendering is driven by the shared clock (`lib/motion/clock.ts`), never by a
 * private rAF. One frame drives the whole application, so the shader can never
 * drift out of phase with a reveal or a counter.
 *
 * The return of this function is deliberately nothing — the canvas owns its
 * context and needs no imperative handle. A caller that wants to inspect the
 * canvas (tests) reaches `ref` from the hook.
 */
export function useShader(
  ref: React.RefObject<HTMLCanvasElement | null>,
  amplitude: number,
  textBand: [number, number] | null,
  active: boolean,
  ground: ShaderGround = "paper",
): void {
  const amplitudeRef = useRef(amplitude);
  const textBandRef = useRef(textBand);
  amplitudeRef.current = amplitude;
  textBandRef.current = textBand;

  useEffect(() => {
    // `active` is the off-screen pause. It belongs in the dependency list rather
    // than inside the frame callback: a subscription that opens at mount and
    // merely writes amplitude 0 still holds the shared clock's rAF loop alive
    // and still issues a draw call per frame for a section nobody can see.
    if (!active) return;

    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const loc = {
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      signal: gl.getUniformLocation(program, "uSignal"),
      paper: gl.getUniformLocation(program, "uPaper"),
      amplitude: gl.getUniformLocation(program, "uAmplitude"),
      textBand: gl.getUniformLocation(program, "uTextBand"),
      ceiling: gl.getUniformLocation(program, "uCeiling"),
    };

    // Resolve the portal signal and the ground colour once per paint from the
    // element's ancestors — the same through-the-browser route contrast.mjs
    // uses, so the shader and the CSS agree by construction. A null signal
    // (unsupported syntax, e.g. color-mix()) means no draw at all: with no
    // signal colour the shader would paint toward black, and refusing is the
    // same state as a canvas with no context — transparent, ground showing.
    // The ground token follows the caller's choice; the uniform keeps its
    // `uPaper` name because to the shader it is only ever "the base colour to
    // mix away from".
    const host = canvas.closest("[data-portal]") ?? canvas;
    const paper = readOklchVar(host, GROUND[ground].token) ?? GROUND[ground].fallback;
    const signal = readOklchVar(host, "--signal");

    // A reduced-motion change mid-session, not just at mount.
    const reduced = prefersReduced();

    // The paint call, shared by the static first frame and the clock. Written
    // once because the two must not drift apart: the static frame IS what a
    // reduced-motion user sees, so it is the same field at t=0, not a cheaper
    // approximation of one.
    const draw = (elapsed: number) => {
      gl.uniform2f(loc.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.time, elapsed);
      gl.uniform3f(loc.signal, signal!.r / 255, signal!.g / 255, signal!.b / 255);
      gl.uniform3f(loc.paper, paper.r / 255, paper.g / 255, paper.b / 255);
      gl.uniform1f(loc.amplitude, amplitudeRef.current);
      gl.uniform1f(loc.ceiling, GROUND[ground].ceiling);
      if (textBandRef.current) {
        gl.uniform2f(loc.textBand, textBandRef.current[0], textBandRef.current[1]);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // One static frame before anything else. An alpha:false WebGL canvas that
    // has never been drawn composites as opaque black, so without this a
    // reduced-motion visitor — or anyone whose clock never opens — would see a
    // black rectangle where the ground belongs. With it, the reduced-motion
    // experience is the field held still at t=0: no drift, all of the colour.
    if (signal) draw(0);

    let unsub: (() => void) | null = null;
    if (!reduced && signal) {
      // The clock speaks milliseconds — it accumulates performance.now()
      // deltas. The shader's uTime speaks seconds, and t = uTime * 0.04 in
      // the fragment source assumes it. Handed through raw, the advection
      // runs a thousand times faster than designed: the noise pattern
      // decorrelates frame to frame and the field reads as flickering light
      // — invisible to any single-frame screenshot, which is how it shipped.
      // The conversion happens here, at the boundary, so neither side ever
      // needs to know the other's units; atmosphere.test.tsx pins the
      // per-tick advance this feed may make.
      unsub = subscribe((_dt, elapsed) => draw(elapsed / 1000));
    }

    return () => {
      ro.disconnect();
      unsub?.();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [ref, active, ground]);
}
