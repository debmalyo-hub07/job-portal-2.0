import { useEffect, useRef } from "react";

import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shader";
import { subscribe } from "@/lib/motion/clock";
import { prefersReduced } from "@/lib/motion/reducedMotion";
import { readOklchVar } from "./oklch";

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

    // Resolve the portal signal once per paint from the element's ancestors —
    // the same through-the-browser route contrast.mjs uses, so the shader and
    // the CSS agree by construction. A null here (unsupported syntax) renders
    // the paper colour, which is indistinguishable from a background that is
    // simply absent.
    const host = canvas.closest("[data-portal]") ?? canvas;
    const paper = readOklchVar(host, "--paper") ?? { r: 255, g: 255, b: 255 };
    const signal = readOklchVar(host, "--signal");

    // A reduced-motion change mid-session, not just at mount.
    const reduced = prefersReduced();

    let unsub: (() => void) | null = null;
    if (!reduced && signal) {
      unsub = subscribe((_dt, elapsed) => {
        gl.uniform2f(loc.resolution, canvas.width, canvas.height);
        gl.uniform1f(loc.time, elapsed);
        gl.uniform3f(loc.signal, signal.r / 255, signal.g / 255, signal.b / 255);
        gl.uniform3f(loc.paper, paper.r / 255, paper.g / 255, paper.b / 255);
        gl.uniform1f(loc.amplitude, amplitudeRef.current);
        if (textBandRef.current) {
          gl.uniform2f(loc.textBand, textBandRef.current[0], textBandRef.current[1]);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      });
    }

    return () => {
      ro.disconnect();
      unsub?.();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [ref, active]);
}
