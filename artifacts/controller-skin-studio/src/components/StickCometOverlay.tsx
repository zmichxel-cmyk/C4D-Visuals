import { useRef, useEffect } from "react";

interface Props {
  color: string;
  speed: number; // seconds per revolution
  phaseOffset?: number; // radians — offsets the starting angle so left/right sticks don't move in lockstep
}

// Renders inside a container that's been enlarged 24% beyond the thumbstick's
// own box (see COMET_INSET_PCT in ControllerPreview.tsx) so the ring can sit
// right at the stick's original rim with room for the glow to bleed outward
// without being clipped by the canvas bounds. Orbit radius is scaled back
// down by the same factor to land exactly on that original edge.
const CONTAINER_SCALE = 1.24;

export function StickCometOverlay({ color, speed, phaseOffset = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  const speedRef = useRef(speed);
  const phaseOffsetRef = useRef(phaseOffset);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { phaseOffsetRef.current = phaseOffset; }, [phaseOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    let last = performance.now();

    const draw = (w: number, h: number, time: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const R = (Math.min(w, h) / 2) / CONTAINER_SCALE;
      const period = Math.max(speedRef.current, 0.5);
      const headAngle = (time / period) * Math.PI * 2 - Math.PI / 2 + phaseOffsetRef.current;

      const col = colorRef.current;
      const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);

      // Continuous tapered tail — a polyline of overlapping round-capped
      // segments (not discrete dots), extended and eased so it fades out
      // gradually to nothing instead of ending abruptly.
      const tailSteps = 56;
      const tailSpan = Math.PI * 1.35;
      let prevX = cx + Math.cos(headAngle) * R, prevY = cy + Math.sin(headAngle) * R;
      ctx.lineCap = "round";
      for (let i = 1; i <= tailSteps; i++) {
        const f = i / tailSteps;
        const ang = headAngle - f * tailSpan;
        const px = cx + Math.cos(ang) * R, py = cy + Math.sin(ang) * R;
        const fade = Math.pow(1 - f, 2.6);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(px, py);
        ctx.lineWidth = 3.6 * Math.pow(1 - f, 1.3);
        ctx.strokeStyle = `rgba(${r},${g},${b},${fade})`;
        ctx.stroke();
        prevX = px; prevY = py;
      }

      // LED head — pulses independently of the revolution, colored to match
      // the picked color, with a soft radial-gradient glow (fades smoothly
      // to transparent instead of a hard-edge blob) plus a glare highlight.
      const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * 1.6);
      const hx = cx + Math.cos(headAngle) * R, hy = cy + Math.sin(headAngle) * R;
      const headR = 3.0 + 0.8 * pulse;

      const glowR = headR * 4.5;
      const glowGrd = ctx.createRadialGradient(hx, hy, 0, hx, hy, glowR);
      glowGrd.addColorStop(0, `rgba(${r},${g},${b},${0.55 + 0.3 * pulse})`);
      glowGrd.addColorStop(0.45, `rgba(${r},${g},${b},${0.18 + 0.12 * pulse})`);
      glowGrd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glowGrd;
      ctx.beginPath(); ctx.arc(hx, hy, glowR, 0, Math.PI * 2); ctx.fill();

      ctx.beginPath();
      ctx.arc(hx, hy, headR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},1)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(hx - headR * 0.35, hy - headR * 0.35, headR * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.75 + 0.2 * pulse})`;
      ctx.fill();
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (canvas.width > 0 && canvas.height > 0) draw(canvas.width, canvas.height, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Sizing is handled independently of the draw loop above (rAF is
    // suspended entirely for backgrounded/inactive tabs, which would
    // otherwise leave the canvas stuck at its default 300x150 buffer).
    // ResizeObserver is the primary mechanism; a synchronous read at mount
    // and a low-frequency interval both backstop cases where the observer's
    // callback doesn't fire promptly (seen for elements nested inside a
    // transform-style:preserve-3d ancestor — the stick's tilt container).
    const applySize = (width: number, height: number) => {
      const w = Math.round(width), h = Math.round(height);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      applySize(width, height);
    });

    // NOTE: intentionally offsetWidth/offsetHeight here, NOT
    // getBoundingClientRect(). getBoundingClientRect() reports the element's
    // PROJECTED on-screen box — inside a 3D-rotated ancestor (the stick's
    // tilt container), that's the foreshortened, post-perspective rect,
    // which shrinks and goes non-square as the stick tilts. Sizing the
    // canvas off of that made the ring visibly shrink/oval out and "snap"
    // back each time this fallback fired (every 500ms) depending on
    // whatever angle the stick happened to be at that instant.
    // offsetWidth/offsetHeight reflect the untransformed CSS layout box,
    // exactly like ResizeObserver's own contentRect already correctly does.
    let intervalId = 0;
    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
      applySize(canvas.parentElement.offsetWidth, canvas.parentElement.offsetHeight);
      intervalId = window.setInterval(() => {
        if (!canvas.parentElement) return;
        applySize(canvas.parentElement.offsetWidth, canvas.parentElement.offsetHeight);
      }, 500);
    }

    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.clearInterval(intervalId); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

export { CONTAINER_SCALE as COMET_CONTAINER_SCALE };
