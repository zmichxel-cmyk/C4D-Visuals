import { useRef, useEffect } from "react";

interface Props {
  color: string;
  speed: number; // revolution / arc frequency multiplier
  phaseOffset?: number; // radians — desyncs left/right so they don't crackle in lockstep
}

// Renders inside a container enlarged 40% beyond the thumbstick's own box
// so bolts have room to jump outward without being clipped by the canvas
// bounds. Mirrors StickCometOverlay.tsx's own inset pattern, just with a
// bigger margin since arcing bolts reach further than the comet's trail.
const CONTAINER_SCALE = 1.4;

function hexToRgb(hex: string): [number, number, number] {
  if (!hex.startsWith("#") || hex.length !== 7) return [77, 226, 255];
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// A jagged path between two points via recursive midpoint displacement —
// the classic procedural-lightning technique. Returns a flat list of
// {x,y} points tracing the bolt.
function buildBoltPath(x0: number, y0: number, x1: number, y1: number, roughness: number, depth: number): { x: number; y: number }[] {
  if (depth <= 0) return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const disp = (Math.random() - 0.5) * roughness;
  const midX = mx + nx * disp, midY = my + ny * disp;
  const left = buildBoltPath(x0, y0, midX, midY, roughness * 0.55, depth - 1);
  const right = buildBoltPath(midX, midY, x1, y1, roughness * 0.55, depth - 1);
  return [...left, ...right.slice(1)];
}

type Arc = { path: { x: number; y: number }[]; life: number; maxLife: number; width: number };

export function StickElectricOverlay({ color, speed, phaseOffset = 0 }: Props) {
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

    // Radial crackle jitter, one persistent value per point around the
    // circle — random-walked each frame so the current's own path stays
    // jagged/alive instead of a perfect circle, same idea as before, just
    // now only a trailing ARC of these gets drawn (comet-style) instead of
    // the full 360° ring being lit at once.
    const ptN = 40;
    const jitter = new Array(ptN).fill(0);
    // Per-bucket jaggedness intensity — its OWN slow random walk that scales
    // how hard `jitter` swings at that point around the ring, so some
    // stretches of the trail read as calm/smooth and others as violently
    // jagged, instead of one uniform amount of crackle everywhere.
    const jitterAmp = new Array(ptN).fill(1);
    // Per-bucket thickness — same idea, a slow drift so some sections of
    // the trail sit consistently thicker/thinner rather than the width
    // just flickering randomly frame to frame with no spatial coherence.
    const widthNoise = new Array(ptN).fill(1);

    // Persistent noise value for the trail's brightness pulse — random-walked
    // each frame like the jitter above, so the pulse isn't a perfectly
    // repeating sine wave but drifts and stutters unpredictably.
    let pulseNoise = 0;

    let nextArcAt = 0;
    let nextBigArcAt = 2 + Math.random() * 3;
    const arcs: Arc[] = [];

    const draw = (w: number, h: number, time: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const R = (Math.min(w, h) / 2) / CONTAINER_SCALE;
      const spd = Math.max(speedRef.current, 0.5);
      const col = colorRef.current;
      const [r, g, b] = hexToRgb(col);
      const phase = phaseRef.current;
      const period = spd; // seconds per revolution, same convention as the comet

      const headAngle = (time / period) * Math.PI * 2 - Math.PI / 2 + phase;
      const tailSpan = Math.PI * 1.5; // trailing arc length behind the head

      // lineCap "round" on a trail drawn as many short independent
      // segments is exactly what read as "a bunch of little balls" — round
      // caps at BOTH ends of every tiny segment overlap into beads. "butt"
      // caps abut cleanly since consecutive segments share exact endpoints
      // (this is also why the comet's own trail, which never sets lineCap
      // at all and gets canvas's "butt" default, never had this problem).
      ctx.lineJoin = "round";
      ctx.lineCap = "butt";

      // Walk the jitter values once per frame (indexed by angle bucket so
      // the crackle stays spatially stable as the head sweeps past). The
      // amplitude and thickness noise both wander slowly on their own so
      // patches of the ring drift between calm/thin and wild/thick instead
      // of every bucket behaving identically.
      for (let i = 0; i < ptN; i++) {
        jitterAmp[i] += (Math.random() - 0.5) * 0.15;
        jitterAmp[i] = Math.max(0.35, Math.min(2.4, jitterAmp[i]));
        jitter[i] += (Math.random() - 0.5) * 2.2 * jitterAmp[i];
        jitter[i] *= 0.85;

        widthNoise[i] += (Math.random() - 0.5) * 0.12;
        widthNoise[i] = Math.max(0.45, Math.min(1.9, widthNoise[i]));
      }

      // Trailing arc, comet-style: segments from the head backward, each
      // fading with distance from the head instead of the whole ring being
      // uniformly lit. Two extra layers of life: an overall brightness
      // pulse (fast, flickery — not the slow revolution) and per-segment
      // random flicker on top of that, so the current itself looks alive
      // instead of a uniformly-lit static shape.
      pulseNoise += (Math.random() - 0.5) * 1.8;
      pulseNoise = Math.max(-1, Math.min(1, pulseNoise * 0.9));
      const trailPulse = Math.max(0.25, 0.75 + 0.3 * Math.sin(time * Math.PI * 2 * 3.1 + phase * 1.7) + 0.35 * pulseNoise);
      const steps = 44;
      let prevX = 0, prevY = 0, havePrev = false;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps; // 0 = head, 1 = tail end
        const ang = headAngle - f * tailSpan;
        const bucket = ((Math.floor((ang / (Math.PI * 2)) * ptN) % ptN) + ptN) % ptN;
        const rr = R + jitter[bucket];
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
        if (havePrev) {
          const flicker = 0.7 + Math.random() * 0.6;
          const fade = Math.pow(1 - f, 1.6) * trailPulse * flicker;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(px, py);
          ctx.lineWidth = (3.4 * (1 - f * 0.6)) * widthNoise[bucket] * (0.85 + Math.random() * 0.35);
          ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(1, 0.95 * fade)})`;
          ctx.shadowBlur = 10 * fade;
          ctx.shadowColor = `rgba(${r},${g},${b},${Math.min(1, 0.85 * fade)})`;
          ctx.stroke();
        }
        prevX = px; prevY = py; havePrev = true;
      }
      ctx.shadowBlur = 0;

      // --- Sporadic arcing bolts arcing INWARD onto the stick's face (not
      // outward past the rim), no head marker/ball anymore, frequency
      // pulled back down, with MITER joins instead of round (a round join
      // on a sharp zigzag corner is what read as beads on the bolts too). ---
      if (time > nextArcAt) {
        const startAng = Math.random() * Math.PI * 2;
        const x0 = cx + Math.cos(startAng) * R, y0 = cy + Math.sin(startAng) * R;
        const reach = R * (0.25 + Math.random() * 0.4);
        const endAng = startAng + (Math.random() - 0.5) * 0.7;
        const innerR = Math.max(R * 0.15, R - reach);
        const x1 = cx + Math.cos(endAng) * innerR, y1 = cy + Math.sin(endAng) * innerR;
        arcs.push({
          path: buildBoltPath(x0, y0, x1, y1, R * 0.22, 6),
          life: 0,
          maxLife: 0.09 + Math.random() * 0.07,
          width: 1.0 + Math.random() * 1.0,
        });
        nextArcAt = time + (0.3 + Math.random() * 0.9) / spd;
      }

      // --- Occasional BIG bolt that reaches all the way across the stick's
      // face, rim to rim — rarer and thicker/brighter than the regular
      // inward bolts, for a "whoa, that one was different" moment. ---
      if (time > nextBigArcAt) {
        const startAng = Math.random() * Math.PI * 2;
        const x0 = cx + Math.cos(startAng) * R, y0 = cy + Math.sin(startAng) * R;
        // Wider spread on where it lands, and the reach itself varies too —
        // not always a clean rim-to-rim diameter — so each big bolt takes a
        // genuinely different path instead of a scaled copy of the last one.
        const endAng = startAng + Math.PI + (Math.random() - 0.5) * 1.1;
        const endR = R * (0.75 + Math.random() * 0.25);
        const x1 = cx + Math.cos(endAng) * endR, y1 = cy + Math.sin(endAng) * endR;
        const roughness = R * (0.3 + Math.random() * 0.28);
        const mainPath = buildBoltPath(x0, y0, x1, y1, roughness, 7);
        const maxLife = 0.12 + Math.random() * 0.09;
        const width = 2.1 + Math.random() * 1.6;
        arcs.push({ path: mainPath, life: 0, maxLife, width });

        // Sometimes fork into a second branch partway along the main bolt,
        // like a real lightning strike splitting off.
        if (Math.random() < 0.55) {
          const splitIdx = Math.floor(mainPath.length * (0.3 + Math.random() * 0.35));
          const sp = mainPath[splitIdx];
          const branchAng = Math.atan2(sp.y - cy, sp.x - cx) + (Math.random() - 0.5) * 1.8;
          const branchLen = R * (0.3 + Math.random() * 0.4);
          const bx = sp.x + Math.cos(branchAng) * branchLen;
          const by = sp.y + Math.sin(branchAng) * branchLen;
          arcs.push({
            path: buildBoltPath(sp.x, sp.y, bx, by, roughness * 0.7, 5),
            life: 0,
            maxLife: maxLife * (0.7 + Math.random() * 0.3),
            width: width * 0.55,
          });
        }

        nextBigArcAt = time + (1.5 + Math.random() * 2.6) / spd;
      }

      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      for (let i = arcs.length - 1; i >= 0; i--) {
        const arc = arcs[i];
        arc.life += 1 / 60;
        if (arc.life >= arc.maxLife) { arcs.splice(i, 1); continue; }
        const fade = 1 - arc.life / arc.maxLife;
        ctx.beginPath();
        arc.path.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.lineWidth = arc.width * 1.8;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.45 * fade})`;
        ctx.shadowBlur = 9;
        ctx.shadowColor = `rgba(${r},${g},${b},${0.75 * fade})`;
        ctx.stroke();
        ctx.lineWidth = arc.width * 0.55;
        ctx.strokeStyle = `rgba(255,255,255,${fade})`;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (canvas.width > 0 && canvas.height > 0) draw(canvas.width, canvas.height, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Sizing decoupled from the draw loop above — ResizeObserver is the
    // primary mechanism, backstopped by a synchronous read at mount plus a
    // low-frequency interval, since rAF alone doesn't reliably fire in a
    // backgrounded tab and ResizeObserver alone has shown gaps for elements
    // nested inside transform-style:preserve-3d ancestors (the stick's tilt
    // container) elsewhere in this app.
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
    // of that made the ring visibly shrink/oval out and "snap" back each
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

export { CONTAINER_SCALE as ELECTRIC_CONTAINER_SCALE };
