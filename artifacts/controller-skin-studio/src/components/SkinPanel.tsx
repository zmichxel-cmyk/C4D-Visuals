import { useEffect, useRef, useState } from "react";
import { Upload, X, ImageIcon, Film, Settings2, LayoutGrid } from "lucide-react";
import { ControllerConfig, ControllerType } from "../types/config";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { LibraryPicker, LibraryEntry, loadCustomLibrary, removeFromCustomLibrary, useAddToLibrary } from "./LibraryPicker";

interface Props {
  config: ControllerConfig;
  onChange: (updates: Partial<ControllerConfig>) => void;
  stickSizePx: number;
  bodySizeLabel: string;
  onClearSlot: (slot: "controllerSkin" | "leftStickSkin" | "rightStickSkin") => void;
}

export interface UploadSlotProps {
  label: string;
  value: string | null;
  onUpload: (dataUrl: string) => void;
  onClear: () => void;
  hint?: string;
  onOpenLibrary?: () => void;
  /** Defaults to the internal Studio tool's original look (Template badge on
   *  preset values, plain "＋ Library" text link) — pass "customer" only from
   *  the website customizer to get its pill-button/no-badge treatment.
   *  Never change the default itself; this component is shared by both apps. */
  variant?: "internal" | "customer";
}

// ── Thumbstick library ─────────────────────────────────────────────────────
// Drop a PNG into  public/sticks/  then add ONE entry here.
// The same library is shown for both the left and right slots — pick any
// stick for either side. If your stick is asymmetric (different left/right
// shapes) just add both PNGs as separate entries.
//
// C4D.1 + C4D.1 Edge  → C4D1_STICKS
// C4D.4 + C4D.5 + C4D.5 Edge  → PS_STICKS

export type StickEntry = { id: string; name: string; url: string };

export const C4D1_STICKS: StickEntry[] = [
  { id:"c4d1-abyssal-iris",         name:"Abyssal Iris",      url:"sticks/c4d1-abyssal-iris.png" },
  { id:"c4d1-anodized",            name:"Anodized",          url:"sticks/c4d1-anodized.png" },
  { id:"c4d1-antique",             name:"Antique",           url:"sticks/c4d1-antique.png" },
  { id:"c4d1-bismuth-bastion",     name:"Bismuth Bastion",   url:"sticks/c4d1-bismuth-bastion.png" },
  { id:"c4d1-black",               name:"Black",             url:"sticks/c4d1-black.png" },
  { id:"c4d1-black-carbon",        name:"Black Carbon",      url:"sticks/c4d1-black-carbon.png" },
  { id:"c4d1-bronze",              name:"Bronze",            url:"sticks/c4d1-bronze.png" },
  { id:"c4d1-ceramic-blue",        name:"Ceramic Blue",      url:"sticks/c4d1-ceramic-blue.png" },
  { id:"c4d1-chrome",              name:"Chrome",            url:"sticks/c4d1-chrome.png" },
  { id:"c4d1-fools-gold",          name:"Fools Gold",        url:"sticks/c4d1-fools-gold.png" },
  { id:"c4d1-fossilized-amber",    name:"Fossilized Amber",  url:"sticks/c4d1-fossilized-amber.png" },
  { id:"c4d1-galaxy",              name:"Galaxy",            url:"sticks/c4d1-galaxy.png" },
  { id:"c4d1-gears-of-time",       name:"Gears of Time",     url:"sticks/c4d1-gears-of-time.png" },
  { id:"c4d1-glossy-black",        name:"Glossy Black",      url:"sticks/c4d1-glossy-black.png" },
  { id:"c4d1-glossy-black-opal",   name:"Glossy Black Opal", url:"sticks/c4d1-glossy-black-opal.png" },
  { id:"c4d1-gold",                name:"Gold",              url:"sticks/c4d1-gold.png" },
  { id:"c4d1-golden-hammered-copper", name:"Golden Hammered Copper", url:"sticks/c4d1-golden-hammered-copper.png" },
  { id:"c4d1-idk",                 name:"Gray",              url:"sticks/c4d1-idk.png" },
  { id:"c4d1-hieroglyphics",       name:"Hieroglyphics",     url:"sticks/c4d1-hieroglyphics.png" },
  { id:"c4d1-hypnotized-green",    name:"Hypnotized Green",  url:"sticks/c4d1-hypnotized-green.png" },
  { id:"c4d1-jade",                name:"Jade",              url:"sticks/c4d1-jade.png" },
  { id:"c4d1-knurled-titanium",    name:"Knurled Titanium",  url:"sticks/c4d1-knurled-titanium.png" },
  { id:"c4d1-light-blue",          name:"Light Blue",        url:"sticks/c4d1-light-blue.png" },
  { id:"c4d1-mechanical-chrome",   name:"Mechanical Chrome", url:"sticks/c4d1-mechanical-chrome.png" },
  { id:"c4d1-metallic-silver",     name:"Metallic Silver",   url:"sticks/c4d1-metallic-silver.png" },
  { id:"c4d1-molten-lava",         name:"Molten Lava",       url:"sticks/c4d1-molten-lava.png" },
  { id:"c4d1-silver",              name:"Silver",            url:"sticks/c4d1-silver.png" },
  { id:"c4d1-stained-glass",       name:"Stained Glass",     url:"sticks/c4d1-stained-glass.png" },
  { id:"c4d1-sterling-iris",       name:"Sterling Iris",     url:"sticks/c4d1-sterling-iris.png" },
  { id:"c4d1-terraflow",           name:"Terraflow",         url:"sticks/c4d1-terraflow.png" },
  { id:"c4d1-wood",                name:"Wood",              url:"sticks/c4d1-wood.png" },
  { id:"c4d1-wood-grain-metallic", name:"Wood Grain Metal",  url:"sticks/c4d1-wood-grain-metallic.png" },
  { id:"c4d1-wooden-opal",         name:"Wooden Opal",       url:"sticks/c4d1-wooden-opal.png" },
  { id:"c4d1-yellow-zig-zag",      name:"Yellow Zig-Zag",    url:"sticks/c4d1-yellow-zig-zag.png" },
];

