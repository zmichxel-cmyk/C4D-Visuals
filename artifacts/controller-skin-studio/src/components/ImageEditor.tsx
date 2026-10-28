import React, { useRef, useState, useEffect, useCallback } from "react";
import { Upload, Eraser, Paintbrush, Wand2, Undo2, RotateCcw, ZoomIn, ZoomOut, Image as ImageIcon, Square, Circle, Check, X, ArrowRightCircle, MousePointer, ChevronDown } from "lucide-react";
import { ControllerType, CONTROLLER_TYPES } from "../lib/layouts";
import { HomeButtonZone, BezelSlot } from "../types/config";
import { addToCustomLibrary, loadCustomLibrary, removeFromCustomLibrary, useAddToLibrary, LibraryEntry } from "./LibraryPicker";

type Tool = "select" | "wand" | "erase" | "restore" | "crop-rect" | "crop-circle";
export type ExportSlot = "controllerSkin" | "leftStickSkin" | "rightStickSkin";
export type MkbSlot   = "kbSkin" | "mouseSkin" | "kbButtonsSkin";
// Union of all possible export targets (controller ids, "mkb", or null = no selection)
type ExportTargetMode = ControllerType | "mkb" | null;

interface HistoryEntry {
  data: ImageData;
}

interface Selection {
  x: number; y: number; w: number; h: number;
}

interface BezelInstance {
  id: number;
  x: number; y: number;
  size: number;
  bezelUrl: string;   // which bezel from BEZEL_LIBRARY
  hue: number;        // -180 → 180
  brightness: number; // 0 → 2  (1 = unchanged)
  contrast: number;   // 0 → 2
  saturate: number;   // 0 → 2
}

interface HomeButtonState {
  src: string;        // blob/data URL of the uploaded PNG
  x: number; y: number;
  size: number;
  hue: number; brightness: number; contrast: number; saturate: number;
}

export const BEZEL_LIBRARY = [
  { id: "analog-bezel",          name: "Analog Bezel",          url: "bezels/analog-bezel.png" },
  { id: "anodized",              name: "Anodized",              url: "bezels/anodized.png" },
  { id: "aurora",                name: "Aurora",                url: "bezels/aurora.png" },
  { id: "carbon-fiber",          name: "Carbon Fiber",          url: "bezels/carbon-fiber.png" },
  { id: "carbon-fiber-gunmetal", name: "Carbon Fiber Gunmetal", url: "bezels/carbon-fiber-gunmetal.png" },
  { id: "chrome",                name: "Chrome",                url: "bezels/chrome.png" },
  { id: "chrome-blue",           name: "Chrome Blue",           url: "bezels/chrome-blue.png" },
  { id: "concrete",              name: "Concrete",              url: "bezels/concrete.png" },
  { id: "cracked-magma",         name: "Cracked Magma",         url: "bezels/cracked-magma.png" },
  { id: "crystalized",           name: "Crystalized",           url: "bezels/crystalized.png" },
  { id: "glossy-black",          name: "Glossy Black",          url: "bezels/glossy-black.png" },
  { id: "gold",                  name: "Gold",                  url: "bezels/gold.png" },
  { id: "gunmetal",              name: "Gunmetal",              url: "bezels/gunmetal.png" },
  { id: "h-713",                 name: "H-713",                 url: "bezels/h-713.png" },
  { id: "hammered-copper",       name: "Hammered Copper",       url: "bezels/hammered-copper.png" },
  { id: "knitted-fiber",         name: "Knitted Fiber",         url: "bezels/knitted-fiber.png" },
  { id: "marble",                name: "Marble",                url: "bezels/marble.png" },
  { id: "matte-black",           name: "Matte Black",           url: "bezels/matte-black.png" },
  { id: "matte-blue",            name: "Matte Blue",            url: "bezels/matte-blue.png" },
  { id: "matte-gold",            name: "Matte Gold",            url: "bezels/matte-gold.png" },
  { id: "matte-gray",            name: "Matte Gray",            url: "bezels/matte-gray.png" },
  { id: "matte-red",             name: "Matte Red",             url: "bezels/matte-red.png" },
  { id: "matte-tan",             name: "Matte Tan",             url: "bezels/matte-tan.png" },
  { id: "molten-lava",           name: "Molten Lava",           url: "bezels/molten-lava.png" },
  { id: "mother-of-pearl",       name: "Mother of Pearl",       url: "bezels/mother-of-pearl.png" },
  { id: "nebula",                name: "Nebula",                url: "bezels/nebula.png" },
  { id: "opal",                  name: "Opal",                  url: "bezels/opal.png" },
  { id: "red-knitted-fiber",     name: "Red Knitted Fiber",     url: "bezels/red-knitted-fiber.png" },
  { id: "ridged-steel",          name: "Ridged Steel",          url: "bezels/ridged-steel.png" },
  { id: "rock",                  name: "Rock",                  url: "bezels/rock.png" },
  { id: "scuffed-anodized",      name: "Scuffed Anodized",      url: "bezels/scuffed-anodized.png" },
  { id: "silver",                name: "Silver",                url: "bezels/silver.png" },
  { id: "silver-wood-grain",     name: "Silver Wood Grain",     url: "bezels/silver-wood-grain.png" },
  { id: "soap-stone",            name: "Soap Stone",            url: "bezels/soap-stone.png" },
  { id: "steel",                 name: "Steel",                 url: "bezels/steel.png" },
  { id: "wicker",                name: "Wicker",                url: "bezels/wicker.png" },
  { id: "wood-grain",            name: "Wood Grain",            url: "bezels/wood-grain.png" },
];
const MAX_HISTORY = 20;

interface Props {
  onExportToSkin:    (dataUrl: string, slot: ExportSlot, controllerType: ControllerType, homeButtonZone: HomeButtonZone | null, bezelSlots: BezelSlot[], baseSkinNoBezels: string | null) => void;
  onClearSlot:       (slot: ExportSlot, controllerType: ControllerType) => void;
  onExportMkbSkin:   (dataUrl: string, slot: MkbSlot) => void;
  onClearMkbSlot:    (slot: MkbSlot) => void;
  pendingSkins:      Partial<Record<string, Partial<Record<ExportSlot, string>> & { homeButtonZone?: HomeButtonZone | null }>>;
  activeControllerType: ControllerType;
  activeConfig:      { controllerSkin: string | null; leftStickSkin: string | null; rightStickSkin: string | null };
  activeMkbConfig:   { kbSkin: string | null; mouseSkin: string | null; kbButtonsSkin: string | null };
}

// ── Blend mode definitions (module-level so Babel handles type alias correctly) ──
const BLEND_MODES = [
  { id: "normal",      label: "Normal"      },
  { id: "multiply",    label: "Multiply"    },
  { id: "screen",      label: "Screen"      },
  { id: "overlay",     label: "Overlay"     },
  { id: "soft-light",  label: "Soft Light"  },
  { id: "hard-light",  label: "Hard Light"  },
  { id: "color-dodge", label: "Color Dodge" },
  { id: "color-burn",  label: "Color Burn"  },
  { id: "darken",      label: "Darken"      },
  { id: "lighten",     label: "Lighten"     },
  { id: "difference",  label: "Difference"  },
  { id: "luminosity",  label: "Luminosity"  },
] as const;
type BlendModeId = "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light" | "color-dodge" | "color-burn" | "darken" | "lighten" | "difference" | "luminosity";
const BLEND_MODE_IDX: Record<string, number> = Object.fromEntries(BLEND_MODES.map((m, i) => [m.id, i]));

