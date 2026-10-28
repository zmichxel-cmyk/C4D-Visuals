import { useRef, useEffect } from "react";

interface Props {
  color: string;
  speed: number; // seconds per revolution
  phaseOffset?: number; // radians — desyncs left/right so they don't spin in lockstep
}

// Same comet-style revolving head + trail as StickCometOverlay, but the head
// also throws off sparks as it travels — like the crackling embers flung
// off the rim of a Doctor Strange portal ring. Container enlarged a bit more
// than the plain comet's own margin (COMET_CONTAINER_SCALE) since sparks fly
// outward past where the trail alone ever reached.
const CONTAINER_SCALE = 1.35;

function hexToRgb(hex: string): [number, number, number] {
  if (!hex.startsWith("#") || hex.length !== 7) return [255, 170, 70];
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number };

export function StickSparkOverlay({ color, speed, phaseOffset = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  const speedRef = useRef(speed);
  const phaseRef = useRef(phaseOffset);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { phaseRef.current = phaseOffset; }, [phaseOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    let last = performance.now();
    const sparks: Spark[] = [];

    const draw = (w: number, h: number, time: number, dt: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const R = (Math.min(w, h) / 2) / CONTAINER_SCALE;
      const period = Math.max(speedRef.current, 0.5);
      const headAngle = (time / period) * Math.PI * 2 - Math.PI / 2 + phaseRef.current;
      const col = colorRef.current;
      const [r, g, b] = hexToRgb(col);

      // Comet trail — identical technique to StickCometOverlay's own tail.
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

      // LED head — same pulsing glow + glare as the comet.
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

      // Spark emission — thrown off mostly TANGENT to the head's direction
      // of travel (matching how a portal's edge flings embers along its own
      // rotation) with a splash of outward randomness so they don't all fly
      // in a single perfect line.
      const tangentAng = headAngle + Math.PI / 2;
      const emitCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < emitCount; i++) {
        const spread = (Math.random() - 0.5) * 2.2;
        const ang = tangentAng + spread;
        const launchSpd = R * (0.9 + Math.random() * 1.6);
        sparks.push({
          x: hx, y: hy,
          vx: Math.cos(ang) * launchSpd, vy: Math.sin(ang) * launchSpd,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.4,
          size: 1.1 + Math.random() * 1.6,
        });
      }

      // Update + draw each spark as a short streak, drawn from its previous
      // position to its new one. Friction slows it down and a gentle pull
      // back toward the stick's center curls the tail off, the same way the
      // reference portal's sparks arc back in as they fizzle instead of
      // flying off in dead-straight lines.
      ctx.lineCap = "round";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        if (s.life >= s.maxLife) { sparks.splice(i, 1); continue; }
        s.vx *= 0.93;
        s.vy *= 0.93;
        const toCx = cx - s.x, toCy = cy - s.y;
        const toLen = Math.hypot(toCx, toCy) || 1;
        s.vx += (toCx / toLen) * 5 * dt * R;
        s.vy += (toCy / toLen) * 5 * dt * R;
        const prevSX = s.x, prevSY = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const fade = 1 - s.life / s.maxLife;
        ctx.beginPath();
        ctx.moveTo(prevSX, prevSY);
        ctx.lineTo(s.x, s.y);
        ctx.lineWidth = s.size * fade;
        ctx.strokeStyle = `rgba(${r},${g},${b},${fade})`;
        ctx.shadowBlur = 5 * fade;
        ctx.shadowColor = `rgba(${r},${g},${b},${0.7 * fade})`;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (canvas.width > 0 && canvas.height > 0) draw(canvas.width, canvas.height, t, dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Sizing decoupled from the draw loop above — same ResizeObserver +
    // synchronous fallback + low-frequency interval backstop pattern used
    // by StickCometOverlay.tsx and StickElectricOverlay.tsx.
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
    // NOTE: intentionally offsetWidth/offsetHeight, NOT
    // getBoundingClientRect(). getBoundingClientRect() reports the
    // PROJECTED on-screen box — inside the stick's 3D-rotated tilt
    // container, that's the foreshortened, post-perspective rect, which
    // shrinks and goes non-square as the stick tilts. Sizing the canvas off
    // of that made the trail visibly shrink/oval out and "snap" back each
    // time this fallback fired (every 500ms) depending on whatever angle
    // the stick happened to be at that instant. offsetWidth/offsetHeight
    // reflect the untransformed CSS layout box, exactly like
    // ResizeObserver's own contentRect already correctly does.
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

export { CONTAINER_SCALE as SPARK_CONTAINER_SCALE };
