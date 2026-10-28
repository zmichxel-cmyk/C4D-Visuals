import { useRef, useEffect } from "react";

export type BodyEffectType = "none" | "pulseGlow" | "particles" | "fire" | "reactive" | "particleBurst" | "reactiveFire";

interface Props {
  // Independent toggles — any combination can be active at once (not
  // mutually exclusive), same pattern as the thumbstick effects.
  pulseGlowEnabled: boolean;
  particlesEnabled: boolean;
  fireEnabled: boolean;
  reactiveEnabled: boolean;
  reactiveFireEnabled: boolean;
  particleBurstEnabled: boolean;
  speed: number;
  intensity: number;
  maskUrl: string;
  glowColor: string;
  fireColor2?: string;
  fireGlowSpeed?: number;
  fireEmberSpeed?: number;
  // Reactive ripple mode
  pressedButtons?: Set<number>;
  buttonPositions?: Record<number, { x:number; y:number; size:number; shape:string; maskSw?:number; maskSh?:number; skinAspect?:number }>;
  reactiveColor?: string;
  reactiveRainbow?: boolean;
  particlesColor?: string;
  particlesRainbow?: boolean;
}

function makeCanvas(maskUrl: string): React.CSSProperties {
  return {
    position: "absolute", inset: 0, width: "100%", height: "100%", display: "block",
    WebkitMaskImage: `url("${maskUrl}")`, maskImage: `url("${maskUrl}")`,
    WebkitMaskSize: "contain", maskSize: "contain",
    WebkitMaskPosition: "center", maskPosition: "center",
    WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
    mixBlendMode: "screen" as const,
  };
}

function makeUnmaskedCanvas(): React.CSSProperties {
  return {
    position: "absolute", inset: 0, width: "100%", height: "100%", display: "block",
    mixBlendMode: "screen" as const,
  };
}

function hexToHsl(hex: string): [number, number, number] {
  if (!hex.startsWith("#") || hex.length !== 7) return [270, 80, 55];
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), l = (max+min)/2;
  if (max === min) return [0, 0, l*100];
  const d = max - min, s = l > 0.5 ? d/(2-max-min) : d/(max+min);
  let h = max === r ? (g-b)/d+(g<b?6:0) : max === g ? (b-r)/d+2 : (r-g)/d+4;
  return [h*60, s*100, l*100];
}

// Traces a rounded-rect path on the given context — used to punch a soft
// inset "hole" out of a filled canvas so only a rim border remains, without
// depending on ctx.roundRect() (not universally available in every renderer
// the exported HTML might run in).
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Returns [halfWidth, halfHeight] of the button's visual press area in canvas pixels.
// For circle/pill/cross buttons hw=hh=(size/200)*w (uniform radius in all directions).
// For rect (touchpad), uses the buttonMask sw/sh percentages which define the actual
// visual extent of the press indicator — giving exact edge per direction when combined
// with the rectEdgeR formula: min(hw/|cosθ|, hh/|sinθ|).
function buttonHWHH(
  pos: { size:number; shape:string; maskSw?:number; maskSh?:number; skinAspect?:number },
  w: number
): [number, number] {
  if (pos.shape === "rect" && pos.maskSw != null && pos.maskSh != null && pos.skinAspect != null) {
    const hw = (pos.maskSw / 200) * w;
    const hh = (pos.maskSh / 200) * (w * pos.skinAspect);
    return [hw, hh];
  }
  const r = (pos.size / 200) * w;
  return [r, r];
}

// ─────────────────────────────────────────────────────────────────────────────
// Particle Burst — types and generator
// A one-shot explosion spawned along the pressed button's edge. Position is a
// closed-form function of age (exponentially-decaying velocity, no per-frame
// mutable state) with an added perpendicular jitter term for organic wander.
// Sizes/drag are drawn from weighted tiers — spark/ember/chunk — the same
// trick the fire embers use to avoid every particle looking identical.
// Velocity is derived from a target travel distance (maxDist = v0/drag)
// scaled to canvas size, rather than picked independently of drag — otherwise
// faster tiers just brake harder and every tier caps out at nearly the same
// tiny radius regardless of controller size, which is why the burst was
// hanging around the button instead of shooting outward.
// ─────────────────────────────────────────────────────────────────────────────
type BurstParticle = {
  x0:number; y0:number; angle:number; vx:number; vy:number;
  size:number; drag:number; hueOff:number;
  jitterAmp:number; jitterFreq:number; jitterPhase:number;
  flickerSpeed:number; flickerPhase:number;
};
type BurstEvent = { startT:number; life:number; particles:BurstParticle[] };