export const PS_STICKS: StickEntry[] = [
  { id:"c4d-aluminum",            name:"Aluminum",         url:"sticks/c4d-aluminum.png" },
  { id:"c4d-antique",             name:"Antique",          url:"sticks/c4d-antique.png" },
  { id:"c4d-apoxy",               name:"Apoxy",            url:"sticks/c4d-apoxy.png" },
  { id:"c4d-basic-black",         name:"Basic Black",      url:"sticks/c4d-basic-black.png" },
  { id:"c4d-black-swirl",         name:"Black Swirl",      url:"sticks/c4d-black-swirl.png" },
  { id:"c4d-carbon-fiber",        name:"Carbon Fiber",     url:"sticks/c4d-carbon-fiber.png" },
  { id:"c4d-chainlink",           name:"Chainlink",        url:"sticks/c4d-chainlink.png" },
  { id:"c4d-chrome",              name:"Chrome",           url:"sticks/c4d-chrome.png" },
  { id:"c4d-concrete",            name:"Concrete",         url:"sticks/c4d-concrete.png" },
  { id:"c4d-copper",              name:"Copper",           url:"sticks/c4d-copper.png" },
  { id:"c4d-cosmic-swirl",        name:"Cosmic Swirl",     url:"sticks/c4d-cosmic-swirl.png" },
  { id:"c4d-gilded-onyx",         name:"Gilded Onyx",      url:"sticks/c4d-gilded-onyx.png" },
  { id:"c4d-glossy-black",        name:"Glossy Black",     url:"sticks/c4d-glossy-black.png" },
  { id:"c4d-gold",                name:"Gold",             url:"sticks/c4d-gold.png" },
  { id:"c4d-gray-foam",           name:"Gray Foam",        url:"sticks/c4d-gray-foam.png" },
  { id:"c4d-gunmetal",            name:"Gunmetal",         url:"sticks/c4d-gunmetal.png" },
  { id:"c4d-h-713",               name:"H-713",            url:"sticks/c4d-h-713.png" },
  { id:"c4d-iron-sun",            name:"Iron Sun",         url:"sticks/c4d-iron-sun.png" },
  { id:"c4d-marble",              name:"Marble",           url:"sticks/c4d-marble.png" },
  { id:"c4d-metallic-weave",      name:"Metallic Weave",   url:"sticks/c4d-metallic-weave.png" },
  { id:"c4d-molten-magma",        name:"Molten Magma",     url:"sticks/c4d-molten-magma.png" },
  { id:"c4d-mosaic-glass",        name:"Mosaic Glass",     url:"sticks/c4d-mosaic-glass.png" },
  { id:"c4d-ocean-spray",         name:"Ocean Spray",      url:"sticks/c4d-ocean-spray.png" },
  { id:"c4d-opal",                name:"Opal",             url:"sticks/c4d-opal.png" },
  { id:"c4d-platinum",            name:"Platinum",         url:"sticks/c4d-platinum.png" },
  { id:"c4d-prism-mosaic",        name:"Prism Mosaic",     url:"sticks/c4d-prism-mosaic.png" },
  { id:"c4d-rainbow-quartz",      name:"Rainbow Quartz",   url:"sticks/c4d-rainbow-quartz.png" },
  { id:"c4d-rust",                name:"Rust",             url:"sticks/c4d-rust.png" },
  { id:"c4d-seafoam",             name:"Seafoam",          url:"sticks/c4d-seafoam.png" },
  { id:"c4d-stone",               name:"Stone",            url:"sticks/c4d-stone.png" },
  { id:"c4d-tactical-khaki",      name:"Tactical Khaki",   url:"sticks/c4d-tactical-khaki.png" },
  { id:"c4d-wood-grain-metallic", name:"Wood Grain Metal", url:"sticks/c4d-wood-grain-metallic.png" },
];

