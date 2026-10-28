import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BEZEL_LIBRARY } from "./ImageEditor";
import { BezelSlot } from "../types/config";

// Customer-facing bezel step — unlike the internal tool's free-placement
// BezelEditor, this never lets anyone move or resize anything. The product
// was authored in the internal tool with its bezel slots (position + size)
// already locked in; a customer can only swap which material sits in each
// existing slot, picked from the library. Nothing to drag.

interface Props {
  /** The skin exactly as it stood before any bezels were baked in — the
   *  clean base every material swap recomposites from. */
  baseSkinNoBezels: string;
  /** The product's fixed slots (position/size decided at authoring time). */
  slots: BezelSlot[];
  onApply: (dataUrl: string, changed: boolean) => void;
  /** Reports open/closed so the editor can show its fade only while a picker is open. */
  onPickerOpenChange?: (open: boolean) => void;
}

export function BezelSlotPicker({ baseSkinNoBezels, slots: initialSlots, onApply, onPickerOpenChange }: Props) {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [slots, setSlots] = useState<BezelSlot[]>(initialSlots);
  const [pickerForSlot, setPickerForSlot] = useState<number | null>(null);
  const pickerOpen = pickerForSlot !== null;
  useEffect(() => {
    if (!pickerOpen) return;
    onPickerOpenChange?.(true);
    return () => onPickerOpenChange?.(false);
  }, [pickerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = baseCanvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
      }
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = baseSkinNoBezels;
  }, [baseSkinNoBezels]);

  function drawComposite() {
    const display = displayCanvasRef.current;
    const base = baseCanvasRef.current;
    if (!display || !base || !base.width) return;
    const W = base.width, H = base.height;
    display.width = W; display.height = H;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);
    for (const bz of slots) {
      const img = slotImgCache.get(bz.bezelUrl) ?? (() => {
        const i = new Image();
        i.onload = () => drawComposite();
        i.src = bz.bezelUrl;
        slotImgCache.set(bz.bezelUrl, i);
        return i;
      })();
      if (!img.complete) continue;
      const x = bz.x - bz.size / 2, y = bz.y - bz.size / 2;
      ctx.save();
      const isDefault = bz.hue === 0 && bz.brightness === 1 && bz.contrast === 1 && bz.saturate === 1;
      if (!isDefault) ctx.filter = `hue-rotate(${bz.hue}deg) brightness(${bz.brightness}) contrast(${bz.contrast}) saturate(${bz.saturate})`;
      ctx.drawImage(img, x, y, bz.size, bz.size);
      ctx.restore();
    }
  }

  // Auto-applies on every material change instead of requiring an explicit
  // "Apply" click — the controller preview in the center of the page is the
  // only place this shows up now, so a pick should land there immediately.
  // Skips the very first render (nothing's actually changed yet at mount).
  const isFirstRender = useRef(true);
  useEffect(() => {
    drawComposite();
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const display = displayCanvasRef.current;
    if (!display || !display.width) return;
    const changed = slots.some((s, i) => s.bezelUrl !== initialSlots[i]?.bezelUrl);
    onApply(display.toDataURL("image/png"), changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, imgDims]);

  function pickMaterial(slotId: number, bezelUrl: string) {
    setSlots(prev => prev.map(s => (s.id === slotId ? { ...s, bezelUrl } : s)));
    setPickerForSlot(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="pb-2 border-b border-border">
        <span className="text-sm font-semibold">Bezels</span>
      </div>

      {/* Compositing canvases — never shown. The result renders live on the
          actual controller preview in the center of the page instead of a
          separate duplicate preview here. */}
      <canvas ref={baseCanvasRef} style={{ display: "none" }} />
      <canvas ref={displayCanvasRef} style={{ display: "none" }} />

      {slots.length === 0 && (
        <p className="text-xs text-muted-foreground/70">This controller doesn't have any bezel materials to customize.</p>
      )}

      <div className="space-y-2">
        {slots.map((slot, i) => {
          const current = BEZEL_LIBRARY.find(b => b.url === slot.bezelUrl);
          return (
            <div key={slot.id} className="border border-border rounded-lg bg-background/60 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <img src={slot.bezelUrl} alt={current?.name ?? "Bezel"} className="w-12 h-12 rounded object-cover border border-border" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Bezel {i + 1}</p>
                  <p className="text-xs font-medium truncate">{current?.name ?? "Custom"}</p>
                </div>
                {pickerForSlot === slot.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPickerForSlot(null)}
                      aria-label="Back"
                      className="p-1.5 rounded-md border border-primary text-primary hover:bg-primary/15 transition-all"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled
                      className="text-[11px] px-2.5 py-1.5 rounded-md border border-border text-muted-foreground/40 cursor-not-allowed"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setPickerForSlot(slot.id)}
                    className="text-[11px] px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
                  >
                    Change
                  </button>
                )}
              </div>

              {pickerForSlot === slot.id && (
                <div className="grid grid-cols-3 gap-1.5 p-1.5 border border-border rounded-lg">
                  {BEZEL_LIBRARY.map(b => (
                    <button key={b.id} onClick={() => pickMaterial(slot.id, b.url)}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded border transition-all ${b.url === slot.bezelUrl ? "border-primary" : "border-border hover:border-primary/50"}`}>
                      <img src={b.url} alt={b.name} className="w-11 h-11 object-cover rounded" />
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">{b.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const slotImgCache = new Map<string, HTMLImageElement>();