// ── Sidebar helper components ──────────────────────────────────────────────
function Section({ label, children, defaultOpen = false }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-card hover:bg-muted/40 transition-colors">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">{label}</span>
        <ChevronDown size={12} className={`text-muted-foreground transition-transform duration-200 flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1.5 border-t border-border bg-background/50">
          {children}
        </div>
      )}
    </div>
  );
}

/** Single value row: slider + numeric text input. */
function NumRow({ label, value, unit, min, max, step, onChange }: {
  label: string; value: number; unit?: string;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
            className="w-14 text-[10px] text-right bg-muted/30 border border-border rounded px-1 py-0.5" />
          {unit && <span className="text-[9px] text-muted-foreground/60">{unit}</span>}
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 accent-primary cursor-pointer" />
    </div>
  );
}

/** Dual-value row for Blend If feathered range.
 *  Two independent sliders: Start (lo) and End (hi).
 *  For Shadows:    both start at 0   — drag right to cut dark pixels.
 *  For Highlights: both start at 255 — drag left  to cut bright pixels.
 */
function DualRow({ label, lo, hi, setLo, setHi }: {
  label: string; lo: number; hi: number;
  setLo: (v: number) => void; setHi: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {/* Start handle */}
      <div className="grid grid-cols-[32px_minmax(0,1fr)_40px] gap-x-1.5 items-center">
        <span className="text-[9px] text-muted-foreground/50 text-right">Start</span>
        <input type="range" min={0} max={255} step={1} value={lo}
          onChange={e => setLo(Number(e.target.value))}
          className="w-full min-w-0 h-1 accent-primary cursor-pointer" />
        <input type="number" min={0} max={255} value={lo}
          onChange={e => setLo(Math.min(255, Math.max(0, Number(e.target.value))))}
          className="w-full text-[9px] text-right bg-muted/30 border border-border rounded px-1 py-0.5" />
      </div>
      {/* End handle (feather) */}
      <div className="grid grid-cols-[32px_minmax(0,1fr)_40px] gap-x-1.5 items-center">
        <span className="text-[9px] text-muted-foreground/50 text-right">End</span>
        <input type="range" min={0} max={255} step={1} value={hi}
          onChange={e => setHi(Number(e.target.value))}
          className="w-full min-w-0 h-1 accent-primary cursor-pointer" />
        <input type="number" min={0} max={255} value={hi}
          onChange={e => setHi(Math.min(255, Math.max(0, Number(e.target.value))))}
          className="w-full text-[9px] text-right bg-muted/30 border border-border rounded px-1 py-0.5" />
      </div>
      {/* Visual range indicator */}
      <div className="h-0.5 bg-border/30 rounded-full relative">
        <div className="absolute h-full bg-primary/50 rounded-full"
          style={{
            left:  `${(Math.min(lo,hi)/255)*100}%`,
            width: `${(Math.abs(hi-lo)/255)*100}%`,
          }} />
      </div>
    </div>
  );
}

// ── Module-level constants + shared components ──────────────────────────────
// Defined outside ImageEditor so React never remounts them on re-render.

const checkerStyle: React.CSSProperties = {
  backgroundImage: "url(editor-checker-tile.png)",
  backgroundSize: "136px 54px",
  backgroundRepeat: "repeat",
  backgroundColor: "#1a1a22",
};

function SlotCard({ label, value, filled, isSelected, onClick, onClear }: {
  label: string; value: string | null | undefined; filled: boolean;
  isSelected: boolean; onClick: () => void; onClear: (e: React.MouseEvent) => void;
}) {
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={`relative flex flex-col gap-1 text-left rounded-lg border-2 p-2 transition-all cursor-pointer ${isSelected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      <div className="relative w-full h-24 rounded-md overflow-hidden border border-border" style={checkerStyle}>
        {filled && value ? (
          (value.startsWith("data:video/") || value.startsWith("blob:")) ? (
            <>
              <video src={value} autoPlay loop muted playsInline className="w-full h-full object-contain" />
              <div style={{position:"absolute",top:3,left:3,fontSize:9,background:"rgba(109,40,217,0.85)",color:"#fff",padding:"1px 5px",borderRadius:3,fontWeight:600,pointerEvents:"none"}}>
                🎬 WebM
              </div>
            </>
          ) : (
            <img src={value} alt={label} className="w-full h-full object-contain" />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon size={20} className="text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] ${filled ? "text-primary" : "text-muted-foreground/50"}`}>
          {filled ? <><Check size={9} className="inline mr-0.5" />Ready</> : "Empty"}
        </span>
        <div className="flex items-center gap-1">
          {filled && (
            <button onClick={onClear} title="Reset slot to default"
              className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-destructive transition-colors px-1 py-0.5 rounded hover:bg-destructive/10">
              <X size={9} /> Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * High-quality downscaling via stepped halving.
 * Direct bilinear (imageSmoothingQuality:"high") blurs when scaling > 2x.
 * This halves the image repeatedly until within 2x of the target,
 * then does a final draw — producing much sharper results on large → small scales.
 */
/** Fits a natural (possibly non-square) image inside a square box without
 *  stretching it — scales to the largest size that fits both dimensions and
 *  centers it, the canvas equivalent of CSS object-fit:contain. Needed for
 *  the home button specifically since, unlike bezels, its source assets
 *  aren't guaranteed to be perfectly square. */
function containInSquare(natW: number, natH: number, boxX: number, boxY: number, boxSize: number) {
  const scale = Math.min(boxSize / natW, boxSize / natH);
  const w = natW * scale, h = natH * scale;
  return { x: boxX + (boxSize - w) / 2, y: boxY + (boxSize - h) / 2, w, h };
}

function drawHighQuality(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  dx: number, dy: number, dw: number, dh: number
) {
  const sw = img instanceof HTMLImageElement ? img.naturalWidth  : (img as HTMLCanvasElement).width;
  const sh = img instanceof HTMLImageElement ? img.naturalHeight : (img as HTMLCanvasElement).height;

  // No significant downscale — direct draw is fine
  if (sw <= dw * 2 && sh <= dh * 2) {
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }

  // Step down in 50% increments until within 2× of target
  let cur: HTMLImageElement | HTMLCanvasElement = img;
  let cw = sw, ch = sh;
  while (cw > dw * 2 || ch > dh * 2) {
    const nw = Math.max(Math.round(cw / 2), dw);
    const nh = Math.max(Math.round(ch / 2), dh);
    const tmp = document.createElement("canvas");
    tmp.width = nw; tmp.height = nh;
    const tc = tmp.getContext("2d")!;
    tc.imageSmoothingEnabled = true;
    (tc as any).imageSmoothingQuality = "high";
    tc.drawImage(cur, 0, 0, nw, nh);
    cur = tmp; cw = nw; ch = nh;
  }

  // Final draw to destination
  ctx.imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = "high";
  ctx.drawImage(cur, dx, dy, dw, dh);
}

export function ImageEditor({ onExportToSkin, onClearSlot, onExportMkbSkin, onClearMkbSlot, pendingSkins, activeControllerType, activeConfig, activeMkbConfig }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoEditRef = useRef<HTMLVideoElement>(null); // ref to canvas-area video for frame capture

  // Original (untouched) image data, used as source for "restore" brush
  const originalDataRef = useRef<ImageData | null>(null);
  // History stack for undo
  const historyRef = useRef<HistoryEntry[]>([]);

  const [hasImage, setHasImage] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [tolerance, setTolerance] = useState(32);
  const [brushSize, setBrushSize] = useState(24);
  const [brushPos, setBrushPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const selDragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; orig: Selection } | null>(null);
  const [exportSlot, setExportSlot] = useState<ExportSlot>("controllerSkin");
  const [mkbSlot,    setMkbSlot]    = useState<MkbSlot>("kbSkin");
  // null = no target selected (dropdown shows "-- select target --")
  const [exportTargetOverride, setExportTargetOverride] = useState<ExportTargetMode>(null);
  const exportTarget    = exportTargetOverride;          // null = no selection
  const isMkbTarget     = exportTarget === "mkb";
  const isControllerTarget = exportTarget !== null && !isMkbTarget;
  const [exportDone, setExportDone] = useState(false);
  const [librarySaved, setLibrarySaved] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [showLibraryNamePrompt, setShowLibraryNamePrompt] = useState(false);
  const [libraryNameDraft, setLibraryNameDraft] = useState("");
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState(false);
  const [encodingProgress, setEncodingProgress] = useState(0);


  // Force the main editing canvas to use a software-rendered (CPU) 2D context.
  // willReadFrequently=true opts out of GPU hardware acceleration for this canvas.
  // Without this, a loaded skin occupies a large GPU texture; when the Windows file
  // dialog opens it must share GPU state with Chrome's compositor, triggering TDR
  // (display driver reset / screen blackout) on affected systems.
  // This must be the first getContext("2d") call on canvasRef — all subsequent calls
  // reuse this context and its settings automatically.
  useEffect(() => {
    canvasRef.current?.getContext("2d", { willReadFrequently: true });
  }, []);

  // When the user switches controller tabs, reset any controller target override
  // but keep "mkb" selected — MKB is tab-independent.
  useEffect(() => {
    setExportTargetOverride(prev => prev === "mkb" ? "mkb" : null);
  }, [activeControllerType]);
  const [croppedResult, setCroppedResult] = useState<{ url: string; w: number; h: number } | null>(null);

  // Bezel instances on canvas
  const [bezels, setBezels] = useState<BezelInstance[]>([]);
  const [selectedBezel, setSelectedBezel] = useState<number | null>(null);
  const bezelNextId = useRef(0);
  const bezelDragRef = useRef<{ id: number; mode: "move" | "resize"; startX: number; startY: number; origX: number; origY: number; origSize: number } | null>(null);
  // bakeToCanvas() flattens bezels into the working canvas and clears the
  // `bezels` state immediately — if the user then exports/saves afterward
  // (a completely separate action, often much later), handleExportToSkin
  // sees bezels.length === 0 and has nothing left to capture positions
  // from. This ref remembers the slot data from the last bake so export can
  // still pick it up even though the live bezels array is already empty.
  const lastBakedBezelDataRef = useRef<{ slots: BezelInstance[]; baseSkinNoBezels: string; homeButtonZone: HomeButtonZone | null } | null>(null);

  // Bezel picker popover state
  const [showBezelPicker, setShowBezelPicker]   = useState(false);
  const [pickerUrl,        setPickerUrl]         = useState(BEZEL_LIBRARY[0].url);
  const [pickerHue,        setPickerHue]         = useState(0);
  const [pickerBrightness, setPickerBrightness]  = useState(1);
  const [pickerContrast,   setPickerContrast]    = useState(1);
  const [pickerSaturate,   setPickerSaturate]    = useState(1);

  // Custom (user-added) bezels — real files under userData in Electron, so
  // they survive rebuilds the same way custom controller-body library
  // entries already do.
  const [customBezels, setCustomBezels] = useState<LibraryEntry[]>([]);
  useEffect(() => {
    if (!showBezelPicker) return;
    let cancelled = false;
    loadCustomLibrary("bezel").then(entries => { if (!cancelled) setCustomBezels(entries); });
    return () => { cancelled = true; };
  }, [showBezelPicker]);
  const addBezelToLibrary = useAddToLibrary("bezel", entry => setCustomBezels(prev => [...prev, entry]));
  async function removeCustomBezel(id: string) {
    await removeFromCustomLibrary("bezel", id);
    setCustomBezels(prev => prev.filter(e => e.id !== id));
  }

  // Home button overlay
  const [homeButton,         setHomeButton]         = useState<HomeButtonState | null>(null);
  const [homeButtonSelected, setHomeButtonSelected] = useState(false);
  const homeButtonImgRef  = useRef<HTMLImageElement | null>(null);
  const homeButtonFileRef = useRef<HTMLInputElement>(null);
  const homeButtonDragRef = useRef<{ mode: "move"|"resize"; startX: number; startY: number; origX: number; origY: number; origSize: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Logo Placement ───────────────────────────────────────────────────────────
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [logoSrc,       setLogoSrc]       = useState<string | null>(null);
  const [logoPos,       setLogoPos]       = useState({ x: 100, y: 100, w: 200, h: 200, rot: 0 });
  const [logoBlendMode, setLogoBlendMode] = useState<BlendModeId>("normal");
  const [logoOpacity,   setLogoOpacity]   = useState(0.85);
  // Blend If – This Layer (logo luma). Each range has a feather pair: [start, end].
  // At default (0/0 and 255/255) both smoothsteps collapse to step → no masking.
  const [biThisShLo, setBiThisShLo] = useState(0);     // shadow fade-in start
  const [biThisShHi, setBiThisShHi] = useState(0);     // shadow fade-in end (feather)
  const [biThisHiLo, setBiThisHiLo] = useState(255);   // highlight fade-out start
  const [biThisHiHi, setBiThisHiHi] = useState(255);   // highlight fade-out end (feather)
  // Blend If – Underlying Layer (surface luma)
  const [biUndShLo, setBiUndShLo]   = useState(0);
  const [biUndShHi, setBiUndShHi]   = useState(0);
  const [biUndHiLo, setBiUndHiLo]   = useState(255);
  const [biUndHiHi, setBiUndHiHi]   = useState(255);
  // Displacement – separate horizontal / vertical Sobel warp
  const [dispX, setDispX] = useState(0);
  const [dispY, setDispY] = useState(0);
  // Surface softening – Gaussian blur applied to the logo before compositing
  const [logoBlur, setLogoBlur] = useState(0);
  // Placement helpers
  const [lockAspect, setLockAspect] = useState(true);
  const [logoSelected, setLogoSelected] = useState(false);

  const logoDragRef = useRef<{ mode: "move" | "resize" | "rotate"; startX: number; startY: number; origPos: typeof logoPos; startAngle?: number } | null>(null);


  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    if (!file.type.startsWith("image/")) return;
    loadLogoFromBlob(file);
  }

  function loadLogoFromBlob(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        logoImgRef.current = img; // set BEFORE setLogoSrc so WebGL effect fires with image ready
        const maxW = 300;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const cv = canvasRef.current;
        const cx = cv ? Math.round((cv.width - w) / 2) : 100;
        const cy = cv ? Math.round((cv.height - h) / 2) : 100;
        setLogoPos({ x: cx, y: cy, w, h, rot: 0 });
        setLogoSelected(true);
        setLogoSrc(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  // Ctrl+V paste — right-click image in Explorer → Copy → Ctrl+V
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (file) { e.preventDefault(); loadLogoFromBlob(file); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WebGL engraving pipeline ──────────────────────────────────────────────
  const webglRef = useRef<WebGLRenderingContext | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glProgramRef = useRef<WebGLProgram | null>(null);

  // WebGL is initialised lazily — only when the user clicks "Bake to WebM".
  // Creating a WebGL context on mount conflicts with the Windows file picker dialog
  // on certain GPU drivers (causes TDR / full screen blackout when the dialog opens).
  function ensureWebGL(): boolean {
    if (webglRef.current && webglCanvasRef.current && glProgramRef.current) return true;
    const cv = document.createElement("canvas");
    cv.width = 2; cv.height = 2;
    const gl = cv.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    webglCanvasRef.current = cv;
    webglRef.current = gl;
    const VS = `attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*0.5+0.5;v_uv.y=1.0-v_uv.y;gl_Position=vec4(a_pos,0.0,1.0);}`;
    const FS = `precision mediump float;uniform sampler2D u_surface,u_logo;uniform vec2 u_res;uniform float u_opacity;uniform int u_blendMode;uniform vec4 u_biThis,u_biUnd;uniform vec2 u_disp;varying vec2 v_uv;vec3 lw=vec3(0.299,0.587,0.114);vec3 bmMul(vec3 b,vec3 s){return b*s;}vec3 bmScr(vec3 b,vec3 s){return 1.0-(1.0-b)*(1.0-s);}vec3 bmOvr(vec3 b,vec3 s){return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(0.5,b));}vec3 bmSL(vec3 b,vec3 s){return mix(2.0*b*s+b*b*(1.0-2.0*s),sqrt(b)*(2.0*s-1.0)+2.0*b*(1.0-s),step(0.5,s));}vec3 bmHL(vec3 b,vec3 s){return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(0.5,s));}vec3 bmCD(vec3 b,vec3 s){return clamp(b/max(1.0-s,0.001),0.0,1.0);}vec3 bmCB(vec3 b,vec3 s){return clamp(1.0-(1.0-b)/max(s,0.001),0.0,1.0);}vec3 bmLum(vec3 b,vec3 s){float bl=dot(b,lw),sl=dot(s,lw);return clamp(b+(sl-bl),0.0,1.0);}void main(){vec4 surf=texture2D(u_surface,v_uv);vec2 px=1.0/u_res;float tl=dot(texture2D(u_surface,v_uv+vec2(-px.x,-px.y)).rgb,lw),tm=dot(texture2D(u_surface,v_uv+vec2(0,-px.y)).rgb,lw),tr=dot(texture2D(u_surface,v_uv+vec2(px.x,-px.y)).rgb,lw),ml=dot(texture2D(u_surface,v_uv+vec2(-px.x,0)).rgb,lw),mr=dot(texture2D(u_surface,v_uv+vec2(px.x,0)).rgb,lw),bl2=dot(texture2D(u_surface,v_uv+vec2(-px.x,px.y)).rgb,lw),bm=dot(texture2D(u_surface,v_uv+vec2(0,px.y)).rgb,lw),br=dot(texture2D(u_surface,v_uv+vec2(px.x,px.y)).rgb,lw);float gx=(tr+2.0*mr+br)-(tl+2.0*ml+bl2),gy=(bl2+2.0*bm+br)-(tl+2.0*tm+tr);vec2 du=clamp(v_uv+vec2(gx*u_disp.x,gy*u_disp.y)*px,0.0,1.0);vec4 lc=texture2D(u_logo,du);float a=lc.a;if(a<0.01){gl_FragColor=surf;return;}vec3 lr=lc.rgb;float ll=dot(lr,lw),sl=dot(surf.rgb,lw),e=0.001;float tA=smoothstep(u_biThis.x,max(u_biThis.x+e,u_biThis.y),ll)*(1.0-smoothstep(u_biThis.z,max(u_biThis.z+e,u_biThis.w),ll));float uA=smoothstep(u_biUnd.x,max(u_biUnd.x+e,u_biUnd.y),sl)*(1.0-smoothstep(u_biUnd.z,max(u_biUnd.z+e,u_biUnd.w),sl));float ta=a*tA*uA;if(ta<0.01){gl_FragColor=surf;return;}vec3 bld;if(u_blendMode==1)bld=bmMul(surf.rgb,lr);else if(u_blendMode==2)bld=bmScr(surf.rgb,lr);else if(u_blendMode==3)bld=bmOvr(surf.rgb,lr);else if(u_blendMode==4)bld=bmSL(surf.rgb,lr);else if(u_blendMode==5)bld=bmHL(surf.rgb,lr);else if(u_blendMode==6)bld=bmCD(surf.rgb,lr);else if(u_blendMode==7)bld=bmCB(surf.rgb,lr);else if(u_blendMode==8)bld=min(surf.rgb,lr);else if(u_blendMode==9)bld=max(surf.rgb,lr);else if(u_blendMode==10)bld=abs(surf.rgb-lr);else if(u_blendMode==11)bld=bmLum(surf.rgb,lr);else bld=lr;gl_FragColor=vec4(mix(surf.rgb,clamp(bld,0.0,1.0),u_opacity*clamp(ta*1.5,0.0,1.0)),surf.a>0.0?1.0:0.0);}`;
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    glProgramRef.current = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    return true;
  }

  function handleDisplayMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!logoSrc || !logoImgRef.current) return;
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const scaleX = (imgDims?.w ?? 1) / rect.width;
    const scaleY = (imgDims?.h ?? 1) / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const { x, y, w, h, rot } = logoPos;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rotRad = (rot * Math.PI) / 180;

    // Transform mouse into logo-local space
    const dx = mx - cx, dy = my - cy;
    const localX = dx * Math.cos(-rotRad) - dy * Math.sin(-rotRad);
    const localY = dx * Math.sin(-rotRad) + dy * Math.cos(-rotRad);

    // Rotate handle: top-center, 20px above
    const rhX = 0, rhY = -h / 2 - 20;
    if (Math.abs(localX - rhX) < 12 && Math.abs(localY - rhY) < 12) {
      const startAngle = Math.atan2(my - cy, mx - cx) * 180 / Math.PI;
      logoDragRef.current = { mode: "rotate", startX: mx, startY: my, origPos: { ...logoPos }, startAngle };
      setLogoSelected(true);
      return;
    }
    // Resize handle: bottom-right corner
    if (Math.abs(localX - w / 2) < 14 && Math.abs(localY - h / 2) < 14) {
      logoDragRef.current = { mode: "resize", startX: mx, startY: my, origPos: { ...logoPos } };
      setLogoSelected(true);
      return;
    }
    // Move: inside bounding box
    if (localX >= -w / 2 && localX <= w / 2 && localY >= -h / 2 && localY <= h / 2) {
      logoDragRef.current = { mode: "move", startX: mx, startY: my, origPos: { ...logoPos } };
      setLogoSelected(true);
      return;
    }
    setLogoSelected(false);
  }

  function handleDisplayMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = logoDragRef.current;
    if (!drag) return;
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const scaleX = (imgDims?.w ?? 1) / rect.width;
    const scaleY = (imgDims?.h ?? 1) / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const dx = mx - drag.startX;
    const dy = my - drag.startY;
    if (drag.mode === "move") {
      setLogoPos({ ...drag.origPos, x: drag.origPos.x + dx, y: drag.origPos.y + dy });
    } else if (drag.mode === "resize") {
      const newW = Math.max(20, drag.origPos.w + dx * 1.5);
      const aspect = drag.origPos.h / drag.origPos.w;
      setLogoPos({ ...drag.origPos, w: newW, h: Math.round(newW * aspect) });
    } else if (drag.mode === "rotate") {
      const origCx = drag.origPos.x + drag.origPos.w / 2;
      const origCy = drag.origPos.y + drag.origPos.h / 2;
      const currentAngle = Math.atan2(my - origCy, mx - origCx) * 180 / Math.PI;
      const delta = currentAngle - (drag.startAngle ?? 0);
      setLogoPos({ ...drag.origPos, rot: (drag.origPos.rot + delta + 360) % 360 });
    }
  }

  function handleDisplayMouseUp() {
    logoDragRef.current = null;
  }

  // Converts raw viewport client coordinates into the same image-space
  // coordinates onLogoMouseMove computes for `mx`/`my` — the resize/rotate
  // handles' onMouseDown used to store raw e.clientX/e.clientY directly as
  // startX/startY, which onLogoMouseMove then diffed against its own
  // properly-scaled mx/my. Whenever the on-screen canvas was displayed at a
  // different size than the image's native resolution (i.e. scaleX/scaleY
  // != 1), that mismatch produced a large bogus initial dx/dy the instant
  // the drag began — before the mouse had moved at all — which is exactly
  // what made the logo appear to auto-shrink the moment you grabbed the
  // resize handle.
  function toLogoSpace(clientX: number, clientY: number): [number, number] {
    if (!containerRef.current) return [clientX, clientY];
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (imgDims?.w ?? 1) / rect.width;
    const scaleY = (imgDims?.h ?? 1) / rect.height;
    return [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY];
  }

  // Window-level handlers used by the SVG resize/rotate handles
  function onLogoMouseMove(e: MouseEvent) {
    const drag = logoDragRef.current;
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (imgDims?.w ?? 1) / rect.width;
    const scaleY = (imgDims?.h ?? 1) / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const dx = mx - drag.startX, dy = my - drag.startY;
    if (drag.mode === "move") {
      setLogoPos({ ...drag.origPos, x: drag.origPos.x + dx, y: drag.origPos.y + dy });
    } else if (drag.mode === "resize") {
      const newW = Math.max(20, drag.origPos.w + dx * 1.5);
      setLogoPos({ ...drag.origPos, w: newW, h: Math.round(newW * (drag.origPos.h / drag.origPos.w)) });
    } else if (drag.mode === "rotate") {
      const origCx = drag.origPos.x + drag.origPos.w / 2;
      const origCy = drag.origPos.y + drag.origPos.h / 2;
      const angle = Math.atan2(my - origCy, mx - origCx) * 180 / Math.PI;
      setLogoPos({ ...drag.origPos, rot: (drag.origPos.rot + angle - (drag.startAngle ?? 0) + 360) % 360 });
    }
  }

  function onLogoMouseUp() {
    logoDragRef.current = null;
    window.removeEventListener("mousemove", onLogoMouseMove);
    window.removeEventListener("mouseup", onLogoMouseUp);
  }

  /** Flattens whatever is currently placed — logo, bezels, home button, any
   *  combination, or none of them — permanently into the working canvas.
   *  Available as soon as an image is loaded, not gated behind having a logo. */
  function bakeToCanvas() {
    const source = canvasRef.current;
    if (!source || !hasImage) return;
    pushHistory();
    const ctx = source.getContext("2d")!;

    // Logo first (if present) — same compositing as before, via the display
    // canvas so blend mode/opacity/blur are respected.
    if (logoSrc && logoImgRef.current) {
      const display = displayCanvasRef.current;
      try {
        if (!display) throw new Error("no display canvas");
        ctx.clearRect(0, 0, source.width, source.height);
        ctx.drawImage(display, 0, 0);
      } catch {
        const { x, y, w, h, rot } = logoPos;
        ctx.save(); ctx.globalAlpha = logoOpacity;
        ctx.translate(x + w/2, y + h/2); ctx.rotate((rot * Math.PI) / 180);
        if (logoBlur > 0) ctx.filter = `blur(${logoBlur}px)`;
        ctx.drawImage(logoImgRef.current, -w/2, -h/2, w, h); ctx.restore();
      }
    }

    // Snapshot bezel slot data (position/size/material), the home button's
    // protected zone, and the clean base BEFORE bakeBezels/bakeHomeButton
    // mutate ctx — this is the only chance to capture them, since both
    // overlay states get cleared right after baking and a later export (a
    // separate action, possibly much later — e.g. "Add to Library") would
    // otherwise see nothing for either. Previously only bezels were snapshot
    // here, which is why a home button baked via this "Bake to Canvas"
    // button always lost its protected-zone metadata even though its pixels
    // were baked in fine.
    const zoneToSnapshot: HomeButtonZone | null =
      exportSlot === "controllerSkin" && homeButton && imgDims
        ? {
            xPercent: (homeButton.x / imgDims.w) * 100,
            yPercent: (homeButton.y / imgDims.h) * 100,
            sizePercent: (homeButton.size / imgDims.w) * 100,
          }
        : null;
    if (bezels.length > 0 || zoneToSnapshot) {
      lastBakedBezelDataRef.current = { slots: bezels, baseSkinNoBezels: source.toDataURL("image/png"), homeButtonZone: zoneToSnapshot };
    }

    // Then bezels and home button — same helpers the PNG/WebM export uses —
    // drawn directly onto the working canvas so they're baked in for good.
    bakeBezels(ctx, () => bakeHomeButton(ctx, () => {
      try { originalDataRef.current = ctx.getImageData(0, 0, source.width, source.height); } catch { /* tainted canvas — ignore */ }
      setLogoSrc(null); logoImgRef.current = null; setLogoSelected(false);
      setIsVideo(false); setVideoUrl(null); videoFileRef.current = null;
      setBezels([]); setSelectedBezel(null);
      setHomeButton(null); homeButtonImgRef.current = null; setHomeButtonSelected(false);
    }));
  }


  // Scroll wheel zoom — must be non-passive to call preventDefault()
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!hasImage) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(z => Math.min(4, Math.max(0.1, +(z + delta).toFixed(2))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasImage]);

  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push({ data });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  }

  function undo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const entry = historyRef.current.pop();
    if (!entry) return;
    ctx.putImageData(entry.data, 0, 0);
    if (logoSrc) drawComposite();
  }

  function resetToOriginal() {
    const canvas = canvasRef.current;
    const orig = originalDataRef.current;
    if (!canvas || !orig) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    pushHistory();
    ctx.putImageData(orig, 0, 0);
    setSelection(null);
    setCroppedResult(null);
    if (logoSrc) drawComposite();
  }

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoop, setVideoLoop] = useState(true);
  const [isVideo, setIsVideo] = useState(false);
  // Stores the original WebM File for export — File.type is always "video/webm"
  // so readAsDataURL always produces data:video/webm;base64,… that isVideoSkin() recognises.
  const videoFileRef = useRef<File | null>(null);

  // Composite the logo onto the controller and draw the result into displayCanvasRef.
  // Pulled out of the effect below so it can also be called imperatively after any
  // direct pixel edit (erase/restore/wand/undo) so the logo preview stays in sync
  // with edits made to the base image while a logo is loaded.
  function drawComposite() {
    const display = displayCanvasRef.current;
    const source  = canvasRef.current;
    if (!display || !source) return;
    const W = source.width, H = source.height;
    display.width = W; display.height = H;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    const vidEl = videoEditRef.current;
    if (isVideo && vidEl && vidEl.readyState >= 2) ctx.drawImage(vidEl, 0, 0, W, H);
    else ctx.drawImage(source, 0, 0);
    const logo = logoImgRef.current;
    if (!logo || !logoSrc) return;
    const { x, y, w, h, rot } = logoPos;
    const lcx = x + w / 2, lcy = y + h / 2;
    const rotRad = (rot * Math.PI) / 180;
    const MODE_2D: Record<string, GlobalCompositeOperation> = {
      "normal":"source-over","multiply":"multiply","screen":"screen","overlay":"overlay",
      "soft-light":"soft-light","hard-light":"hard-light","color-dodge":"color-dodge",
      "color-burn":"color-burn","darken":"darken","lighten":"lighten",
      "difference":"difference","luminosity":"luminosity",
    };
    ensureWebGL();
    const gl = webglRef.current, prog = glProgramRef.current, glCv = webglCanvasRef.current;
    let webglOk = false;
    if (gl && prog && glCv && W > 0 && H > 0) {
      try {
        glCv.width = W; glCv.height = H;
        gl.viewport(0, 0, W, H); gl.useProgram(prog);
        const mkTex = (unit: number, src: TexImageSource) => {
          const t = gl.createTexture()!;
          gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
          return t;
        };
        const surfSrc = (isVideo && vidEl && vidEl.readyState >= 2) ? vidEl : source;
        const surfTex = mkTex(0, surfSrc);
        const logoCv = document.createElement("canvas"); logoCv.width = W; logoCv.height = H;
        const lctx = logoCv.getContext("2d")!;
        lctx.save(); lctx.translate(lcx, lcy); lctx.rotate(rotRad);
        if (logoBlur > 0) lctx.filter = `blur(${logoBlur}px)`;
        lctx.drawImage(logo, -w/2, -h/2, w, h); lctx.restore();
        const logoTex = mkTex(1, logoCv);
        const ul = (n: string) => gl.getUniformLocation(prog, n);
        gl.uniform1i(ul("u_surface"), 0); gl.uniform1i(ul("u_logo"), 1);
        gl.uniform2f(ul("u_res"), W, H); gl.uniform1f(ul("u_opacity"), logoOpacity);
        gl.uniform1i(ul("u_blendMode"), BLEND_MODE_IDX[logoBlendMode] ?? 0);
        gl.uniform4f(ul("u_biThis"), biThisShLo/255, biThisShHi/255, biThisHiLo/255, biThisHiHi/255);
        gl.uniform4f(ul("u_biUnd"),  biUndShLo/255,  biUndShHi/255,  biUndHiLo/255,  biUndHiHi/255);
        gl.uniform2f(ul("u_disp"), dispX, dispY);
        const buf2 = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf2);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(prog, "a_pos");
        gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        ctx.clearRect(0, 0, W, H); ctx.drawImage(glCv, 0, 0);
        // Clip WebGL output to controller alpha — removes white specks at anti-aliased edges
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(source, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        gl.deleteTexture(surfTex); gl.deleteTexture(logoTex); gl.deleteBuffer(buf2);
        webglOk = true;
      } catch (err) { console.warn("WebGL display failed, using 2D:", err); }
    }
    if (!webglOk) {
      ctx.save(); ctx.globalAlpha = logoOpacity;
      ctx.globalCompositeOperation = MODE_2D[logoBlendMode] ?? "source-over";
      ctx.translate(lcx, lcy); ctx.rotate(rotRad);
      if (logoBlur > 0) ctx.filter = `blur(${logoBlur}px)`;
      ctx.drawImage(logo, -w/2, -h/2, w, h); ctx.restore();
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  useEffect(() => {
    drawComposite();
  }, [logoSrc, logoPos, logoBlendMode, logoOpacity,
      biThisShLo, biThisShHi, biThisHiLo, biThisHiHi,
      biUndShLo, biUndShHi, biUndHiLo, biUndHiHi,
      dispX, dispY, logoBlur, logoSelected, hasImage, isVideo]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Always clear any previously placed logo when loading a new skin
    setLogoSrc(null);
    logoImgRef.current = null;
    setLogoSelected(false);

    // Detect video by type OR extension — Windows sometimes returns file.type=""
    const name = file.name.toLowerCase();
    const isVideoFile = file.type.startsWith("video/") ||
      name.endsWith(".webm") || name.endsWith(".mp4") || name.endsWith(".mov");

    if (isVideoFile) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setIsVideo(true);
      setVideoLoop(true);

      // Store the File directly — type is always "video/webm" so export is reliable.
      videoFileRef.current = file;

      const vid = document.createElement("video");
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = "auto";

      // onloadeddata fires when the first frame is decoded and ready to display —
      // more reliable than onseeked which can fire before the frame is available.
      vid.onloadeddata = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width  = vid.videoWidth;
        canvas.height = vid.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(vid, 0, 0);
        try {
          originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch { originalDataRef.current = null; }
        historyRef.current = [];
        setImgDims({ w: vid.videoWidth, h: vid.videoHeight });
        setHasImage(true);
        setZoom(1);
        setSelection(null);
        setCroppedResult(null);
        setBezels([]);
        setSelectedBezel(null);
        vid.remove();
      };

      vid.src = url;
      vid.load();
      e.target.value = "";
      return;
    }

    // Handle image (existing flow)
    setIsVideo(false);
    setVideoUrl(null);
    videoFileRef.current = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result !== "string") return;
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        historyRef.current = [];
        setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
        setHasImage(true);
        setZoom(1);
        setSelection(null);
        setCroppedResult(null);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ── Magic wand background removal: flood fill from a click point ──
  function magicWandRemove(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const startIdx = (y * w + x) * 4;
    const sr = data[startIdx], sg = data[startIdx + 1], sb = data[startIdx + 2];
    const tol = tolerance;

    const visited = new Uint8Array(w * h);
    const stack: number[] = [y * w + x];

    while (stack.length) {
      const p = stack.pop()!;
      if (visited[p]) continue;
      visited[p] = 1;
      const px = p % w, py = (p - px) / w;
      const idx = p * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a === 0) continue;
      const diff = Math.abs(r - sr) + Math.abs(g - sg) + Math.abs(b - sb);
      if (diff > tol * 3) continue;
      data[idx + 3] = 0; // set alpha to 0

      if (px > 0) stack.push(p - 1);
      if (px < w - 1) stack.push(p + 1);
      if (py > 0) stack.push(p - w);
      if (py < h - 1) stack.push(p + w);
    }

    pushHistory();
    ctx.putImageData(imageData, 0, 0);
    if (logoSrc) drawComposite();
  }

  // ── Erase / Restore brush ──
  function paintAt(x: number, y: number, mode: "erase" | "restore") {
    const canvas = canvasRef.current;
    const orig = originalDataRef.current;
    if (!canvas || !orig) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const radius = brushSize;

    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(w - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(h - 1, Math.ceil(y + radius));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px - x, dy = py - y;
        if (dx * dx + dy * dy > radius * radius) continue;
        const idx = (py * w + px) * 4;
        if (mode === "erase") {
          data[idx + 3] = 0;
        } else {
          // restore from original
          data[idx] = orig.data[idx];
          data[idx + 1] = orig.data[idx + 1];
          data[idx + 2] = orig.data[idx + 2];
          data[idx + 3] = orig.data[idx + 3];
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    if (logoSrc) drawComposite();
  }

  function getCanvasCoords(e: React.MouseEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x, y };
  }

  // Unclamped canvas-space coords, used for selection dragging (allows slight overshoot)
  function getRawCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function clampSelection(sel: Selection): Selection {
    const canvas = canvasRef.current;
    if (!canvas) return sel;
    let { x, y, w, h } = sel;
    w = Math.max(4, w);
    h = Math.max(4, h);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > canvas.width) x = canvas.width - w;
    if (y + h > canvas.height) y = canvas.height - h;
    if (x < 0) { x = 0; w = canvas.width; }
    if (y < 0) { y = 0; h = canvas.height; }
    return { x, y, w, h };
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (!hasImage) return;

    if (tool === "crop-rect" || tool === "crop-circle") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const raw = getRawCanvasCoords(e.clientX, e.clientY);
      // Start a fresh square-ish selection centered near click, default size = 20% of canvas
      const size = Math.round(Math.min(canvas.width, canvas.height) * 0.25);
      const newSel: Selection = clampSelection({
        x: raw.x - size / 2, y: raw.y - size / 2, w: size, h: size,
      });
      setCroppedResult(null);
      setSelection(newSel);
      return;
    }

    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (tool === "select") {
      // Clicking empty canvas area deselects everything
      setSelectedBezel(null);
      setLogoSelected(false);
      return;
    }
    if (tool === "wand") {
      magicWandRemove(coords.x, coords.y);
    } else {
      pushHistory();
      setIsPainting(true);
      paintAt(coords.x, coords.y, tool === "erase" ? "erase" : "restore");
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent) {
    // Track brush cursor position in display (CSS) coords relative to canvas element
    if (tool === "erase" || tool === "restore") {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setBrushPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    } else {
      setBrushPos(null);
    }
    if (!isPainting) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    paintAt(coords.x, coords.y, tool === "erase" ? "erase" : "restore");
  }

  function handleCanvasMouseUp() {
    setIsPainting(false);
  }

  function beginSelDrag(e: React.MouseEvent, mode: "move" | "resize") {
    if (!selection) return;
    e.stopPropagation();
    e.preventDefault();
    selDragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...selection } };
  }

  // Auto-create a centered selection when a crop tool is activated
  useEffect(() => {
    if ((tool === "crop-rect" || tool === "crop-circle") && hasImage && !selection && !croppedResult) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = Math.round(Math.min(canvas.width, canvas.height) * 0.5);
      setSelection(clampSelection({
        x: (canvas.width - size) / 2, y: (canvas.height - size) / 2, w: size, h: size,
      }));
    }
  }, [tool, hasImage]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = selDragRef.current;
      const canvas = canvasRef.current;
      if (!d || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const dx = (e.clientX - d.startX) * scaleX;
      const dy = (e.clientY - d.startY) * scaleY;

      if (d.mode === "move") {
        setSelection(clampSelection({ x: d.orig.x + dx, y: d.orig.y + dy, w: d.orig.w, h: d.orig.h }));
      } else {
        const newW = Math.max(8, d.orig.w + dx);
        const newH = Math.max(8, d.orig.h + dy);
        setSelection(clampSelection({ x: d.orig.x, y: d.orig.y, w: newW, h: newH }));
      }
    }
    function onUp() { selDragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Crop canvas to the current selection. For circle mode, also masks pixels outside the circle.
  function applyCrop() {
    const canvas = canvasRef.current;
    if (!canvas || !selection) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y, w, h } = selection;
    const sx = Math.round(x), sy = Math.round(y), sw = Math.round(w), sh = Math.round(h);

    const cropped = ctx.getImageData(sx, sy, sw, sh);

    if (tool === "crop-circle") {
      const data = cropped.data;
      const cx = sw / 2, cy = sh / 2;
      const r = Math.min(sw, sh) / 2;
      for (let py = 0; py < sh; py++) {
        for (let px = 0; px < sw; px++) {
          const dx = px - cx + 0.5, dy = py - cy + 0.5;
          if (dx * dx + dy * dy > r * r) {
            const idx = (py * sw + px) * 4;
            data[idx + 3] = 0;
          }
        }
      }
    }

    // Render the crop onto an off-screen canvas — the main canvas/image is left untouched
    // so additional crops (e.g. the other thumbstick) can be made from the same source.
    const off = document.createElement("canvas");
    off.width = sw;
    off.height = sh;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.putImageData(cropped, 0, 0);

    setCroppedResult({ url: off.toDataURL("image/png"), w: sw, h: sh });
    setSelection(null);
  }

  function cancelCrop() {
    setSelection(null);
  }

  function discardCroppedResult() {
    setCroppedResult(null);
  }

  // Replace the main canvas with the cropped result (e.g. to erase/restore-touch-up just the crop)
  function useCroppedResultAsMain() {
    const canvas = canvasRef.current;
    const result = croppedResult;
    if (!canvas || !result) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = result.w;
      canvas.height = result.h;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      historyRef.current = [];
      setImgDims({ w: result.w, h: result.h });
      setCroppedResult(null);
      setTool("erase");
    };
    img.src = result.url;
  }

  function bakeBezels(ctx: CanvasRenderingContext2D, done: () => void) {
    if (bezels.length === 0) { done(); return; }
    let settled = 0;
    const finish = () => { settled++; if (settled === bezels.length) done(); };
    for (const bz of bezels) {
      const img = new Image();
      img.onload = () => {
        const x = bz.x - bz.size / 2, y = bz.y - bz.size / 2;
        ctx.save();
        const isDefault = bz.hue === 0 && bz.brightness === 1 && bz.contrast === 1 && bz.saturate === 1;
        if (!isDefault) ctx.filter = `hue-rotate(${bz.hue}deg) brightness(${bz.brightness}) contrast(${bz.contrast}) saturate(${bz.saturate})`;
        drawHighQuality(ctx, img, x, y, bz.size, bz.size);
        ctx.filter = "none";
        ctx.restore();
        finish();
      };
      img.onerror = () => { console.warn("Bezel bake failed:", bz.bezelUrl); finish(); };
      img.src = bz.bezelUrl;
    }
  }

  function handleCanvasDropBezel(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.getData("bezel") !== "1") return;
    if (!hasImage || bezels.length >= 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const size = Math.round(Math.min(canvas.width, canvas.height) * 0.15);
    const id = bezelNextId.current++;
    setBezels(prev => [...prev, {
      id, x: cx, y: cy, size,
      bezelUrl: pickerUrl,
      hue: pickerHue, brightness: pickerBrightness, contrast: pickerContrast, saturate: pickerSaturate,
    }]);
    setSelectedBezel(id);
  }

  /** Place a bezel from the picker at the canvas centre. */
  function addBezelFromPicker() {
    if (!hasImage || bezels.length >= 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = Math.round(Math.min(canvas.width, canvas.height) * 0.15);
    const id = bezelNextId.current++;
    setBezels(prev => [...prev, {
      id, x: canvas.width / 2, y: canvas.height / 2, size,
      bezelUrl: pickerUrl,
      hue: pickerHue, brightness: pickerBrightness, contrast: pickerContrast, saturate: pickerSaturate,
    }]);
    setSelectedBezel(id);
    setShowBezelPicker(false);
  }

  function beginBezelDrag(e: React.MouseEvent, id: number, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    const bz = bezels.find(b => b.id === id);
    if (!bz) return;
    bezelDragRef.current = { id, mode, startX: e.clientX, startY: e.clientY, origX: bz.x, origY: bz.y, origSize: bz.size };
    setSelectedBezel(id);
    const onMove = (ev: MouseEvent) => {
      const d = bezelDragRef.current;
      if (!d) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const dx = (ev.clientX - d.startX) * scaleX;
      const dy = (ev.clientY - d.startY) * scaleY;
      setBezels(prev => prev.map(b => {
        if (b.id !== d.id) return b;
        if (d.mode === "move") return { ...b, x: d.origX + dx, y: d.origY + dy };
        const delta = (dx + dy) / 2;
        return { ...b, size: Math.max(20, d.origSize + delta) };
      }));
    };
    const onUp = () => { bezelDragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function removeBezel(id: number) {
    setBezels(prev => prev.filter(b => b.id !== id));
    if (selectedBezel === id) setSelectedBezel(null);
  }

  /** Adds a second copy of an existing bezel — same image and same color
   *  settings — so placing a matching pair doesn't mean reopening the
   *  library and re-tuning hue/brightness/contrast/saturate from scratch. */
  function duplicateBezel(bz: BezelInstance) {
    if (bezels.length >= 2) return;
    const id = bezelNextId.current++;
    setBezels(prev => [...prev, { ...bz, id, x: bz.x + 24, y: bz.y + 24 }]);
    setSelectedBezel(id);
  }

  // ── Home Button ────────────────────────────────────────────────────────────
  function handleHomeButtonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      homeButtonImgRef.current = img;
      const c = canvasRef.current;
      const size = c ? Math.round(Math.min(c.width, c.height) * 0.09) : 100;
      // Default to centre-bottom of the canvas — typical home button position
      setHomeButton({ src: url, x: c ? c.width * 0.5 : 200, y: c ? c.height * 0.65 : 300,
        size, hue: 0, brightness: 1, contrast: 1, saturate: 1 });
      setHomeButtonSelected(true);
    };
    img.src = url;
  }

  function beginHomeButtonDrag(e: React.MouseEvent, mode: "move" | "resize") {
    e.stopPropagation(); e.preventDefault();
    if (!homeButton) return;
    homeButtonDragRef.current = { mode, startX: e.clientX, startY: e.clientY,
      origX: homeButton.x, origY: homeButton.y, origSize: homeButton.size };
    setHomeButtonSelected(true);
    const onMove = (ev: MouseEvent) => {
      const d = homeButtonDragRef.current;
      if (!d) return;
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
      const dx = (ev.clientX - d.startX) * sx, dy = (ev.clientY - d.startY) * sy;
      setHomeButton(prev => {
        if (!prev) return prev;
        if (d.mode === "move") return { ...prev, x: d.origX + dx, y: d.origY + dy };
        return { ...prev, size: Math.max(20, d.origSize + (dx + dy) / 2) };
      });
    };
    const onUp = () => { homeButtonDragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function bakeHomeButton(ctx: CanvasRenderingContext2D, done: () => void) {
    if (!homeButton || !homeButtonImgRef.current) { done(); return; }
    const img = homeButtonImgRef.current;
    const x = homeButton.x - homeButton.size / 2, y = homeButton.y - homeButton.size / 2;
    const fit = containInSquare(img.naturalWidth, img.naturalHeight, x, y, homeButton.size);
    ctx.save();
    const isDefault = homeButton.hue === 0 && homeButton.brightness === 1 && homeButton.contrast === 1 && homeButton.saturate === 1;
    if (!isDefault) ctx.filter = `hue-rotate(${homeButton.hue}deg) brightness(${homeButton.brightness}) contrast(${homeButton.contrast}) saturate(${homeButton.saturate})`;
    drawHighQuality(ctx, img, fit.x, fit.y, fit.w, fit.h);
    ctx.filter = "none";
    ctx.restore();
    done();
  }

  /** Encode a new WebM with the logo and/or bezels composited onto every frame. */
  async function handleBakeLogoToWebM() {
    const hasLogo   = !!(logoSrc && logoImgRef.current);
    const hasBezels = bezels.length > 0;
    if (!videoFileRef.current) return;

    // Init WebGL now — first time the user clicks Bake, not on page load
    if (hasLogo) ensureWebGL();

    const gl   = webglRef.current;
    const prog = glProgramRef.current;
    const glCv = webglCanvasRef.current;

    setIsEncoding(true);
    setEncodingProgress(0);

    // Snapshot logo settings (only used when hasLogo)
    const logo = hasLogo ? logoImgRef.current! : null;
    const { x, y, w, h, rot } = logoPos;
    const lcx    = x + w / 2, lcy = y + h / 2;
    const rotRad = (rot * Math.PI) / 180;
    const snap = {
      opacity: logoOpacity, blendMode: logoBlendMode, blur: logoBlur,
      biThisShLo, biThisShHi, biThisHiLo, biThisHiHi,
      biUndShLo,  biUndShHi,  biUndHiLo,  biUndHiHi,
      dispX, dispY,
    };

    // Pre-load all bezel images before the recording loop so they're
    // available synchronously inside renderFrame.
    type LoadedBezel = { bz: BezelInstance; img: HTMLImageElement };
    const bezelImgs: LoadedBezel[] = [];
    if (hasBezels) {
      await Promise.all(bezels.map(bz => new Promise<void>(resolve => {
        const img = new Image();
        img.onload  = () => { bezelImgs.push({ bz, img }); resolve(); };
        img.onerror = () => { console.warn("Bezel load failed:", bz.bezelUrl); resolve(); };
        img.src = bz.bezelUrl;
      })));
    }

    // Pre-render all bezel images at their exact canvas size using Lanczos resampling
    // (createImageBitmap resizeQuality:"high") so renderFrame stays synchronous.
    type SizedBezel = { bz: BezelInstance; bm: ImageBitmap | HTMLImageElement };
    const sizedBezels: SizedBezel[] = await Promise.all(bezelImgs.map(async ({ bz, img }) => {
      try {
        const bm = await createImageBitmap(img, {
          resizeWidth: Math.round(bz.size),
          resizeHeight: Math.round(bz.size),
          resizeQuality: "high",
        });
        return { bz, bm };
      } catch {
        return { bz, bm: img };
      }
    }));

    // Pre-load home button image
    let homeButtonBakeImg: HTMLImageElement | null = null;
    if (homeButton) {
      await new Promise<void>(resolve => {
        const img = new Image();
        img.onload  = () => { homeButtonBakeImg = img; resolve(); };
        img.onerror = () => resolve();
        img.src = homeButton.src;
      });
    }

    // Pre-resize home button at canvas size using Lanczos — contain-fit
    // (not a forced square stretch) since the source asset isn't guaranteed
    // to be square, unlike bezels.
    let homeButtonBakeBm: ImageBitmap | HTMLImageElement | null = homeButtonBakeImg;
    let homeButtonBakeFit = { x: 0, y: 0, w: 0, h: 0 };
    if (homeButton && homeButtonBakeImg) {
      // homeButtonBakeImg is only ever assigned inside the Promise executor
      // callback above, which TS's control-flow narrowing can't see through
      // (it statically treats the variable as still `null` here, narrowing
      // this whole branch to `never`) — the runtime guard above is correct,
      // so cast past the false-positive rather than fight the type system.
      const hbImg = homeButtonBakeImg as HTMLImageElement;
      const fit = containInSquare(hbImg.naturalWidth, hbImg.naturalHeight, homeButton.x - homeButton.size / 2, homeButton.y - homeButton.size / 2, homeButton.size);
      homeButtonBakeFit = fit;
      try {
        homeButtonBakeBm = await createImageBitmap(hbImg, {
          resizeWidth: Math.round(fit.w),
          resizeHeight: Math.round(fit.h),
          resizeQuality: "high",
        });
      } catch { /* fallback stays as homeButtonBakeImg */ }
    }

    try {
      const srcUrl = URL.createObjectURL(videoFileRef.current);

      const blob = await new Promise<Blob>((resolve, reject) => {
        const vid = document.createElement("video");
        vid.muted = true; vid.playsInline = true;

        vid.onloadedmetadata = () => {
          const W = vid.videoWidth, H = vid.videoHeight;
          const duration = vid.duration;

          // Pre-render logo to a canvas once (only when logo is active)
          let logoCv: HTMLCanvasElement | null = null;
          if (hasLogo && logo) {
            logoCv = document.createElement("canvas");
            logoCv.width = W; logoCv.height = H;
            const lctx = logoCv.getContext("2d")!;
            lctx.save();
            lctx.translate(lcx, lcy);
            lctx.rotate(rotRad);
            if (snap.blur > 0) lctx.filter = `blur(${snap.blur}px)`;
            lctx.drawImage(logo, -w / 2, -h / 2, w, h);
            lctx.restore();
          }

          const offscreen = document.createElement("canvas");
          offscreen.width = W; offscreen.height = H;
          const ctx = offscreen.getContext("2d")!;

          const renderFrame = (t: number) => {
            ctx.clearRect(0, 0, W, H);

            if (hasLogo && logoCv && gl && prog && glCv) {
              // ── WebGL path: video + logo composite ──────────────────
              const ul = (n: string) => gl.getUniformLocation(prog, n);
              const mkTex = (unit: number, src: TexImageSource) => {
                const tx = gl.createTexture()!;
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, tx);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
                return tx;
              };
              try {
                glCv.width = W; glCv.height = H;
                gl.viewport(0, 0, W, H);
                gl.useProgram(prog);
                const surfTex = mkTex(0, vid);
                const logoTex = mkTex(1, logoCv);
                gl.uniform1i(ul("u_surface"),   0);
                gl.uniform1i(ul("u_logo"),      1);
                gl.uniform2f(ul("u_res"),       W, H);
                gl.uniform1f(ul("u_opacity"),   snap.opacity);
                gl.uniform1i(ul("u_blendMode"), BLEND_MODE_IDX[snap.blendMode] ?? 0);
                gl.uniform4f(ul("u_biThis"),    snap.biThisShLo/255, snap.biThisShHi/255, snap.biThisHiLo/255, snap.biThisHiHi/255);
                gl.uniform4f(ul("u_biUnd"),     snap.biUndShLo/255,  snap.biUndShHi/255,  snap.biUndHiLo/255,  snap.biUndHiHi/255);
                gl.uniform2f(ul("u_disp"),      snap.dispX, snap.dispY);
                const buf = gl.createBuffer()!;
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
                const posLoc = gl.getAttribLocation(prog, "a_pos");
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                ctx.drawImage(glCv, 0, 0);
                gl.deleteTexture(surfTex);
                gl.deleteTexture(logoTex);
                gl.deleteBuffer(buf);
              } catch {
                // 2D fallback
                ctx.drawImage(vid, 0, 0, W, H);
                ctx.save();
                ctx.globalAlpha = snap.opacity;
                ctx.translate(lcx, lcy); ctx.rotate(rotRad);
                ctx.drawImage(logo, -w / 2, -h / 2, w, h);
                ctx.restore();
              }
            } else {
              // ── No logo — draw raw video frame ───────────────────────
              ctx.drawImage(vid, 0, 0, W, H);
            }

            // ── Bezels on top (always, regardless of logo) ───────────
            for (const { bz, bm } of sizedBezels) {
              const bx = bz.x - bz.size / 2, by = bz.y - bz.size / 2;
              ctx.save();
              const bzDefault = bz.hue === 0 && bz.brightness === 1 && bz.contrast === 1 && bz.saturate === 1;
              if (!bzDefault) ctx.filter = `hue-rotate(${bz.hue}deg) brightness(${bz.brightness}) contrast(${bz.contrast}) saturate(${bz.saturate})`;
              ctx.drawImage(bm, bx, by);
              ctx.filter = "none";
              ctx.restore();
            }

            // ── Home button on top of bezels ─────────────────────────
            if (homeButton && homeButtonBakeBm) {
              ctx.save();
              const hbDefault = homeButton.hue === 0 && homeButton.brightness === 1 && homeButton.contrast === 1 && homeButton.saturate === 1;
              if (!hbDefault) ctx.filter = `hue-rotate(${homeButton.hue}deg) brightness(${homeButton.brightness}) contrast(${homeButton.contrast}) saturate(${homeButton.saturate})`;
              ctx.drawImage(homeButtonBakeBm, homeButtonBakeFit.x, homeButtonBakeFit.y, homeButtonBakeFit.w, homeButtonBakeFit.h);
              ctx.filter = "none";
              ctx.restore();
            }

            // Clip entire composite frame to the video's alpha channel.
            // The WebGL shader forces alpha=1 wherever surf.a > 0, which causes
            // white specks at semi-transparent edge pixels (anti-aliased controller
            // boundary). Re-applying the video alpha here removes those specks.
            ctx.globalCompositeOperation = "destination-in";
            ctx.drawImage(vid, 0, 0, W, H);
            ctx.globalCompositeOperation = "source-over";

            setEncodingProgress(Math.min(1, t / duration));
          };

          // Seek to frame 0, draw it before recorder starts
          vid.currentTime = 0;
          vid.onseeked = () => {
            vid.onseeked = null;
            renderFrame(0);

            const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
              ? "video/webm;codecs=vp9" : "video/webm";
            const stream   = offscreen.captureStream();
            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 25_000_000 });

            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
              URL.revokeObjectURL(srcUrl);
              vid.remove();
              resolve(new Blob(chunks, { type: "video/webm" }));
            };

            let done = false, lastTime = -1;
            let rafId: number;

            const stopClean = () => {
              if (done) return;
              done = true;
              vid.pause();       // stop immediately — prevents extra loop frames bleeding in
              vid.loop = false;
              cancelAnimationFrame(rafId);
              recorder.stop();
            };

            const onRVFC = (_: number, meta: { mediaTime: number }) => {
              if (done) return;
              const t = meta.mediaTime;
              // Loop detected: time jumped backward by > 0.5 s
              if (lastTime > 0.5 && t < lastTime - 0.5) { stopClean(); return; }
              lastTime = t; renderFrame(t);
              (vid as any).requestVideoFrameCallback(onRVFC);
            };
            const onRAF = () => {
              if (done) return;
              const t = vid.currentTime;
              if (lastTime > 0.5 && t < lastTime - 0.5) { stopClean(); return; }
              lastTime = t; renderFrame(t);
              rafId = requestAnimationFrame(onRAF);
            };

            vid.onended = () => stopClean();
            vid.onerror = () => reject(new Error("Encoding playback error"));

            recorder.start(100);
            vid.loop = true;
            vid.play().then(() => {
              if ("requestVideoFrameCallback" in vid) (vid as any).requestVideoFrameCallback(onRVFC);
              else rafId = requestAnimationFrame(onRAF);
            }).catch(reject);
          };
        };

        vid.onerror = () => reject(new Error("Failed to load video for encoding"));
        vid.src = srcUrl;
      });

      const newFile = new File([blob], "baked-skin.webm", { type: "video/webm" });
      videoFileRef.current = newFile;
      const newUrl = URL.createObjectURL(blob);
      setVideoUrl(newUrl); setIsVideo(true);

      const pv = document.createElement("video");
      pv.muted = true; pv.playsInline = true; pv.preload = "auto";
      // Attach to DOM so loadeddata fires reliably across browsers
      pv.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
      document.body.appendChild(pv);
      pv.onloadeddata = () => {
        const c = canvasRef.current;
        if (c && pv.videoWidth > 0 && pv.videoHeight > 0) {
          c.width  = pv.videoWidth;
          c.height = pv.videoHeight;
          c.getContext("2d")?.drawImage(pv, 0, 0);
          setImgDims({ w: pv.videoWidth, h: pv.videoHeight });
        }
        // Ensure the editor stays in a live, editable state after baking
        setHasImage(true);
        pv.remove();
      };
      pv.src = newUrl;

      setLogoSrc(null); logoImgRef.current = null; setLogoSelected(false);
      // Bezels and home button are now permanently baked into the new WebM — clear the overlays
      setBezels([]); setSelectedBezel(null);
      setHomeButton(null); homeButtonImgRef.current = null; setHomeButtonSelected(false);

    } catch (err) {
      console.error("WebM encoding failed:", err);
    }

    setIsEncoding(false);
    setEncodingProgress(0);
  }

  function confirmExport(
    dataUrl: string, slot: ExportSlot, target: ControllerType,
    bezelSlotsSnapshot: BezelSlot[] = [], baseSkinNoBezels: string | null = null,
    zoneOverride?: HomeButtonZone | null,
  ) {
    // Only the controller body slot has a meaningful protected zone — a
    // thumbstick skin doesn't have a home button on it. zoneOverride (passed
    // by handleExportToSkin's finalize()) already accounts for a prior "Bake
    // to Canvas" having cleared the live homeButton overlay — recomputing
    // from scratch here would lose that the same way this used to.
    const zone: HomeButtonZone | null = zoneOverride !== undefined
      ? zoneOverride
      : slot === "controllerSkin" && homeButton && imgDims
        ? {
            xPercent: (homeButton.x / imgDims.w) * 100,
            yPercent: (homeButton.y / imgDims.h) * 100,
            sizePercent: (homeButton.size / imgDims.w) * 100,
          }
        : null;
    // Bezel slot metadata only makes sense for the controller body itself.
    onExportToSkin(dataUrl, slot, target, zone,
      slot === "controllerSkin" ? bezelSlotsSnapshot : [],
      slot === "controllerSkin" ? baseSkinNoBezels : null);
    setExportDone(true);
    setTimeout(() => setExportDone(false), 1500);
  }
  function confirmMkbExport(dataUrl: string, slot: MkbSlot) {
    onExportMkbSkin(dataUrl, slot);
    setExportDone(true);
    setTimeout(() => setExportDone(false), 1500);
  }

  function handleExportToSkin(onBaked?: (dataUrl: string, bezelSlots: BezelSlot[], baseSkinNoBezels: string | null, homeButtonZone: HomeButtonZone | null) => void) {
    const source = canvasRef.current;
    if (!source || !hasImage || !exportTarget) return;

    // Same zone computation confirmExport does — only the controller body
    // slot has a meaningful protected zone. Computed once here so it can be
    // forwarded through onBaked, which previously never received it at all
    // (only confirmExport did), meaning a home button placed before "Add to
    // Library" never carried its protected-zone metadata forward even though
    // the button's pixels were baked in fine.
    // Falls back to whatever a prior "Bake to Canvas" already snapshotted —
    // by the time this runs (e.g. from "Add to Library", possibly much
    // later), a baked home button's live overlay state is already gone.
    const zone: HomeButtonZone | null =
      exportSlot === "controllerSkin" && homeButton && imgDims
        ? {
            xPercent: (homeButton.x / imgDims.w) * 100,
            yPercent: (homeButton.y / imgDims.h) * 100,
            sizePercent: (homeButton.size / imgDims.w) * 100,
          }
        : (exportSlot === "controllerSkin" ? lastBakedBezelDataRef.current?.homeButtonZone ?? null : null);

    // Routes the final payload to the correct callback — either the caller's
    // override (used by "Add to Library") or the normal skin-slot export.
    // bezelSlotsSnapshot/baseSkinNoBezels are only populated by the call sites
    // below that actually bake bezels — everything else passes bezels through
    // untouched (there's nothing to snapshot when there are none). onBaked
    // used to silently drop these two — that's exactly why bezels baked via
    // "Add to Library" never carried their position/material forward.
    const finalize = (dataUrl: string, bezelSlotsSnapshot: BezelSlot[] = [], baseSkinNoBezels: string | null = null) => {
      if (onBaked) { onBaked(dataUrl, bezelSlotsSnapshot, baseSkinNoBezels, zone); return; }
      if (isMkbTarget) {
        confirmMkbExport(dataUrl, mkbSlot);
      } else {
        confirmExport(dataUrl, exportSlot, exportTarget as ControllerType, bezelSlotsSnapshot, baseSkinNoBezels, zone);
      }
    };

    // If logo is placed: composite surface + logo onto a fresh canvas for export.
    if (logoSrc && logoImgRef.current) {
      const display = displayCanvasRef.current;
      if (display) {
        try {
          const dataUrl = display.toDataURL("image/png");
          setLogoSrc(null); logoImgRef.current = null; setLogoSelected(false);
          setIsVideo(false); setVideoUrl(null); videoFileRef.current = null;
          finalize(dataUrl); return;
        } catch { /* tainted — use fallback */ }
      }
      const W = source.width, H = source.height;
      const ec = document.createElement("canvas"); ec.width = W; ec.height = H;
      const ectx = ec.getContext("2d")!;
      const vidEl = videoEditRef.current;
      if (isVideo && vidEl && vidEl.readyState >= 2) ectx.drawImage(vidEl, 0, 0, W, H);
      else ectx.drawImage(source, 0, 0);
      const { x, y, w, h, rot } = logoPos;
      ectx.save(); ectx.globalAlpha = logoOpacity;
      ectx.translate(x + w/2, y + h/2); ectx.rotate((rot * Math.PI) / 180);
      if (logoBlur > 0) ectx.filter = `blur(${logoBlur}px)`;
      ectx.drawImage(logoImgRef.current, -w/2, -h/2, w, h); ectx.restore();
      setLogoSrc(null); logoImgRef.current = null; setLogoSelected(false);
      setIsVideo(false); setVideoUrl(null); videoFileRef.current = null;
      finalize(ec.toDataURL("image/png"));
      return;
    }

    // No logo — export WebM as blob URL (avoids base64 quota crash in localStorage).
    const hasWebM = videoFileRef.current || (isVideo && videoUrl);
    if (hasWebM) {
      window.dispatchEvent(new CustomEvent("bezel-video-loop", { detail: { loop: videoLoop } }));
      if (bezels.length === 0 && !homeButton) {
        // No live bezel overlay right now, but a prior bakeToCanvas() may
        // have already flattened one in — carry its slot data through even
        // though there's nothing left to actually bake here.
        const baked = lastBakedBezelDataRef.current;
        finalize(videoFileRef.current
          ? URL.createObjectURL(videoFileRef.current)
          : videoUrl!, baked?.slots ?? [], baked?.baseSkinNoBezels ?? null);
        return;
      }
      // Bezels and/or home button present — composite the current video frame
      // + overlays into a PNG.
      // (WebM frames can't be re-encoded here without MediaRecorder, so we export
      //  the still frame. The user can remove overlays first if they need animated export.)
      const vidEl = videoEditRef.current;
      const W = source.width, H = source.height;
      const tmp = document.createElement("canvas");
      tmp.width = W; tmp.height = H;
      const tctx = tmp.getContext("2d")!;
      if (vidEl && vidEl.readyState >= 2) tctx.drawImage(vidEl, 0, 0, W, H);
      else tctx.drawImage(source, 0, 0);
      const preBakeSnapshot1 = bezels.length > 0 ? tmp.toDataURL("image/png") : null;
      bakeBezels(tctx, () => bakeHomeButton(tctx, () => finalize(tmp.toDataURL("image/png"), bezels, preBakeSnapshot1)));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (bezels.length === 0 && !homeButton) {
      // Same as above — no live bezel right now, but carry through a prior
      // bakeToCanvas() bake's slot data if there is one.
      const baked = lastBakedBezelDataRef.current;
      finalize(croppedResult ? croppedResult.url : canvas.toDataURL("image/png"), baked?.slots ?? [], baked?.baseSkinNoBezels ?? null);
      return;
    }
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width; tmp.height = canvas.height;
    const tctx = tmp.getContext("2d")!;
    if (croppedResult) {
      const img = new Image();
      img.onload = () => {
        tctx.drawImage(img, 0, 0);
        const preBakeSnapshot2 = bezels.length > 0 ? tmp.toDataURL("image/png") : null;
        bakeBezels(tctx, () => bakeHomeButton(tctx, () => finalize(tmp.toDataURL("image/png"), bezels, preBakeSnapshot2)));
      };
      img.src = croppedResult.url;
    } else {
      tctx.drawImage(canvas, 0, 0);
      const preBakeSnapshot3 = bezels.length > 0 ? tmp.toDataURL("image/png") : null;
      bakeBezels(tctx, () => bakeHomeButton(tctx, () => finalize(tmp.toDataURL("image/png"), bezels, preBakeSnapshot3)));
    }
  }

  /** Which custom-library section (if any) the current selection maps to.
   *  Controller body only — not thumbsticks, which already have their own
   *  dedicated library system in the Skins panel. */
  function librarySectionForCurrentSelection(): string | null {
    if (isMkbTarget) {
      if (mkbSlot === "kbSkin") return "kb-body";
      if (mkbSlot === "kbButtonsSkin") return "kb-keys";
      if (mkbSlot === "mouseSkin") return "mouse";
      return null;
    }
    if (isControllerTarget && exportSlot === "controllerSkin") {
      return `body-${exportTarget}`;
    }
    return null;
  }

  function handleAddToLibrary() {
    const section = librarySectionForCurrentSelection();
    if (!section) return;
    setLibraryNameDraft("");
    setShowLibraryNamePrompt(true);
  }

  function confirmAddToLibrary() {
    const section = librarySectionForCurrentSelection();
    const name = libraryNameDraft.trim();
    setShowLibraryNamePrompt(false);
    if (!section || !name) return;
    handleExportToSkin(async (dataUrl, bezelSlots, baseSkinNoBezels, homeButtonZone) => {
      if (dataUrl.startsWith("blob:")) {
        setLibraryMessage("A raw WebM without any bezel or logo baked on top can't be saved to the library (it won't survive a reload). Add a bezel or logo first, or export a still-frame PNG.");
        setTimeout(() => setLibraryMessage(null), 4000);
        return;
      }
      // Only carries bezel/zone data for the controller body — a
      // thumbstick/MKB library entry has no use for either.
      const extra = section.startsWith("body-") && (bezelSlots.length > 0 || homeButtonZone)
        ? { bezelSlots, baseSkinNoBezels: baseSkinNoBezels ?? undefined, homeButtonZone: homeButtonZone ?? undefined }
        : undefined;
      const saved = await addToCustomLibrary(section, name, dataUrl, extra);
      if (!saved) {
        setLibraryError(true);
        setTimeout(() => setLibraryError(false), 2500);
        setLibraryMessage("Couldn't save to the library — the write failed (disk full, or a permissions issue). Nothing was saved.");
        setTimeout(() => setLibraryMessage(null), 4000);
        return;
      }
      setLibrarySaved(true);
      setTimeout(() => setLibrarySaved(false), 1500);
    });
  }

  const SLOT_LABELS: Record<ExportSlot, string> = {
    controllerSkin: "Controller Body",
    leftStickSkin:  "Left Thumbstick",
    rightStickSkin: "Right Thumbstick",
  };
  const MKB_SLOT_LABELS: Record<MkbSlot, string> = {
    kbSkin:        "Keyboard",
    mouseSkin:     "Mouse",
    kbButtonsSkin: "Keyboard Keys",
  };

  // Checkerboard background pattern for transparency visualization
  // Checkerboard + SlotCard are defined at module level above ImageEditor
  // so React never treats them as new component types on re-render.

  return (
    <div className="relative flex h-full min-h-0 border-2 border-black rounded-lg overflow-hidden">
      {/* Left sidebar */}
      <div className="flex-none w-[220px] flex flex-col gap-3 p-3 border-r-2 border-black bg-card/30 overflow-y-auto min-h-0">

        {/* Section header */}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isMkbTarget        ? "C4D.MKB Skins"
           : isControllerTarget ? `${CONTROLLER_TYPES.find(c => c.id === exportTarget)?.label ?? "Target"} Skins`
           : "Export Target"}
        </span>

        {/* No target selected */}
        {!exportTarget && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <ImageIcon size={24} className="text-muted-foreground/20" />
            <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
              Select a target below<br />to see skin slots
            </p>
          </div>
        )}

        {/* ── Controller slots ── */}
        {isControllerTarget && (Object.entries(SLOT_LABELS) as [ExportSlot, string][]).map(([slotKey, label]) => {
          const isActive = exportTarget === activeControllerType;
          const value = isActive ? activeConfig[slotKey] : pendingSkins[exportTarget as ControllerType]?.[slotKey];
          const filled = !!value && (isActive ? (value.startsWith("data:") || value.startsWith("blob:")) : true);
          return (
            <SlotCard key={slotKey}
              label={label} value={value} filled={filled} isSelected={exportSlot === slotKey}
              onClick={() => setExportSlot(slotKey)}
              onClear={e => { e.stopPropagation(); onClearSlot(slotKey, exportTarget as ControllerType); }} />
          );
        })}

        {/* ── MKB slots ── */}
        {isMkbTarget && (Object.entries(MKB_SLOT_LABELS) as [MkbSlot, string][]).map(([slotKey, label]) => {
          const value = activeMkbConfig[slotKey];
          // Default template paths (start with "/") are not "filled" — only user-supplied data/blob URLs
          const filled = !!value && (value.startsWith("data:") || value.startsWith("blob:"));
          return (
            <SlotCard key={slotKey}
              label={label} value={value} filled={filled} isSelected={mkbSlot === slotKey}
              onClick={() => setMkbSlot(slotKey)}
              onClear={e => { e.stopPropagation(); onClearMkbSlot(slotKey); }} />
          );
        })}

        <div className="flex-1" />

        {/* ── Export controls ── */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <label className="text-[10px] text-muted-foreground">Export Target</label>
          <select
            value={exportTarget ?? ""}
            onChange={e => {
              const v = e.target.value;
              setExportTargetOverride(v === "" ? null : v as ExportTargetMode);
            }}
            className="w-full text-xs px-2 py-1.5 rounded-md bg-card border border-border text-foreground">
            <option value="">-- select target --</option>
            <optgroup label="Controllers">
              {CONTROLLER_TYPES.map(ct => (
                <option key={ct.id} value={ct.id}>{ct.label}</option>
              ))}
            </optgroup>
            <optgroup label="MKB">
              <option value="mkb">C4D.MKB</option>
            </optgroup>
          </select>

          <p className="text-[10px] text-muted-foreground">
            {exportTarget ? (
              <>Send {croppedResult ? "cropped result" : "full image"} as{" "}
              <span className="text-foreground/80">
                {isMkbTarget ? MKB_SLOT_LABELS[mkbSlot] : SLOT_LABELS[exportSlot]}
              </span></>
            ) : "Select a target to export"}
          </p>

          <button onClick={() => handleExportToSkin()} disabled={!hasImage || !exportTarget}
            className={`flex items-center justify-center gap-1.5 w-full text-xs px-2.5 py-2 rounded-md font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${exportDone ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
            <ArrowRightCircle size={12} /> {exportDone ? "✓ Exported!" : "Export to Skin Slot"}
          </button>

          {librarySectionForCurrentSelection() && (
            <button onClick={handleAddToLibrary} disabled={!hasImage}
              className={`flex items-center justify-center gap-1.5 w-full text-xs px-2.5 py-2 rounded-md font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed border ${librarySaved ? "bg-green-600 text-white border-green-600" : libraryError ? "bg-destructive text-white border-destructive" : "bg-card border-border text-foreground hover:border-primary/50 hover:bg-primary/5"}`}>
              {librarySaved ? "✓ Saved to Library!" : libraryError ? "✕ Not Saved" : "＋ Add to Library"}
            </button>
          )}
          {libraryMessage && (
            <p className="text-[10px] text-destructive leading-snug">{libraryMessage}</p>
          )}
        </div>
      </div>

      {/* ── Add to Library — name prompt (Electron doesn't support window.prompt) ── */}
      {showLibraryNamePrompt && (
        <div
          style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center",
            background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)" }}
          onClick={() => setShowLibraryNamePrompt(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"rgba(10,10,14,0.96)", border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:18, padding:"22px 24px", width:360, maxWidth:"90vw",
            boxShadow:"0 24px 64px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)",
            display:"flex", flexDirection:"column", gap:14,
          }}>
            <span style={{ fontSize:12, fontWeight:700, letterSpacing:"0.08em", color:"#fff", textTransform:"uppercase" }}>
              Name this for the library
            </span>
            <input
              autoFocus
              value={libraryNameDraft}
              onChange={e => setLibraryNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && libraryNameDraft.trim()) confirmAddToLibrary(); if (e.key === "Escape") setShowLibraryNamePrompt(false); }}
              placeholder="e.g. Emerald Fade"
              style={{
                background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:8, padding:"8px 10px", color:"#fff", fontSize:13, outline:"none",
              }}
            />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => setShowLibraryNamePrompt(false)}
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 14px", color:"#aaa", fontSize:12, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={confirmAddToLibrary} disabled={!libraryNameDraft.trim()}
                style={{ background: libraryNameDraft.trim() ? "#e40707" : "rgba(228,7,7,0.3)", border:"none", borderRadius:8, padding:"7px 14px", color:"#fff", fontSize:12, fontWeight:600, cursor: libraryNameDraft.trim() ? "pointer" : "not-allowed" }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right: toolbar + canvas */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex-none flex items-center gap-2 px-3 py-2 border-b border-border bg-card/60 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/png,image/webp,image/jpeg,video/webm" className="hidden" onChange={handleFile} />

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          <button onClick={() => setTool("select")} title="Select: click to select bezels or logo"
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all ${tool === "select" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <MousePointer size={12} /> Select
          </button>
          <button onClick={() => setTool("wand")} title="Magic wand: click to remove background color"
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all ${tool === "wand" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Wand2 size={12} /> Wand
          </button>
          <button onClick={() => setTool("erase")} title="Erase brush: paint to remove"
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all ${tool === "erase" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Eraser size={12} /> Erase
          </button>
          <button onClick={() => setTool("restore")} title="Restore brush: paint to bring back original pixels"
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all ${tool === "restore" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Paintbrush size={12} /> Restore
          </button>
          <button onClick={() => { setTool("crop-rect"); setSelection(null); }} title="Rectangle crop"
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all ${tool === "crop-rect" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Square size={12} /> Crop
          </button>
          <button onClick={() => { setTool("crop-circle"); setSelection(null); }} title="Circle crop (for thumbsticks)"
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all ${tool === "crop-circle" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Circle size={12} /> Circle
          </button>
        </div>

        {(tool === "crop-rect" || tool === "crop-circle") && selection && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {Math.round(selection.w)} × {Math.round(selection.h)} px
            </span>
            <button onClick={applyCrop}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-all">
              <Check size={12} /> Apply Crop
            </button>
            <button onClick={cancelCrop}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground transition-all">
              <X size={12} /> Cancel
            </button>
          </div>
        )}

        {croppedResult && (
          <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-md px-2 py-1">
            <img src={croppedResult.url} alt="Crop result" className="w-6 h-6 object-contain" style={{
              backgroundImage: "linear-gradient(45deg, #2a2a35 25%, transparent 25%), linear-gradient(-45deg, #2a2a35 25%, transparent 25%)",
              backgroundSize: "6px 6px",
            }} />
            <span className="text-[10px] text-muted-foreground">{croppedResult.w} × {croppedResult.h} px ready</span>
            <button onClick={useCroppedResultAsMain} title="Edit this crop further (erase/restore)"
              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-all">
              Edit
            </button>
            <button onClick={discardCroppedResult} title="Discard this crop"
              className="text-muted-foreground hover:text-destructive transition-colors">
              <X size={12} />
            </button>
          </div>
        )}

        {tool === "wand" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Tolerance</span>
            <input type="range" min={1} max={100} value={tolerance} onChange={e => setTolerance(Number(e.target.value))}
              className="w-24 accent-primary h-1.5 rounded-full cursor-pointer" />
            <span className="text-[10px] font-mono text-foreground/60 w-6">{tolerance}</span>
          </div>
        )}
        {(tool === "erase" || tool === "restore") && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Brush size</span>
            <input type="range" min={4} max={80} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))}
              className="w-24 accent-primary h-1.5 rounded-full cursor-pointer" />
            <span className="text-[10px] font-mono text-foreground/60 w-6">{brushSize}</span>
          </div>
        )}

        <div className="w-px h-6 bg-border mx-1" />

        <button onClick={undo} disabled={!hasImage || historyRef.current.length === 0}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-card border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          <Undo2 size={12} /> Undo
        </button>
        <button onClick={resetToOriginal} disabled={!hasImage}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-card border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          <RotateCcw size={12} /> Reset
        </button>
        <button onClick={() => {
          setHasImage(false);
          setIsVideo(false);
          setVideoUrl(null);
          videoFileRef.current = null;
          setImgDims(null);
          setZoom(1);
          setSelection(null);
          setCroppedResult(null);
          setBezels([]);
          setSelectedBezel(null);
          setHomeButton(null); homeButtonImgRef.current = null; setHomeButtonSelected(false);
          setLogoSrc(null);
          logoImgRef.current = null;
          historyRef.current = [];
          originalDataRef.current = null;
          const canvas = canvasRef.current;
          if (canvas) { const ctx = canvas.getContext("2d"); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
        }} disabled={!hasImage}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-card border border-destructive/40 hover:border-destructive hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          <X size={12} /> Clear
        </button>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-1.5">
          <ZoomOut size={12} className="text-muted-foreground flex-none" />
          <input type="range" min={10} max={400} step={5} value={Math.round(zoom * 100)}
            onChange={e => setZoom(Number(e.target.value) / 100)}
            disabled={!hasImage}
            className="w-28 h-1.5 accent-primary cursor-pointer disabled:opacity-40" />
          <ZoomIn size={12} className="text-muted-foreground flex-none" />
          <span className="text-[10px] font-mono text-foreground/60 w-10 text-center">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="flex-1" />
      </div>

      {/* Canvas area */}
      <div ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center min-h-0 border-2 border-black m-2 rounded-md"
        style={checkerStyle}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
          if (file && hasImage) { loadLogoFromBlob(file); return; }
          handleCanvasDropBezel(e);
        }}
        onMouseDown={e => { if (e.target === e.currentTarget) setSelectedBezel(null); }}>
        {!hasImage && (
          <button onClick={() => fileInputRef.current?.click()}
            className="group flex flex-col items-center gap-3 text-white/90 transition-all p-12 border-2 border-dashed border-white/25 hover:border-primary rounded-xl"
            style={{
              background: "rgba(10,10,14,0.88)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)",
            }}>
            <ImageIcon size={36} className="text-white/90 group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium text-white/90 group-hover:text-primary transition-colors">Upload a PNG or WebM to start editing</span>
          </button>
        )}
        <div className="relative" style={{
          display: hasImage ? "block" : "none",
          width: imgDims ? `${imgDims.w * zoom}px` : undefined,
          height: imgDims ? `${imgDims.h * zoom}px` : undefined,
        }}>
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              width: imgDims ? `${imgDims.w * zoom}px` : undefined,
              height: imgDims ? `${imgDims.h * zoom}px` : undefined,
              imageRendering: zoom > 1 ? "pixelated" : "auto",
              cursor: tool === "select" ? "default" : tool === "wand" ? "crosshair" : (tool === "crop-rect" || tool === "crop-circle") ? "crosshair" : "none",
              visibility: logoSrc ? "hidden" : "visible",
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => { handleCanvasMouseUp(); setBrushPos(null); }}
          />

          {logoSrc && (
            <canvas
              ref={displayCanvasRef}
              style={{
                display: "block", position: "absolute", inset: 0,
                width: imgDims ? `${imgDims.w * zoom}px` : undefined,
                height: imgDims ? `${imgDims.h * zoom}px` : undefined,
                imageRendering: zoom > 1 ? "pixelated" : "auto",
                cursor: tool === "select" ? (logoSelected ? "move" : "crosshair")
                  : tool === "wand" ? "crosshair"
                  : (tool === "crop-rect" || tool === "crop-circle") ? "crosshair"
                  : "none",
                zIndex: 11,
              }}
              onMouseDown={tool === "select" ? handleDisplayMouseDown : handleCanvasMouseDown}
              onMouseMove={tool === "select" ? handleDisplayMouseMove : handleCanvasMouseMove}
              onMouseUp={tool === "select" ? handleDisplayMouseUp : handleCanvasMouseUp}
              onMouseLeave={tool === "select" ? handleDisplayMouseUp : () => { handleCanvasMouseUp(); setBrushPos(null); }}
            />
          )}

          {/* Logo selection handles — SVG overlay, never part of toDataURL() */}
          {tool === "select" && logoSrc && logoSelected && imgDims && (() => {
            const { x, y, w, h, rot } = logoPos;
            const lcx = (x + w / 2) * zoom;
            const lcy = (y + h / 2) * zoom;
            const dw = w * zoom; const dh = h * zoom;
            return (
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", zIndex: 12, pointerEvents: "none" }}>
                <g transform={`translate(${lcx},${lcy}) rotate(${rot})`}>
                  <rect x={-dw/2} y={-dh/2} width={dw} height={dh}
                    fill="none" stroke="#e40707" strokeWidth={1.5} strokeDasharray="6 3" />
                  <circle cx={dw/2} cy={dh/2} r={6} fill="#fff" stroke="#e40707" strokeWidth={1.5} style={{ pointerEvents: "auto", cursor: "se-resize" }}
                    onMouseDown={e => {
                      e.stopPropagation();
                      const [sx, sy] = toLogoSpace(e.clientX, e.clientY);
                      logoDragRef.current = { mode: "resize", startX: sx, startY: sy, origPos: { ...logoPos } };
                      window.addEventListener("mousemove", onLogoMouseMove); window.addEventListener("mouseup", onLogoMouseUp);
                    }} />
                  <line x1={0} y1={-dh/2} x2={0} y2={-dh/2 - 14} stroke="#e40707" strokeWidth={1.5} />
                  <circle cx={0} cy={-dh/2 - 20} r={6} fill="#fff" stroke="#e40707" strokeWidth={1.5} style={{ pointerEvents: "auto", cursor: "grab" }}
                    onMouseDown={e => {
                      e.stopPropagation();
                      const [sx, sy] = toLogoSpace(e.clientX, e.clientY);
                      logoDragRef.current = { mode: "rotate", startX: sx, startY: sy, origPos: { ...logoPos }, startAngle: logoPos.rot };
                      window.addEventListener("mousemove", onLogoMouseMove); window.addEventListener("mouseup", onLogoMouseUp);
                    }} />
                </g>
              </svg>
            );
          })()}

          {/* Video element kept hidden — used only for WebGL texture upload.
              The canvas displays the captured first frame so all tools work
              identically to PNG. No z-index conflicts. */}
          {isVideo && videoUrl && hasImage && (
            <video
              ref={videoEditRef}
              src={videoUrl}
              autoPlay
              loop={videoLoop}
              muted
              playsInline
              style={{ display: "none" }}
            />
          )}

          {/* WebM mode badge */}
          {isVideo && (
            <div style={{
              position: "absolute", top: 6, right: 6,
              background: videoFileRef.current ? "rgba(22,163,74,0.9)" : "rgba(220,38,38,0.9)",
              color: "#fff",
              fontSize: 10, padding: "2px 8px", borderRadius: 4,
              pointerEvents: "none", fontWeight: 600,
            }}>
              {videoFileRef.current ? "🎬 WebM ready — exports as animated" : "⚠️ WebM not tracked — re-upload to export as animated"}
            </div>
          )}

          {brushPos && (tool === "erase" || tool === "restore") && (
            <div style={{
              position: "absolute",
              left: brushPos.x - (brushSize * zoom) / 2,
              top: brushPos.y - (brushSize * zoom) / 2,
              width: brushSize * zoom,
              height: brushSize * zoom,
              border: `2px solid ${tool === "erase" ? "#ff4444" : "#44ff88"}`,
              borderRadius: "50%",
              pointerEvents: "none",
              boxShadow: `0 0 0 1px rgba(0,0,0,0.5)`,
              zIndex: 20,
            }} />
          )}

          {/* Bezel overlays */}
          {bezels.map(bz => {
            const dispX = (bz.x - bz.size/2) * zoom;
            const dispY = (bz.y - bz.size/2) * zoom;
            const dispSize = bz.size * zoom;
            const isSelected = selectedBezel === bz.id;
            return (
              <div key={bz.id}
                onMouseDown={e => { e.stopPropagation(); e.preventDefault(); beginBezelDrag(e, bz.id, "move"); }}
                style={{
                  position: "absolute",
                  left: `${dispX}px`, top: `${dispY}px`,
                  width: `${dispSize}px`, height: `${dispSize}px`,
                  cursor: "move",
                  zIndex: 20,
                  userSelect: "none",
                  outline: isSelected ? "2px solid #e40707" : "none",
                  outlineOffset: "2px",
                }}>
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <img src={bz.bezelUrl} alt="bezel"
                    draggable={false}
                    style={{
                      width: "100%", height: "100%", display: "block", pointerEvents: "none",
                      userSelect: "none",
                      filter: `hue-rotate(${bz.hue}deg) brightness(${bz.brightness}) contrast(${bz.contrast}) saturate(${bz.saturate})`,
                    }} />
                </div>
                {/* Handles always present but only visible when selected */}
                <div onMouseDown={e => { e.stopPropagation(); beginBezelDrag(e, bz.id, "resize"); }}
                  style={{
                    position: "absolute", right: -6, bottom: -6,
                    width: 14, height: 14, background: "#fff",
                    border: "2px solid #e40707", borderRadius: "50%",
                    cursor: "se-resize",
                    opacity: isSelected ? 1 : 0,
                    pointerEvents: isSelected ? "auto" : "none",
                    transition: "opacity 0.15s",
                  }} />
                <div onMouseDown={e => { e.stopPropagation(); removeBezel(bz.id); }}
                  style={{
                    position: "absolute", right: -6, top: -6,
                    width: 16, height: 16, background: "#e40707",
                    borderRadius: "50%", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "#fff", fontWeight: "bold",
                    opacity: isSelected ? 1 : 0,
                    pointerEvents: isSelected ? "auto" : "none",
                    transition: "opacity 0.15s",
                  }}>✕</div>
              </div>
            );
          })}

          {/* Home button canvas overlay */}
          {homeButton && (
            <div
              onMouseDown={e => beginHomeButtonDrag(e, "move")}
              style={{
                position: "absolute",
                left: `${(homeButton.x - homeButton.size/2) * zoom}px`,
                top:  `${(homeButton.y - homeButton.size/2) * zoom}px`,
                width: `${homeButton.size * zoom}px`,
                height:`${homeButton.size * zoom}px`,
                cursor: "move", zIndex: 21, userSelect: "none",
                outline: homeButtonSelected ? "2px solid #e40707" : "none",
                outlineOffset: "2px",
              }}>
              <img src={homeButton.src} alt="home button" draggable={false}
                style={{ width:"100%", height:"100%", display:"block", objectFit:"contain", pointerEvents:"none", userSelect:"none",
                  filter:`hue-rotate(${homeButton.hue}deg) brightness(${homeButton.brightness}) contrast(${homeButton.contrast}) saturate(${homeButton.saturate})` }} />
              <div onMouseDown={e => { e.stopPropagation(); e.preventDefault(); beginHomeButtonDrag(e, "resize"); }}
                style={{ position:"absolute", right:-6, bottom:-6, width:14, height:14, background:"#fff",
                  border:"2px solid #e40707", borderRadius:"50%", cursor:"se-resize",
                  opacity: homeButtonSelected ? 1 : 0, pointerEvents: homeButtonSelected ? "auto" : "none", transition:"opacity 0.15s" }} />
              <div onMouseDown={e => { e.stopPropagation(); setHomeButton(null); homeButtonImgRef.current = null; setHomeButtonSelected(false); }}
                style={{ position:"absolute", right:-6, top:-6, width:16, height:16, background:"#e40707",
                  borderRadius:"50%", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:10, color:"#fff", fontWeight:"bold",
                  opacity: homeButtonSelected ? 1 : 0, pointerEvents: homeButtonSelected ? "auto" : "none", transition:"opacity 0.15s" }}>✕</div>
            </div>
          )}

          {selection && (tool === "crop-rect" || tool === "crop-circle") && (
            <div
              onMouseDown={(e) => beginSelDrag(e, "move")}
              style={{
                position: "absolute",
                left: `${selection.x * zoom}px`,
                top: `${selection.y * zoom}px`,
                width: `${selection.w * zoom}px`,
                height: `${selection.h * zoom}px`,
                border: "2px dashed #fff",
                borderRadius: tool === "crop-circle" ? "50%" : "0",
                background: "rgba(255,255,255,0.08)",
                cursor: "move",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
                zIndex: 20,
              }}
            >
              <div
                onMouseDown={(e) => beginSelDrag(e, "resize")}
                style={{
                  position: "absolute",
                  right: "-6px",
                  bottom: "-6px",
                  width: "14px",
                  height: "14px",
                  background: "#fff",
                  border: "2px solid #db0606",
                  borderRadius: "50%",
                  cursor: "se-resize",
                }}
              />
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Right sidebar: Logo Placement */}
      <div className="flex-none w-[240px] flex flex-col border-l-2 border-black bg-card/30 min-h-0">
        <div className="p-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Logo Placement</p>
          <button onClick={() => logoFileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-2.5 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-all">
            <Upload size={12} /> Upload Logo PNG
          </button>
          <input ref={logoFileInputRef} type="file" accept="image/png,image/webp,image/jpeg,video/webm" className="hidden" onChange={handleLogoFile} />
          {logoSrc && (
            <button onClick={() => { setLogoSrc(null); logoImgRef.current = null; setLogoSelected(false); }}
              className="mt-1.5 w-full text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all">
              Remove Logo
            </button>
          )}
        </div>

        {/* ── All panel sections in one scrollable block ──────────────────── */}
        <div className="flex flex-col gap-2 p-3 overflow-y-auto flex-1 min-h-0 text-[10px]">

          {/* Logo settings — only when a logo is placed */}
          {logoSrc ? (<React.Fragment key={logoSrc}>
            <Section label="Layer Blend Mode">
              <select value={logoBlendMode} onChange={e => setLogoBlendMode(e.target.value as BlendModeId)}
                className="w-full text-xs px-2 py-1.5 rounded-md bg-card border border-border text-foreground mb-2">
                {BLEND_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <NumRow label="Opacity" value={Math.round(logoOpacity * 100)} unit="%" min={1} max={100}
                onChange={v => setLogoOpacity(v / 100)} step={1} />
            </Section>

            <Section label="Blend If — This Layer (Logo)">
              <p className="text-muted-foreground/60 mb-1.5 leading-snug">
                Each range: <b className="text-foreground/40">Start → End</b> (feather). Equal = hard edge.
              </p>
              <DualRow label="Shadows" lo={biThisShLo} hi={biThisShHi}
                setLo={v => setBiThisShLo(Math.min(v, biThisShHi))} setHi={v => setBiThisShHi(Math.max(v, biThisShLo))} />
              <DualRow label="Highlights" lo={biThisHiLo} hi={biThisHiHi}
                setLo={v => setBiThisHiLo(Math.min(v, biThisHiHi))} setHi={v => setBiThisHiHi(Math.max(v, biThisHiLo))} />
            </Section>

            <Section label="Blend If — Underlying Layer (Surface)">
              <DualRow label="Shadows" lo={biUndShLo} hi={biUndShHi}
                setLo={v => setBiUndShLo(Math.min(v, biUndShHi))} setHi={v => setBiUndShHi(Math.max(v, biUndShLo))} />
              <DualRow label="Highlights" lo={biUndHiLo} hi={biUndHiHi}
                setLo={v => setBiUndHiLo(Math.min(v, biUndHiHi))} setHi={v => setBiUndHiHi(Math.max(v, biUndHiLo))} />
            </Section>

            <Section label="Displacement Map">
              <NumRow label="Horizontal" value={dispX} unit="px" min={0} max={60} step={0.5} onChange={setDispX} />
              <NumRow label="Vertical"   value={dispY} unit="px" min={0} max={60} step={0.5} onChange={setDispY} />
              <p className="text-muted-foreground/40 leading-snug mt-1">
                Warps logo along surface Sobel gradient. Start with 5–10.
              </p>
            </Section>

            <Section label="Surface Softening">
              <NumRow label="Logo Blur" value={logoBlur} unit="px" min={0} max={8} step={0.1} onChange={setLogoBlur} />
              <p className="text-muted-foreground/40 leading-snug mt-1">
                Slight blur (0.5–1.5px) removes the "digital sticker" edge.
              </p>
            </Section>

            <Section label="Placement">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-1.5">
                {([["X", logoPos.x, (v: number) => setLogoPos({ ...logoPos, x: v })],
                   ["Y", logoPos.y, (v: number) => setLogoPos({ ...logoPos, y: v })]] as const).map(([l, val, set]) => (
                  <label key={l} className="flex items-center gap-1">
                    <span className="text-muted-foreground w-3">{l}</span>
                    <input type="number" value={Math.round(val as number)}
                      onChange={e => (set as (v: number) => void)(Number(e.target.value))}
                      className="flex-1 min-w-0 text-[10px] bg-muted/30 border border-border rounded px-1 py-0.5 text-right" />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-1.5">
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground w-3">W</span>
                  <input type="number" value={Math.round(logoPos.w)}
                    onChange={e => {
                      const nw = Number(e.target.value);
                      setLogoPos({ ...logoPos, w: nw, h: lockAspect ? Math.round(nw * logoPos.h / (logoPos.w || 1)) : logoPos.h });
                    }}
                    className="flex-1 min-w-0 text-[10px] bg-muted/30 border border-border rounded px-1 py-0.5 text-right" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground w-3">H</span>
                  <input type="number" value={Math.round(logoPos.h)}
                    onChange={e => {
                      const nh = Number(e.target.value);
                      setLogoPos({ ...logoPos, h: nh, w: lockAspect ? Math.round(nh * logoPos.w / (logoPos.h || 1)) : logoPos.w });
                    }}
                    className="flex-1 min-w-0 text-[10px] bg-muted/30 border border-border rounded px-1 py-0.5 text-right" />
                </label>
              </div>
              <label className="flex items-center gap-1.5 mb-2 cursor-pointer">
                <input type="checkbox" checked={lockAspect} onChange={e => setLockAspect(e.target.checked)}
                  className="accent-primary" />
                <span className="text-muted-foreground">Lock aspect ratio</span>
              </label>
              <NumRow label="Rotation" value={Math.round(logoPos.rot)} unit="°" min={0} max={360} step={1}
                onChange={v => setLogoPos({ ...logoPos, rot: v })} />
            </Section>
          </React.Fragment>) : (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-muted-foreground/40">
              <ImageIcon size={28} />
              <p className="text-[10px]">Upload a logo PNG to place it on the controller</p>
            </div>
          )}

          {/* ── Bezels ───────────────────────────────────────────────────────── */}
          <Section label="Bezels">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground/60">Up to 2 per skin</span>
              <button
                onClick={() => setShowBezelPicker(true)}
                disabled={!hasImage || bezels.length >= 2}
                className="flex items-center gap-1 text-xs text-primary border border-primary/40 hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-all font-medium">
                ＋ Library
              </button>
            </div>
            {bezels.length === 0 && (
              <p className="text-xs text-muted-foreground/40 text-center py-1">
                {hasImage ? "Open library to place a bezel" : "Load an image first"}
              </p>
            )}
            {bezels.map(bz => {
              const def = BEZEL_LIBRARY.find(b => b.url === bz.bezelUrl);
              return (
                <div key={bz.id}
                  className={`rounded-md border overflow-hidden transition-all cursor-pointer ${selectedBezel === bz.id ? "border-primary bg-primary/5" : "border-border"}`}
                  onClick={() => setSelectedBezel(bz.id)}>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <img src={bz.bezelUrl} alt={def?.name ?? "bezel"}
                        style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0, filter: `hue-rotate(${bz.hue}deg) brightness(${bz.brightness}) contrast(${bz.contrast}) saturate(${bz.saturate})` }} />
                      <span className="text-xs font-medium text-foreground/80">{def?.name ?? "Bezel"}</span>
                    </div>
                    <button onClick={e => { e.stopPropagation(); removeBezel(bz.id); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"><X size={11} /></button>
                  </div>
                  {/* Color adjustment lives only in the library popover now —
                      this used to duplicate those same sliders per placed
                      bezel, which was redundant. Duplicating an existing
                      bezel (below) carries its color settings over exactly,
                      so a matching second bezel never needs re-tuning here. */}
                  {selectedBezel === bz.id && (
                    <div className="border-t border-border bg-background/30 px-2 py-1.5">
                      <button onClick={e => { e.stopPropagation(); duplicateBezel(bz); }}
                        disabled={bezels.length >= 2}
                        className="w-full flex items-center justify-center gap-1 text-xs text-primary border border-primary/40 hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded transition-all font-medium">
                        ＋ Add Another Like This
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </Section>

          {/* ── Home Button ──────────────────────────────────────────────────── */}
          <Section label="Home Button">
            {!homeButton ? (
              <button onClick={() => {
                if (!hasImage) return;
                const img = new Image();
                img.onload = () => {
                  homeButtonImgRef.current = img;
                  const c = canvasRef.current;
                  const size = c ? Math.round(Math.min(c.width, c.height) * 0.09) : 100;
                  setHomeButton({ src: "c4d-home-button.png", x: c ? c.width * 0.5 : 200, y: c ? c.height * 0.65 : 300,
                    size, hue: 0, brightness: 1, contrast: 1, saturate: 1 });
                  setHomeButtonSelected(true);
                };
                img.src = "c4d-home-button.png";
              }}
                disabled={!hasImage}
                className="w-full flex items-center justify-center gap-2 text-xs px-2.5 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <img src="c4d-home-button.png" alt="C4D" style={{ width: 20, height: 20, objectFit: "contain", borderRadius: "50%" }} />
                Place Home Button
              </button>
            ) : (
              <div className="rounded-md border overflow-hidden border-border">
                <div className="flex items-center justify-between px-2 py-1.5 bg-card">
                  <div className="flex items-center gap-1.5">
                    <img src={homeButton.src} alt="home button"
                      style={{ width:22, height:22, objectFit:"contain", flexShrink:0, borderRadius:"50%",
                        filter:`hue-rotate(${homeButton.hue}deg) brightness(${homeButton.brightness}) contrast(${homeButton.contrast}) saturate(${homeButton.saturate})` }} />
                    <span className="text-xs font-medium text-foreground/80">Home Button</span>
                  </div>
                  <div className="flex items-center gap-2">
                  <button onClick={() => { setHomeButton(null); homeButtonImgRef.current = null; setHomeButtonSelected(false); }}
                    className="text-muted-foreground hover:text-destructive transition-colors"><X size={11} /></button>
                </div>
                </div>
                <div className="border-t border-border bg-background/30 px-2 py-1.5 space-y-1.5">
                  {([
                    { label:"Hue",    key:"hue",        value:homeButton.hue,        min:0,    max:360, step:1    },
                    { label:"Bright", key:"brightness",  value:homeButton.brightness, min:0,    max:3,   step:0.05 },
                    { label:"Contr",  key:"contrast",    value:homeButton.contrast,   min:0,    max:3,   step:0.05 },
                    { label:"Sat",    key:"saturate",    value:homeButton.saturate,   min:0,    max:10,  step:0.1  },
                  ] as const).map(({ label, key, value, min, max, step }) => (
                    <div key={key} className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-muted-foreground w-10 shrink-0">{label}</span>
                      <input type="range" min={min} max={max} step={step} value={value}
                        onChange={e => setHomeButton(prev => prev ? { ...prev, [key]: Number(e.target.value) } : prev)}
                        className="min-w-0 flex-1 h-1 accent-primary" />
                      {key === "hue"
                        ? <span className="w-5 h-5 rounded shrink-0 border border-white/20 shadow-sm"
                            style={{ background: `hsl(${value}, 100%, 50%)`, flexShrink: 0 }} />
                        : <span className="text-xs text-muted-foreground w-7 text-right shrink-0 tabular-nums">{typeof value === "number" ? value.toFixed(1) : value}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

        </div>

        {/* ── Bake actions — pinned to bottom ──────────────────────────────── */}
        {hasImage ? (
          <div className="p-3 border-t border-border mt-auto space-y-2">
            {!isVideo && (
              <button onClick={bakeToCanvas}
                className="w-full flex items-center justify-center gap-1.5 text-xs px-2.5 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-all">
                <Check size={12} /> Bake to Canvas (PNG)
              </button>
            )}
            {isVideo && videoFileRef.current && (
              <button onClick={handleBakeLogoToWebM} disabled={isEncoding}
                className="w-full flex items-center justify-center gap-1.5 text-xs px-2.5 py-2 rounded-md font-medium transition-all bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed">
                🎬 {isEncoding
                  ? `Encoding… ${Math.round(encodingProgress * 100)}%`
                  : (logoSrc && logoImgRef.current) && bezels.length > 0
                    ? "Bake Logo + Bezels to WebM"
                    : logoSrc && logoImgRef.current
                      ? "Bake Logo to WebM"
                      : bezels.length > 0 || !!homeButton
                        ? "Bake Bezels to WebM"
                        : "Bake to WebM"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Bezel Library Picker ───────────────────────────────────────────── */}
      {showBezelPicker && (
        <div
          style={{ position:"absolute", inset:0, zIndex:90, display:"flex", alignItems:"center", justifyContent:"center",
            background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)" }}
          onClick={() => setShowBezelPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"rgba(10,10,14,0.96)", border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:18, padding:"22px 24px",
            boxShadow:"0 24px 64px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)",
            width:380, display:"flex", flexDirection:"column", gap:16,
          }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, fontWeight:700, letterSpacing:"0.08em", color:"#fff", textTransform:"uppercase" }}>
                  Bezel Library
                </span>
                <span style={{
                  fontSize:10, fontWeight:700, color:"#aaa",
                  background:"rgba(255,255,255,0.08)", borderRadius:999, padding:"1px 6px", lineHeight:1.4,
                }}>{BEZEL_LIBRARY.length + customBezels.length}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button onClick={addBezelToLibrary.openPicker}
                  style={{ background:"none", border:"1px solid rgba(228,7,7,0.5)", color:"#e40707",
                    borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:10, fontWeight:600 }}>
                  ＋ Add to Library
                </button>
                <button onClick={() => setShowBezelPicker(false)}
                  style={{ background:"none", border:"none", color:"#888", cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>
              </div>
            </div>
            <input ref={addBezelToLibrary.inputRef} type="file" accept="image/*" className="hidden"
              onChange={addBezelToLibrary.handleFile} />

            {/* Rename prompt — shown after picking a file, before it's actually saved */}
            {addBezelToLibrary.pendingDataUrl && (
              <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(228,7,7,0.4)",
                borderRadius:10, padding:10, display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <img src={addBezelToLibrary.pendingDataUrl} alt="New bezel"
                    style={{ width:40, height:40, objectFit:"contain", flexShrink:0 }} />
                  <input autoFocus value={addBezelToLibrary.nameDraft}
                    onChange={e => addBezelToLibrary.setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addBezelToLibrary.confirmAdd(); }}
                    placeholder="Name this bezel"
                    style={{ flex:1, background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.15)",
                      borderRadius:6, padding:"5px 8px", fontSize:11, color:"#fff", outline:"none" }} />
                </div>
                {addBezelToLibrary.error && (
                  <span style={{ fontSize:10, color:"#f87171" }}>{addBezelToLibrary.error}</span>
                )}
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={addBezelToLibrary.confirmAdd} disabled={addBezelToLibrary.saving}
                    style={{ flex:1, background:"#e40707", border:"none", color:"#fff", borderRadius:6,
                      padding:"6px 0", fontSize:11, fontWeight:700, cursor:"pointer",
                      opacity: addBezelToLibrary.saving ? 0.6 : 1 }}>
                    {addBezelToLibrary.saving ? "Saving…" : "Add"}
                  </button>
                  <button onClick={addBezelToLibrary.cancel}
                    style={{ background:"none", border:"1px solid rgba(255,255,255,0.2)", color:"#aaa",
                      borderRadius:6, padding:"6px 12px", fontSize:11, cursor:"pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Bezel grid — scrollable, 3 columns */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, maxHeight:280, overflowY:"auto", paddingRight:4 }}>
              {[...BEZEL_LIBRARY, ...customBezels].map(b => (
                <div key={b.id} style={{ position:"relative" }}>
                  <button onClick={() => setPickerUrl(b.url)}
                    style={{
                      width:"100%",
                      background: pickerUrl === b.url ? "rgba(228,7,7,0.18)" : "rgba(255,255,255,0.05)",
                      border:`2px solid ${pickerUrl === b.url ? "#e40707" : "rgba(255,255,255,0.10)"}`,
                      borderRadius:10, padding:"8px 4px", cursor:"pointer",
                      display:"flex", flexDirection:"column", alignItems:"center", gap:6,
                      transition:"border-color 0.15s, background 0.15s",
                    }}>
                    <img src={b.url} alt={b.name}
                      style={{ width:56, height:56, objectFit:"contain",
                        filter:`hue-rotate(${pickerHue}deg) brightness(${pickerBrightness}) contrast(${pickerContrast}) saturate(${pickerSaturate})` }} />
                    <span style={{ fontSize:8, color:"#aaa", textAlign:"center", lineHeight:1.3 }}>{b.name}</span>
                  </button>
                  {b.id.startsWith("custom-") && (
                    <button onClick={(e) => { e.stopPropagation(); removeCustomBezel(b.id); }}
                      title="Remove from library"
                      style={{
                        position:"absolute", top:2, right:2, width:16, height:16, lineHeight:"14px",
                        borderRadius:"50%", background:"rgba(0,0,0,0.75)", border:"1px solid rgba(255,255,255,0.25)",
                        color:"#ccc", fontSize:10, cursor:"pointer", padding:0,
                      }}>×</button>
                  )}
                </div>
              ))}
            </div>

            {/* Sliders */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {([
                { label:"Hue",        value:pickerHue,        set:setPickerHue,        min:0,    max:360, step:1    },
                { label:"Brightness", value:pickerBrightness, set:setPickerBrightness, min:0,    max:3,   step:0.05 },
                { label:"Contrast",   value:pickerContrast,   set:setPickerContrast,   min:0,    max:3,   step:0.05 },
                { label:"Saturation", value:pickerSaturate,   set:setPickerSaturate,   min:0,    max:10,  step:0.1  },
              ] as const).map(({ label, value, set, min, max, step }) => (
                <div key={label} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ width:72, fontSize:10, color:"#aaa", flexShrink:0 }}>{label}</span>
                  <input type="range" min={min} max={max} step={step} value={value}
                    onChange={e => (set as (v:number)=>void)(Number(e.target.value))}
                    style={{ flex:1, accentColor:"#e40707" }} />
                  {label === "Hue"
                    ? <span style={{ width:20, height:20, borderRadius:4, flexShrink:0, border:"1px solid rgba(255,255,255,0.2)",
                        background:`hsl(${value},100%,50%)` }} />
                    : <span style={{ width:36, fontSize:10, color:"#fff", textAlign:"right", flexShrink:0, fontVariantNumeric:"tabular-nums" }}>
                        {typeof value === "number" ? value.toFixed(1) : value}
                      </span>
                  }
                </div>
              ))}
            </div>

            {/* Place button */}
            <button
              onClick={addBezelFromPicker}
              disabled={!hasImage || bezels.length >= 2}
              style={{
                padding:"10px 0", borderRadius:10, border:"none", cursor: (!hasImage || bezels.length >= 2) ? "not-allowed" : "pointer",
                background: (!hasImage || bezels.length >= 2) ? "rgba(255,255,255,0.08)" : "#e40707",
                color:"#fff", fontSize:12, fontWeight:700, letterSpacing:"0.04em",
                opacity: (!hasImage || bezels.length >= 2) ? 0.5 : 1,
              }}>
              {bezels.length >= 2 ? "Max 2 bezels placed" : !hasImage ? "Load an image first" : "Place on Canvas"}
            </button>
          </div>
        </div>
      )}

      {/* Encoding overlay — covers the entire editor (sidebars + canvas) with a
          backdrop blur so the content is still visible beneath, rather than a
          solid black scrim. The card is larger and has a strong drop shadow. */}
      {isEncoding && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 100,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "rgba(10,10,14,0.92)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "20px",
            padding: "32px 44px",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.95), 0 8px 24px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.07)",
            textAlign: "center",
            minWidth: "320px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}>
            <video
              src="logoanimation.webm"
              autoPlay loop muted playsInline
              style={{ width: 240, height: "auto", display: "block" }}
            />
            <div style={{ width: "100%", background: "rgba(255,255,255,0.10)", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{
                width: `${encodingProgress * 100}%`,
                background: "linear-gradient(90deg,#e40707,#ff6b35)",
                height: "100%", borderRadius: 4,
                transition: "width 0.1s linear",
              }} />
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0, letterSpacing: "0.02em" }}>
              {Math.round(encodingProgress * 100)}% — baking logo into WebM…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