function genBurstParticles(cx:number, cy:number, hw:number, hh:number, canvasMax:number, n:number): BurstParticle[] {
  const arr: BurstParticle[] = [];
  for (let i=0; i<n; i++) {
    // Most particles fan out evenly and stay close to the button. A minority
    // ("wild" ones) get both a wider random angle and extra travel distance,
    // so only some visibly rocket off further/more randomly — not all of them.
    const isWild = Math.random() < 0.22;
    let angle = (i/n)*Math.PI*2 + (Math.random()-0.5)*(Math.PI*2/n);
    if (isWild) angle += (Math.random()-0.5) * 1.6;

    const ca=Math.abs(Math.cos(angle)), sa=Math.abs(Math.sin(angle));
    const edgeR = ca < 1e-9 ? hh : sa < 1e-9 ? hw : Math.min(hw/ca, hh/sa);
    const x0 = cx + Math.cos(angle)*edgeR, y0 = cy + Math.sin(angle)*edgeR;

    // Weighted kind — small/fast, medium, or big/slow — for organic size variety
    const roll = Math.random();
    let size:number, maxDist:number, drag:number;
    if (roll < 0.35) {
      size = 0.8 + Math.random()*1.0;                      // spark — tiny, fast, snaps to a stop
      maxDist = canvasMax * (0.04 + Math.random()*0.05);
      drag = 3.0 + Math.random()*2.0;
    } else if (roll < 0.75) {
      size = 1.8 + Math.random()*2.2;                      // ember — standard
      maxDist = canvasMax * (0.06 + Math.random()*0.06);
      drag = 1.8 + Math.random()*1.4;
    } else {
      size = 3.2 + Math.random()*3.2;                      // chunk — big, slow, lingers
      maxDist = canvasMax * (0.09 + Math.random()*0.08);
      drag = 1.0 + Math.random()*0.8;
    }
    if (isWild) maxDist *= 1.8 + Math.random()*1.4;
    const speed = maxDist * drag;

    arr.push({
      x0, y0, angle, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      size, drag, hueOff: (i/n)*360 + Math.random()*30,
      jitterAmp: 4 + Math.random()*14,
      jitterFreq: 3 + Math.random()*6,
      jitterPhase: Math.random()*Math.PI*2,
      flickerSpeed: 2 + Math.random()*6,
      flickerPhase: Math.random()*Math.PI*2,
    });
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic canvas hook — waits for real dimensions before starting tick
function useCanvas(
  active: boolean,
  deps: unknown[],
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let started = false;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      canvas.width = width;
      canvas.height = height;
      if (!started && width > 0 && height > 0) {
        started = true;
        const tick = () => {
          if (canvas.width > 0 && canvas.height > 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw(ctx, canvas.width, canvas.height);
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    });

    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [active, ...deps]);

  return canvasRef;
}

export function BodyEffectOverlay({ pulseGlowEnabled, particlesEnabled, fireEnabled, reactiveEnabled, reactiveFireEnabled, particleBurstEnabled, speed, intensity, maskUrl, glowColor, fireColor2 = "#ff8800", fireGlowSpeed = 4, fireEmberSpeed = 6, pressedButtons, buttonPositions, reactiveColor = "#ffffff", reactiveRainbow = true, particlesColor = "#ffffff", particlesRainbow = true }: Props) {
  const ss = 1 / Math.max(speed, 0.5);

  // Reactive color refs — updated immediately so running tick loops pick up changes
  const hue1Ref = useRef(hexToHsl(glowColor));
  const hue2Ref = useRef(hexToHsl(fireColor2));
  useEffect(() => { hue1Ref.current = hexToHsl(glowColor); }, [glowColor]);
  useEffect(() => { hue2Ref.current = hexToHsl(fireColor2); }, [fireColor2]);

  // Particles color/rainbow refs — updated immediately so the running tick
  // loop picks up changes without restarting.
  const particlesHueRef = useRef(hexToHsl(particlesColor));
  const particlesRainbowRef = useRef(particlesRainbow);
  useEffect(() => { particlesHueRef.current = hexToHsl(particlesColor); }, [particlesColor]);
  useEffect(() => { particlesRainbowRef.current = particlesRainbow; }, [particlesRainbow]);

  // Raw hex color ref for pulse glow — avoids HSL instability with low-saturation colors
  const glowColorRef = useRef(glowColor);
  useEffect(() => { glowColorRef.current = glowColor; }, [glowColor]);

  // ── Reactive ripple refs ───────────────────────────────────────────────────
  const pressedRef      = useRef<Set<number>>(new Set());
  const prevPressedRef  = useRef<Set<number>>(new Set());
  const btnPosRef = useRef<Record<number, { x:number; y:number; size:number; shape:string; maskSw?:number; maskSh?:number; skinAspect?:number }>>({});
  const ripplesRef      = useRef<{ cx: number; cy: number; startT: number; edgeR: number }[]>([]);
  const reactRealTRef   = useRef(0);
  const reactColorRef   = useRef(reactiveColor);
  const reactRainbowRef = useRef(reactiveRainbow);

  useEffect(() => { pressedRef.current     = pressedButtons  ?? new Set(); }, [pressedButtons]);
  useEffect(() => { btnPosRef.current      = buttonPositions ?? {};         }, [buttonPositions]);
  useEffect(() => { reactColorRef.current  = reactiveColor;                 }, [reactiveColor]);
  useEffect(() => { reactRainbowRef.current = reactiveRainbow;              }, [reactiveRainbow]);

  // ── Particle Burst event store ─────────────────────────────────────────────
  const burstEventsRef = useRef<BurstEvent[]>([]);
  const burstTRef      = useRef(0);

  // ── Reactive Fire event store ──────────────────────────────────────────────
  // lobes give the wave's silhouette a ragged, flame-like edge — several
  // pulsing blobs riding the ring instead of one perfectly smooth circle.
  type FireLobe = { angle:number; sizeMult:number; phase:number; freq:number; hueT:number; };
  const fireBurstEventsRef = useRef<{ cx:number; cy:number; startT:number; life:number; embers:RideEmber[]; lobes:FireLobe[] }[]>([]);
  const fireBurstTRef      = useRef(0);

  // Helper: hex color + alpha → rgba string
  function hexAlpha(hex: string, a: number): string {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ── Pulse Glow ────────────────────────────────────────────────────────────
  // A soft rim hugging the outer edge (built by punching a blurred, inset
  // hole out of a filled canvas, then letting the existing silhouette mask
  // clip it to the controller's real shape). Every cycle, a single wave
  // detaches from that rim — not from the controller's true outer edge —
  // and travels inward to the center. The wave and the rim share one
  // envelope (peaks together, fades to nothing together at the cycle
  // boundary) so the ring reads as part of the same pulse, not a separate
  // effect layered on top.
  const tGlowRef = useRef(0);
  const glowRef = useCanvas(pulseGlowEnabled, [speed, intensity], (ctx, w, h) => {
    tGlowRef.current += 0.016 * ss;
    const cyclePos = tGlowRef.current - Math.floor(tGlowRef.current); // 0→1, repeats each cycle
    const env = Math.sin(cyclePos * Math.PI); // 0 at cycle start/end, 1 at midpoint — shared by rim + ring
    const col = glowColorRef.current;
    const cx = w / 2, cy = h / 2;

    // Rim
    const insetFrac = 0.14;
    const insetX = w * insetFrac, insetY = h * insetFrac;
    const cornerR = Math.min(insetX, insetY) * 1.4;
    const rimAlpha = (0.45 + 0.55 * env) * intensity;
    ctx.save();
    ctx.fillStyle = hexAlpha(col, rimAlpha);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    ctx.filter = `blur(${Math.max(insetX, insetY) * 0.35}px)`;
    ctx.beginPath();
    roundRectPath(ctx, insetX, insetY, w - insetX * 2, h - insetY * 2, cornerR);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill();
    ctx.restore();

    // Sonar ring — emitted from the rim's own inner boundary (not the outer
    // edge), traveling to the center over the cycle. Drawn in a space scaled
    // to the canvas aspect ratio so it hugs the same rounded-rect footprint
    // as the rim instead of an unrelated circle.
    const ringStartR = 1 - insetFrac;
    const ringR = ringStartR * (1 - cyclePos);
    // Punchy right as it detaches from the rim (quick fade-in avoids a hard
    // pop), then steadily dims the whole way in — brightest at the start,
    // fading out by the time it reaches the center.
    const ringFadeIn = Math.min(1, cyclePos / 0.05);
    const centerFalloff = Math.pow(ringR / ringStartR, 1.4);
    const ringAlpha = ringFadeIn * centerFalloff * intensity * 0.95;
    const ringThickness = ringStartR * 0.26;
    if (ringR > 0.02 && ringAlpha > 0.02) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(w / 2, h / 2);
      const rg = ctx.createRadialGradient(0, 0, Math.max(0, ringR - ringThickness), 0, 0, ringR + ringThickness);
      rg.addColorStop(0,   hexAlpha(col, 0));
      rg.addColorStop(0.5, hexAlpha(col, ringAlpha));
      rg.addColorStop(1,   hexAlpha(col, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
  });

  // Dummy ref so render section still works (glowOuterRef no longer used for pulseGlow)
  const tGlowOuterRef = useRef(0);
  const glowOuterRef = useCanvas(false, [speed, intensity], () => {});

  // ── Particles ─────────────────────────────────────────────────────────────
  type Particle = { x:number;y:number;vx:number;vy:number;r:number;hue:number;hueShift:number;life:number;maxLife:number;twinkle:number;twinkleSpeed:number;opacity:number };
  const pRef = useRef<Particle[]>([]);
  const sSP = 6 * ss;
  function spawnParticle(w: number, h: number): Particle {
    const angle = Math.random() * Math.PI * 2, spd = 0.1 + Math.random() * 0.7, ml = 80 + Math.random() * 220;
    const rainbow = particlesRainbowRef.current;
    const [baseHue] = particlesHueRef.current;
    const hue = rainbow ? Math.random()*360 : baseHue + (Math.random()-0.5)*14;
    const hueShift = rainbow ? (Math.random()-0.5)*1.5 : 0;
    return { x:Math.random()*w, y:Math.random()*h, vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd-Math.random()*0.3, r:0.5+Math.random()*1.8, hue, hueShift, life:Math.random()*ml, maxLife:ml, twinkle:Math.random()*Math.PI*2, twinkleSpeed:0.02+Math.random()*0.08, opacity:0.7+Math.random()*0.3 };
  }

  const particleRef = useCanvas(particlesEnabled, [speed, intensity], (ctx, w, h) => {
    // More, smaller particles with a much smaller glow halo (the old
    // 14-24px blur at 4.5px radius is what was reading as one big blob
    // instead of distinct sparkle points).
    const target = Math.round(90 * intensity) + 60;
    while (pRef.current.length < target) { const p = spawnParticle(w,h); p.life = Math.random()*p.maxLife; pRef.current.push(p); }
    if (pRef.current.length > target) pRef.current.length = target;
    for (let i = 0; i < pRef.current.length; i++) {
      const p = pRef.current[i];
      // Random per-frame jitter on top of the base drift, plus an
      // occasional hard direction snap — makes the motion read as sporadic
      // and darting rather than smooth floating.
      p.vx += (Math.random()-0.5)*0.14; p.vy += (Math.random()-0.5)*0.14;
      if (Math.random() < 0.015) { const sa=Math.random()*Math.PI*2, ss2=0.4+Math.random()*0.8; p.vx = Math.cos(sa)*ss2; p.vy = Math.sin(sa)*ss2; }
      const sp = Math.hypot(p.vx, p.vy), maxSp = 1.3;
      if (sp > maxSp) { p.vx = p.vx/sp*maxSp; p.vy = p.vy/sp*maxSp; }
      p.x += p.vx*sSP; p.y += p.vy*sSP; p.hue=(p.hue+p.hueShift*sSP)%360; p.life+=sSP; p.twinkle+=p.twinkleSpeed*sSP;
      if (p.x<-10) p.x=w+10; if (p.x>w+10) p.x=-10; if (p.y<-10) p.y=h+10; if (p.y>h+10) p.y=-10;
      if (p.life>=p.maxLife){ pRef.current[i] = spawnParticle(w,h); continue; }
      const lf=p.life/p.maxLife, fade=lf<0.15?lf/0.15:lf>0.75?1-(lf-0.75)/0.25:1, tw=(Math.sin(p.twinkle)+1)/2;
      // Floor raised from 0.65+0.35*tw to 0.8+0.2*tw, and the whole thing
      // now gets an extra intensity-driven punch on top of the plain
      // intensity multiply — cranking intensity should visibly do more
      // than just fade the floor in.
      const boost = 0.6 + 0.4*intensity;
      const a=fade*p.opacity*(0.8+0.2*tw)*intensity;
      const pr = p.r*(0.85+0.35*tw)*boost;
      // Soft blurred drop shadow — radial gradient (dark core fading to
      // transparent) instead of a hard-edge circle, so it reads as a real
      // soft shadow rather than a flat dark dot.
      const sx = p.x+pr*0.9, sy = p.y+pr*1.3, sr = pr*2.2;
      const shGrd = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      shGrd.addColorStop(0,   `rgba(0,0,0,${a*0.65})`);
      shGrd.addColorStop(0.6, `rgba(0,0,0,${a*0.35})`);
      shGrd.addColorStop(1,   `rgba(0,0,0,0)`);
      ctx.fillStyle = shGrd;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();

      ctx.beginPath(); ctx.arc(p.x,p.y,pr,0,Math.PI*2);
      ctx.fillStyle=`hsla(${p.hue},90%,70%,${a})`; ctx.shadowBlur=(4+3*tw)*boost; ctx.shadowColor=`hsla(${p.hue},90%,65%,${a*0.6})`; ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  // ── Fire ──────────────────────────────────────────────────────────────────
  type EmberKind = "tiny" | "medium" | "large" | "line";
  type Ember = {
    x:number; y:number; vx:number; vy:number;
    r:number; life:number; maxLife:number;
    hue:number; sat:number;
    kind: EmberKind;
    flickerSpeed: number; flickerPhase: number;
    speed: number; // individual speed multiplier
  };
  const eRef = useRef<Ember[]>([]);
  const ssGlow = 1 / Math.max(fireGlowSpeed, 0.5);
  const ssEmber = 6 / Math.max(fireEmberSpeed, 0.5);

  // Independently-pulsing lobes along the bottom glow's edge — several
  // bumps at different x-positions/heights/frequencies instead of one flat
  // rising band, so the top edge reads as a ragged flame line rather than a
  // smooth curve.
  type FireGlowLobe = { xFrac: number; freq: number; phase: number; heightMult: number };
  const fireGlowLobesRef = useRef<FireGlowLobe[]>([]);

  function spawnEmber(w: number, h: number): Ember {
    const [hf1,sf1] = hue1Ref.current, [hf2,sf2] = hue2Ref.current;
    const useC1 = Math.random() < 0.6;
    const hue = useC1 ? hf1+(Math.random()-0.5)*20 : hf2+(Math.random()-0.5)*20;
    const sat = useC1 ? sf1 : sf2;

    // Pick a kind with weighted probability
    const roll = Math.random();
    let kind: EmberKind, r: number, spd: number, maxLife: number, flickerSpeed: number;
    if (roll < 0.30) {
      // tiny — very small, fast flickering, quick life
      kind = "tiny"; r = 0.4 + Math.random() * 0.8;
      spd = 0.3 + Math.random() * 1.2;
      maxLife = 20 + Math.random() * 50;
      flickerSpeed = 0.6 + Math.random() * 1.2;
    } else if (roll < 0.60) {
      // medium — standard ember
      kind = "medium"; r = 1.2 + Math.random() * 1.8;
      spd = 0.2 + Math.random() * 0.9;
      maxLife = 50 + Math.random() * 100;
      flickerSpeed = 0.2 + Math.random() * 0.5;
    } else if (roll < 0.80) {
      // large — big slow ember, slow flicker
      kind = "large"; r = 2.5 + Math.random() * 3.0;
      spd = 0.1 + Math.random() * 0.4;
      maxLife = 80 + Math.random() * 140;
      flickerSpeed = 0.05 + Math.random() * 0.15;
    } else {
      // line — thin streak, way faster than the other kinds so it reads as
      // a fast-darting spark instead of a drifting ember.
      kind = "line"; r = 0.5 + Math.random() * 1.0; // line half-width
      spd = 2.5 + Math.random() * 4.5;
      maxLife = 30 + Math.random() * 70;
      flickerSpeed = 0.3 + Math.random() * 0.8;
    }

    // Wider angle spread (1.6→1.9) and taller spawn band (0.65→0.55 start)
    // for a more chaotic, sporadic-looking shower instead of a neat upward cone.
    const angle = -Math.PI/2 + (Math.random()-0.5)*Math.PI*1.9;
    return {
      x: Math.random()*w, y: h*(0.55+Math.random()*0.45),
      vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
      r, life: 0, maxLife, hue, sat, kind,
      flickerSpeed, flickerPhase: Math.random()*Math.PI*2,
      speed: spd,
    };
  }

  // Ride embers stay locked to the wave's own expanding radius the whole
  // time — instead of independent velocity/buoyancy, each one just has a
  // fixed angle plus a small radial offset and a gentle wobble/bob, so it
  // visibly rides the outer edge of the fire wave as it's pushed outward
  // rather than flying off on its own separate trajectory.
  type RideEmber = {
    angle:number; radialOffset:number;
    wobbleAmp:number; wobbleFreq:number; wobblePhase:number;
    bobAmp:number; bobFreq:number; bobPhase:number;
    r:number; hue:number; sat:number; kind:EmberKind;
    flickerSpeed:number; flickerPhase:number; spd:number;
  };

  // Same kind weights/ranges as spawnEmber above (size/speed-character/flicker
  // per tiny/medium/large/line), but positioned relative to the wave's radius
  // instead of given independent velocity.
  function spawnRideEmber(index: number, n: number): RideEmber {
    const [hf1,sf1] = hue1Ref.current, [hf2,sf2] = hue2Ref.current;
    const useC1 = Math.random() < 0.6;
    const hue = useC1 ? hf1+(Math.random()-0.5)*20 : hf2+(Math.random()-0.5)*20;
    const sat = useC1 ? sf1 : sf2;

    const roll = Math.random();
    let kind: EmberKind, r: number, spd: number, flickerSpeed: number;
    if (roll < 0.30) {
      kind = "tiny"; r = 0.4 + Math.random() * 0.8;
      spd = 0.3 + Math.random() * 1.2;
      flickerSpeed = 0.6 + Math.random() * 1.2;
    } else if (roll < 0.60) {
      kind = "medium"; r = 1.2 + Math.random() * 1.8;
      spd = 0.2 + Math.random() * 0.9;
      flickerSpeed = 0.2 + Math.random() * 0.5;
    } else if (roll < 0.80) {
      kind = "large"; r = 2.5 + Math.random() * 3.0;
      spd = 0.1 + Math.random() * 0.4;
      flickerSpeed = 0.05 + Math.random() * 0.15;
    } else {
      kind = "line"; r = 0.5 + Math.random() * 1.0;
      spd = 0.4 + Math.random() * 1.8;
      flickerSpeed = 0.3 + Math.random() * 0.8;
    }

    const angle = (index/n)*Math.PI*2 + (Math.random()-0.5)*(Math.PI*2/n);
    return {
      angle,
      // Strictly ahead of the wave's own edge, in a tight band — never
      // behind/inside it, and clustered close together rather than spread
      // out, so they read as one shower riding just in front of the front.
      radialOffset: 0.03 + Math.random()*0.12,
      wobbleAmp: 0.12 + Math.random()*0.3, wobbleFreq: 1+Math.random()*2, wobblePhase: Math.random()*Math.PI*2,
      bobAmp: 0.02 + Math.random()*0.04, bobFreq: 1.5+Math.random()*2.5, bobPhase: Math.random()*Math.PI*2,
      r, hue, sat, kind,
      flickerSpeed, flickerPhase: Math.random()*Math.PI*2, spd,
    };
  }

  // Same per-kind rendering as the ambient fire's embers, but position is
  // derived from the wave's current radius (R) each frame rather than
  // integrated from stored velocity — so the ember rides the wave's edge for
  // its entire visible lifetime instead of drifting independently.
  function updateAndDrawRideEmbers(ctx: CanvasRenderingContext2D, embers: RideEmber[], cx:number, cy:number, R:number, maxSpread:number, age:number, alpha:number, intensity:number) {
    for (let i = 0; i < embers.length; i++) {
      const em = embers[i];
      const emberAngle = em.angle + Math.sin(age*em.wobbleFreq + em.wobblePhase) * em.wobbleAmp;
      // Bob term is 0..bobAmp (not -bobAmp..bobAmp) — a plain sine here could
      // swing the offset negative at some phases and pull the ember behind
      // the wave despite radialOffset itself always being positive, which is
      // exactly the "ember behind the wave" bug this was supposed to fix.
      const bob = (0.5 + 0.5*Math.sin(age*em.bobFreq + em.bobPhase)) * em.bobAmp;
      const emberR = R + (em.radialOffset + bob)*maxSpread;
      if (emberR < 1) continue;
      const px = cx + Math.cos(emberAngle)*emberR;
      const py = cy + Math.sin(emberAngle)*emberR;

      const flicker = (Math.sin(age * em.flickerSpeed*4 + em.flickerPhase) + 1) / 2;
      const a = alpha * intensity;
      if (a <= 0.01) continue;

      ctx.shadowBlur = 0;

      if (em.kind === "tiny") {
        // Lightness caps pulled down across this ride-ember rendering (was
        // 85-95%, functionally white regardless of hue) — Reactive Fire's
        // dense embers ring were reading as one solid white bezel around the
        // wave instead of colored sparks.
        const ta = a * (0.3 + 0.7 * flicker);
        ctx.beginPath();
        ctx.arc(px, py, em.r * (0.6 + 0.4*flicker), 0, Math.PI*2);
        ctx.fillStyle = `hsla(${em.hue},${em.sat}%,${62+10*flicker}%,${ta})`;
        ctx.shadowBlur = 4 + 8*flicker;
        ctx.shadowColor = `hsla(${em.hue},${em.sat}%,58%,${ta})`;
        ctx.fill();

      } else if (em.kind === "medium") {
        const ma = a * (0.4 + 0.6*flicker);
        ctx.beginPath();
        ctx.arc(px, py, em.r*(0.5+0.3*flicker), 0, Math.PI*2);
        ctx.fillStyle = `hsla(${em.hue},${em.sat}%,${55+15*flicker}%,${ma})`;
        ctx.shadowBlur = 5 + 5*flicker;
        ctx.shadowColor = `hsla(${em.hue},${em.sat}%,55%,${ma*0.8})`;
        ctx.fill();
        if (em.r > 1.5) {
          const ang = emberAngle; // radially outward — the ember's actual direction of travel
          ctx.save();
          ctx.translate(px - Math.cos(ang)*em.r*2.5, py - Math.sin(ang)*em.r*2.5);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(0, 0, em.r*0.1, em.r*(0.5+0.4*flicker), 0, 0, Math.PI*2);
          ctx.fillStyle = `hsla(${em.hue},${em.sat}%,50%,${ma*0.25})`;
          ctx.fill();
          ctx.restore();
        }

      } else if (em.kind === "large") {
        // Raised from 0.25+0.4*flicker (capped at 0.65) — "large" embers
        // were the dimmest kind even at full intensity/flicker.
        const la = a * (0.45 + 0.55*flicker);
        const grd = ctx.createRadialGradient(px, py, 0, px, py, em.r*(1.2+0.4*flicker));
        grd.addColorStop(0,   `hsla(${em.hue},${em.sat}%,62%,${la})`);
        grd.addColorStop(0.5, `hsla(${em.hue},${em.sat}%,50%,${la*0.5})`);
        grd.addColorStop(1,   `hsla(${em.hue},${em.sat}%,40%,0)`);
        ctx.beginPath();
        ctx.arc(px, py, em.r*(1.2+0.4*flicker), 0, Math.PI*2);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, em.r*0.35, 0, Math.PI*2);
        ctx.fillStyle = `hsla(${em.hue},${em.sat}%,68%,${la*0.9})`;
        ctx.fill();

      } else {
        const la = a * (0.4 + 0.6*flicker);
        const ang = emberAngle; // radially outward — the ember's actual direction of travel
        const len = 6 + em.spd * 8 + flicker * 6;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        const sg = ctx.createLinearGradient(-len, 0, em.r*2, 0);
        sg.addColorStop(0,   `hsla(${em.hue},${em.sat}%,58%,0)`);
        sg.addColorStop(0.6, `hsla(${em.hue},${em.sat}%,60%,${la*0.6})`);
        sg.addColorStop(1,   `hsla(${em.hue},${em.sat}%,68%,${la})`);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(em.r*2, 0);
        ctx.strokeStyle = sg;
        ctx.lineWidth = em.r * (0.6 + 0.6*flicker);
        ctx.lineCap = "round";
        ctx.shadowBlur = 4 + 6*flicker;
        ctx.shadowColor = `hsla(${em.hue},${em.sat}%,58%,${la*0.8})`;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Fire glow — uses fireGlowSpeed
  const tFireGlowRef = useRef(0);
  const fireGlowRef = useCanvas(fireEnabled, [fireGlowSpeed, intensity], (ctx, w, h) => {
    tFireGlowRef.current += 0.016 / Math.max(fireGlowSpeed, 0.5);
    const [hf1,sf1,lf1] = hue1Ref.current, [hf2,sf2,lf2] = hue2Ref.current;
    const breathe = 0.08 * Math.sin(tFireGlowRef.current * Math.PI * 2);
    const glowH = h * (0.55 + breathe);
    const grd = ctx.createLinearGradient(0, h, 0, h - glowH);
    // Peak stop raised from 0.5 to 0.85 — it capped well under full opacity
    // even at max intensity, so the base glow never actually looked bold.
    // Fire Color 1 now holds through the first ~22% of the glow (an added
    // stop) before handing off to Color 2, so Color 1 reads as the dominant
    // color right at the bottom instead of blending away almost immediately.
    grd.addColorStop(0,    `hsla(${hf1},${sf1}%,${lf1}%,${0.95*intensity})`);
    grd.addColorStop(0.22, `hsla(${hf1},${sf1}%,${lf1}%,${0.8*intensity})`);
    grd.addColorStop(0.5,  `hsla(${hf2},${sf2}%,${lf2}%,${0.45*intensity})`);
    grd.addColorStop(0.75, `hsla(${hf2},${sf2}%,${lf2}%,${0.12*intensity})`);
    grd.addColorStop(1,    `hsla(${hf2},${sf2}%,${lf2}%,0)`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);

    // Uneven flame-line lobes riding the glow's edge, each pulsing on its
    // own frequency/phase so the top of the glow ripples raggedly instead
    // of breathing as one smooth, uniform band.
    if (fireGlowLobesRef.current.length === 0) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        fireGlowLobesRef.current.push({
          xFrac: (i + 0.5) / n + (Math.random() - 0.5) * 0.07,
          freq: 0.5 + Math.random() * 1.3,
          phase: Math.random() * Math.PI * 2,
          heightMult: 0.6 + Math.random() * 0.9,
        });
      }
    }
    const t = tFireGlowRef.current;
    for (const lobe of fireGlowLobesRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * lobe.freq + lobe.phase);
      const lx = lobe.xFrac * w;
      const lr = glowH * lobe.heightMult * (0.45 + 0.55 * pulse) * 0.8;
      if (lr < 1) continue;
      const lgrd = ctx.createRadialGradient(lx, h, 0, lx, h, lr);
      lgrd.addColorStop(0,   `hsla(${hf1},${sf1}%,${lf1}%,${0.6 * intensity * pulse})`);
      lgrd.addColorStop(0.5, `hsla(${hf2},${sf2}%,${lf2}%,${0.35 * intensity * pulse})`);
      lgrd.addColorStop(1,   `hsla(${hf2},${sf2}%,${lf2}%,0)`);
      ctx.fillStyle = lgrd;
      ctx.beginPath(); ctx.arc(lx, h, lr, 0, Math.PI * 2); ctx.fill();
    }
  });

  // Fire embers — uses fireEmberSpeed
  const fireRef = useCanvas(fireEnabled, [fireEmberSpeed, intensity], (ctx, w, h) => {
    // More embers, and a wider launch angle spread (below) for a busier,
    // more sporadic-looking shower.
    const target = Math.round(75*intensity) + 45;
    while (eRef.current.length < target) { const em=spawnEmber(w,h); em.life=Math.random()*em.maxLife; eRef.current.push(em); }
    if (eRef.current.length > target) eRef.current.length = target;

    for (let i = 0; i < eRef.current.length; i++) {
      const em = eRef.current[i];
      em.x += em.vx * ssEmber;
      em.y += em.vy * ssEmber;
      em.vy -= 0.012 * ssEmber;
      em.vx += (Math.random()-0.5) * 0.05 * ssEmber;
      em.life += ssEmber;
      if (em.life >= em.maxLife || em.y < -10) { eRef.current[i] = spawnEmber(w, h); continue; }

      const lf = em.life / em.maxLife;
      const fade = lf < 0.1 ? lf/0.1 : lf > 0.72 ? 1-(lf-0.72)/0.28 : 1;
      const flicker = (Math.sin(em.life * em.flickerSpeed + em.flickerPhase) + 1) / 2;
      // Fades embers out near the bottom (where most of them spawn) so that
      // whole band reads as solid Fire Color 1 glow instead of embers poking
      // through it — they only become visible once they've risen well clear
      // of it. Band covers most of the spawn range (0.55h-1.0h) and the
      // falloff is squared so it stays fully suppressed low down instead of
      // ramping up gradually right from the very bottom pixel.
      const bottomBand = h * 0.4;
      const vertFadeLinear = Math.max(0, Math.min(1, (h - em.y) / bottomBand));
      const vertFade = vertFadeLinear * vertFadeLinear;
      const a = fade * intensity * vertFade;

      ctx.shadowBlur = 0;

      if (em.kind === "tiny") {
        // Tiny: small bright dot, fast flicker, high opacity burst
        const ta = a * (0.3 + 0.7 * flicker);
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.r * (0.6 + 0.4*flicker), 0, Math.PI*2);
        ctx.fillStyle = `hsla(${em.hue},${em.sat}%,${85+10*flicker}%,${ta})`;
        ctx.shadowBlur = 4 + 8*flicker;
        ctx.shadowColor = `hsla(${em.hue},${em.sat}%,80%,${ta})`;
        ctx.fill();

      } else if (em.kind === "medium") {
        // Medium: classic ember dot + small wisp trail
        const ma = a * (0.4 + 0.6*flicker);
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.r*(0.5+0.3*flicker), 0, Math.PI*2);
        ctx.fillStyle = `hsla(${em.hue},${em.sat}%,${75+20*flicker}%,${ma})`;
        ctx.shadowBlur = 5 + 5*flicker;
        ctx.shadowColor = `hsla(${em.hue},${em.sat}%,75%,${ma*0.8})`;
        ctx.fill();
        // wisp
        if (em.r > 1.5) {
          const ang = Math.atan2(em.vy, em.vx);
          ctx.save();
          ctx.translate(em.x - Math.cos(ang)*em.r*2.5, em.y - Math.sin(ang)*em.r*2.5);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(0, 0, em.r*0.1, em.r*(0.5+0.4*flicker), 0, 0, Math.PI*2);
          ctx.fillStyle = `hsla(${em.hue},${em.sat}%,65%,${ma*0.25})`;
          ctx.fill();
          ctx.restore();
        }

      } else if (em.kind === "large") {
        // Large: big glowing orb, slow gentle flicker, soft glow
        // Raised from 0.25+0.4*flicker (capped at 0.65) — "large" embers
        // were the dimmest kind even at full intensity/flicker.
        const la = a * (0.45 + 0.55*flicker);
        // outer soft glow
        const grd = ctx.createRadialGradient(em.x, em.y, 0, em.x, em.y, em.r*(1.2+0.4*flicker));
        grd.addColorStop(0,   `hsla(${em.hue},${em.sat}%,80%,${la})`);
        grd.addColorStop(0.5, `hsla(${em.hue},${em.sat}%,60%,${la*0.5})`);
        grd.addColorStop(1,   `hsla(${em.hue},${em.sat}%,40%,0)`);
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.r*(1.2+0.4*flicker), 0, Math.PI*2);
        ctx.fillStyle = grd;
        ctx.fill();
        // bright core
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.r*0.35, 0, Math.PI*2);
        ctx.fillStyle = `hsla(${em.hue},${em.sat}%,92%,${la*1.4})`;
        ctx.fill();

      } else {
        // Line: thin elongated streak in direction of travel
        const la = a * (0.4 + 0.6*flicker);
        const ang = Math.atan2(em.vy, em.vx);
        const len = 6 + em.speed * 8 + flicker * 6;
        ctx.save();
        ctx.translate(em.x, em.y);
        ctx.rotate(ang);
        // gradient streak fading at tail
        const sg = ctx.createLinearGradient(-len, 0, em.r*2, 0);
        sg.addColorStop(0,   `hsla(${em.hue},${em.sat}%,70%,0)`);
        sg.addColorStop(0.6, `hsla(${em.hue},${em.sat}%,80%,${la*0.6})`);
        sg.addColorStop(1,   `hsla(${em.hue},${em.sat}%,95%,${la})`);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(em.r*2, 0);
        ctx.strokeStyle = sg;
        ctx.lineWidth = em.r * (0.6 + 0.6*flicker);
        ctx.lineCap = "round";
        ctx.shadowBlur = 4 + 6*flicker;
        ctx.shadowColor = `hsla(${em.hue},${em.sat}%,80%,${la*0.8})`;
        ctx.stroke();
        ctx.restore();
      }
    }
  });

  const fireOuterRef = useCanvas(fireEnabled, [fireGlowSpeed, intensity], (ctx, w, h) => {
    const [hf1,sf1,lf1] = hue1Ref.current, [hf2,sf2,lf2] = hue2Ref.current;
    const glowH = h*(0.6+0.08*Math.sin(Date.now()*ssGlow*1.1));
    const grd = ctx.createLinearGradient(0, h, 0, h-glowH);
    // Peak raised from 0.4 to 0.7 — same underpowered-at-max-intensity issue
    // as the inner glow layer above.
    grd.addColorStop(0,   `hsla(${hf1},${sf1}%,${lf1}%,${0.7*intensity})`);
    grd.addColorStop(0.35,`hsla(${hf2},${sf2}%,${lf2}%,${0.4*intensity})`);
    grd.addColorStop(0.7, `hsla(${hf2},${sf2}%,${lf2}%,${0.1*intensity})`);
    grd.addColorStop(1,   `hsla(${hf2},${sf2}%,${lf2}%,0)`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
  });

  // Real highlight+shadow bevel instead of a single dark "overlay" trough —
  // overlay/multiply blending on a near-black color is luminance-dependent
  // (its math barely darkens already-bright pixels at all), so on a shiny or
  // light-colored controller skin the old trough was nearly invisible. A
  // bright band on one edge and a dark band on the other, both drawn with
  // plain alpha compositing, reads as a genuine raised/recessed 3D edge
  // regardless of what's underneath.
  function drawBevel(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, R: number, T: number, alpha: number) {
    // Toned down (peaks were 0.55/0.65, now 0.32/0.42) and the gradient span
    // widened with a flat mid-plateau instead of a single sharp peak stop —
    // that's what actually makes it fade into the glow ring and the shadow
    // gradually rather than reading as a separate hard-edged band.
    // Highlight alpha halved (0.32→0.16) — the white bevel ring was reading
    // as a bright washed-out band on top of the color, not a subtle 3D cue.
    const hiR = Math.max(0, R - T * 0.4);
    const hiGrd = ctx.createRadialGradient(cx, cy, Math.max(0, hiR - T * 1.3), cx, cy, hiR + T * 0.6);
    hiGrd.addColorStop(0,   `rgba(255,255,255,0)`);
    hiGrd.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.16})`);
    hiGrd.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.16})`);
    hiGrd.addColorStop(1,   `rgba(255,255,255,0)`);
    ctx.fillStyle = hiGrd;
    ctx.fillRect(0, 0, w, h);

    const shR = R + T * 0.55;
    const shGrd = ctx.createRadialGradient(cx, cy, Math.max(0, shR - T * 0.7), cx, cy, shR + T * 1.6);
    shGrd.addColorStop(0,   `rgba(0,0,0,0)`);
    shGrd.addColorStop(0.4, `rgba(0,0,0,${alpha * 0.42})`);
    shGrd.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.42})`);
    shGrd.addColorStop(1,   `rgba(0,0,0,0)`);
    ctx.fillStyle = shGrd;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Reactive Ripple ───────────────────────────────────────────────────────
  // Two canvases stacked:
  //  reactive3DRef   — draws the highlight+shadow bevel, giving the 3D
  //                    "surface rippling" depth look
  //  reactiveGlowRef — screen blend: draws the intense colored glow ring,
  //                    same brightness as before. Also owns ripple detection.

  // Screen-blend color glow — handles detection, spawning, and color rendering
  const reactiveGlowRef = useCanvas(reactiveEnabled, [speed, intensity], (ctx, w, h) => {
    reactRealTRef.current += 0.016;
    const rt = reactRealTRef.current;
    const rippleLife = Math.max(speed, 0.5) * 0.22;

    ripplesRef.current = ripplesRef.current.filter(r => rt - r.startT < rippleLife);

    const cur  = pressedRef.current;
    const prev = prevPressedRef.current;
    for (const idx of cur) {
      if (!prev.has(idx)) {
        const pos = btnPosRef.current[idx];
        if (pos) {
          const [hw, hh] = buttonHWHH(pos, w);
          ripplesRef.current.push({ cx:(pos.x/100)*w, cy:(pos.y/100)*h, startT:rt, edgeR:Math.min(hw,hh) });
        }
      }
    }
    prevPressedRef.current = new Set(cur);

    const col = reactColorRef.current;
    const rr  = parseInt(col.slice(1,3), 16);
    const rg  = parseInt(col.slice(3,5), 16);
    const rb  = parseInt(col.slice(5,7), 16);

    for (const rip of ripplesRef.current) {
      const age   = rt - rip.startT;
      const frac  = age / rippleLife;
      const R     = rip.edgeR + frac * Math.max(w, h) * 1.3;
      const T     = Math.max(w, h) * 0.06;
      // Boosted 1.35x (clamped to 1) and the shoulder stops now hold full
      // alpha instead of 0.85x — the color was reading washed-out/pastel.
      const alpha = Math.min(1, Math.max(0, (1 - frac) * intensity) * 1.35);
      const hue   = (((age / rippleLife) * 300 + (rip.cx / w) * 120) % 360 + 360) % 360;

      const getC = (a: number) => reactRainbowRef.current
        ? `hsla(${hue},100%,58%,${a})`
        : `rgba(${rr},${rg},${rb},${a})`;

      // Plateau widened further (0.15-0.85, at full alpha even on the
      // shoulders) — almost the entire ring now sits at full strength
      // instead of tapering off quickly on either side of the center.
      const grd = ctx.createRadialGradient(rip.cx, rip.cy, Math.max(0, R - T), rip.cx, rip.cy, R + T);
      grd.addColorStop(0,    getC(0));
      grd.addColorStop(0.15, getC(alpha));
      grd.addColorStop(0.3,  getC(alpha));
      grd.addColorStop(0.7,  getC(alpha));
      grd.addColorStop(0.85, getC(alpha));
      grd.addColorStop(1,    getC(0));
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
    }

    // Erase areas of other currently-pressed buttons so their indicators stay visible
  });

  // Overlay-blend shadow trough — reads ripplesRef but never modifies it
  const reactive3DRef = useCanvas(reactiveEnabled, [speed, intensity], (ctx, w, h) => {
    const rt         = reactRealTRef.current;
    const rippleLife = Math.max(speed, 0.5) * 0.22;

    for (const rip of ripplesRef.current) {
      const age   = rt - rip.startT;
      if (age < 0) continue;
      const frac  = age / rippleLife;
      const R     = rip.edgeR + frac * Math.max(w, h) * 1.3;
      const T     = Math.max(w, h) * 0.055;
      const alpha = Math.max(0, (1 - frac) * intensity);
      drawBevel(ctx, w, h, rip.cx, rip.cy, R, T, alpha);
    }
  });

  // ── Reactive Fire — a ripple rendered in the same Fire Color 1/2 palette as
  //    the ambient fire effect, plus embers using the same per-kind rendering
  //    as the regular fire embers — but their position rides the wave's own
  //    expanding radius (with a little wobble/bob) instead of flying off with
  //    independent velocity, so they visibly stay pushed along the wave's
  //    outer edge for as long as it's expanding. Rendered in two passes — all
  //    wave gradients, then all embers — so embers always sit in front of
  //    every wave even when multiple presses overlap. ──
  const reactiveFireRef = useCanvas(reactiveFireEnabled, [speed, intensity], (ctx, w, h) => {
    fireBurstTRef.current += 0.016;
    const rt = fireBurstTRef.current;
    // Same time coefficient as reactive (0.22) — this kept
    // drifting back to 0.3 whenever unrelated work touched this file.
    const life = Math.max(speed, 0.5) * 0.22;

    fireBurstEventsRef.current = fireBurstEventsRef.current.filter(e => rt - e.startT < e.life);
    const cur = pressedRef.current, prev = prevPressedRef.current;
    for (const idx of cur) {
      if (!prev.has(idx)) {
        const pos = btnPosRef.current[idx];
        if (pos) {
          const cx = (pos.x/100)*w, cy = (pos.y/100)*h;
          const n = 100; // a ton more embers — a dense, busy shower
          const embers: RideEmber[] = [];
          for (let i=0; i<n; i++) embers.push(spawnRideEmber(i, n));
          const lobeCount = 14;
          const lobes: FireLobe[] = [];
          for (let i=0; i<lobeCount; i++) {
            lobes.push({
              angle: (i/lobeCount)*Math.PI*2 + (Math.random()-0.5)*(Math.PI*2/lobeCount)*0.8,
              sizeMult: 0.7 + Math.random()*0.9,
              phase: Math.random()*Math.PI*2,
              freq: 3 + Math.random()*4,
              hueT: Math.random(), // where along the hf1→hf2 blend this lobe sits
            });
          }
          fireBurstEventsRef.current.push({ cx, cy, startT: rt, life, embers, lobes });
        }
      }
    }
    prevPressedRef.current = new Set(cur);

    ctx.clearRect(0,0,w,h);
    const [hf1,sf1] = hue1Ref.current, [hf2,sf2] = hue2Ref.current;
    const mixHue = (t: number) => hf1 + (hf2-hf1)*t;
    const mixSat = (t: number) => sf1 + (sf2-sf1)*t;
    // Matches reactive's spread coefficient (1.3) exactly.
    const maxSpread = Math.max(w,h) * 1.3;

    // Pass 1 — every wave first. A smooth multi-stop blend through the two
    // colors (not a hard 40%/70% split) plus several pulsing "lobes" riding
    // the ring at different angles/phases — that raggedness plus flicker is
    // what actually reads as fire instead of a flat glowing ring.
    for (const evt of fireBurstEventsRef.current) {
      const age = rt - evt.startT;
      const frac = Math.min(1, age / evt.life);
      const R = frac * maxSpread;
      const alpha = Math.max(0, 1 - frac) * intensity;
      if (alpha <= 0.02 || R < 1) continue;
      const T = Math.max(w,h) * 0.05;

      const grd = ctx.createRadialGradient(evt.cx, evt.cy, Math.max(0,R-T), evt.cx, evt.cy, R+T);
      grd.addColorStop(0,    `hsla(${mixHue(0)},${mixSat(0)}%,58%,0)`);
      grd.addColorStop(0.15, `hsla(${mixHue(0)},${mixSat(0)}%,58%,${alpha})`);
      grd.addColorStop(0.35, `hsla(${mixHue(0.35)},${mixSat(0.35)}%,55%,${alpha*0.9})`);
      grd.addColorStop(0.55, `hsla(${mixHue(0.6)},${mixSat(0.6)}%,52%,${alpha*0.75})`);
      grd.addColorStop(0.8,  `hsla(${mixHue(0.9)},${mixSat(0.9)}%,48%,${alpha*0.5})`);
      grd.addColorStop(1,    `hsla(${mixHue(1)},${mixSat(1)}%,48%,0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,w,h);

      for (const lobe of evt.lobes) {
        const pulse = 0.6 + 0.4*Math.sin(age*lobe.freq + lobe.phase);
        const lobeR = T * lobe.sizeMult * (0.8 + 0.5*pulse);
        const lx = evt.cx + Math.cos(lobe.angle)*R, ly = evt.cy + Math.sin(lobe.angle)*R;
        const lh = mixHue(lobe.hueT), ls = mixSat(lobe.hueT);
        const lgrd = ctx.createRadialGradient(lx, ly, 0, lx, ly, lobeR);
        lgrd.addColorStop(0,   `hsla(${lh},${ls}%,64%,${alpha*pulse})`);
        lgrd.addColorStop(0.6, `hsla(${lh},${ls}%,55%,${alpha*0.7*pulse})`);
        lgrd.addColorStop(1,   `hsla(${lh},${ls}%,50%,0)`);
        ctx.fillStyle = lgrd;
        ctx.beginPath(); ctx.arc(lx, ly, lobeR, 0, Math.PI*2); ctx.fill();
      }
    }

    // Pass 2 — every ember on top, riding its wave's current radius
    for (const evt of fireBurstEventsRef.current) {
      const age = rt - evt.startT;
      const frac = Math.min(1, age / evt.life);
      const R = frac * maxSpread;
      const alpha = Math.max(0, 1 - frac);
      updateAndDrawRideEmbers(ctx, evt.embers, evt.cx, evt.cy, R, maxSpread, age, alpha, intensity);
    }
  });

  // Overlay-blend shadow trough for reactiveFire — same 3D-depth trick as
  // reactive3DRef; reactiveFire never had one.
  const reactiveFire3DRef = useCanvas(reactiveFireEnabled, [speed, intensity], (ctx, w, h) => {
    const rt = fireBurstTRef.current;
    const maxSpread = Math.max(w,h) * 1.3;

    for (const evt of fireBurstEventsRef.current) {
      const age = rt - evt.startT;
      if (age < 0) continue;
      const frac = Math.min(1, age / evt.life);
      const R = frac * maxSpread;
      const T = Math.max(w,h) * 0.045;
      const alpha = Math.max(0, 1 - frac) * intensity;
      if (alpha <= 0.02 || R < 1) continue;
      drawBevel(ctx, w, h, evt.cx, evt.cy, R, T, alpha);
    }
  });

  // ── Particle Burst — a one-shot explosion of glowing particles flying
  //    outward from the pressed button's edge, decelerating and fading out. ──
  const burstRef = useCanvas(particleBurstEnabled, [speed, intensity], (ctx, w, h) => {
    burstTRef.current += 0.016;
    const rt = burstTRef.current;
    const life = Math.max(speed, 0.5) * 0.5;

    burstEventsRef.current = burstEventsRef.current.filter(e => rt - e.startT < e.life);
    const cur = pressedRef.current, prev = prevPressedRef.current;
    for (const idx of cur) {
      if (!prev.has(idx)) {
        const pos = btnPosRef.current[idx];
        if (pos) {
          const [hw, hh] = buttonHWHH(pos, w);
          const n = 14 + Math.floor(Math.random()*10);
          burstEventsRef.current.push({
            startT: rt, life,
            particles: genBurstParticles((pos.x/100)*w, (pos.y/100)*h, hw, hh, Math.max(w,h), n),
          });
        }
      }
    }
    prevPressedRef.current = new Set(cur);

    const col = reactColorRef.current;
    const rr=parseInt(col.slice(1,3),16), rg=parseInt(col.slice(3,5),16), rb=parseInt(col.slice(5,7),16);

    for (const evt of burstEventsRef.current) {
      const age = rt - evt.startT;
      const tn = Math.min(1, age / evt.life);
      const fadeAlpha = Math.max(0, 1 - Math.pow(tn, 1.6)) * intensity;
      if (fadeAlpha <= 0.01) continue;

      for (const p of evt.particles) {
        const decay = 1 - Math.exp(-p.drag * age);
        let px = p.x0 + (p.vx / p.drag) * decay;
        let py = p.y0 + (p.vy / p.drag) * decay;

        // Perpendicular wander so tracks aren't perfectly straight radial lines —
        // ramps in from zero at spawn, fades out as the particle settles.
        const perpX = -Math.sin(p.angle), perpY = Math.cos(p.angle);
        const jitter = Math.sin(age*p.jitterFreq + p.jitterPhase) * p.jitterAmp * Math.min(1, age*3) * (1-tn);
        px += perpX * jitter;
        py += perpY * jitter;

        const flicker = 0.7 + 0.3*Math.sin(age*p.flickerSpeed + p.flickerPhase);
        const size = p.size * (1 - 0.35*tn) * flicker;
        if (size <= 0.15) continue;
        const alpha = fadeAlpha * flicker;

        const hue = reactRainbowRef.current ? (p.hueOff + age * 220) % 360 : 0;
        const colorC = reactRainbowRef.current ? `hsla(${hue},100%,62%,` : `rgba(${rr},${rg},${rb},`;

        ctx.save();
        ctx.shadowBlur = 8; ctx.shadowColor = `${colorC}${alpha*0.8})`;
        ctx.fillStyle = `${colorC}${alpha})`;
        ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI*2); ctx.fill();

        // Tiny bright core for extra pop
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255,255,255,${alpha*0.7})`;
        ctx.beginPath(); ctx.arc(px, py, size*0.4, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pulseGlowEnabled && (
        <canvas ref={glowRef} style={{ ...makeCanvas(maskUrl), mixBlendMode: "normal" as const }} />
      )}
      {particlesEnabled && <canvas ref={particleRef} style={makeCanvas(maskUrl)} />}
      {fireEnabled && <>
        <canvas ref={fireGlowRef} style={makeCanvas(maskUrl)} />
        <canvas ref={fireRef} style={makeCanvas(maskUrl)} />
      </>}
      {reactiveEnabled && <>
        <canvas ref={reactive3DRef}   style={{ ...makeCanvas(maskUrl), mixBlendMode: "normal" as const }} />
        <canvas ref={reactiveGlowRef} style={makeCanvas(maskUrl)} />
      </>}
      {reactiveFireEnabled && <>
        <canvas ref={reactiveFire3DRef} style={{ ...makeCanvas(maskUrl), mixBlendMode: "normal" as const }} />
        <canvas ref={reactiveFireRef} style={makeCanvas(maskUrl)} />
      </>}
      {particleBurstEnabled && <canvas ref={burstRef} style={makeCanvas(maskUrl)} />}
    </div>
  );
}