/** Controller Body library — separate list per controller type, since each
 *  type has a different body shape (no tabs to switch types; this section
 *  is strictly for the currently-selected controller's own body skins). */
const CONTROLLER_BODY_LIBRARY: Record<ControllerType, LibraryEntry[]> = {
  "c4d1":      [{ id:"c4d1-default",      name:"Default", url:"skins/c4d1-base.png" }],
  "c4d1-edge": [{ id:"c4d1-edge-default", name:"Default", url:"skins/c4d1-edge-base.png" }],
  "c4d4":      [{ id:"c4d4-default",      name:"Default", url:"skins/c4d4-base.png" }],
  "c4d5":      [{ id:"c4d5-default",      name:"Default", url:"skins/c4d5-base.png" }],
  "c4d5-edge": [{ id:"c4d5-edge-default", name:"Default", url:"skins/c4d5-edge-base.png" }],
};

/** Returns true if the skin value is an animated WebM (base64 data URL or blob URL). */
function isVideoSkin(value: string | null): boolean {
  if (!value) return false;
  return value.startsWith("data:video/") || value.startsWith("blob:");
}

/** Same-style library picker modal as the Bezel Library in ImageEditor.
 *  Shows both stick libraries via tabs, defaulting to whichever matches the
 *  active controller type — but either library can be picked from regardless
 *  of controller type, since a stick image has no functional tie to it. */
