import { useCallback, useEffect, useRef, useState } from "react";
import { RgbBodyCanvas } from "./RgbBodyCanvas";
import { loadPresets, savePresets } from "./LibraryPicker";

// ─────────────────────────────────────────────────────────────────────────────
// Preset helpers — exported so Studio can use them
// ─────────────────────────────────────────────────────────────────────────────
// Full snapshot of an MKB preset — key/mouse mask overrides PLUS the full
// appearance settings (mirrors Studio.tsx's MkbSettings) AND the actual
// keyboard body/keys/mouse skin selection. Skin URLs are excluded from the
// separate "last session state" localStorage settings (they can be several
// MB and that store has a tight quota), but presets are written as real
// files under Electron's userData with no such cap, so there's no reason to
// drop them here — a saved preset should actually restore what it looked
// like, library-picked skin included. Presets used to only carry
// keyOverrides/mouseOverrides, so loading one silently dropped every color,
// glow, RGB, and shadow setting.
export interface MkbPreset {
  name: string;
  keyOverrides: Record<string,{cx:number;cy:number;w:number;h:number}>;
  mouseOverrides: {id:string;cx:number;cy:number;w:number;h:number}[];
  kbSkinUrl?: string; kbButtonsUrl?: string; mouseSkinUrl?: string;
  kbSkinVideoFit?: "contain" | "cover";
  kbSkinContrast?: number; kbSkinSaturate?: number;
  mouseSkinVideoFit?: "contain" | "cover";
  mouseSkinContrast?: number; mouseSkinSaturate?: number;
  mkbColor?: string; mkbRgbStyle?: 1|2|3; mkbRainbow?: boolean; mouseColor?: string;
  keyPressColor?: string; keyPressOpacity?: number; keyPressGlow?: number;
  kbOpacity?: number; kbGlow?: number;
  mouseOpacity?: number; mouseGlow?: number; mouseInnerFade?: boolean; mouseOuterFade?: boolean; mouseSnapBack?: boolean;
  mouseRgbEnabled?: boolean; mouseRgbMode?: "wave"|"breathing"; mouseRgbSpeed?: number;
  mouseRgbIntensity?: number; mouseRgbColor?: string; mouseRgbRainbow?: boolean;
  mkbShowShadow?: boolean; mkbShadowIntensity?: number; mkbShadowDistance?: number; mkbShadowAngle?: number;
  mkbWidth?: number; mkbHeight?: number;
  savedAt: number;
}
const MKB_PRESETS_LEGACY_KEY = 'css-mkb-presets';
export function loadMkbPresets(): Promise<MkbPreset[]> { return loadPresets<MkbPreset>('mkb', MKB_PRESETS_LEGACY_KEY); }
export async function saveMkbPresets(p: MkbPreset[]): Promise<void> {
  const ok = await savePresets('mkb', MKB_PRESETS_LEGACY_KEY, p);
  if (!ok) window.alert("Couldn't save preset — you're out of storage space. Try deleting an old preset and saving again.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Key definitions — labels and default positions as % of 1344×799 image
// ─────────────────────────────────────────────────────────────────────────────
export interface KeyDef {
  code: string; label: string;
  cx: number; cy: number; w: number; h: number;
}

// Press-highlight size is intentionally uniform across two groups of keys
// (position/cx,cy is untouched — only w/h, which drives the press glow
// size). Each group's w/h is the average of what was there before, since
// the per-key values were all close but not quite equal (manual tracing
// imprecision), and picking one key's exact number over another's would be
// arbitrary. Digit6/7/8 (S1/S2/S3, the RGB-style-select keys) are a
// deliberately smaller distinct control, not part of the "numbers" group.
//   Group A — Tab / Caps / Ctrl / Alt: w:11.92 h:13.94
//   Group B — Esc / Digit1-5 / all letters: w:8.00 h:14.04
// ShiftLeft and Space were left as-is per instruction.
export const BASE_KEYS: KeyDef[] = [
  { code:"Escape",      label:"ESC",   cx:18.97, cy:23.90, w:8.00,  h:14.04 },
  { code:"Digit1",      label:"1",     cx:27.49, cy:23.09, w:8.00,  h:14.04 },
  { code:"Digit2",      label:"2",     cx:36.16, cy:23.03, w:8.00,  h:14.04 },
  { code:"Digit3",      label:"3",     cx:44.64, cy:23.09, w:8.00,  h:14.04 },
  { code:"Digit4",      label:"4",     cx:53.50, cy:23.09, w:8.00,  h:14.04 },
  { code:"Digit5",      label:"5",     cx:61.94, cy:23.22, w:8.00,  h:14.04 },
  { code:"Digit6",      label:"S1",    cx:71.87, cy:22.07, w:5.58,  h:8.26  },
  { code:"Digit7",      label:"S2",    cx:77.64, cy:21.87, w:5.51,  h:8.26  },
  { code:"Digit8",      label:"S3",    cx:83.47, cy:22.04, w:5.65,  h:8.26  },
  { code:"Tab",         label:"TAB",   cx:20.65, cy:37.23, w:11.92, h:13.94 },
  { code:"KeyQ",        label:"Q",     cx:30.69, cy:36.80, w:8.00,  h:14.04 },
  { code:"KeyW",        label:"W",     cx:39.40, cy:36.73, w:8.00,  h:14.04 },
  { code:"KeyE",        label:"E",     cx:48.03, cy:36.86, w:8.00,  h:14.04 },
  { code:"KeyR",        label:"R",     cx:56.66, cy:36.73, w:8.00,  h:14.04 },
  { code:"KeyT",        label:"T",     cx:65.07, cy:36.73, w:8.00,  h:14.04 },
  { code:"CapsLock",    label:"CAPS",  cx:20.61, cy:51.94, w:11.92, h:13.94 },
  { code:"KeyA",        label:"A",     cx:30.80, cy:51.94, w:8.00,  h:14.04 },
  { code:"KeyS",        label:"S",     cx:39.40, cy:50.88, w:8.00,  h:14.04 },
  { code:"KeyD",        label:"D",     cx:48.03, cy:50.88, w:8.00,  h:14.04 },
  { code:"KeyF",        label:"F",     cx:56.58, cy:50.94, w:8.00,  h:14.04 },
  { code:"KeyG",        label:"G",     cx:65.07, cy:50.88, w:8.00,  h:14.04 },
  { code:"ShiftLeft",   label:"SHIFT", cx:23.85, cy:65.64, w:17.49, h:12.91 },
  { code:"KeyZ",        label:"Z",     cx:37.09, cy:65.08, w:8.00,  h:14.04 },
  { code:"KeyX",        label:"X",     cx:45.72, cy:66.08, w:8.00,  h:14.04 },
  { code:"KeyC",        label:"C",     cx:54.28, cy:65.02, w:8.00,  h:14.04 },
  { code:"KeyV",        label:"V",     cx:62.98, cy:65.02, w:8.00,  h:14.04 },
  { code:"ControlLeft", label:"CTRL",  cx:20.50, cy:79.79, w:11.92, h:13.94 },
  { code:"AltLeft",     label:"ALT",   cx:32.59, cy:80.29, w:11.92, h:13.94 },
  { code:"Space",       label:"SPACE", cx:62.02, cy:79.72, w:47.50, h:13.50 },
];

export const STYLE_CODES = ["Digit6","Digit7","Digit8"];

// Per-key colors for edit mode visibility — like controller button colors
const KEY_COLORS: Record<string,string> = {
  // Row 0 — orange
  "Escape":"#f97316","Digit1":"#f97316","Digit2":"#f97316","Digit3":"#f97316","Digit4":"#f97316","Digit5":"#f97316",
  // Style buttons — teal
  "Digit6":"#06b6d4","Digit7":"#06b6d4","Digit8":"#06b6d4",
  // Row 1 — purple
  "Tab":"#a855f7","KeyQ":"#a855f7","KeyW":"#a855f7","KeyE":"#a855f7","KeyR":"#a855f7","KeyT":"#a855f7",
  // Row 2 — blue
  "CapsLock":"#3b82f6","KeyA":"#3b82f6","KeyS":"#3b82f6","KeyD":"#3b82f6","KeyF":"#3b82f6","KeyG":"#3b82f6",
  // Row 3 — green
  "ShiftLeft":"#22c55e","KeyZ":"#22c55e","KeyX":"#22c55e","KeyC":"#22c55e","KeyV":"#22c55e",
  // Row 4 — red
  "ControlLeft":"#ef4444","AltLeft":"#ef4444","Space":"#ef4444",
};
type RgbStyle = 1|2|3;

// ─────────────────────────────────────────────────────────────────────────────
// Exact RGB mask polygon — derived from RGB_animation_mask.png measurements
// Points are [x%, y%] of the keyboard image (1344×799)
// ─────────────────────────────────────────────────────────────────────────────
// Polygon traced pixel-precisely from RGB_animation_mask.png
// Points are [x%, y%] of the 1344x799 keyboard image
const MASK_POLYGON = [
  [15.0, 17.1],   // top-left
  [66.5, 17.1],   // top-right of narrow section
  [66.5, 31.2],   // drop to style-keys step
  [69.9, 31.2],   // step right for style keys
  [69.9, 59.4],   // bottom of style keys
  [67.5, 59.4],   // step back in
  [67.5, 73.5],   // above SPACE row
  [87.4, 73.5],   // step right for SPACE row
  [87.4, 87.4],   // bottom-right
  [13.8, 87.4],   // bottom-left
  [13.8, 17.1],   // back to top-left
];

function hexToRgb(hex: string): [number,number,number] {
  const h = hex.replace("#","");
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}

// ─────────────────────────────────────────────────────────────────────────────
// RGB Canvas — clipped precisely to mask polygon
// ─────────────────────────────────────────────────────────────────────────────
function RgbCanvas({ style, color, rainbow, pressedKeys, keyPositions }: {
  style: RgbStyle; color: string; rainbow: boolean;
  pressedKeys: Set<string>;
  keyPositions: Record<string, {cx:number;cy:number}>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const ripples = useRef<{cx:number;cy:number;t:number}[]>([]);

  useEffect(()=>{
    let raf: number;
    const tick = () => {
      tRef.current += 0.016;
      const t = tRef.current;
      const cv = canvasRef.current; if (!cv) { raf=requestAnimationFrame(tick); return; }
      const ctx = cv.getContext("2d")!;
      const W = cv.width, H = cv.height;
      ctx.clearRect(0,0,W,H);
      ripples.current = ripples.current.filter(r=>t-r.t<2.5);

      ctx.save();

      const [rr,rg,rb] = hexToRgb(color);
      const getC = (hue:number, alpha:number) =>
        rainbow ? `hsla(${((hue*360)%360+360)%360},100%,55%,${alpha})`
                : `rgba(${rr},${rg},${rb},${alpha})`;

      if (style===1) {
        // Pulse — sharp attack, quick fade, like a heartbeat
        const raw = 0.5 + 0.5*Math.sin(t*2.5);
        const b = Math.pow(raw, 3) * 0.95; // no floor — goes fully dark at trough
        const hue = rainbow ? (t * 0.08) % 1 : 0; // cycle hue slowly over time when rainbow on
        ctx.fillStyle = getC(hue, b);
        ctx.fillRect(0,0,W,H);
      } else if (style===2) {
        // Wave — wider columns, faster scroll. Floor raised (was a bare
        // Math.pow(raw,2), which goes fully black at every trough) and the
        // exponent softened — the old high-contrast falloff read as big
        // dead-black gaps between keys instead of a smooth color wave.
        const colW = 6;
        for (let x=0; x<W; x+=colW) {
          const hue=(x/W + t*0.15)%1;
          const phase=(x/W)*Math.PI*6;
          const raw = 0.5+0.5*Math.sin(t*3 - phase);
          const b = 0.18 + Math.pow(raw, 1.6) * 0.82;
          ctx.fillStyle=getC(hue, b);
          ctx.fillRect(x,0,colW,H);
        }
      } else {
        // Ripple — no ambient, just expanding rings
        for (const rip of ripples.current) {
          const age=t-rip.t;
          const radius=age*Math.max(W,H)*0.8;
          const alpha=Math.max(0, 1.0*(1-age/2.5));
          const hue=rainbow?(age*0.2+rip.cx/W)%1:0;
          const thickness = Math.max(W,H)*0.08;
          const grd=ctx.createRadialGradient(rip.cx,rip.cy,Math.max(0,radius-thickness),rip.cx,rip.cy,radius+thickness);
          grd.addColorStop(0,   getC(hue, 0));
          grd.addColorStop(0.4, getC(hue, alpha));
          grd.addColorStop(0.5, getC(hue, alpha * 1.2));
          grd.addColorStop(0.6, getC(hue, alpha));
          grd.addColorStop(1,   getC(hue, 0));
          ctx.fillStyle=grd;
          ctx.fillRect(0,0,W,H);
        }
      }
      ctx.restore();
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[style,color,rainbow]);

  useEffect(()=>{
    const cv=canvasRef.current; if(!cv) return;
    const W=cv.width,H=cv.height;
    pressedKeys.forEach(code=>{
      const pos=keyPositions[code]||BASE_KEYS.find(k=>k.code===code);
      if(!pos) return;
      const cx=pos.cx/100*W, cy=pos.cy/100*H;
      const already=ripples.current.some(r=>Math.abs(r.cx-cx)<5&&tRef.current-r.t<0.12);
      if(!already) ripples.current.push({cx,cy,t:tRef.current});
    });
  },[pressedKeys,keyPositions]);

  return (
    <canvas ref={canvasRef} width={1344} height={799}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        WebkitMaskImage: `url(${import.meta.env.BASE_URL}mkb/keyboard-mask.png)`,
        maskImage: `url(${import.meta.env.BASE_URL}mkb/keyboard-mask.png)`,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
      }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Draggable Key Marker (same pattern as controller LayoutEditor)
// ─────────────────────────────────────────────────────────────────────────────
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}

interface KeyMarkerProps {
  keyDef: KeyDef;
  overridePos?: {cx:number;cy:number;w:number;h:number};
  isSelected: boolean;
  isPressed: boolean;
  // CapsLock-only: toggled-on resting state — a lighter look than isPressed,
  // shown for as long as caps is on rather than just for a momentary press.
  isToggleActive?: boolean;
  isActiveStyle: boolean;
  color: string;
  editColor: string;
  kbOpacity: number;
  kbGlow: number;
  keyPressOpacity: number;
  keyPressGlow: number;
  onSelect: ()=>void;
  onMove: (cx:number,cy:number)=>void;
  onResize: (w:number,h:number)=>void;
  containerRef: React.RefObject<HTMLDivElement|null>;
  editMode: boolean;
}

function KeyMarker({ keyDef, overridePos, isSelected, isPressed, isToggleActive, isActiveStyle, color, editColor,
  kbOpacity, kbGlow, keyPressOpacity, keyPressGlow,
  onSelect, onMove, onResize, containerRef, editMode }: KeyMarkerProps) {
  const dragRef = useRef<{active:boolean;isResize:boolean;startX:number;startY:number;startCx:number;startCy:number;startW:number;startH:number;cW:number;cH:number}|null>(null);
  const cbRef = useRef({onMove,onResize,onSelect});
  useEffect(()=>{cbRef.current={onMove,onResize,onSelect};},[onMove,onResize,onSelect]);

  const cx = overridePos?.cx ?? keyDef.cx;
  const cy = overridePos?.cy ?? keyDef.cy;
  const w  = overridePos?.w  ?? keyDef.w;
  const h  = overridePos?.h  ?? keyDef.h;

  useEffect(()=>{
    const onMM=(e:MouseEvent)=>{
      const d=dragRef.current; if(!d?.active) return;
      const dx=e.clientX-d.startX, dy=e.clientY-d.startY;
      if(d.isResize){
        const delta=(dx+dy)/2/d.cW*100;
        const scale=clamp((d.startW+delta)/d.startW, 0.1, 6);
        const newW=clamp(d.startW*scale,1,95);
        const newH=clamp(d.startH*scale,1,95);
        cbRef.current.onResize(newW,newH);
      } else {
        cbRef.current.onMove(
          clamp(d.startCx+dx/d.cW*100,0,100),
          clamp(d.startCy+dy/d.cH*100,0,100)
        );
      }
    };
    const onMU=()=>{if(dragRef.current) dragRef.current.active=false;};
    window.addEventListener("mousemove",onMM);
    window.addEventListener("mouseup",onMU);
    return()=>{window.removeEventListener("mousemove",onMM);window.removeEventListener("mouseup",onMU);};
  },[]);

  const startDrag=(e:React.MouseEvent,isResize:boolean)=>{
    if(!editMode) return;
    e.stopPropagation(); e.preventDefault();
    const r=containerRef.current?.getBoundingClientRect();
    if(!r) return;
    dragRef.current={active:true,isResize,startX:e.clientX,startY:e.clientY,startCx:cx,startCy:cy,startW:w,startH:h,cW:r.width,cH:r.height};
    cbRef.current.onSelect();
  };

  const glowColor = color;
  const isCapsLock = keyDef.code === "CapsLock";
  // "Resting active" (CapsLock toggled on, not currently being struck) is
  // deliberately shallower than a full isPressed sink on every axis — half
  // the inset shadow depth, a lighter tint, and a much smaller nudge/squish —
  // so a toggle that stays on indefinitely doesn't read as permanently
  // "mashed all the way down" the way a genuine held press does.
  const boxShadow = isPressed
    ? `inset 0 3px 8px rgba(0,0,0,0.8), inset 0 1px 3px rgba(0,0,0,0.6), 0 0 ${keyPressGlow}px ${Math.round(keyPressGlow/4)}px ${glowColor}`
    : isToggleActive
    ? isCapsLock
      ? `inset 0 2px 6px rgba(0,0,0,0.8), inset 0 1px 3px rgba(0,0,0,0.6), 0 0 ${Math.round(keyPressGlow/2)}px ${Math.round(keyPressGlow/6)}px ${glowColor}`
      : `inset 0 1px 4px rgba(0,0,0,0.5), 0 0 ${Math.round(keyPressGlow/2)}px ${Math.round(keyPressGlow/6)}px ${glowColor}`
    : isSelected && editMode
    ? `0 0 0 1.5px white, 0 0 8px ${glowColor}88`
    : isActiveStyle
    ? `0 0 6px 1px ${glowColor}99`
    : `0 3px 6px rgba(0,0,0,0.5)`;  // resting shadow gives depth

  return (
    <>
      <div
        onMouseDown={e=>startDrag(e,false)}
        style={{
          position:"absolute",
          left:`${cx-w/2}%`, top:`${cy-h/2}%`,
          width:`${w}%`, height:`${h}%`,
          borderRadius:"4px",
          cursor: editMode?"move":"default",
          zIndex: isSelected?30:10,
          border: isPressed
            ? "1px solid rgba(0,0,0,0.4)"
            : isToggleActive
            ? "1px solid rgba(0,0,0,0.25)"
            : editMode ? (isSelected?"2px solid white":"1px solid rgba(255,255,255,0.5)") : "none",
          background: isPressed
            ? `rgba(0,0,0,${0.5 * keyPressOpacity})`
            : isToggleActive
            ? `rgba(0,0,0,${(isCapsLock ? 0.5 : 0.25) * keyPressOpacity})`
            : editMode
            ? `${editColor}88`
            : isActiveStyle ? `${glowColor}22` : "transparent",
          boxShadow,
          // Y-only scale (not a uniform scale()) — keeps the squish purely
          // vertical so the press reads as sinking straight down, with no
          // horizontal component that could make it look like it's tilting.
          // Minimal translateY — the "pressed in" feel comes mostly from the
          // scaleY squish + inset shadow now, not from sliding the key a
          // visible distance down the board. isToggleActive is even lighter.
          transform: isPressed ? "translateY(1px) scaleY(0.94)"
            : isToggleActive ? "translateY(0px) scaleY(0.98)"
            : "translateY(0px) scaleY(1)",
          transition: "transform 0.06s cubic-bezier(0.4,0,0.2,1), box-shadow 0.06s, background 0.06s",
          willChange:"transform,box-shadow",
        }}
      >
        {editMode && isSelected && (
          <span style={{position:"absolute",top:"-18px",left:"50%",transform:"translateX(-50%)",
            fontSize:"8px",fontFamily:"monospace",background:"rgba(0,0,0,0.8)",color:"white",
            padding:"1px 4px",borderRadius:"3px",whiteSpace:"nowrap",pointerEvents:"none",zIndex:50}}>
            {keyDef.label} {cx.toFixed(1)},{cy.toFixed(1)} {w.toFixed(1)}%
          </span>
        )}
      </div>
      {/* Resize grip */}
      {editMode && isSelected && (
        <div onMouseDown={e=>startDrag(e,true)}
          style={{
            position:"absolute",
            left:`${cx}%`, top:`calc(${cy+h/2}% + 3px)`,
            transform:"translateX(-50%)",
            width:"24px",height:"14px",
            background:editMode?editColor:glowColor,borderRadius:"999px",
            cursor:"se-resize",zIndex:40,
            boxShadow:"0 1px 4px rgba(0,0,0,0.6),0 0 0 1.5px white",
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="white">
            <rect y="0" width="10" height="1.5" rx="1"/>
            <rect y="4.5" width="10" height="1.5" rx="1"/>
          </svg>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mouse component with draggable/resizable button masks
// ─────────────────────────────────────────────────────────────────────────────
export interface MouseMaskDef {
  id: string; src: string; btnIndex: number;
  cx: number; cy: number; w: number; h: number; // % of mouse container
  color: string;
}

const _B = import.meta.env.BASE_URL;
export const DEFAULT_MOUSE_MASKS: MouseMaskDef[] = [
  { id:"left",     src:`${_B}mkb/mouse-left.png`,     btnIndex:0, cx:28, cy:25, w:42, h:46, color:"#3b82f6" },
  { id:"right",    src:`${_B}mkb/mouse-right.png`,    btnIndex:2, cx:72, cy:24, w:40, h:44, color:"#ef4444" },
  { id:"scroll",   src:`${_B}mkb/mouse-scroll.png`,   btnIndex:1, cx:50, cy:14, w:18, h:16, color:"#22c55e" },
  { id:"side_top", src:`${_B}mkb/mouse-side-top.png`, btnIndex:4, cx:5,  cy:42, w:12, h:18, color:"#f97316" },
  { id:"side_bot", src:`${_B}mkb/mouse-side-bot.png`, btnIndex:3, cx:6,  cy:58, w:18, h:18, color:"#a855f7" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper — detect base64 WebM data URLs and blob URLs
// ─────────────────────────────────────────────────────────────────────────────
function isVideoSkin(url: string): boolean {
  return url.startsWith("data:video/") || url.startsWith("blob:") ||
         url.endsWith(".webm") || url.endsWith(".mp4");
}

function hexToRgbaStr(hex:string,a:number){
  const m=/^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if(!m) return `rgba(255,255,255,${a})`;
  const n=parseInt(m[1],16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// Mouse button press — same recipe the controller face buttons and keyboard
// keys use (instead of the old flat solid silhouette): the face darkens, an
// inset shadow gives it depth, and a hollow ring in the mouse color glows
// around the button's own shape, with the whole button sinking a hair like a
// pressed key. `src` is the white silhouette PNG for the button; every layer
// is that same silhouette used as a CSS mask. The ring's outer box punches the
// button's own shape out of an oversized box so the glow only blooms OUTSIDE
// the face (otherwise the blur fills the face solid, which is what read as
// "flat" before). Mirrored in Studio.tsx's exported overlay.
const PRESS_PAD=40;      // room around the button for the glow bloom (px)
const PRESS_RING_GAP=3;  // ring thickness (px)
function MouseBtnPress({src,color,amount,glow,outerFade,innerFade,pressed,boxW,boxH}:{
  src:string; color:string; amount:number; glow:number; outerFade:boolean; innerFade:boolean; pressed:boolean;
  boxW:number; boxH:number;
}) {
  // The old press was an <img> with objectFit:"contain", so the silhouette sat
  // letterboxed at its own aspect ratio inside the mask's box. Masks stretch
  // to fill their box by default, which blew every button up — so find the
  // image's natural ratio and size the layers to the exact "contain" rect.
  const [nat,setNat]=useState<{w:number;h:number}|null>(null);
  useEffect(()=>{
    let dead=false;
    const im=new Image();
    im.onload=()=>{ if(!dead&&im.naturalWidth&&im.naturalHeight) setNat({w:im.naturalWidth,h:im.naturalHeight}); };
    im.src=src;
    return()=>{dead=true;};
  },[src]);
  if(!nat) return null;
  const fit=Math.min(boxW/nat.w,boxH/nat.h);
  const cw=nat.w*fit, ch=nat.h*fit;
  const shape=`url("${src}")`;
  const maskBox=(imgs:string,sizes:string):React.CSSProperties=>({
    WebkitMaskImage:imgs, maskImage:imgs,
    WebkitMaskSize:sizes, maskSize:sizes,
    WebkitMaskPosition:"center", maskPosition:"center",
    WebkitMaskRepeat:"no-repeat", maskRepeat:"no-repeat",
  });
  const faceMask=maskBox(shape,"100% 100%");
  // Full box minus the button's shape: black fill with the shape cut out.
  const outsideMask:React.CSSProperties={
    ...maskBox(`linear-gradient(black,black), ${shape}`,`100% 100%, calc(100% - ${PRESS_PAD*2}px) calc(100% - ${PRESS_PAD*2}px)`),
    WebkitMaskComposite:"destination-out", maskComposite:"exclude",
  } as React.CSSProperties;
  const ringMask:React.CSSProperties={
    ...maskBox(`${shape}, ${shape}`,`100% 100%, calc(100% - ${PRESS_RING_GAP*2}px) calc(100% - ${PRESS_RING_GAP*2}px)`),
    WebkitMaskComposite:"destination-out", maskComposite:"exclude",
  } as React.CSSProperties;
  const g=Math.max(glow,1);
  const ringFilter=
    `blur(1.5px) drop-shadow(0 0 2px rgba(255,255,255,${0.9*amount})) `+
    `drop-shadow(0 0 ${g*0.8}px ${hexToRgbaStr(color,amount)}) `+
    `drop-shadow(0 0 ${g*1.6}px ${hexToRgbaStr(color,0.6*amount)}) `+
    `drop-shadow(0 0 ${g*2.4}px ${hexToRgbaStr(color,0.3*amount)})`+
    (outerFade?` drop-shadow(0 0 ${g*4}px ${hexToRgbaStr(color,0.25*amount)})`:"")+
    (innerFade?" brightness(1.3)":"")+
    ` drop-shadow(2px 3px 4px rgba(0,0,0,${0.55*amount}))`;
  return (
    <div style={{
      position:"absolute",left:(boxW-cw)/2,top:(boxH-ch)/2,width:cw,height:ch,pointerEvents:"none",
      transform:pressed?"translateY(1px) scaleY(0.96)":"translateY(0) scaleY(1)",
      transition:"transform 0.06s cubic-bezier(0.4,0,0.2,1)",
    }}>
      {/* Darkened face */}
      <div style={{position:"absolute",inset:0,...faceMask,
        background:`rgba(0,0,0,${pressed?0.5*amount:0})`,transition:"background 0.06s"}}/>
      {/* Inset shadow — blurred "outside the shape" layer clipped back to the shape */}
      <div style={{position:"absolute",inset:0,...faceMask,overflow:"hidden",opacity:pressed?1:0,transition:"opacity 0.06s"}}>
        <div style={{position:"absolute",inset:-PRESS_PAD,...outsideMask,
          background:`rgba(0,0,0,${0.8*amount})`,filter:"blur(4px)",transform:"translateY(3px)"}}/>
      </div>
      {/* Hollow glowing ring — only blooms outside the face */}
      <div style={{position:"absolute",inset:-PRESS_PAD,...outsideMask,display:pressed?"block":"none"}}>
        <div style={{position:"absolute",inset:PRESS_PAD,filter:ringFilter}}>
          <div style={{position:"absolute",inset:0,...ringMask,background:hexToRgbaStr(color,amount)}}/>
        </div>
      </div>
    </div>
  );
}

function MouseView({skinUrl, color, editMode, opacity=1, glow=6, innerFade=false, outerFade=false, masks, onMasksChange, videoFit="contain", contrast=1, saturate=1,
  mouseRgbEnabled=false, mouseRgbMode="wave" as "wave"|"breathing", mouseRgbSpeed=6, mouseRgbIntensity=1, mouseRgbColor="#e40707", mouseRgbRainbow=true,
  mouseSnapBack=true,
}: {skinUrl:string; color:string; editMode:boolean; opacity?:number; glow?:number; innerFade?:boolean; outerFade?:boolean; masks:MouseMaskDef[]; onMasksChange:(m:MouseMaskDef[])=>void; videoFit?:"contain"|"cover"; contrast?:number; saturate?:number;
  mouseRgbEnabled?:boolean; mouseRgbMode?:"wave"|"breathing"; mouseRgbSpeed?:number; mouseRgbIntensity?:number; mouseRgbColor?:string; mouseRgbRainbow?:boolean;
  mouseSnapBack?:boolean;
}) {
  const [pos,setPos]=useState({x:0,y:0});
  const posRef=useRef({x:0,y:0});
  // Read live inside the rAF loop below instead of as an effect dependency —
  // that loop is set up once on mount and must keep running continuously
  // without tearing down/rebuilding every time the toggle changes.
  const snapBackRef=useRef(mouseSnapBack);
  useEffect(()=>{ snapBackRef.current=mouseSnapBack; });
  const [btns,setBtns]=useState<Set<number>>(new Set());
  const [selectedMask,setSelectedMask]=useState<string|null>(null);
  const containerRef=useRef<HTMLDivElement>(null);
  const RADIUS=50;

  useEffect(()=>{
    const onMove=(e:MouseEvent)=>{
      posRef.current.x=clamp(posRef.current.x+e.movementX*0.5,-RADIUS,RADIUS);
      posRef.current.y=clamp(posRef.current.y+e.movementY*0.5,-RADIUS,RADIUS);
    };
    // Safety net mirroring the export's WS path: if the matching mouseup
    // never arrives (e.g. focus is lost mid-press), auto-release after a
    // beat instead of leaving the button mask lit forever. Restarted by
    // each new down, cleared by the real up, so a normal press-and-hold
    // never trips it.
    const releaseTimers: Record<number, ReturnType<typeof setTimeout>> = {};
    const onDown=(e:MouseEvent)=>{
      setBtns(p=>{const n=new Set(p);n.add(e.button);return n;});
      clearTimeout(releaseTimers[e.button]);
      releaseTimers[e.button]=setTimeout(()=>setBtns(p=>{const n=new Set(p);n.delete(e.button);return n;}),600);
    };
    const onUp=(e:MouseEvent)=>{
      setBtns(p=>{const n=new Set(p);n.delete(e.button);return n;});
      clearTimeout(releaseTimers[e.button]);
    };

    // Light up scroll wheel (button index 1) while scrolling
    let scrollTimer: ReturnType<typeof setTimeout>;
    const onWheel=()=>{
      setBtns(p=>{const n=new Set(p);n.add(1);return n;});
      clearTimeout(scrollTimer);
      scrollTimer=setTimeout(()=>setBtns(p=>{const n=new Set(p);n.delete(1);return n;}),150);
    };

    let raf:number;
    const decay=()=>{
      if(snapBackRef.current){ posRef.current.x*=0.92; posRef.current.y*=0.92; }
      setPos({x:posRef.current.x,y:posRef.current.y});
      raf=requestAnimationFrame(decay);
    };
    raf=requestAnimationFrame(decay);
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mousedown",onDown);
    window.addEventListener("mouseup",onUp);
    window.addEventListener("wheel",onWheel,{passive:true});
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mousedown",onDown);window.removeEventListener("mouseup",onUp);window.removeEventListener("wheel",onWheel);cancelAnimationFrame(raf);clearTimeout(scrollTimer);Object.values(releaseTimers).forEach(clearTimeout);};
  },[]);

  const masksRef = useRef(masks);
  useEffect(()=>{ masksRef.current = masks; },[masks]);

  const dragRef=useRef<{active:boolean;isResize:boolean;maskId:string;startX:number;startY:number;startCx:number;startCy:number;startW:number;cW:number;cH:number}|null>(null);

  useEffect(()=>{
    const onMM=(e:MouseEvent)=>{
      const d=dragRef.current; if(!d?.active) return;
      const dx=e.clientX-d.startX, dy=e.clientY-d.startY;
      const updated = masksRef.current.map((m:MouseMaskDef)=>{
        if(m.id!==d.maskId) return m;
        if(d.isResize){
          const newW=clamp(d.startW+(dx+dy)*0.3,1,100);
          const ratio=m.w>0?m.h/m.w:1;
          return {...m,w:newW,h:newW*ratio};
        }
        return {...m,cx:clamp(d.startCx+dx/d.cW*100,0,100),cy:clamp(d.startCy+dy/d.cH*100,0,100)};
      });
      masksRef.current = updated;
      onMasksChange(updated);
    };
    const onMU=()=>{
      if(dragRef.current){
        dragRef.current.active=false;
        // Final sync on mouse up
        onMasksChange(masksRef.current);
      }
    };
    window.addEventListener("mousemove",onMM);
    window.addEventListener("mouseup",onMU);
    return()=>{window.removeEventListener("mousemove",onMM);window.removeEventListener("mouseup",onMU);};
  },[onMasksChange]);

  const startMaskDrag=(e:React.MouseEvent,maskId:string,isResize:boolean)=>{
    if(!editMode) return;
    e.stopPropagation(); e.preventDefault();
    const r=containerRef.current?.getBoundingClientRect();
    if(!r) return;
    const m=masks.find(x=>x.id===maskId)!;
    dragRef.current={active:true,isResize,maskId,startX:e.clientX,startY:e.clientY,startCx:m.cx,startCy:m.cy,startW:m.w,cW:r.width,cH:r.height};
    setSelectedMask(maskId);
  };

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%"}}
      onClick={()=>setSelectedMask(null)}>
      {/* Inner wrapper sized to actual rendered mouse image for correct mask positioning */}
      <div style={{position:"relative",width:"294px",height:"392px"}}>
      <div ref={containerRef} style={{position:"relative",width:"294px",height:"392px",
        transform:`translate(${editMode?0:pos.x}px,${editMode?0:pos.y}px)`,
        transition:"transform 0.04s ease-out",willChange:"transform"}}>

        {/* Black backdrop — same silhouette mask as the RGB layer below, filled
            solid black so there's no transparency showing through behind the
            RGB glow (mirrors the controller body / keyboard RGB backdrop). */}
        {mouseRgbEnabled && !isVideoSkin(skinUrl) && (
          <div className="absolute inset-0 w-full h-full pointer-events-none" style={{
            background: "#000",
            WebkitMaskImage: `url("${import.meta.env.BASE_URL}mkb/mouse-mask.png")`,
            maskImage: `url("${import.meta.env.BASE_URL}mkb/mouse-mask.png")`,
            WebkitMaskSize: "contain", maskSize: "contain",
            WebkitMaskPosition: "center", maskPosition: "center",
            WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          }} />
        )}

        {/* RGB body layer — masked to mouse skin silhouette, sits BEHIND the skin */}
        {mouseRgbEnabled && !isVideoSkin(skinUrl) && (
          <RgbBodyCanvas
            maskUrl={`${import.meta.env.BASE_URL}mkb/mouse-mask.png`}
            mode={mouseRgbMode}
            speed={mouseRgbSpeed}
            intensity={mouseRgbIntensity}
            color={mouseRgbColor}
            rainbow={mouseRgbRainbow}
          />
        )}

        {/* Mouse skin — wrapper carries color correction; filter never goes directly on <video> */}
        <div style={{
          position:"absolute",inset:0,
          filter:[contrast!==1?`contrast(${contrast})`:"",saturate!==1?`saturate(${saturate})`:""].filter(Boolean).join(" ")||undefined,
        }}>
          {isVideoSkin(skinUrl)
            ?<video src={skinUrl} autoPlay loop muted playsInline
               style={{width:"100%",height:"100%",objectFit:videoFit,display:"block",background:"transparent"}}/>
            :<img src={skinUrl} alt="Mouse" style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}}/>
          }
        </div>

        {/* Button masks — draggable in edit mode */}
        {masks.map(m=>{
          const pressed=btns.has(m.btnIndex);
          const isSelected=editMode&&selectedMask===m.id;
          return (
            <div key={m.id}
              onMouseDown={e=>startMaskDrag(e,m.id,false)}
              onClick={e=>{if(editMode){e.stopPropagation();setSelectedMask(m.id);}}}
              style={{
                position:"absolute",
                left:`${m.cx-m.w/2}%`, top:`${m.cy-m.h/2}%`,
                width:`${m.w}%`, height:`${m.h}%`,
                cursor:editMode?"move":"default",
                border:isSelected?"2px solid white":editMode?`1px solid ${m.color||"#fff"}88`:"1px solid transparent",
                background:"transparent",
                borderRadius:"4px",
                zIndex:isSelected?20:10,
              }}>
              {editMode
                ? <img src={m.src} alt={m.id} style={{
                    width:"100%",height:"100%",objectFit:"contain",
                    opacity: 0.9 * opacity,
                    filter: `drop-shadow(0 0 4px ${color}aa) drop-shadow(0 0 8px ${color}44)`,
                    pointerEvents:"none",
                  }}/>
                : <MouseBtnPress src={m.src} color={color} amount={opacity} glow={glow}
                    outerFade={outerFade} innerFade={innerFade} pressed={pressed}
                    boxW={m.w/100*294-2} boxH={m.h/100*392-2}/>}
              {/* Resize grip */}
              {isSelected&&(
                <div onMouseDown={e=>startMaskDrag(e,m.id,true)}
                  style={{position:"absolute",bottom:"-14px",left:"50%",transform:"translateX(-50%)",
                    width:"20px",height:"12px",background:m.color,borderRadius:"999px",
                    cursor:"se-resize",zIndex:30,boxShadow:"0 0 0 1.5px white",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="white">
                    <rect y="0" width="8" height="1.2" rx="0.6"/>
                    <rect y="3.8" width="8" height="1.2" rx="0.6"/>
                  </svg>
                </div>
              )}
              {isSelected&&(
                <div style={{position:"absolute",top:"-16px",left:"50%",transform:"translateX(-50%)",
                  fontSize:"8px",fontFamily:"monospace",background:"rgba(0,0,0,0.8)",color:"white",
                  padding:"1px 4px",borderRadius:"3px",whiteSpace:"nowrap",pointerEvents:"none"}}>
                  {m.id} {m.cx.toFixed(1)},{m.cy.toFixed(1)} {m.w.toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local types (non-duplicate)
// ─────────────────────────────────────────────────────────────────────────────
interface KeyOverride { cx:number; cy:number; w:number; h:number; }

// ─────────────────────────────────────────────────────────────────────────────
// Main MKB View
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  color: string;
  keyPressColor: string;
  keyPressOpacity: number;
  keyPressGlow: number;
  mouseColor: string;
  kbOpacity: number;
  kbGlow: number;
  mouseOpacity: number;
  mouseGlow: number;
  mouseInnerFade: boolean;
  mouseOuterFade: boolean;
  mouseSnapBack: boolean;
  mouseRgbEnabled?: boolean;
  mouseRgbMode?: "wave"|"breathing";
  mouseRgbSpeed?: number;
  mouseRgbIntensity?: number;
  mouseRgbColor?: string;
  mouseRgbRainbow?: boolean;
  mkbShowShadow: boolean;
  mkbShadowIntensity: number;
  mkbShadowDistance: number;
  mkbShadowAngle: number;
  rgbStyle: 1|2|3;
  onRgbStyleChange: (s:1|2|3)=>void;
  rainbow: boolean;
  onRainbowChange?: (v:boolean)=>void;
  onRgbOff?: ()=>void;
  keyboardSkinUrl: string;
  mouseSkinUrl: string;
  keyboardButtonsUrl: string;
  kbSkinVideoFit?: "contain" | "cover";
  kbSkinContrast?: number;
  kbSkinSaturate?: number;
  mouseSkinVideoFit?: "contain" | "cover";
  mouseSkinContrast?: number;
  mouseSkinSaturate?: number;
  editMode: boolean;
  keyOverrides: Record<string,{cx:number;cy:number;w:number;h:number}>;
  mouseOverrides: {id:string;cx:number;cy:number;w:number;h:number}[];
  onKeyOverridesChange: (o: Record<string,{cx:number;cy:number;w:number;h:number}>) => void;
  onMouseOverridesChange: (o: {id:string;cx:number;cy:number;w:number;h:number}[]) => void;
  onGetMasksRef?: React.MutableRefObject<()=>{id:string;cx:number;cy:number;w:number;h:number}[]>;
}

export function MkbView({color,keyPressColor,keyPressOpacity,keyPressGlow,mouseColor,kbOpacity,kbGlow,mouseOpacity,mouseGlow,mouseInnerFade,mouseOuterFade,mouseSnapBack,mouseRgbEnabled=false,mouseRgbMode="wave" as "wave"|"breathing",mouseRgbSpeed=6,mouseRgbIntensity=1,mouseRgbColor="#e40707",mouseRgbRainbow=true,mkbShowShadow,mkbShadowIntensity,mkbShadowDistance,mkbShadowAngle,rgbStyle,onRgbStyleChange,rainbow,onRainbowChange,onRgbOff,keyboardSkinUrl,mouseSkinUrl,keyboardButtonsUrl,kbSkinVideoFit="contain",kbSkinContrast=1,kbSkinSaturate=1,mouseSkinVideoFit="contain",mouseSkinContrast=1,mouseSkinSaturate=1,editMode,keyOverrides,mouseOverrides,onKeyOverridesChange,onMouseOverridesChange,onGetMasksRef}:Props) {
  const [pressedKeys,setPressedKeys]=useState<Set<string>>(new Set());
  // CapsLock is visually distinct from a normal key press: capsLockOn is the
  // persistent toggle state (lit with a lighter "resting active" look for as
  // long as caps is on), capsFlash is a brief full-depth press just for the
  // instant the physical key is actually struck, so tapping it still feels
  // like a press before it settles into the lighter active look.
  const [capsLockOn,setCapsLockOn]=useState(false);
  const [capsFlash,setCapsFlash]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [ledActive,setLedActive]=useState<Map<string,1|2>>(new Map());
  const containerRef=useRef<HTMLDivElement>(null);

  // Mouse masks — lifted up so presets can save/restore them
  const [masks,setMasks]=useState<MouseMaskDef[]>(DEFAULT_MOUSE_MASKS);
  const masksStateRef = useRef<MouseMaskDef[]>(DEFAULT_MOUSE_MASKS);
  // Keep ref always current so export can read fresh data
  useEffect(()=>{ masksStateRef.current = masks; },[masks]);
  // Expose masks getter to parent for export — update every render so it's always fresh
  if(onGetMasksRef) {
    onGetMasksRef.current = ()=>masksStateRef.current.map(({id,cx,cy,w,h})=>({id,cx,cy,w,h}));
  }

  // Sync mouseOverrides INTO masks when preset is loaded from Studio
  const prevMouseOverrides = useRef<string>("");
  useEffect(()=>{
    if(!mouseOverrides||mouseOverrides.length===0) return;
    const key = JSON.stringify(mouseOverrides);
    if(key === prevMouseOverrides.current) return;
    prevMouseOverrides.current = key;
    setMasks(DEFAULT_MOUSE_MASKS.map(d=>{
      const ov=mouseOverrides.find(o=>o.id===d.id);
      return ov?{...d,...ov}:d;
    }));
  },[mouseOverrides]);

  // Sync masks to parent whenever they change. Memoized — this used to be a
  // plain function recreated on every render, and the mouse-mask editor's
  // window mousemove/mouseup listeners depend on this exact reference
  // ([onMasksChange] in its effect deps). Every drag tick called this (via
  // setMasks), which re-rendered MkbView, which handed down a brand new
  // function identity, which tore down and re-subscribed those window
  // listeners dozens of times a second mid-drag — leaving a race window
  // where a mouseup landing exactly during that gap was never seen, so the
  // mask kept "stuck" following the cursor instead of releasing.
  const handleMasksChange=useCallback((newMasks:MouseMaskDef[])=>{
    setMasks(newMasks);
    const overrides = newMasks.map(({id,cx,cy,w,h})=>({id,cx,cy,w,h}));
    // Update prevMouseOverrides so the sync useEffect doesn't re-fire
    prevMouseOverrides.current = JSON.stringify(overrides);
    onMouseOverridesChange(overrides);
  },[onMouseOverridesChange]);

  // Track which key is currently active and its mode
  const activeLedRef = useRef<string|null>(null);
  const activeLedModeRef = useRef<number>(0); // 0=off, 1=solid, 2=rainbow

  // Key events
  useEffect(()=>{
    // Don't hijack keystrokes meant for an actual text field — this listens
    // on `window` and used to preventDefault() every single key press
    // unconditionally, which silently ate every keystroke typed into the
    // preset-name input, the overlay-name field, or any other text input
    // anywhere in the app for as long as the MKB tab was open.
    const isTypingTarget = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onDown=(e:KeyboardEvent)=>{
      if(isTypingTarget()) return;
      // Ignore OS key-repeat — otherwise holding a key down re-fires this on
      // every repeat tick, which for Digit6/7/8 below rapid-cycles through
      // all three LED modes in under a second instead of advancing once per
      // actual press.
      if(e.repeat) return;
      e.preventDefault();
      // CapsLock is a toggle, not a momentary press — it should stay lit
      // (with a lighter "resting active" look, not the full press depth)
      // until pressed again, not just while physically held. getModifierState
      // reflects the OS's actual lock state after this keydown (rather than
      // us tracking our own on/off flag, which could drift out of sync with
      // e.g. Caps Lock having been toggled before the app had focus). Kept
      // entirely out of pressedKeys — capsLockOn/capsFlash drive its look
      // instead, so it never gets the same deep, blur-exempt press style
      // every other key uses.
      if(e.code==="CapsLock") {
        setCapsLockOn(e.getModifierState("CapsLock"));
        setCapsFlash(true);
        setTimeout(()=>setCapsFlash(false), 120);
        return;
      }
      setPressedKeys(p=>{const n=new Set(p);n.add(e.code);return n;});
      if(e.code==="Digit6"||e.code==="Digit7"||e.code==="Digit8") {
        const styleMap: Record<string,1|2|3> = {Digit6:1,Digit7:2,Digit8:3};
        if(activeLedRef.current !== e.code) {
          // Different key — switch to solid on this key
          activeLedRef.current = e.code;
          activeLedModeRef.current = 1;
          setLedActive(new Map([[e.code,1]]));
          onRainbowChange?.(false);
          onRgbStyleChange(styleMap[e.code]);
        } else {
          // Same key — cycle mode
          const nextMode = (activeLedModeRef.current % 3) + 1;
          if(nextMode === 2) {
            // Rainbow (LED pulses red; RGB output unchanged)
            activeLedModeRef.current = 2;
            setLedActive(new Map([[e.code,2]]));
            onRainbowChange?.(true);
          } else {
            // Off (nextMode wraps to 3 then off)
            activeLedRef.current = null;
            activeLedModeRef.current = 0;
            setLedActive(new Map());
            onRainbowChange?.(false);
            onRgbOff?.();
          }
        }
      }
    };
    // CapsLock no longer touches pressedKeys at all, so onUp/onBlur need no
    // special-casing for it any more — its own capsLockOn state already
    // persists correctly across both keyup and a focus change untouched.
    const onUp=(e:KeyboardEvent)=>setPressedKeys(p=>{const n=new Set(p);n.delete(e.code);return n;});
    // If the window loses focus while a key is physically held (alt-tab,
    // clicking outside, minimizing), its keyup never fires — the key would
    // otherwise stay lit/highlighted forever until pressed again.
    const onBlur=()=>setPressedKeys(new Set());
    window.addEventListener("keydown",onDown);
    window.addEventListener("keyup",onUp);
    window.addEventListener("blur",onBlur);
    return()=>{
      window.removeEventListener("keydown",onDown);
      window.removeEventListener("keyup",onUp);
      window.removeEventListener("blur",onBlur);
    };
  },[onRgbStyleChange,onRainbowChange,onRgbOff]);

  const keyPositions=Object.fromEntries(
    BASE_KEYS.map(k=>[k.code,keyOverrides[k.code]||{cx:k.cx,cy:k.cy}])
  );


  return (
    <div className="flex items-center justify-center w-full h-full" onClick={()=>setSelected(null)}>

      {/* Keyboard + mouse section */}
      <div className="flex items-center justify-center gap-6 p-4 w-full">

        {/* ── Keyboard ── */}
        {/* Outer wrapper carries the drop-shadow filter and has NO overflow
            clipping — a filter applied on the same element as overflow:hidden
            gets its own shadow cut off at that element's box edge, which was
            clipping the keyboard's drop shadow into a visible rectangle. The
            rounded-corner clipping now lives on the inner wrapper instead, so
            the shadow can render freely outside the keyboard's own bounds. */}
        <div ref={containerRef} className="relative flex-shrink-0"
          style={{width:"800px",aspectRatio:"1344/799",
            filter: mkbShowShadow ? (() => {
              const rad = (mkbShadowAngle * Math.PI) / 180;
              const x = Math.round(Math.sin(rad) * mkbShadowDistance);
              const y = Math.round(Math.cos(rad) * mkbShadowDistance);
              const a = mkbShadowIntensity;
              return `drop-shadow(${x}px ${y}px 24px rgba(0,0,0,${a})) drop-shadow(${Math.round(x*0.4)}px ${Math.round(y*0.4)}px 8px rgba(0,0,0,${Math.min(a+0.1,1)}))`;
            })() : "none"
          }}
          onClick={e=>{if(editMode)e.stopPropagation();}}>
        <div className="relative w-full h-full overflow-hidden rounded-xl">

          {/* Always-on black backdrop — clipped to keyboard shape, keeps cutouts opaque when RGB is off */}
          <img src={`${import.meta.env.BASE_URL}mkb/keyboard-black.png`}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{zIndex:0}} />

          {/* RGB canvas — sits on top of black backdrop */}
          <div className="absolute inset-0 w-full h-full pointer-events-none"
            style={{zIndex:0, opacity:kbOpacity}}>
            <RgbCanvas style={rgbStyle} color={color} rainbow={rainbow}
              pressedKeys={new Set([...pressedKeys].filter(k => !STYLE_CODES.includes(k)))}
              keyPositions={keyPositions}/>
          </div>

          {/* Layer 1: LED indicators — behind skin, glow shows through transparent cutouts */}
          {[
            { key: "Digit6", cx: 72.8, cy: 22.74 },
            { key: "Digit7", cx: 77.6, cy: 22.68 },
            { key: "Digit8", cx: 82.3, cy: 22.77 },
          ].map((led) => {
            const mode = ledActive.get(led.key);
            const active = mode !== undefined;
            return (
              <div key={led.key} style={{
                position: "absolute",
                left: `${led.cx}%`, top: `${led.cy}%`,
                transform: "translate(-50%, -50%)",
                width: "4.0%", height: "7.0%",
                borderRadius: "50%",
                background: active
                  ? mode === 2
                    ? "radial-gradient(circle, #ff8080 0%, #ff0000 70%)"
                    : "radial-gradient(circle, #ff6060 0%, #cc0000 70%)"
                  : "#0a0000",
                animation: mode === 2 ? "ledRgbCycle 2s linear infinite" : "none",
                transition: "background 0.08s",
                zIndex: 1,
                pointerEvents: "none",
              }} />
            );
          })}
          <style>{`
            @keyframes ledRgbCycle {
              0%   { filter: hue-rotate(0deg) saturate(1.4); }
              100% { filter: hue-rotate(360deg) saturate(1.4); }
            }
          `}</style>

          {/* Layer 2: Keyboard skin — transparent holes let RGB and LEDs show through */}
          <div className="absolute inset-0 w-full h-full pointer-events-none" style={{
            zIndex:2,
            filter:[kbSkinContrast!==1?`contrast(${kbSkinContrast})`:"",kbSkinSaturate!==1?`saturate(${kbSkinSaturate})`:""].filter(Boolean).join(" ")||undefined,
          }}>
            {isVideoSkin(keyboardSkinUrl)
              ?<video src={keyboardSkinUrl} autoPlay loop muted playsInline
                 className="absolute inset-0 w-full h-full pointer-events-none"
                 style={{objectFit:kbSkinVideoFit,background:"transparent"}}/>
              :<img src={keyboardSkinUrl} alt="Keyboard"
                 className="absolute inset-0 w-full h-full object-cover pointer-events-none"/>
            }
          </div>

          {/* Layer 3: Keyboard keys — transparent key shapes sit on top of RGB.
              Supports both PNG (static) and WebM (animated). */}
          {keyboardButtonsUrl&&(
            isVideoSkin(keyboardButtonsUrl)
              ? <video src={keyboardButtonsUrl} autoPlay loop muted playsInline
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{zIndex:3}} />
              : <img src={keyboardButtonsUrl} alt=""
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{zIndex:3}}/>
          )}

          {/* Layer 4: Draggable key markers */}
          <div className="absolute inset-0 w-full h-full" style={{zIndex:6}}>
            {BASE_KEYS.filter(key => !STYLE_CODES.includes(key.code)).map(key=>{
              const isStyle=STYLE_CODES.includes(key.code);
              const styleIdx=(STYLE_CODES.indexOf(key.code)+1) as RgbStyle;
              return (
                <KeyMarker key={key.code} keyDef={key}
                  overridePos={keyOverrides[key.code]}
                  isSelected={selected===key.code}
                  isPressed={key.code==="CapsLock" ? capsFlash : pressedKeys.has(key.code)}
                  isToggleActive={key.code==="CapsLock" && capsLockOn}
                  isActiveStyle={isStyle&&rgbStyle===styleIdx}
                  color={keyPressColor}
                  editColor={KEY_COLORS[key.code]??"#ffffff"}
                  kbOpacity={kbOpacity} kbGlow={kbGlow}
                  keyPressOpacity={keyPressOpacity} keyPressGlow={keyPressGlow}
                  onSelect={()=>setSelected(key.code)}
                  onMove={(cx,cy)=>onKeyOverridesChange({...keyOverrides,[key.code]:{...keyOverrides[key.code]??{w:key.w,h:key.h},cx,cy}})}
                  onResize={(w,h)=>onKeyOverridesChange({...keyOverrides,[key.code]:{...keyOverrides[key.code]??{cx:key.cx,cy:key.cy},w,h}})}
                  containerRef={containerRef}
                  editMode={editMode}/>
              );
            })}
          </div>
        </div>{/* end inner clipped wrapper */}
        </div>{/* end outer shadow wrapper */}



        {/* ── Mouse ── */}
        <div className="flex-shrink-0" style={{width:"308px",height:"392px",
          filter: mkbShowShadow ? (() => {
            const rad = (mkbShadowAngle * Math.PI) / 180;
            const x = Math.round(Math.sin(rad) * mkbShadowDistance);
            const y = Math.round(Math.cos(rad) * mkbShadowDistance);
            const a = mkbShadowIntensity;
            return `drop-shadow(${x}px ${y}px 24px rgba(0,0,0,${a})) drop-shadow(${Math.round(x*0.4)}px ${Math.round(y*0.4)}px 8px rgba(0,0,0,${Math.min(a+0.1,1)}))`;
          })() : "none"
        }}>
          <MouseView skinUrl={mouseSkinUrl} color={mouseColor} editMode={editMode}
            opacity={mouseOpacity} glow={mouseGlow} innerFade={mouseInnerFade} outerFade={mouseOuterFade} mouseSnapBack={mouseSnapBack}
            videoFit={mouseSkinVideoFit} contrast={mouseSkinContrast} saturate={mouseSkinSaturate}
            mouseRgbEnabled={mouseRgbEnabled} mouseRgbMode={mouseRgbMode} mouseRgbSpeed={mouseRgbSpeed}
            mouseRgbIntensity={mouseRgbIntensity} mouseRgbColor={mouseRgbColor} mouseRgbRainbow={mouseRgbRainbow}
            masks={masks} onMasksChange={handleMasksChange}/>
        </div>
      </div>
    </div>
  );
}