export function StickLibraryPicker({
  defaultTab, current, onSelect, onClose, allowCustomUploads = true,
}: {
  defaultTab: "c4d1" | "ps";
  current: string | null;
  onSelect: (url: string) => void;
  onClose: () => void;
  /** Customer-facing editor passes false — customers pick from the existing
   *  library only, no "＋ Add to Library" upload affordance and no removing
   *  entries the shop already curated. Defaults to true so the internal
   *  Studio tool's own usage is unaffected. */
  allowCustomUploads?: boolean;
}) {
  const [tab, setTab] = useState<"c4d1" | "ps">(defaultTab);
  const staticEntries = tab === "c4d1" ? C4D1_STICKS : PS_STICKS;
  const section = tab === "c4d1" ? "stick-c4d1" : "stick-ps";

  // Custom (user-added) sticks — real files under userData in Electron, so
  // they survive rebuilds the same way custom controller-body library
  // entries already do. Reloads whenever the tab switches, since each tab
  // is its own library section.
  const [customSticks, setCustomSticks] = useState<LibraryEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadCustomLibrary(section).then(loaded => { if (!cancelled) setCustomSticks(loaded); });
    return () => { cancelled = true; };
  }, [section]);
  const addStickToLibrary = useAddToLibrary(section, entry => setCustomSticks(prev => [...prev, entry]));
  async function removeCustomStick(id: string) {
    await removeFromCustomLibrary(section, id);
    setCustomSticks(prev => prev.filter(e => e.id !== id));
  }
  const entries = [...staticEntries, ...customSticks];

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:999, display:"flex", alignItems:"center", justifyContent:"center",
        background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"rgba(10,10,14,0.96)", border:"1px solid rgba(255,255,255,0.12)",
        borderRadius:18, padding:"22px 24px",
        boxShadow:"0 24px 64px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)",
        width:640, maxWidth:"92vw", display:"flex", flexDirection:"column", gap:16,
      }}>
        {/* Header — tabs to switch library, close button */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setTab("c4d1")}
              style={{
                background: tab === "c4d1" ? "rgba(228,7,7,0.18)" : "rgba(255,255,255,0.05)",
                border:`1px solid ${tab === "c4d1" ? "#e40707" : "rgba(255,255,255,0.12)"}`,
                borderRadius:8, padding:"6px 14px", cursor:"pointer",
                fontSize:12, fontWeight:700, letterSpacing:"0.04em", color: tab === "c4d1" ? "#fff" : "#999",
                transition:"border-color 0.15s, background 0.15s, color 0.15s",
                display:"flex", alignItems:"center", gap:6,
              }}>
              C4D.1
              <span style={{
                fontSize:10, fontWeight:700, color: tab === "c4d1" ? "#fff" : "#777",
                background: tab === "c4d1" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                borderRadius:999, padding:"1px 6px", lineHeight:1.4,
              }}>{C4D1_STICKS.length}</span>
            </button>
            <button onClick={() => setTab("ps")}
              style={{
                background: tab === "ps" ? "rgba(228,7,7,0.18)" : "rgba(255,255,255,0.05)",
                border:`1px solid ${tab === "ps" ? "#e40707" : "rgba(255,255,255,0.12)"}`,
                borderRadius:8, padding:"6px 14px", cursor:"pointer",
                fontSize:12, fontWeight:700, letterSpacing:"0.04em", color: tab === "ps" ? "#fff" : "#999",
                transition:"border-color 0.15s, background 0.15s, color 0.15s",
                display:"flex", alignItems:"center", gap:6,
              }}>
              C4D.4/5
              <span style={{
                fontSize:10, fontWeight:700, color: tab === "ps" ? "#fff" : "#777",
                background: tab === "ps" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                borderRadius:999, padding:"1px 6px", lineHeight:1.4,
              }}>{PS_STICKS.length}</span>
            </button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {allowCustomUploads && (
              <button onClick={addStickToLibrary.openPicker}
                style={{ background:"none", border:"1px solid rgba(228,7,7,0.5)", color:"#e40707",
                  borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                ＋ Add to Library
              </button>
            )}
            <button onClick={onClose}
              style={{ background:"none", border:"none", color:"#888", cursor:"pointer", fontSize:22, lineHeight:1 }}>×</button>
          </div>
        </div>
        {allowCustomUploads && (
          <input ref={addStickToLibrary.inputRef} type="file" accept="image/*" className="hidden"
            onChange={addStickToLibrary.handleFile} />
        )}

        {/* Rename prompt — shown after picking a file, before it's actually saved */}
        {allowCustomUploads && addStickToLibrary.pendingDataUrl && (
          <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(228,7,7,0.4)",
            borderRadius:10, padding:10, display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <img src={addStickToLibrary.pendingDataUrl} alt="New stick"
                style={{ width:44, height:44, objectFit:"contain", flexShrink:0 }} />
              <input autoFocus value={addStickToLibrary.nameDraft}
                onChange={e => addStickToLibrary.setNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStickToLibrary.confirmAdd(); }}
                placeholder="Name this stick"
                style={{ flex:1, background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.15)",
                  borderRadius:6, padding:"6px 8px", fontSize:12, color:"#fff", outline:"none" }} />
            </div>
            {addStickToLibrary.error && (
              <span style={{ fontSize:10, color:"#f87171" }}>{addStickToLibrary.error}</span>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={addStickToLibrary.confirmAdd} disabled={addStickToLibrary.saving}
                style={{ flex:1, background:"#e40707", border:"none", color:"#fff", borderRadius:6,
                  padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer",
                  opacity: addStickToLibrary.saving ? 0.6 : 1 }}>
                {addStickToLibrary.saving ? "Saving…" : "Add"}
              </button>
              <button onClick={addStickToLibrary.cancel}
                style={{ background:"none", border:"1px solid rgba(255,255,255,0.2)", color:"#aaa",
                  borderRadius:6, padding:"7px 14px", fontSize:12, cursor:"pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, maxHeight:520, overflowY:"auto", paddingRight:4 }}>
          {entries.map(entry => (
            <div key={entry.id} style={{ position:"relative" }}>
              <button onClick={() => { onSelect(entry.url); onClose(); }}
                style={{
                  width:"100%",
                  background: current === entry.url ? "rgba(228,7,7,0.18)" : "rgba(255,255,255,0.05)",
                  border:`2px solid ${current === entry.url ? "#e40707" : "rgba(255,255,255,0.10)"}`,
                  borderRadius:10, padding:"10px 6px", cursor:"pointer",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:8,
                  transition:"border-color 0.15s, background 0.15s",
                }}>
                <img src={entry.url} alt={entry.name}
                  style={{ width:84, height:84, objectFit:"contain" }} />
                <span style={{ fontSize:10, color:"#aaa", textAlign:"center", lineHeight:1.3 }}>{entry.name}</span>
              </button>
              {allowCustomUploads && entry.id.startsWith("custom-") && (
                <button onClick={(e) => { e.stopPropagation(); removeCustomStick(entry.id); }}
                  title="Remove from library"
                  style={{
                    position:"absolute", top:4, right:4, width:18, height:18, lineHeight:"16px",
                    borderRadius:"50%", background:"rgba(0,0,0,0.75)", border:"1px solid rgba(255,255,255,0.25)",
                    color:"#ccc", fontSize:11, cursor:"pointer", padding:0,
                  }}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Simple upload slot for stick skins — includes a ＋ Library button. */
export function UploadSlot({ label, value, onUpload, onClear, hint, onOpenLibrary, variant = "internal" }: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isTemplate = variant === "internal" && value && !value.startsWith("data:");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") onUpload(result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-none">{label}</label>
        {onOpenLibrary && (
          variant === "customer" ? (
            <button onClick={onOpenLibrary}
              className="flex-none flex items-center gap-1 text-[10px] font-semibold text-foreground/80 bg-white/5 border border-white/10 hover:bg-primary/15 hover:border-primary/40 hover:text-primary px-2 py-1 rounded-full transition-all whitespace-nowrap">
              <LayoutGrid size={11} /> Library
            </button>
          ) : (
            <button onClick={onOpenLibrary}
              className="flex-none flex items-center gap-0.5 text-[10px] text-primary border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded transition-all font-medium whitespace-nowrap">
              ＋ Library
            </button>
          )
        )}
      </div>
      {value ? (
        <div className="relative rounded-lg border border-border group" style={{
          backgroundImage: "url(editor-checker-tile.png)",
          backgroundSize: "136px 54px",
          backgroundRepeat: "repeat",
          backgroundColor: "#1a1a22",
        }}>
          <div className="w-full h-28 p-3">
            <img src={value} alt={label} className="w-full h-full object-contain" />
          </div>
          {isTemplate && (
            <div className="absolute top-1.5 left-1.5 text-[9px] bg-primary/80 text-white px-1.5 py-0.5 rounded font-medium">
              Template
            </div>
          )}
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onClear}
              className="p-1 rounded-full bg-black/60 text-white hover:bg-destructive transition-colors">
              <X size={11} />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()}
          className="w-full h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground">
          <Upload size={18} />
          <span className="text-xs">Upload PNG / WebP</span>
          {hint && <span className="text-[10px] opacity-60">{hint}</span>}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/png,image/webp,image/jpeg,image/gif"
        className="hidden" onChange={handleFile} />
    </div>
  );
}

/** Controller Body slot — supports PNG and WebM, with a popover for video settings. */
function BodySlot({ config, onChange, onClearSlot }: { config: ControllerConfig; onChange: (u: Partial<ControllerConfig>) => void; onClearSlot: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const isVideo = isVideoSkin(config.controllerSkin);
  const isTemplate = config.controllerSkin && !config.controllerSkin.startsWith("data:");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") onChange({ controllerSkin: result });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-none">Controller Body</label>
        <button onClick={() => setShowLibrary(true)}
          className="flex-none flex items-center gap-0.5 text-[10px] text-primary border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded transition-all font-medium whitespace-nowrap">
          ＋ Library
        </button>
      </div>

      {showLibrary && (
        <LibraryPicker
          title="Controller Body Library"
          section={`body-${config.controllerType}`}
          staticEntries={CONTROLLER_BODY_LIBRARY[config.controllerType] ?? []}
          current={config.controllerSkin}
          onSelect={(url, entry) => onChange({
            controllerSkin: url,
            // Carries a baked-with-bezels/home-button entry's placement,
            // material, and protected-zone data along so the customer editor
            // can offer material-swapping and logo-avoidance on it later —
            // see LibraryEntry's bezelSlots/baseSkinNoBezels/homeButtonZone.
            ...(entry.bezelSlots ? { bezelSlots: entry.bezelSlots } : {}),
            ...(entry.baseSkinNoBezels ? { baseSkinNoBezels: entry.baseSkinNoBezels } : {}),
            ...(entry.homeButtonZone ? { homeButtonZone: entry.homeButtonZone } : {}),
          })}
          onClose={() => setShowLibrary(false)}
          allowVideo
        />
      )}
      {config.controllerSkin ? (
        <Popover>
          <div className="relative rounded-lg border border-border group" style={{
            backgroundImage: "url(editor-checker-tile.png)",
            backgroundSize: "136px 54px",
            backgroundRepeat: "repeat",
            backgroundColor: "#1a1a22",
          }}>
            <div className="w-full h-28 p-3">
              {isVideo ? (
                <video src={config.controllerSkin} autoPlay loop muted playsInline
                  className="w-full h-full object-contain" />
              ) : (
                <img src={config.controllerSkin} alt="Controller Body" className="w-full h-full object-contain" />
              )}
            </div>
            {isVideo && (
              <div className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] bg-violet-600/90 text-white px-1.5 py-0.5 rounded font-medium">
                <Film size={9} /> WebM
              </div>
            )}
            {isTemplate && !isVideo && (
              <div className="absolute top-1.5 left-1.5 text-[9px] bg-primary/80 text-white px-1.5 py-0.5 rounded font-medium">
                Template
              </div>
            )}
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isVideo && (
                <PopoverTrigger asChild>
                  <button className="p-1 rounded-full bg-black/60 text-violet-300 hover:bg-violet-600 transition-colors" title="Video options">
                    <Settings2 size={11} />
                  </button>
                </PopoverTrigger>
              )}
              <button onClick={onClearSlot}
                className="p-1 rounded-full bg-black/60 text-white hover:bg-destructive transition-colors" title="Reset to default skin">
                <X size={11} />
              </button>
            </div>
          </div>

          <PopoverContent side="right" sideOffset={8} align="start" className="w-56 p-3 space-y-3">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Film size={10} className="text-violet-400" /> WebM Options
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Fit</label>
              <div className="grid grid-cols-2 gap-1">
                {(["contain", "cover"] as const).map((mode) => {
                  const active = (config.controllerSkinVideoFit ?? "contain") === mode;
                  return (
                    <button key={mode} onClick={() => onChange({ controllerSkinVideoFit: mode })}
                      className={`flex flex-col items-center py-1.5 rounded text-[10px] border transition-all ${
                        active ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                               : "bg-muted/20 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}>
                      <span className="font-semibold capitalize">{mode}</span>
                      <span className="opacity-60 mt-0.5">{mode === "contain" ? "Letterbox" : "Crop sides"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] text-muted-foreground">Contrast</label>
                <span className="text-[10px] font-mono text-muted-foreground">{(config.controllerSkinContrast ?? 1).toFixed(2)}×</span>
              </div>
              <input type="range" min="0.5" max="2" step="0.01" value={config.controllerSkinContrast ?? 1}
                onChange={(e) => onChange({ controllerSkinContrast: parseFloat(e.target.value) })}
                className="w-full h-1 accent-violet-500" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] text-muted-foreground">Saturation</label>
                <span className="text-[10px] font-mono text-muted-foreground">{(config.controllerSkinSaturate ?? 1).toFixed(2)}×</span>
              </div>
              <input type="range" min="0.5" max="2" step="0.01" value={config.controllerSkinSaturate ?? 1}
                onChange={(e) => onChange({ controllerSkinSaturate: parseFloat(e.target.value) })}
                className="w-full h-1 accent-violet-500" />
            </div>
            <p className="text-[9px] text-muted-foreground/50 leading-snug border-t border-border pt-2">
              Washed out? Try Contrast 1.15 + Saturation 1.10. Permanent fix: re-encode with{" "}
              <code className="bg-muted/40 px-0.5 rounded">-color_range 2</code> in FFmpeg.
            </p>
          </PopoverContent>
        </Popover>
      ) : (
        <button onClick={() => inputRef.current?.click()}
          className="w-full h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground">
          <Upload size={18} />
          <span className="text-xs">Upload PNG / WebP / WebM</span>
          <span className="text-[10px] opacity-60">Full controller background</span>
        </button>
      )}

      <input ref={inputRef} type="file"
        accept="image/png,image/webp,image/jpeg,image/gif,video/webm"
        className="hidden" onChange={handleFile} />
    </div>
  );
}

export { isVideoSkin };

export function SkinPanel({ config, onChange, stickSizePx, bodySizeLabel, onClearSlot }: Props) {
  const [showLeftLib,  setShowLeftLib]  = useState(false);
  const [showRightLib, setShowRightLib] = useState(false);
  const defaultTab: "c4d1" | "ps" =
    (config.controllerType === "c4d1" || config.controllerType === "c4d1-edge") ? "c4d1" : "ps";

  return (
    <div className="flex flex-col gap-5 p-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <ImageIcon size={16} className="text-primary" />
        <span className="text-sm font-semibold">Skins</span>
      </div>

      <BodySlot config={config} onChange={onChange} onClearSlot={() => onClearSlot("controllerSkin")} />

      <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 border border-primary/20 px-2 py-1.5">
        <span className="text-[10px] font-semibold text-primary">Body PNG size</span>
        <span className="text-xs font-mono font-bold">{bodySizeLabel}</span>
      </div>

      <UploadSlot
        label="Left Thumbstick"
        value={config.leftStickSkin}
        hint="Square PNG, transparent bg"
        onUpload={(url) => onChange({ leftStickSkin: url })}
        onClear={() => onClearSlot("leftStickSkin")}
        onOpenLibrary={() => setShowLeftLib(true)}
      />

      <UploadSlot
        label="Right Thumbstick"
        value={config.rightStickSkin}
        hint="Square PNG, transparent bg"
        onUpload={(url) => onChange({ rightStickSkin: url })}
        onClear={() => onClearSlot("rightStickSkin")}
        onOpenLibrary={() => setShowRightLib(true)}
      />

      <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 border border-primary/20 px-2 py-1.5">
        <span className="text-[10px] font-semibold text-primary">Stick PNG size</span>
        <span className="text-xs font-mono font-bold">{stickSizePx} × {stickSizePx} px</span>
      </div>

      <div className="rounded-lg bg-muted/30 border border-border/50 p-2.5 text-[10px] text-muted-foreground/70 leading-snug">
        <p className="font-medium text-foreground/50 mb-1">Skin tips</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>PNG with transparency for static skins</li>
          <li>VP9 WebM (yuva420p) for animated body skins</li>
          <li>Sticks must be <b className="text-foreground/50">square</b> — use size above</li>
          <li>All skins embed in the exported HTML</li>
        </ul>
      </div>

      {/* Left Thumbstick Library Picker */}
      {showLeftLib && (
        <StickLibraryPicker
          defaultTab={defaultTab}
          current={config.leftStickSkin}
          onSelect={(url) => onChange({ leftStickSkin: url })}
          onClose={() => setShowLeftLib(false)}
        />
      )}

      {/* Right Thumbstick Library Picker */}
      {showRightLib && (
        <StickLibraryPicker
          defaultTab={defaultTab}
          current={config.rightStickSkin}
          onSelect={(url) => onChange({ rightStickSkin: url })}
          onClose={() => setShowRightLib(false)}
        />
      )}
    </div>
  );
}
