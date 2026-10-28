import React, { useState, useEffect } from "react";
import { ControllerPreview } from "../components/ControllerPreview";
import { SkinPanel } from "../components/SkinPanel";
import { ConfigPanel } from "../components/ConfigPanel";
import { MkbView, MkbPreset, loadMkbPresets, saveMkbPresets, BASE_KEYS, DEFAULT_MOUSE_MASKS, STYLE_CODES } from "../components/MkbView";
import { ImageEditor, MkbSlot } from "../components/ImageEditor";
import { ControllerConfig, DEFAULT_CONFIG, LayoutOverrides, DEFAULT_OVERRIDES, migrateLegacyConfig } from "../types/config";
import { LAYOUTS, CONTROLLER_TYPES } from "../lib/layouts";
import { Move, Play, Save, FolderOpen, Trash2, Upload, X, ImageIcon, Loader2, Download, Film, Settings2, Tag, Check } from "lucide-react";
import { useGamepad } from "../hooks/useGamepad";
import { useThrottledColor } from "../hooks/useThrottledColor";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { LibraryPicker, LibraryEntry, loadPresets, savePresets } from "../components/LibraryPicker";

// Full snapshot of a controller preset — both the layout overrides (button/
// stick position tweaks) AND the full appearance config (skins, colors, body
// effects, RGB body, bezels, home button, logo — everything else). Presets
// used to only carry `overrides`, so loading one silently dropped every other
// setting; `config` here is what fixes that.
interface CtrlPreset { name: string; config: ControllerConfig; overrides: LayoutOverrides; savedAt: number; }
// Legacy localStorage key (kept for one-time migration) vs. the disk-file
// "kind" name — see loadPresets/savePresets in LibraryPicker.tsx. Presets are
// written as real files under the app's userData folder in Electron, bounded
// only by actual disk space, not the ~5-10MB localStorage quota.
function ctrlPresetKey(t: string) { return `css-presets-${t}`; }
function ctrlPresetKind(t: string) { return `ctrl-${t}`; }
function loadCtrlPresets(t: string): Promise<CtrlPreset[]> { return loadPresets<CtrlPreset>(ctrlPresetKind(t), ctrlPresetKey(t)); }
async function saveCtrlPresets(t: string, p: CtrlPreset[]): Promise<void> {
  const ok = await savePresets(ctrlPresetKind(t), ctrlPresetKey(t), p);
  if (!ok) window.alert("Couldn't save preset — you're out of storage space. Try deleting an old preset (especially ones with video skins) and saving again.");
}

const CONFIG_KEY = "css-config";
// Old controller type ids / default asset paths, from before the
// trademark-name cleanup (xbox-one/ps4/ps5 -> c4d1/c4d4/c4d5). A session
// saved before that rename would otherwise load back with a controllerType
// that no longer exists in LAYOUTS, breaking anywhere that indexes it
// without a fallback (e.g. exportHtml.ts).
const LEGACY_CONTROLLER_TYPE_MAP: Record<string, ControllerConfig["controllerType"]> = {
  "xbox-one": "c4d1", "ps4": "c4d4", "ps5": "c4d5",
};
const LEGACY_ASSET_PATH_MAP: Record<string, string> = {
  "skins/xbox-one-base.png": "skins/c4d1-base.png",
  "skins/ps4-base.png": "skins/c4d4-base.png",
  "skins/ps5-base.png": "skins/c4d5-base.png",
  "sticks/xbox-left.png": "sticks/c4d1-left.png",
  "sticks/xbox-right.png": "sticks/c4d1-right.png",
  "sticks/ps4-left.png": "sticks/c4d4-left.png",
  "sticks/ps4-right.png": "sticks/c4d4-right.png",
  "sticks/ps5-left.png": "sticks/c4d5-left.png",
  "sticks/ps5-right.png": "sticks/c4d5-right.png",
};

function loadSavedConfig(): ControllerConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    // Remove legacy overlay field that was stored during development
    delete parsed.controllerSkinLogoOverlay;
    if (parsed.controllerType in LEGACY_CONTROLLER_TYPE_MAP) {
      parsed.controllerType = LEGACY_CONTROLLER_TYPE_MAP[parsed.controllerType];
    }
    for (const slot of ["controllerSkin", "leftStickSkin", "rightStickSkin"] as const) {
      if (parsed[slot] in LEGACY_ASSET_PATH_MAP) parsed[slot] = LEGACY_ASSET_PATH_MAP[parsed[slot]];
    }
    migrateLegacyConfig(parsed);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch { return DEFAULT_CONFIG; }
}
function saveConfig(c: ControllerConfig) {
  try {
    // Blob URLs are session-scoped and can be huge — don't persist them
    const toSave = { ...c };
    if (toSave.controllerSkin?.startsWith("blob:")) delete toSave.controllerSkin;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(toSave));
  } catch { /* quota exceeded — ignore, config just won't persist this session */ }
}

interface MkbSettings {
  kbSkinUrl: string; kbButtonsUrl: string; mouseSkinUrl: string;
  kbSkinVideoFit: "contain" | "cover";
  kbSkinContrast: number; kbSkinSaturate: number;
  mouseSkinVideoFit: "contain" | "cover";
  mouseSkinContrast: number; mouseSkinSaturate: number;
  mkbColor: string; mkbRgbStyle: 1|2|3; mkbRainbow: boolean; mouseColor: string;
  keyPressColor: string;
  keyPressOpacity: number;
  keyPressGlow: number;
  kbOpacity: number; kbGlow: number;
  mouseOpacity: number; mouseGlow: number; mouseInnerFade: boolean; mouseOuterFade: boolean; mouseSnapBack: boolean;
  mouseRgbEnabled: boolean; mouseRgbMode: "wave"|"breathing"; mouseRgbSpeed: number;
  mouseRgbIntensity: number; mouseRgbColor: string; mouseRgbRainbow: boolean;
  mkbShowShadow: boolean; mkbShadowIntensity: number; mkbShadowDistance: number; mkbShadowAngle: number;
  mkbWidth: number; mkbHeight: number;
  mkbOverlayName: string;
}
const DEFAULT_MKB_SETTINGS: MkbSettings = {
  kbSkinUrl: "mkb/keyboard-empty.png", kbButtonsUrl: "mkb/keyboard-buttons.png", mouseSkinUrl: "mkb/mouse.png",
  kbSkinVideoFit: "contain", kbSkinContrast: 1, kbSkinSaturate: 1,
  mouseSkinVideoFit: "contain", mouseSkinContrast: 1, mouseSkinSaturate: 1,
  mkbColor: "#ffffff", mkbRgbStyle: 1, mkbRainbow: false, mouseColor: "#ffffff",
  keyPressColor: "#ffffff",
  keyPressOpacity: 1,
  keyPressGlow: 8,
  kbOpacity: 0.85, kbGlow: 8,
  mouseOpacity: 1.0, mouseGlow: 6, mouseInnerFade: false, mouseOuterFade: false, mouseSnapBack: true,
  mouseRgbEnabled: false, mouseRgbMode: "wave", mouseRgbSpeed: 6,
  mouseRgbIntensity: 1, mouseRgbColor: "#e40707", mouseRgbRainbow: true,
  mkbShowShadow: false, mkbShadowIntensity: 0.8, mkbShadowDistance: 12, mkbShadowAngle: 180,
  mkbWidth: 1920, mkbHeight: 1080,
  mkbOverlayName: "My Keyboard",
};
const MKB_SETTINGS_KEY = "css-mkb-settings";
function loadMkbSettings(): MkbSettings {
  try {
    const raw = localStorage.getItem(MKB_SETTINGS_KEY);
    if (!raw) return DEFAULT_MKB_SETTINGS;
    const parsed = JSON.parse(raw);
    // Spread defaults first so any new fields added to DEFAULT_MKB_SETTINGS
    // are always present even if the saved JSON predates them.
    // Then override with saved values, but always reset built-in skin paths.
    return {
      ...DEFAULT_MKB_SETTINGS,
      ...parsed,
      kbSkinUrl: DEFAULT_MKB_SETTINGS.kbSkinUrl,
      kbButtonsUrl: DEFAULT_MKB_SETTINGS.kbButtonsUrl,
      mouseSkinUrl: DEFAULT_MKB_SETTINGS.mouseSkinUrl,
      // Explicit fallbacks for fields that may be missing in old saved data
      mkbShowShadow: parsed.mkbShowShadow ?? DEFAULT_MKB_SETTINGS.mkbShowShadow,
      mkbShadowIntensity: parsed.mkbShadowIntensity ?? DEFAULT_MKB_SETTINGS.mkbShadowIntensity,
      mkbShadowDistance: parsed.mkbShadowDistance ?? DEFAULT_MKB_SETTINGS.mkbShadowDistance,
      mkbShadowAngle: parsed.mkbShadowAngle ?? DEFAULT_MKB_SETTINGS.mkbShadowAngle,
      keyPressOpacity: parsed.keyPressOpacity ?? DEFAULT_MKB_SETTINGS.keyPressOpacity,
      keyPressGlow: parsed.keyPressGlow ?? DEFAULT_MKB_SETTINGS.keyPressGlow,
      mkbOverlayName: parsed.mkbOverlayName ?? DEFAULT_MKB_SETTINGS.mkbOverlayName,
      // One-time revert — a saved size sitting at 2560x1440 was never
      // deliberately chosen (there's no size picker in the UI), just
      // inherited from a since-reverted default. Anything else (an actual
      // custom size) is left alone.
      mkbWidth: (parsed.mkbWidth === 2560 && parsed.mkbHeight === 1440) ? DEFAULT_MKB_SETTINGS.mkbWidth : (parsed.mkbWidth ?? DEFAULT_MKB_SETTINGS.mkbWidth),
      mkbHeight: (parsed.mkbWidth === 2560 && parsed.mkbHeight === 1440) ? DEFAULT_MKB_SETTINGS.mkbHeight : (parsed.mkbHeight ?? DEFAULT_MKB_SETTINGS.mkbHeight),
    };
  } catch { return DEFAULT_MKB_SETTINGS; }
}
function saveMkbSettings(s: MkbSettings) {
  try {
    // Skin URLs are uploaded as base64 data URLs (can be several MB) and loadMkbSettings()
    // always resets them to the default paths on load anyway — so there's no point persisting
    // them, and doing so risks blowing the localStorage quota on every upload.
    const { kbSkinUrl, kbButtonsUrl, mouseSkinUrl, ...toSave } = s;
    localStorage.setItem(MKB_SETTINGS_KEY, JSON.stringify(toSave));
  } catch { /* quota exceeded — ignore, settings just won't persist this session */ }
}

export function Studio() {
  const [config, setConfig] = useState<ControllerConfig>(loadSavedConfig);
  // Ref always holds the latest config value — used in callbacks that may close over stale state
  const configRef = React.useRef(config);
  configRef.current = config;
  // Preset-derived state (overrides, mkbPresets, key/mouse overrides below)
  // starts at its default and is filled in asynchronously by the mount
  // effect further down — preset storage now lives on disk (via Electron
  // IPC), which can't be read synchronously the way localStorage could.
  const [overrides, setOverrides] = useState<LayoutOverrides>(DEFAULT_OVERRIDES);
  const [showButtonLabels, setShowButtonLabels] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [mkbMode, setMkbMode] = useState(false);
  const [editorMode, setEditorMode] = useState(false);
  const [mkbEditMode, setMkbEditMode] = useState(false);

  // Images exported from the Editor tab for controllers other than the
  // currently-active one; applied automatically when that controller is opened.
  const [pendingSkins, setPendingSkins] = useState<Partial<Record<string, Partial<Pick<ControllerConfig, "controllerSkin" | "leftStickSkin" | "rightStickSkin" | "homeButtonZone" | "bezelSlots" | "baseSkinNoBezels">>>>>({});

  // MKB skins
  const [mkbSettingsInit] = useState(loadMkbSettings);
  const [kbSkinUrl, setKbSkinUrl] = useState(mkbSettingsInit.kbSkinUrl);
  const [kbButtonsUrl, setKbButtonsUrl] = useState(mkbSettingsInit.kbButtonsUrl);
  const [mouseSkinUrl, setMouseSkinUrl] = useState(mkbSettingsInit.mouseSkinUrl);
  const [kbSkinVideoFit, setKbSkinVideoFit] = useState<"contain"|"cover">(mkbSettingsInit.kbSkinVideoFit ?? "contain");
  const [kbSkinContrast, setKbSkinContrast] = useState(mkbSettingsInit.kbSkinContrast ?? 1);
  const [kbSkinSaturate, setKbSkinSaturate] = useState(mkbSettingsInit.kbSkinSaturate ?? 1);
  const [mouseSkinVideoFit, setMouseSkinVideoFit] = useState<"contain"|"cover">(mkbSettingsInit.mouseSkinVideoFit ?? "contain");
  const [mouseSkinContrast, setMouseSkinContrast] = useState(mkbSettingsInit.mouseSkinContrast ?? 1);
  const [mouseSkinSaturate, setMouseSkinSaturate] = useState(mkbSettingsInit.mouseSkinSaturate ?? 1);

  // MKB appearance
  const [mkbColor, setMkbColor] = useState(mkbSettingsInit.mkbColor);
  const [keyPressColor, setKeyPressColor] = useState(mkbSettingsInit.keyPressColor);
  const [keyPressOpacity, setKeyPressOpacity] = useState(mkbSettingsInit.keyPressOpacity);
  const [keyPressGlow, setKeyPressGlow] = useState(mkbSettingsInit.keyPressGlow);
  const [mkbRgbStyle, setMkbRgbStyle] = useState<1|2|3>(mkbSettingsInit.mkbRgbStyle);
  const [mkbRainbow, setMkbRainbow] = useState(mkbSettingsInit.mkbRainbow);
  // Off is off, no matter what — the LED is the master switch for whether
  // the keyboard RGB shows at all, so this has to start false until a style
  // key (Digit6/7/8) is actually pressed to turn an LED on, not default to
  // showing RGB backlight while every LED still reads as unlit.
  const [kbRgbVisible, setKbRgbVisible] = useState(false);
  const [mouseColor, setMouseColor] = useState(mkbSettingsInit.mouseColor);
  // Keyboard appearance
  const [kbOpacity, setKbOpacity] = useState(mkbSettingsInit.kbOpacity);
  const [kbGlow, setKbGlow] = useState(mkbSettingsInit.kbGlow);
  // Mouse appearance
  const [mouseOpacity, setMouseOpacity] = useState(mkbSettingsInit.mouseOpacity);
  const [mouseGlow, setMouseGlow] = useState(mkbSettingsInit.mouseGlow);
  const [mouseInnerFade, setMouseInnerFade] = useState(mkbSettingsInit.mouseInnerFade);
  const [mouseOuterFade, setMouseOuterFade] = useState(mkbSettingsInit.mouseOuterFade);
  const [mouseSnapBack, setMouseSnapBack] = useState(mkbSettingsInit.mouseSnapBack);
  const [mouseRgbEnabled, setMouseRgbEnabled] = useState(mkbSettingsInit.mouseRgbEnabled);
  const [mouseRgbMode, setMouseRgbMode] = useState<"wave"|"breathing">(mkbSettingsInit.mouseRgbMode);
  const [mouseRgbSpeed, setMouseRgbSpeed] = useState(mkbSettingsInit.mouseRgbSpeed);
  const [mouseRgbIntensity, setMouseRgbIntensity] = useState(mkbSettingsInit.mouseRgbIntensity);
  const [mouseRgbColor, setMouseRgbColor] = useState(mkbSettingsInit.mouseRgbColor);
  const [mouseRgbRainbow, setMouseRgbRainbow] = useState(mkbSettingsInit.mouseRgbRainbow);
  const [mkbShowShadow, setMkbShowShadow] = useState(mkbSettingsInit.mkbShowShadow);
  const [mkbShadowIntensity, setMkbShadowIntensity] = useState(mkbSettingsInit.mkbShadowIntensity);
  const [mkbShadowDistance, setMkbShadowDistance] = useState(mkbSettingsInit.mkbShadowDistance);
  const [mkbShadowAngle, setMkbShadowAngle] = useState(mkbSettingsInit.mkbShadowAngle);
  const [mkbWidth, setMkbWidth] = useState(mkbSettingsInit.mkbWidth);
  const [mkbHeight, setMkbHeight] = useState(mkbSettingsInit.mkbHeight);
  const [mkbOverlayName, setMkbOverlayName] = useState(mkbSettingsInit.mkbOverlayName);

  // Controller presets
  const [ctrlPresets, setCtrlPresets] = useState<CtrlPreset[]>([]);
  // MKB presets
  const [mkbPresets, setMkbPresets] = useState<MkbPreset[]>([]);
  // Shared preset UI
  const [showPresets, setShowPresets] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveInput, setSaveInput] = useState("");
  // Identifies the currently-active preset (by its unique savedAt timestamp)
  // so the dropdown can highlight which one is currently loaded. Separate
  // per mode since a controller preset and an MKB preset are never the same
  // list; null means "no preset currently active" (e.g. after manual edits
  // to a fresh/default state, or after switching to a type/mode with none loaded).
  const [activeCtrlPresetAt, setActiveCtrlPresetAt] = useState<number | null>(null);
  const [activeMkbPresetAt, setActiveMkbPresetAt] = useState<number | null>(null);

  // MKB key/mask overrides lifted up from MkbView so header save can access them
  const [keyOverrides, setKeyOverrides] = useState<Record<string,{cx:number;cy:number;w:number;h:number}>>({});
  const [mouseOverrides, setMouseOverrides] = useState<{id:string;cx:number;cy:number;w:number;h:number}[]>([]);
  // Refs so export always reads latest values regardless of closure staleness
  const keyOverridesRef = React.useRef<Record<string,{cx:number;cy:number;w:number;h:number}>>({});
  const mouseOverridesRef = React.useRef<{id:string;cx:number;cy:number;w:number;h:number}[]>([]);
  const getMasksRef = React.useRef<()=>{id:string;cx:number;cy:number;w:number;h:number}[]>(()=>[]);
  // Keep refs in sync
  React.useEffect(()=>{ mouseOverridesRef.current = mouseOverrides; },[mouseOverrides]);
  React.useEffect(()=>{ keyOverridesRef.current = keyOverrides; },[keyOverrides]);

  const gp = useGamepad();
  const baseLayout = LAYOUTS[config.controllerType] ?? LAYOUTS["c4d1"];
  const ltLabel = config.controllerType === "c4d1" ? "LT" : "L2";
  const rtLabel = config.controllerType === "c4d1" ? "RT" : "R2";
  const lStickBase = baseLayout.sticks[0];
  const lStickEff = { ...lStickBase, ...(overrides.sticks[0] ?? {}) };
  const stickSizePx = Math.round(config.width * lStickEff.size / 100);
  const bodyW = config.width;
  const bodyH = Math.round(config.width * baseLayout.skinHeight / baseLayout.skinWidth);
  const bodySizeLabel = `${bodyW} × ${bodyH} px`;

  useEffect(() => {
    // Debounced — saveConfig JSON.stringifies the whole config (which can carry
    // multi-MB base64 skin images/videos) and writes it to localStorage
    // synchronously. Rapid-fire updates (e.g. dragging inside a native color
    // picker, which fires onChange continuously) were re-running that heavy
    // write on every single tick, blocking the main thread and making the
    // picker visibly lag behind the cursor.
    const t = setTimeout(() => saveConfig(config), 400);
    return () => clearTimeout(t);
  }, [config]);

  useEffect(() => {
    saveMkbSettings({
      kbSkinUrl, kbButtonsUrl, mouseSkinUrl,
      kbSkinVideoFit, kbSkinContrast, kbSkinSaturate,
      mouseSkinVideoFit, mouseSkinContrast, mouseSkinSaturate,
      mkbColor, mkbRgbStyle, mkbRainbow, mouseColor,
      keyPressColor, keyPressOpacity, keyPressGlow,
      kbOpacity, kbGlow,
      mouseOpacity, mouseGlow, mouseInnerFade, mouseOuterFade, mouseSnapBack,
      mouseRgbEnabled, mouseRgbMode, mouseRgbSpeed, mouseRgbIntensity, mouseRgbColor, mouseRgbRainbow,
      mkbShowShadow, mkbShadowIntensity, mkbShadowDistance, mkbShadowAngle,
      mkbWidth, mkbHeight, mkbOverlayName,
    });
  }, [kbSkinUrl, kbButtonsUrl, mouseSkinUrl,
      kbSkinVideoFit, kbSkinContrast, kbSkinSaturate,
      mouseSkinVideoFit, mouseSkinContrast, mouseSkinSaturate,
      mkbColor, mkbRgbStyle, mkbRainbow, mouseColor,
      keyPressColor, keyPressOpacity, keyPressGlow,
      kbOpacity, kbGlow, mouseOpacity, mouseGlow, mouseInnerFade, mouseOuterFade, mouseSnapBack,
      mouseRgbEnabled, mouseRgbMode, mouseRgbSpeed, mouseRgbIntensity, mouseRgbColor, mouseRgbRainbow,
      mkbShowShadow, mkbShadowIntensity, mkbShadowDistance, mkbShadowAngle,
      mkbWidth, mkbHeight, mkbOverlayName]);

  // One-time restore on mount — resumes the most recently saved preset's
  // overrides/settings, same as the old synchronous localStorage read used
  // to, just async now that preset storage lives on disk (Electron IPC).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initialType = configRef.current.controllerType;
      const [ctrlP, mkbP] = await Promise.all([loadCtrlPresets(initialType), loadMkbPresets()]);
      if (cancelled) return;
      setOverrides(ctrlP[0]?.overrides ?? DEFAULT_OVERRIDES);
      setMkbPresets(mkbP);
      setKeyOverrides(mkbP[0]?.keyOverrides ?? {});
      setMouseOverrides(mkbP[0]?.mouseOverrides ?? []);

      // One-time legacy-localStorage-to-disk migration, for every controller
      // type, not just the one active at launch. loadCtrlPresets() already
      // migrates a type's old localStorage presets to disk the first time
      // it's called for that type (see LibraryPicker.tsx's loadPresets) — but
      // until now that only ever happened for whichever type the user had
      // open, silently leaving every other type's old presets stranded.
      // Calling it once for every type here (result unused — this run is
      // purely to trigger that migration) guarantees nothing gets missed.
      CONTROLLER_TYPES.forEach(ct => { if (ct.id !== initialType) loadCtrlPresets(ct.id); });
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCtrlPresets(config.controllerType).then(presets => { if (!cancelled) setCtrlPresets(presets); });
    setShowPresets(false); setShowSaveInput(false);
    return () => { cancelled = true; };
  }, [config.controllerType]);

  useEffect(() => {
    setShowPresets(false); setShowSaveInput(false);
  }, [mkbMode]);

  function handleChange(u: Partial<ControllerConfig>) { setConfig(p => ({ ...p, ...u })); }
  function handleResetOverrides() { setOverrides(DEFAULT_OVERRIDES); setEditMode(false); }
  function switchController(ctId: string) {
    const l = LAYOUTS[ctId];
    const pending = pendingSkins[ctId];
    handleChange({
      controllerType: ctId,
      controllerSkin: pending?.controllerSkin ?? l.defaultSkinUrl,
      leftStickSkin: pending?.leftStickSkin ?? l.defaultLeftStickUrl,
      rightStickSkin: pending?.rightStickSkin ?? l.defaultRightStickUrl,
      // A layout's default skin has no home button placed on it — only a
      // pending custom bake carries protected-zone data.
      homeButtonZone: pending?.homeButtonZone ?? null,
      bezelSlots: pending?.bezelSlots ?? [],
      baseSkinNoBezels: pending?.baseSkinNoBezels ?? null,
    });
    if (pending) {
      setPendingSkins(prev => {
        const { [ctId]: _, ...rest } = prev;
        return rest;
      });
    }
    loadCtrlPresets(ctId).then(presets => setOverrides(presets[0]?.overrides ?? DEFAULT_OVERRIDES));
    setEditMode(false);
    setMkbMode(false);
  }

  // Called from the Editor tab's "Export to Skin Slot" — applies the edited
  // image to the chosen skin slot for the target controller, without leaving the editor.
  // If exporting to the currently-active controller, applies immediately via handleChange.
  // Otherwise stores it in pendingSkins so it's applied when that controller is next opened.
  function handleExportFromEditor(
    dataUrl: string, slot: "controllerSkin" | "leftStickSkin" | "rightStickSkin", controllerType: string,
    homeButtonZone: ControllerConfig["homeButtonZone"],
    bezelSlots: ControllerConfig["bezelSlots"], baseSkinNoBezels: ControllerConfig["baseSkinNoBezels"],
  ) {
    // Use configRef.current (not the closed-over `config`) so this always reads
    // the live controllerType even if called from an async callback or stale closure.
    const bezelExtras = slot === "controllerSkin" ? { homeButtonZone, bezelSlots, baseSkinNoBezels } : {};
    if (controllerType === configRef.current.controllerType) {
      handleChange({ [slot]: dataUrl, ...bezelExtras });
    } else {
      setPendingSkins(prev => ({
        ...prev,
        [controllerType]: {
          ...(prev[controllerType] ?? {}),
          [slot]: dataUrl,
          ...bezelExtras,
        },
      }));
    }
  }

  // Resets a skin slot back to the layout default — called from the editor's X button.
  function handleClearSlot(slot: "controllerSkin" | "leftStickSkin" | "rightStickSkin", controllerType: string) {
    const l = LAYOUTS[controllerType];
    if (!l) return;
    const defaults = {
      controllerSkin:   l.defaultSkinUrl,
      leftStickSkin:    l.defaultLeftStickUrl,
      rightStickSkin:   l.defaultRightStickUrl,
    };
    if (controllerType === configRef.current.controllerType) {
      // Resetting the controller body back to the layout default also clears
      // the protected zone and any bezel slot metadata — the default skin
      // has no home button or bezels on it.
      handleChange({ [slot]: defaults[slot], ...(slot === "controllerSkin" ? { homeButtonZone: null, bezelSlots: [], baseSkinNoBezels: null } : {}) });
    } else {
      setPendingSkins(prev => {
        const existing = { ...(prev[controllerType] ?? {}) };
        delete existing[slot];
        if (slot === "controllerSkin") { delete existing.homeButtonZone; delete existing.bezelSlots; delete existing.baseSkinNoBezels; }
        return Object.keys(existing).length > 0
          ? { ...prev, [controllerType]: existing }
          : (({ [controllerType]: _, ...rest }) => rest)(prev);
      });
    }
  }

  // Push an edited image/WebM from the editor into the MKB skin slots.
  function handleExportMkbSkin(dataUrl: string, slot: MkbSlot) {
    if (slot === "kbSkin")        setKbSkinUrl(dataUrl);
    else if (slot === "mouseSkin")      setMouseSkinUrl(dataUrl);
    else if (slot === "kbButtonsSkin")  setKbButtonsUrl(dataUrl);
  }

  // Reset an MKB slot back to its default template asset.
  function handleClearMkbSlot(slot: MkbSlot) {
    if (slot === "kbSkin")        setKbSkinUrl(DEFAULT_MKB_SETTINGS.kbSkinUrl);
    else if (slot === "mouseSkin")      setMouseSkinUrl(DEFAULT_MKB_SETTINGS.mouseSkinUrl);
    else if (slot === "kbButtonsSkin")  setKbButtonsUrl(DEFAULT_MKB_SETTINGS.kbButtonsUrl);
  }

  // Listen for video loop preference from ImageEditor
  useEffect(() => {
    const handler = (e: Event) => {
      const { loop } = (e as CustomEvent).detail;
      handleChange({ controllerSkinLoop: loop });
    };
    window.addEventListener("bezel-video-loop", handler);
    return () => window.removeEventListener("bezel-video-loop", handler);
  }, []);

  // Save — controller or MKB depending on current mode. No cap on preset
  // count — the only real ceiling is actual disk space (presets are written
  // as real files under the Electron app's userData folder), and
  // saveCtrlPresets/saveMkbPresets surface a message instead of failing
  // silently if that's ever somehow exhausted.
  async function handleSave() {
    const name = saveInput.trim();
    if (mkbMode) {
      const n = name || `MKB Preset ${mkbPresets.length + 1}`;
      const savedAt = Date.now();
      const updated = [{
        name: n, keyOverrides, mouseOverrides,
        kbSkinUrl, kbButtonsUrl, mouseSkinUrl,
        kbSkinVideoFit, kbSkinContrast, kbSkinSaturate,
        mouseSkinVideoFit, mouseSkinContrast, mouseSkinSaturate,
        mkbColor, mkbRgbStyle, mkbRainbow, mouseColor,
        keyPressColor, keyPressOpacity, keyPressGlow,
        kbOpacity, kbGlow, mouseOpacity, mouseGlow, mouseInnerFade, mouseOuterFade, mouseSnapBack,
        mouseRgbEnabled, mouseRgbMode, mouseRgbSpeed, mouseRgbIntensity, mouseRgbColor, mouseRgbRainbow,
        mkbShowShadow, mkbShadowIntensity, mkbShadowDistance, mkbShadowAngle,
        mkbWidth, mkbHeight,
        savedAt,
      }, ...mkbPresets];
      setMkbPresets(updated); setActiveMkbPresetAt(savedAt); await saveMkbPresets(updated);
    } else {
      const n = name || `Preset ${ctrlPresets.length + 1}`;
      const savedAt = Date.now();
      const updated = [{ name: n, config, overrides, savedAt }, ...ctrlPresets];
      setCtrlPresets(updated); setActiveCtrlPresetAt(savedAt); await saveCtrlPresets(config.controllerType, updated);
    }
    setSaveInput(""); setShowSaveInput(false); setShowPresets(true);
  }

  const presets = mkbMode ? mkbPresets : ctrlPresets;

  // MKB export state and function — lives in Studio so it has access to all state refs
  const [mkbExporting, setMkbExporting] = React.useState(false);

  const handleExportMkb = React.useCallback(async () => {
    setMkbExporting(true);
    try {
      const toB64 = async (url: string): Promise<string> => {
        if (!url) return "";
        try {
          // fetch() resolves relative URLs against the current document on
          // its own; manually prepending window.location.origin breaks under
          // Electron's file:// protocol (origin serializes as the literal
          // string "file://" with no path).
          const resolvedUrl = url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')
            ? url
            : url.startsWith('/') ? url.slice(1) : url;
          const res = await fetch(resolvedUrl);
          const blob = await res.blob();
          return new Promise(resolve => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.readAsDataURL(blob);
          });
        } catch { return ""; }
      };

      const [kbB64, keysB64, mouseB64, maskB64, mouseMaskB64, kbBlackB64] = await Promise.all([
        toB64(kbSkinUrl), toB64(kbButtonsUrl), toB64(mouseSkinUrl), toB64("mkb/keyboard-mask.png"), toB64("mkb/mouse-mask.png"), toB64("mkb/keyboard-black.png"),
      ]);

      // Build effective key positions (with overrides) — excludes the
      // style-select keys (Digit6/7/8), which drive the LED indicators only
      // and were never meant to get the normal per-key press-glow box (the
      // live preview already excludes them the same way; this export was
      // using the keys unfiltered, so pressing 6/7/8 drew a glowing box
      // right on top of the LED).
      const effectiveKeys = BASE_KEYS.filter(k => !STYLE_CODES.includes(k.code)).map(k => {
        const ov = keyOverridesRef.current[k.code];
        return { code: k.code, cx: ov?.cx ?? k.cx, cy: ov?.cy ?? k.cy, w: ov?.w ?? k.w, h: ov?.h ?? k.h };
      });

      // Build effective mouse masks (with overrides)
      const maskAspectRatios: Record<string,number> = {left:2.488,right:2.521,scroll:2.0,side_top:3.688,side_bot:2.109};
      const liveMasks = getMasksRef.current();
      const sourceMasks = liveMasks.length > 0 ? liveMasks : mouseOverridesRef.current;
      const effectiveMasks = DEFAULT_MOUSE_MASKS.map(m => {
        const ov = sourceMasks.find(o => o.id === m.id);
        const w = ov?.w ?? m.w;
        const h = ov?.h ?? (w * (maskAspectRatios[m.id] ?? 1));
        return { id: m.id, src: m.src, btnIndex: m.btnIndex, cx: ov?.cx ?? m.cx, cy: ov?.cy ?? m.cy, w, h };
      });

      // Fetch all mouse mask images
      const maskImages: Record<string, string> = {};
      await Promise.all(effectiveMasks.map(async m => {
        maskImages[m.id] = await toB64(m.src);
      }));

      const kbW = Math.round(mkbWidth * 0.66);
      const kbH = Math.round(kbW * 799 / 1344);
      // Derived from kbW using MkbView.tsx's exact fixed reference sizes
      // (800px keyboard, 294px mouse) instead of its own independent
      // mkbWidth*0.30 — that gave a kb:mouse ratio of 0.66:0.30 (2.2:1)
      // instead of the preview's real 800:294 (~2.72:1), which is what was
      // making the mouse render proportionally bigger next to the keyboard
      // here than it does in Studio's live preview.
      const mouseW = Math.round(kbW * 294 / 800);
      const mouseH = Math.round(mouseW * 392 / 294);
      const rc = parseInt(mkbColor.slice(1,3)||"ff",16);
      const gc = parseInt(mkbColor.slice(3,5)||"ff",16);
      const bcv = parseInt(mkbColor.slice(5,7)||"ff",16);
      const mrc = parseInt(mouseColor.slice(1,3)||"ff",16);
      const mgc = parseInt(mouseColor.slice(3,5)||"ff",16);
      const mbc = parseInt(mouseColor.slice(5,7)||"ff",16);
      const kpc = parseInt(keyPressColor.slice(1,3)||"ff",16);
      const kpg = parseInt(keyPressColor.slice(3,5)||"ff",16);
      const kpb = parseInt(keyPressColor.slice(5,7)||"ff",16);
      const mrgbc = parseInt(mouseRgbColor.slice(1,3)||"ff",16);
      const mrgbg = parseInt(mouseRgbColor.slice(3,5)||"ff",16);
      const mrgbb = parseInt(mouseRgbColor.slice(5,7)||"ff",16);

      const keysJson = JSON.stringify(effectiveKeys);
      const masksJson = JSON.stringify(effectiveMasks.map(m => ({...m, b64: maskImages[m.id]})));

      // Drop shadow — mirrors the filter formula applied to `.kb`/mouse wrap in the live MkbView preview
      const mkbShadowFilter = mkbShowShadow ? (() => {
        const rad = (mkbShadowAngle * Math.PI) / 180;
        const sx = Math.round(Math.sin(rad) * mkbShadowDistance);
        const sy = Math.round(Math.cos(rad) * mkbShadowDistance);
        const a = mkbShadowIntensity;
        return `drop-shadow(${sx}px ${sy}px 24px rgba(0,0,0,${a})) drop-shadow(${Math.round(sx*0.4)}px ${Math.round(sy*0.4)}px 8px rgba(0,0,0,${Math.min(a+0.1,1)}))`;
      })() : "none";

      // Contrast/saturate color correction — mirrors MkbView's per-skin CSS filter
      const kbSkinFilter = [kbSkinContrast !== 1 ? `contrast(${kbSkinContrast})` : "", kbSkinSaturate !== 1 ? `saturate(${kbSkinSaturate})` : ""].filter(Boolean).join(" ");
      const mouseSkinFilter = [mouseSkinContrast !== 1 ? `contrast(${mouseSkinContrast})` : "", mouseSkinSaturate !== 1 ? `saturate(${mouseSkinSaturate})` : ""].filter(Boolean).join(" ");

      // Video skins (WebM/MP4) come back from toB64() as `data:video/...` data URLs
      // (same detection rule as isVideoSkin() in MkbView.tsx/SkinPanel.tsx). Filters
      // are kept off the <video> element itself — applied to a wrapping div instead —
      // to avoid disabling hardware video decode in some Chromium builds (OBS's CEF
      // browser source included).
      const isVid = (b64: string) => b64.startsWith("data:video/");
      const kbIsVideo = isVid(kbB64);
      const keysIsVideo = isVid(keysB64);
      const mouseIsVideo = isVid(mouseB64);
      const kbSkinTag = kbB64
        ? `<div style="position:absolute;inset:0;width:100%;height:100%;z-index:2;${kbSkinFilter ? `filter:${kbSkinFilter}` : ""}">${
            kbIsVideo
              ? `<video src="${kbB64}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:${kbSkinVideoFit};background:transparent"></video>`
              : `<img src="${kbB64}" style="width:100%;height:100%;object-fit:cover">`
          }</div>`
        : "";
      const keysTag = keysB64
        ? (keysIsVideo
            ? `<video id="kbkeys" src="${keysB64}" autoplay loop muted playsinline style="z-index:3;object-fit:cover;background:transparent"></video>`
            : `<img id="kbkeys" src="${keysB64}" style="z-index:3">`)
        : "";
      const mouseSkinTag = mouseB64
        ? `<div style="position:absolute;inset:0;width:100%;height:100%;${mouseSkinFilter ? `filter:${mouseSkinFilter}` : ""}">${
            mouseIsVideo
              ? `<video src="${mouseB64}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:${mouseSkinVideoFit};background:transparent"></video>`
              : `<img class="mskin" src="${mouseB64}" style="width:100%;height:100%;object-fit:contain;display:block">`
          }</div>`
        : "";

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none}
html,body{width:${mkbWidth}px;height:${mkbHeight}px;overflow:hidden;background:transparent}
body{display:flex;align-items:center;justify-content:center;gap:24px}
.kb{position:relative;width:${kbW}px;height:${kbH}px;flex-shrink:0}
.kb>*{position:absolute;top:0;left:0;width:100%;height:100%}
.kb img{object-fit:cover}
#kbkeys{pointer-events:none}
.mouse-wrap{width:${mouseW}px;height:${mouseH}px;flex-shrink:0;position:relative;overflow:visible;transition:transform 0.04s ease-out;will-change:transform}
.mouse-wrap img.mskin{width:100%;height:100%;object-fit:contain;display:block;position:relative}
.mouse-wrap canvas#mouseRgbCv{position:absolute;inset:0;width:100%;height:100%;display:block}
.mmask{position:absolute;object-fit:contain;opacity:0;transition:opacity 0.06s;pointer-events:none}
.led{position:absolute;transform:translate(-50%,-50%);width:4.0%;height:7.0%;border-radius:50%;background:#0a0000;pointer-events:none;z-index:1;transition:background 0.08s}
@keyframes ledRgbCycle{0%{filter:hue-rotate(0deg) saturate(1.4)}100%{filter:hue-rotate(360deg) saturate(1.4)}}
</style>
</head>
<body>
<div class="kb" style="filter:${mkbShadowFilter}">
  <img src="${kbBlackB64}" style="z-index:0;object-fit:cover" />
  <canvas id="rgbcv" style="z-index:0"></canvas>
  ${kbSkinTag}
  ${keysTag}
  <div id="keydivs" style="z-index:4"></div>
  <div class="led" id="led6" style="left:72.8%;top:22.74%"></div>
  <div class="led" id="led7" style="left:77.6%;top:22.68%"></div>
  <div class="led" id="led8" style="left:82.3%;top:22.77%"></div>
</div>
<div class="mouse-wrap" id="mousewrap" style="filter:${mkbShadowFilter}">
  ${mouseIsVideo ? "" : `<canvas id="mouseRgbCv"></canvas>`}
  ${mouseSkinTag}
</div>
<script>
(function(){
  // Tell whatever's embedding this overlay in an <iframe> (the Companion's
  // Live Preview) our actual pixel size, so it can scale to fill its box
  // instead of assuming a fixed resolution that this export may not match.
  if(window.parent !== window) {
    window.parent.postMessage({ type: 'c4d-mkb-size', width: ${mkbWidth}, height: ${mkbHeight} }, '*');
  }

  // ── Config (live-updatable via WebSocket from C4D Companion) ──
  var KB_W=${kbW}, KB_H=${kbH};
  var MOUSE_W=${mouseW}, MOUSE_H=${mouseH};
  // MkbView.tsx's live preview always renders the keyboard at a fixed 800px
  // width and the mouse at a fixed 294px width — every glow/blur/spread
  // value on the sliders (keyPressGlow, mouseGlow, etc.) was tuned by eye
  // against THAT fixed size. This export renders at whatever size the
  // configured overlay width works out to (usually much larger, e.g. a
  // 1920px-wide OBS overlay), so those same absolute-pixel values would look
  // proportionally tiny/washed out here unless scaled up to match.
  var KB_SCALE = KB_W / 800;
  var MOUSE_SCALE = MOUSE_W / 294;
  var RC=${rc},GC=${gc},BC=${bcv};
  var MRC=${mrc},MGC=${mgc},MBC=${mbc};
  var RAINBOW=${mkbRainbow};
  var STYLE=${mkbRgbStyle};
  var KB_OPACITY=${kbOpacity};
  var KB_GLOW=${kbGlow};
  var MOUSE_GLOW=${mouseGlow};
  var MOUSE_OPACITY=${mouseOpacity};
  var MOUSE_INNER_FADE=${mouseInnerFade ? "true" : "false"};
  var MOUSE_OUTER_FADE=${mouseOuterFade ? "true" : "false"};
  var MOUSE_SNAP_BACK=${mouseSnapBack ? "true" : "false"};
  var KPC=${kpc},KPG=${kpg},KPB=${kpb};
  var KEY_PRESS_OPACITY=${keyPressOpacity};
  var KEY_PRESS_GLOW=${keyPressGlow};
  var MOUSE_RGB_ENABLED=${mouseRgbEnabled ? "true" : "false"};
  var MOUSE_RGB_MODE='${mouseRgbMode}';
  var MOUSE_RGB_SPEED=${mouseRgbSpeed};
  var MOUSE_RGB_INTENSITY=${mouseRgbIntensity};
  var MOUSE_RGB_RAINBOW=${mouseRgbRainbow ? "true" : "false"};
  var MRGBC=${mrgbc},MRGBG=${mrgbg},MRGBB=${mrgbb};

  // ── Key definitions ──
  var KEYS = ${keysJson};
  var MASKS = ${masksJson};

  // ── uiohook keycode -> our KEYS[].code map ──
  var KEY_MAP = {
    1:'Escape',2:'Digit1',3:'Digit2',4:'Digit3',5:'Digit4',6:'Digit5',
    7:'Digit6',8:'Digit7',9:'Digit8',10:'Digit9',11:'Digit0',
    15:'Tab',58:'CapsLock',
    30:'KeyA',48:'KeyB',46:'KeyC',32:'KeyD',18:'KeyE',33:'KeyF',34:'KeyG',
    35:'KeyH',23:'KeyI',36:'KeyJ',37:'KeyK',38:'KeyL',50:'KeyM',
    49:'KeyN',24:'KeyO',25:'KeyP',16:'KeyQ',19:'KeyR',31:'KeyS',
    20:'KeyT',22:'KeyU',47:'KeyV',17:'KeyW',45:'KeyX',21:'KeyY',44:'KeyZ',
    42:'ShiftLeft',54:'ShiftRight',29:'ControlLeft',157:'ControlRight',
    56:'AltLeft',184:'AltRight',57:'Space'
  };

  // ── RGB Canvas ──
  var cv = document.getElementById('rgbcv');
  cv.width = KB_W; cv.height = KB_H;
  var ctx = cv.getContext('2d');

  // ── Style-select LED indicators (Digit6/7/8) — mirrors MkbView.tsx exactly:
  //    press a fresh key -> solid on that key's style; press the SAME key
  //    again -> rainbow; press it a third time -> off (RGB hidden entirely).
  var LED_ACTIVE_CODE = null, LED_ACTIVE_MODE = 0; // 0=off,1=solid,2=rainbow
  // Off is off, no matter what — starts false (matching every LED starting
  // unlit) instead of showing RGB backlight before any style key has ever
  // been pressed.
  var KB_VISIBLE = false;
  var LED_STYLE_MAP = {Digit6:1,Digit7:2,Digit8:3};
  var LED_ELS = {Digit6:document.getElementById('led6'),Digit7:document.getElementById('led7'),Digit8:document.getElementById('led8')};
  function updateLeds(){
    cv.style.opacity = KB_VISIBLE ? KB_OPACITY : 0;
    for(var code in LED_ELS){
      var el = LED_ELS[code];
      if(!el) continue;
      if(code === LED_ACTIVE_CODE && LED_ACTIVE_MODE === 2){
        el.style.background = 'radial-gradient(circle, #ff8080 0%, #ff0000 70%)';
        el.style.animation = 'ledRgbCycle 2s linear infinite';
      } else if(code === LED_ACTIVE_CODE && LED_ACTIVE_MODE === 1){
        el.style.background = 'radial-gradient(circle, #ff6060 0%, #cc0000 70%)';
        el.style.animation = 'none';
      } else {
        el.style.background = '#0a0000';
        el.style.animation = 'none';
      }
    }
  }
  updateLeds();

  var maskImg = new Image();
  maskImg.src = "${maskB64}";

  var t = 0;
  function getC(h,a){
    if(RAINBOW){ var hue=((h*360)%360+360)%360; return 'hsla('+hue+',100%,55%,'+a+')'; }
    return 'rgba('+RC+','+GC+','+BC+','+a+')';
  }

  // ── Key press visuals ──
  // Real DOM elements with the exact same CSS as MkbView.tsx's KeyMarker.
  // Its inset box-shadow, spread, transparent-until-pressed background, and
  // scaleY squish can't be faithfully reproduced by redrawing a <canvas>
  // every frame (canvas shadows have no spread and always fill the shape's
  // own interior) — so these are literal <div>s instead, built once and
  // updated on press/release, same as the live preview.
  var keyDivs = document.getElementById('keydivs');
  var keyEls = {};
  KEYS.forEach(function(k){
    var el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = (k.cx - k.w/2) + '%';
    el.style.top = (k.cy - k.h/2) + '%';
    el.style.width = k.w + '%';
    el.style.height = k.h + '%';
    el.style.borderRadius = '4px';
    el.style.transition = 'transform 0.06s cubic-bezier(0.4,0,0.2,1), box-shadow 0.06s, background 0.06s';
    keyDivs.appendChild(el);
    keyEls[k.code] = el;
  });

  function renderKeyVisual(code){
    var el = keyEls[code]; if(!el) return;
    var isCapsLock = code === 'CapsLock';
    var isPressed = isCapsLock ? capsFlash : !!pressedKeys[code];
    var isToggleActive = isCapsLock && capsLockOn;
    // keyPressGlow is scaled by KB_SCALE (see above) since this export
    // renders at a different absolute size than MkbView.tsx's fixed 800px
    // preview reference — otherwise the exact same px glow value reads as
    // proportionally tiny on a bigger keyboard.
    var glow = KEY_PRESS_GLOW * KB_SCALE;
    var glowColor = 'rgb('+KPC+','+KPG+','+KPB+')';
    var boxShadow, background, border, transform;
    if(isPressed){
      boxShadow = 'inset 0 3px 8px rgba(0,0,0,0.8), inset 0 1px 3px rgba(0,0,0,0.6), 0 0 '+glow+'px '+Math.round(glow/4)+'px '+glowColor;
      background = 'rgba(0,0,0,'+(0.5*KEY_PRESS_OPACITY)+')';
      border = '1px solid rgba(0,0,0,0.4)';
      transform = 'translateY(1px) scaleY(0.94)';
    } else if(isToggleActive){
      boxShadow = isCapsLock
        ? 'inset 0 2px 6px rgba(0,0,0,0.8), inset 0 1px 3px rgba(0,0,0,0.6), 0 0 '+Math.round(glow/2)+'px '+Math.round(glow/6)+'px '+glowColor
        : 'inset 0 1px 4px rgba(0,0,0,0.5), 0 0 '+Math.round(glow/2)+'px '+Math.round(glow/6)+'px '+glowColor;
      background = 'rgba(0,0,0,'+((isCapsLock?0.5:0.25)*KEY_PRESS_OPACITY)+')';
      border = '1px solid rgba(0,0,0,0.25)';
      transform = 'translateY(0px) scaleY(0.98)';
    } else {
      boxShadow = '0 3px 6px rgba(0,0,0,0.5)';
      background = 'transparent';
      border = 'none';
      transform = 'translateY(0px) scaleY(1)';
    }
    el.style.boxShadow = boxShadow;
    el.style.background = background;
    el.style.border = border;
    el.style.transform = transform;
  }

  // ── Pressed key tracking ──
  var pressedKeys = {};
  var ripples = [];
  // CapsLock is a toggle, not a momentary press — mirrors MkbView.tsx: it
  // never enters pressedKeys (so it never contributes a ripple to the
  // ambient RGB canvas, and never gets the normal per-key press box below),
  // it's driven entirely by its own capsLockOn (persists until pressed
  // again) / capsFlash (a brief 120ms flash for the instant it's struck).
  var capsLockOn = false, capsFlash = false, capsFlashTimer = null;

  // Now that pressedKeys/capsLockOn/capsFlash exist, set every key's
  // initial resting look.
  KEYS.forEach(function(k){ renderKeyVisual(k.code); });

  function handleKeyDown(code){
    if(code === 'CapsLock'){
      capsLockOn = !capsLockOn;
      capsFlash = true;
      renderKeyVisual('CapsLock');
      clearTimeout(capsFlashTimer);
      capsFlashTimer = setTimeout(function(){ capsFlash = false; renderKeyVisual('CapsLock'); }, 120);
      return;
    }
    if(pressedKeys[code]) return;
    pressedKeys[code] = true;
    renderKeyVisual(code);
    if(LED_STYLE_MAP[code]){
      if(LED_ACTIVE_CODE !== code){
        // Different key (or none active) — switch to solid on this key
        LED_ACTIVE_CODE = code;
        LED_ACTIVE_MODE = 1;
        RAINBOW = false;
        STYLE = LED_STYLE_MAP[code];
        KB_VISIBLE = true;
      } else {
        var nextMode = (LED_ACTIVE_MODE % 3) + 1;
        if(nextMode === 2){
          // Rainbow — LED pulses red, RGB output unchanged
          LED_ACTIVE_MODE = 2;
          RAINBOW = true;
        } else {
          // Off (wraps past 3) — RGB hidden entirely
          LED_ACTIVE_CODE = null;
          LED_ACTIVE_MODE = 0;
          RAINBOW = false;
          KB_VISIBLE = false;
        }
      }
      updateLeds();
    }
    var k = KEYS.find(function(k){ return k.code===code; });
    if(k) ripples.push({cx:k.cx/100*KB_W, cy:k.cy/100*KB_H, t:t});
  }
  function handleKeyUp(code){ delete pressedKeys[code]; renderKeyVisual(code); }

  // ── Mouse tracking ──
  // Position is tracked directly and clamped on every move — mirrors
  // MkbView.tsx's MouseView exactly (posRef.current.x = clamp(posRef.current.x
  // + e.movementX*0.5, -RADIUS, RADIUS)). This used to run the position
  // through an extra target-chasing lerp (mouseX += (targetX-mouseX)*0.15)
  // that the live preview never had — an entire additional stage of lag on
  // top of what the CSS transition below already smooths, which is what
  // made the export feel stiffer/less responsive than the preview.
  var mouseX=0, mouseY=0;
  // RADIUS=50 (and the 0.5 sensitivity below) are absolute px values tuned
  // against MkbView.tsx's fixed 294px-wide mouse preview, same as
  // keyPressGlow/mouseGlow above — scaled by MOUSE_SCALE so a given real
  // mouse movement covers the same fraction of the container's travel
  // space here as it does in the preview, instead of covering proportionally
  // less of it on a bigger export render (which read as stiff/restricted).
  var RADIUS=50*MOUSE_SCALE;
  var mouseButtons = {};
  // Safety net: if a mousedown's matching mouseup never arrives (seen on
  // fast double-clicks — the OS/input-hook occasionally drops the up event),
  // the button mask would otherwise stay lit forever. Auto-release it after
  // a beat; the timer gets cancelled/restarted by the real mouseup or the
  // next mousedown, so this never fires during a normal press-and-hold.
  var mouseButtonTimers = {};
  function pressMouseButton(idx){
    mouseButtons[idx] = true;
    clearTimeout(mouseButtonTimers[idx]);
    mouseButtonTimers[idx] = setTimeout(function(){ releaseMouseButton(idx); }, 600);
  }
  function releaseMouseButton(idx){
    delete mouseButtons[idx];
    clearTimeout(mouseButtonTimers[idx]);
    updateMouseMasks();
  }
  // Actual wheel scrolling (spinning it, not clicking it down) — mirrors
  // MkbView.tsx's onWheel exactly: its own 150ms decay, separate from the
  // mousedown/mouseup safety-net timer above, since a real scroll and a
  // real middle-click both light up the same scroll mask (idx 1) but decay
  // on different timescales.
  var wheelTimer = null;
  function handleWheelScroll(){
    mouseButtons[1] = true;
    updateMouseMasks();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function(){ delete mouseButtons[1]; updateMouseMasks(); }, 150);
  }

  function handleMouseMove(dx,dy){
    mouseX = Math.max(-RADIUS, Math.min(RADIUS, mouseX + dx*0.5*MOUSE_SCALE));
    mouseY = Math.max(-RADIUS, Math.min(RADIUS, mouseY + dy*0.5*MOUSE_SCALE));
  }

  // ── Build mouse mask elements ──
  // Press look mirrors MkbView.tsx's MouseBtnPress (and the controller face
  // buttons / keyboard keys): darkened face, inset shadow for depth, and a
  // hollow ring in the mouse color that only glows OUTSIDE the button's own
  // shape — instead of the old flat solid silhouette. Every layer uses the
  // button's silhouette PNG as a CSS mask.
  var wrap = document.getElementById('mousewrap');
  var maskEls = {};
  var PRESS_PAD = 40 * MOUSE_SCALE;
  var PRESS_GAP = Math.max(1, 3 * MOUSE_SCALE);
  function maskCss(imgs, sizes, composite){
    var s = '-webkit-mask-image:'+imgs+';mask-image:'+imgs+';'
      + '-webkit-mask-size:'+sizes+';mask-size:'+sizes+';'
      + '-webkit-mask-position:center;mask-position:center;'
      + '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;';
    if(composite) s += '-webkit-mask-composite:destination-out;mask-composite:exclude;';
    return s;
  }
  function mkDiv(parent, css){
    var d = document.createElement('div');
    d.style.cssText = css;
    parent.appendChild(d);
    return d;
  }
  MASKS.forEach(function(m){
    var shape = 'url("'+m.b64+'")';
    var faceMask = maskCss(shape, '100% 100%', false);
    var outsideMask = maskCss('linear-gradient(black,black), '+shape,
      '100% 100%, calc(100% - '+(PRESS_PAD*2)+'px) calc(100% - '+(PRESS_PAD*2)+'px)', true);
    var ringMask = maskCss(shape+', '+shape,
      '100% 100%, calc(100% - '+(PRESS_GAP*2)+'px) calc(100% - '+(PRESS_GAP*2)+'px)', true);
    var box = mkDiv(wrap,
      'position:absolute;pointer-events:none;'
      + 'left:'+(m.cx - m.w/2)+'%;top:'+(m.cy - m.h/2)+'%;width:'+m.w+'%;height:'+m.h+'%;'
      + 'transition:transform 0.06s cubic-bezier(0.4,0,0.2,1);');
    // The old press was an <img> with object-fit:contain, so the silhouette sat
    // letterboxed at its own aspect ratio inside the mask's box. CSS masks
    // stretch to fill their box, so size an inner layer holder to the exact
    // "contain" rect once the image's natural size is known.
    var inner = mkDiv(box, 'position:absolute;left:0;top:0;width:0;height:0;');
    var natImg = new Image();
    natImg.onload = function(){
      if(!natImg.naturalWidth || !natImg.naturalHeight) return;
      var bw = m.w/100*MOUSE_W, bh = m.h/100*MOUSE_H;
      var fit = Math.min(bw/natImg.naturalWidth, bh/natImg.naturalHeight);
      var cw = natImg.naturalWidth*fit, ch = natImg.naturalHeight*fit;
      inner.style.left = ((bw-cw)/2)+'px';
      inner.style.top = ((bh-ch)/2)+'px';
      inner.style.width = cw+'px';
      inner.style.height = ch+'px';
    };
    natImg.src = m.b64;
    var dark = mkDiv(inner, 'position:absolute;inset:0;background:rgba(0,0,0,0);transition:background 0.06s;'+faceMask);
    var insetClip = mkDiv(inner, 'position:absolute;inset:0;overflow:hidden;opacity:0;transition:opacity 0.06s;'+faceMask);
    var insetIn = mkDiv(insetClip, 'position:absolute;inset:-'+PRESS_PAD+'px;background:rgba(0,0,0,0);'
      + 'filter:blur('+(4*MOUSE_SCALE)+'px);transform:translateY('+(3*MOUSE_SCALE)+'px);'+outsideMask);
    var ringOuter = mkDiv(inner, 'position:absolute;inset:-'+PRESS_PAD+'px;display:none;'+outsideMask);
    var ringMid = mkDiv(ringOuter, 'position:absolute;inset:'+PRESS_PAD+'px;');
    var ring = mkDiv(ringMid, 'position:absolute;inset:0;'+ringMask);
    maskEls[m.id] = {box:box, dark:dark, insetClip:insetClip, insetIn:insetIn, ringOuter:ringOuter, ringMid:ringMid, ring:ring, btnIndex:m.btnIndex};
  });

  function updateMouseMasks(){
    var S = MOUSE_SCALE;
    var a = MOUSE_OPACITY;
    function mc(alpha){ return 'rgba('+MRC+','+MGC+','+MBC+','+alpha+')'; }
    // MOUSE_GLOW is an absolute px value tuned against MkbView.tsx's fixed
    // 294px-wide mouse preview — scaled by MOUSE_SCALE so it still reads
    // as the same relative glow size at this export's actual mouse size.
    var g = Math.max(MOUSE_GLOW, 1) * S;
    Object.keys(maskEls).forEach(function(id){
      var m = maskEls[id];
      var pressed = !!mouseButtons[m.btnIndex];
      m.box.style.transform = pressed ? 'translateY('+S+'px) scaleY(0.96)' : 'none';
      m.dark.style.background = 'rgba(0,0,0,'+(pressed ? 0.5*a : 0)+')';
      m.insetClip.style.opacity = pressed ? 1 : 0;
      m.insetIn.style.background = 'rgba(0,0,0,'+(0.8*a)+')';
      m.ringOuter.style.display = pressed ? 'block' : 'none';
      if(pressed){
        m.ring.style.background = mc(a);
        m.ringMid.style.filter =
          'blur('+(1.5*S)+'px) drop-shadow(0 0 '+(2*S)+'px rgba(255,255,255,'+(0.9*a)+')) '
          + 'drop-shadow(0 0 '+(g*0.8)+'px '+mc(a)+') '
          + 'drop-shadow(0 0 '+(g*1.6)+'px '+mc(0.6*a)+') '
          + 'drop-shadow(0 0 '+(g*2.4)+'px '+mc(0.3*a)+')'
          + (MOUSE_OUTER_FADE ? ' drop-shadow(0 0 '+(g*4)+'px '+mc(0.25*a)+')' : '')
          + (MOUSE_INNER_FADE ? ' brightness(1.3)' : '')
          + ' drop-shadow('+(2*S)+'px '+(3*S)+'px '+(4*S)+'px rgba(0,0,0,'+(0.55*a)+'))';
      }
    });
  }

  // ══ WebSocket connection to C4D Companion ══
  // uiohook mouse button numbers (per libuiohook / Windows XBUTTON1/2):
  // 1=left, 2=right, 3=middle/scroll, 4=side_bot (XBUTTON1/back), 5=side_top (XBUTTON2/forward)
  var WS_BTN_MAP = { 1:0, 2:2, 3:1, 4:3, 5:4 };
  var ws, msgCount=0;
  function connectWS(){
    ws = new WebSocket('ws://127.0.0.1:8080');
    var statusEl = document.getElementById('wsStatus');

    ws.onopen = function(){
      if(statusEl){ statusEl.textContent='WS: connected'; statusEl.style.borderColor='#0f0'; statusEl.style.color='#0f0'; }
    };
    ws.onclose = function(){
      if(statusEl){ statusEl.textContent='WS: disconnected - retrying'; statusEl.style.borderColor='#f00'; statusEl.style.color='#f00'; }
      setTimeout(connectWS, 2000);
    };
    ws.onerror = function(){ ws.close(); };

    ws.onmessage = function(e){
      msgCount++;
      var msg = JSON.parse(e.data);
      if(statusEl) statusEl.textContent = 'WS: '+msgCount+' | '+msg.type;

      if(msg.type==='config'){
        if(msg.kbColor){ var c=msg.kbColor; RC=parseInt(c.slice(1,3),16);GC=parseInt(c.slice(3,5),16);BC=parseInt(c.slice(5,7),16); }
        if(msg.mouseColor){ var mc=msg.mouseColor; MRC=parseInt(mc.slice(1,3),16);MGC=parseInt(mc.slice(3,5),16);MBC=parseInt(mc.slice(5,7),16); }
        if(msg.rgbStyle) STYLE=msg.rgbStyle;
        if(msg.opacity!=null) KB_OPACITY=msg.opacity;
        if(msg.mouseGlow!=null) MOUSE_GLOW=msg.mouseGlow;
        cv.style.opacity = KB_OPACITY;
        return;
      }
      if(msg.type==='keydown'){ handleKeyDown(KEY_MAP[msg.code] || ('key'+msg.code)); return; }
      if(msg.type==='keyup'){ handleKeyUp(KEY_MAP[msg.code] || ('key'+msg.code)); return; }
      if(msg.type==='mousemove'){ handleMouseMove(msg.dx, msg.dy); return; }
      if(msg.type==='mousedown'){
        var idx = WS_BTN_MAP[msg.button];
        if(idx!=null){ pressMouseButton(idx); updateMouseMasks(); }
        return;
      }
      if(msg.type==='mouseup'){
        var idx2 = WS_BTN_MAP[msg.button];
        if(idx2!=null){ releaseMouseButton(idx2); }
        return;
      }
      if(msg.type==='wheel'){ handleWheelScroll(); return; }
    };
  }
  connectWS();

  // ── Mouse ambient RGB (masked to the mouse skin's own silhouette) ──
  if(MOUSE_RGB_ENABLED){
    (function(){
      var mrCanvas = document.getElementById('mouseRgbCv');
      var mrWrap = document.getElementById('mousewrap');
      if(!mrCanvas || !mrWrap) return;
      var mrCtx = mrCanvas.getContext('2d');
      var mrMaskImg = new Image();
      mrMaskImg.src = "${mouseMaskB64}";
      var mrT = 0;
      var mrSS = 1 / Math.max(MOUSE_RGB_SPEED, 0.5);
      var mrStarted = false;

      function mrGetC(hue, alpha){
        if(MOUSE_RGB_RAINBOW){
          var h = ((hue*360)%360+360)%360;
          return 'hsla('+h+',100%,55%,'+alpha+')';
        }
        return 'rgba('+MRGBC+','+MRGBG+','+MRGBB+','+alpha+')';
      }

      var mrRo = new ResizeObserver(function(entries){
        var e = entries[0];
        mrCanvas.width = e.contentRect.width;
        mrCanvas.height = e.contentRect.height;
        if(!mrStarted && mrCanvas.width > 0 && mrCanvas.height > 0){
          mrStarted = true;
          mrTick();
        }
      });
      mrRo.observe(mrWrap);

      function mrTick(){
        mrT += 0.016 * mrSS;
        var w = mrCanvas.width, h = mrCanvas.height;
        if(w > 0 && h > 0){
          mrCtx.clearRect(0,0,w,h);
          // Solid black first, painted over by the color fill below (source-over,
          // the canvas default) — wherever the color's alpha dips below 1, black
          // shows through instead of transparency. The final destination-in mask
          // clip then applies to the black+color result together, same as the
          // controller body / keyboard RGB backdrop treatment.
          mrCtx.fillStyle = '#000';
          mrCtx.fillRect(0,0,w,h);
          if(MOUSE_RGB_MODE === 'breathing'){
            var raw = 0.5 + 0.5*Math.sin(mrT*2.5);
            var pulse = 0.3 + 0.7*raw;
            var hue = MOUSE_RGB_RAINBOW ? mrT*0.08 : 0;
            mrCtx.fillStyle = mrGetC(hue, MOUSE_RGB_INTENSITY * pulse);
            mrCtx.fillRect(0,0,w,h);
          } else {
            var pulseRaw = 0.5 + 0.5*Math.sin(mrT*3);
            var pulse2 = 0.25 + 0.75*pulseRaw;
            var grad = mrCtx.createLinearGradient(0,0,w,0);
            var steps = 60;
            for(var i=0; i<=steps; i++){
              var frac = i/steps;
              var phase = frac + mrT*0.18;
              var x = ((phase % 1) + 1) % 1;
              var tri = Math.abs(x*2 - 1);
              var hue2 = MOUSE_RGB_RAINBOW ? tri : 0;
              grad.addColorStop(frac, mrGetC(hue2, MOUSE_RGB_INTENSITY * pulse2));
            }
            mrCtx.fillStyle = grad;
            mrCtx.fillRect(0,0,w,h);
          }
          if(mrMaskImg.complete && mrMaskImg.naturalWidth > 0){
            mrCtx.globalCompositeOperation = 'destination-in';
            mrCtx.drawImage(mrMaskImg, 0, 0, w, h);
            mrCtx.globalCompositeOperation = 'source-over';
          }
        }
        requestAnimationFrame(mrTick);
      }
    })();
  }

  // ── Main render loop ──
  function loop(){
    t += 0.016;
    var W=KB_W, H=KB_H;

    // RGB
    ctx.clearRect(0,0,W,H);
    if(STYLE===1){
      // Pulse — sharp attack, quick fade, like a heartbeat (mirrors MkbView.tsx exactly)
      var raw=0.5+0.5*Math.sin(t*2.5);
      var b=Math.pow(raw,3)*0.95; // no floor — goes fully dark at trough
      var hue=RAINBOW?(t*0.08)%1:0; // cycle hue slowly over time when rainbow on
      ctx.fillStyle=getC(hue,b); ctx.fillRect(0,0,W,H);
    } else if(STYLE===2){
      // Wave — wider columns, faster scroll (mirrors MkbView.tsx exactly).
      // Floor raised + exponent softened — the old high-contrast falloff
      // went fully black at every trough, reading as big dead gaps.
      var colW=6;
      for(var x=0;x<W;x+=colW){
        var hue2=(x/W+t*0.15)%1;
        var phase=(x/W)*Math.PI*6;
        var raw2=0.5+0.5*Math.sin(t*3-phase);
        var b2=0.18+Math.pow(raw2,1.6)*0.82;
        ctx.fillStyle=getC(hue2,b2); ctx.fillRect(x,0,colW,H);
      }
    } else {
      // Ripple — no ambient, just expanding rings (mirrors MkbView.tsx exactly)
      var now = t;
      ripples = ripples.filter(function(r){ return now-r.t < 2.5; });
      ripples.forEach(function(rip){
        var age=now-rip.t;
        var radius=age*Math.max(W,H)*0.8;
        var alpha=Math.max(0, 1.0*(1-age/2.5));
        var hue3=RAINBOW?(age*0.2+rip.cx/W)%1:0;
        var thickness=Math.max(W,H)*0.08;
        var grd=ctx.createRadialGradient(rip.cx,rip.cy,Math.max(0,radius-thickness),rip.cx,rip.cy,radius+thickness);
        grd.addColorStop(0,   getC(hue3, 0));
        grd.addColorStop(0.4, getC(hue3, alpha));
        grd.addColorStop(0.5, getC(hue3, alpha*1.2));
        grd.addColorStop(0.6, getC(hue3, alpha));
        grd.addColorStop(1,   getC(hue3, 0));
        ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);
      });
    }
    if(maskImg.complete && maskImg.naturalWidth>0){
      ctx.globalCompositeOperation='destination-in';
      ctx.drawImage(maskImg,0,0,W,H);
      ctx.globalCompositeOperation='source-over';
    }

    // Mouse movement (decay) — no lerp toward a target here, matches
    // MkbView.tsx exactly: the position itself decays directly.
    if(MOUSE_SNAP_BACK){ mouseX *= 0.92; mouseY *= 0.92; }
    wrap.style.transform = 'translate('+mouseX+'px,'+mouseY+'px)';
  }

  if(maskImg.complete && maskImg.naturalWidth>0){
    setInterval(loop, 16);
  } else {
    maskImg.onload = function(){ setInterval(loop, 16); };
    setTimeout(function(){ if(maskImg.naturalWidth===0) setInterval(loop, 16); }, 500);
  }
})();
<\/script>
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(mkbOverlayName || "overlay").replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}.html`;
      a.click();
    } finally { setMkbExporting(false); }
  }, [kbSkinUrl, kbButtonsUrl, mouseSkinUrl, mkbWidth, mkbHeight, mkbColor, mouseColor, mkbRainbow, mkbRgbStyle, kbOpacity, kbGlow, mouseOpacity, mouseGlow,
      mouseInnerFade, mouseOuterFade, mouseSnapBack, keyPressColor, keyPressOpacity, keyPressGlow, mkbOverlayName,
      mouseRgbEnabled, mouseRgbMode, mouseRgbSpeed, mouseRgbIntensity, mouseRgbColor, mouseRgbRainbow,
      mkbShowShadow, mkbShadowIntensity, mkbShadowDistance, mkbShadowAngle, kbSkinContrast, kbSkinSaturate, mouseSkinContrast, mouseSkinSaturate,
      kbSkinVideoFit, mouseSkinVideoFit]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="relative z-20 flex-none border-b border-border bg-card/60 backdrop-blur px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex flex-col items-center gap-0.5">
          <img src="c4d_visuals.png" alt="C4D Visuals" style={{ height:"96px", width:"auto", objectFit:"contain", filter:"brightness(1.2)" }} />
        </div>

        {/* Controller tabs + MKB tab */}
        <div className="flex items-center gap-1 border-l border-border pl-3">
          {CONTROLLER_TYPES.map(ct => (
            <button key={ct.id} onClick={() => {
              // Only switch when changing to a different controller.
              // Clicking the current tab while in editor mode should just exit
              // the editor — calling switchController would reset the skin that
              // was just exported via handleChange.
              if (ct.id !== configRef.current.controllerType || mkbMode) {
                switchController(ct.id);
              }
              setMkbMode(false);
              setEditorMode(false);
            }}
              className={`text-xs px-2.5 py-1 rounded-md border transition-all font-medium ${config.controllerType === ct.id && !mkbMode && !editorMode ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
              {ct.label}
            </button>
          ))}
          <button onClick={() => { setMkbMode(true); setEditorMode(false); setEditMode(false); setMkbEditMode(false); }}
            className={`text-xs px-2.5 py-1 rounded-md border transition-all font-medium ${mkbMode && !editorMode ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
            ⌨️ C4D.MKB
          </button>
        </div>

        {/* Preview / Edit — context-aware */}
        {!editorMode && (
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
          <button onClick={() => mkbMode ? setMkbEditMode(false) : setEditMode(false)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-all font-medium ${(mkbMode ? !mkbEditMode : !editMode) ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Play size={10} /> Preview
          </button>
          <button onClick={() => mkbMode ? setMkbEditMode(true) : setEditMode(true)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-all font-medium ${(mkbMode ? mkbEditMode : editMode) ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
            <Move size={10} /> {mkbMode ? "Edit Keys" : "Edit Layout"}
          </button>
        </div>
        )}

        {/* Save / Presets — works for both controller and MKB */}
        {!editorMode && (
        <div className="relative flex items-center gap-1">
          <button onClick={() => { setShowSaveInput(v => !v); setShowPresets(false); }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-card border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all">
            <Save size={10} /> Save
          </button>
          <button onClick={() => { setShowPresets(v => !v); setShowSaveInput(false); }} disabled={presets.length === 0}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-all ${presets.length > 0 ? "bg-card border-border hover:border-primary/50 text-muted-foreground hover:text-foreground" : "bg-card/40 border-border/40 text-muted-foreground/30 cursor-default"}`}>
            <FolderOpen size={10} /> Presets {presets.length > 0 && <span className="text-primary font-bold">{presets.length}</span>}
          </button>
          {showSaveInput && (
            <div className="absolute top-full mt-1 left-0 z-[999] bg-card border border-border rounded-lg shadow-xl p-3 w-52">
              <p className="text-[10px] text-muted-foreground mb-1.5">
                Save {mkbMode ? "MKB key layout" : `for ${baseLayout.name}`}
              </p>
              <input autoFocus value={saveInput} onChange={e => setSaveInput(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if(e.key==="Enter") handleSave(); }}
                placeholder={`Preset ${presets.length + 1}`}
                className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 mb-2 outline-none focus:border-primary" />
              <div className="flex gap-1.5">
                <button onClick={handleSave} className="flex-1 text-xs bg-primary text-primary-foreground rounded px-2 py-1.5 font-medium">Save</button>
                <button onClick={() => setShowSaveInput(false)} className="text-xs px-2 py-1.5 rounded border border-border text-muted-foreground">Cancel</button>
              </div>
            </div>
          )}
          {showPresets && presets.length > 0 && (
            <div className="absolute top-full mt-1 left-0 z-[999] bg-card border border-border rounded-lg shadow-xl w-56 overflow-hidden">
              <p className="text-[10px] text-muted-foreground px-3 pt-2 pb-1.5 border-b border-border">
                {mkbMode ? "MKB Presets" : `Presets — ${baseLayout.name}`}
              </p>
              {/* Past 5 presets, the list scrolls inside a fixed-height box
                  (~5 rows) instead of growing the dropdown unbounded. */}
              <div className="max-h-[150px] overflow-y-auto">
              {(presets as any[]).map((p, i) => {
                const isActive = p.savedAt === (mkbMode ? activeMkbPresetAt : activeCtrlPresetAt);
                return (
                <div key={i} className={`flex items-center px-2 py-1.5 hover:bg-muted/40 group ${isActive ? "bg-primary/10" : ""}`}>
                  <button onClick={() => {
                    if (mkbMode) {
                      // Merge over defaults first — presets saved before appearance
                      // fields were added only have keyOverrides/mouseOverrides.
                      const mp = { ...DEFAULT_MKB_SETTINGS, ...(p as MkbPreset) };
                      setKeyOverrides(mp.keyOverrides); setMouseOverrides(mp.mouseOverrides ?? []);
                      setKbSkinUrl(mp.kbSkinUrl); setKbButtonsUrl(mp.kbButtonsUrl); setMouseSkinUrl(mp.mouseSkinUrl);
                      setKbSkinVideoFit(mp.kbSkinVideoFit); setKbSkinContrast(mp.kbSkinContrast); setKbSkinSaturate(mp.kbSkinSaturate);
                      setMouseSkinVideoFit(mp.mouseSkinVideoFit); setMouseSkinContrast(mp.mouseSkinContrast); setMouseSkinSaturate(mp.mouseSkinSaturate);
                      setMkbColor(mp.mkbColor); setMkbRgbStyle(mp.mkbRgbStyle); setMkbRainbow(mp.mkbRainbow); setMouseColor(mp.mouseColor);
                      setKeyPressColor(mp.keyPressColor); setKeyPressOpacity(mp.keyPressOpacity); setKeyPressGlow(mp.keyPressGlow);
                      setKbOpacity(mp.kbOpacity); setKbGlow(mp.kbGlow);
                      setMouseOpacity(mp.mouseOpacity); setMouseGlow(mp.mouseGlow); setMouseInnerFade(mp.mouseInnerFade); setMouseOuterFade(mp.mouseOuterFade); setMouseSnapBack(mp.mouseSnapBack);
                      setMouseRgbEnabled(mp.mouseRgbEnabled); setMouseRgbMode(mp.mouseRgbMode); setMouseRgbSpeed(mp.mouseRgbSpeed);
                      setMouseRgbIntensity(mp.mouseRgbIntensity); setMouseRgbColor(mp.mouseRgbColor); setMouseRgbRainbow(mp.mouseRgbRainbow);
                      setMkbShowShadow(mp.mkbShowShadow); setMkbShadowIntensity(mp.mkbShadowIntensity); setMkbShadowDistance(mp.mkbShadowDistance); setMkbShadowAngle(mp.mkbShadowAngle);
                      setMkbWidth(mp.mkbWidth); setMkbHeight(mp.mkbHeight);
                      setActiveMkbPresetAt(p.savedAt);
                    } else {
                      const cp = p as CtrlPreset;
                      setOverrides(cp.overrides);
                      // Older presets (saved before this field existed) have no
                      // config snapshot — leave the current config alone rather
                      // than wiping it out with undefined.
                      if (cp.config) setConfig({ ...DEFAULT_CONFIG, ...migrateLegacyConfig({ ...cp.config }), controllerType: config.controllerType });
                      setActiveCtrlPresetAt(p.savedAt);
                    }
                    setShowPresets(false);
                  }} className={`flex-1 flex items-center gap-1 text-left text-xs truncate ${isActive ? "text-primary font-medium" : "text-foreground"}`}>
                    {isActive ? <Check size={10} className="flex-none text-primary" /> : <span className="w-[10px] flex-none" />}
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground flex-none">{new Date(p.savedAt).toLocaleDateString()}</span>
                  </button>
                  <button onClick={async () => {
                    const u = presets.filter((_, j) => j !== i);
                    if (mkbMode) {
                      setMkbPresets(u as MkbPreset[]);
                      if (isActive) setActiveMkbPresetAt(null);
                      await saveMkbPresets(u as MkbPreset[]);
                    } else {
                      setCtrlPresets(u as CtrlPreset[]);
                      if (isActive) setActiveCtrlPresetAt(null);
                      await saveCtrlPresets(config.controllerType, u as CtrlPreset[]);
                    }
                  }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 rounded">
                    <Trash2 size={10} />
                  </button>
                </div>
                );
              })}
              </div>
            </div>
          )}
        </div>
        )}

        <div className="flex-1" />

        <button onClick={() => { setEditorMode(true); setMkbMode(false); }}
          className={`text-sm px-4 py-1.5 rounded-md border transition-all font-semibold ${editorMode ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
          🖌️ Editor
        </button>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0">

        {/* ImageEditor — always mounted so loaded images, logo state, and undo
            history survive switching between editor mode and the normal view.
            display:none hides it visually but keeps the React tree alive. */}
        <div className={editorMode ? "flex-1 min-w-0 min-h-0" : "hidden"}>
          <ImageEditor
            onExportToSkin={handleExportFromEditor}
            onClearSlot={handleClearSlot}
            onExportMkbSkin={handleExportMkbSkin}
            onClearMkbSlot={handleClearMkbSlot}
            pendingSkins={pendingSkins}
            activeControllerType={config.controllerType}
            activeConfig={config}
            activeMkbConfig={{ kbSkin: kbSkinUrl, mouseSkin: mouseSkinUrl, kbButtonsSkin: kbButtonsUrl }}
          />
        </div>

        {/* Normal view — conditionally rendered (state lives in Studio, safe to remount) */}
        {!editorMode && (
        <>
        {/* Left panel */}
        <aside className="w-52 flex-none border-r border-border bg-card/40 overflow-y-auto min-h-0">
          {mkbMode
            ? <MkbSkinPanel kbSkinUrl={kbSkinUrl} mouseSkinUrl={mouseSkinUrl} kbButtonsUrl={kbButtonsUrl}
                onKbChange={setKbSkinUrl} onMouseChange={setMouseSkinUrl} onKbButtonsChange={setKbButtonsUrl}
                kbSkinVideoFit={kbSkinVideoFit} onKbVideoFit={setKbSkinVideoFit}
                kbSkinContrast={kbSkinContrast} onKbContrast={setKbSkinContrast}
                kbSkinSaturate={kbSkinSaturate} onKbSaturate={setKbSkinSaturate}
                mouseSkinVideoFit={mouseSkinVideoFit} onMouseVideoFit={setMouseSkinVideoFit}
                mouseSkinContrast={mouseSkinContrast} onMouseContrast={setMouseSkinContrast}
                mouseSkinSaturate={mouseSkinSaturate} onMouseSaturate={setMouseSkinSaturate} />
            : <SkinPanel config={config} onChange={handleChange} stickSizePx={stickSizePx} bodySizeLabel={bodySizeLabel}
                onClearSlot={slot => handleClearSlot(slot, config.controllerType)} />
          }
        </aside>

        {/* Center */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-2 min-h-0">
            {mkbMode ? (
              <div className="flex items-center justify-center w-full flex-1 min-h-0 rounded-xl"
                style={{ backgroundImage:"url(editor-checker-tile.png)", backgroundSize:"136px 54px", backgroundRepeat:"repeat", backgroundColor:"#1a1a22", userSelect: "none", WebkitUserSelect: "none" }}>
              <div className="inline-flex">
                <MkbView
                  color={mkbColor}
                  keyPressColor={keyPressColor}
                  keyPressOpacity={keyPressOpacity}
                  keyPressGlow={keyPressGlow}
                  kbOpacity={kbRgbVisible ? kbOpacity : 0} kbGlow={kbGlow}
                  mouseColor={mouseColor} mouseOpacity={mouseOpacity} mouseGlow={mouseGlow} mouseInnerFade={mouseInnerFade} mouseOuterFade={mouseOuterFade} mouseSnapBack={mouseSnapBack}
                  mouseRgbEnabled={mouseRgbEnabled} mouseRgbMode={mouseRgbMode} mouseRgbSpeed={mouseRgbSpeed}
                  mouseRgbIntensity={mouseRgbIntensity} mouseRgbColor={mouseRgbColor} mouseRgbRainbow={mouseRgbRainbow}
                  mkbShowShadow={mkbShowShadow} mkbShadowIntensity={mkbShadowIntensity} mkbShadowDistance={mkbShadowDistance} mkbShadowAngle={mkbShadowAngle}
                  rgbStyle={mkbRgbStyle}
                  onRgbStyleChange={(s) => { setMkbRgbStyle(s); setKbRgbVisible(true); }}
                  rainbow={mkbRainbow}
                  onRainbowChange={setMkbRainbow}
                  onRgbOff={() => setKbRgbVisible(false)}
                  keyboardSkinUrl={kbSkinUrl}
                  keyboardButtonsUrl={kbButtonsUrl}
                  mouseSkinUrl={mouseSkinUrl}
                  kbSkinVideoFit={kbSkinVideoFit}
                  kbSkinContrast={kbSkinContrast}
                  kbSkinSaturate={kbSkinSaturate}
                  mouseSkinVideoFit={mouseSkinVideoFit}
                  mouseSkinContrast={mouseSkinContrast}
                  mouseSkinSaturate={mouseSkinSaturate}
                  editMode={mkbEditMode}
                  keyOverrides={keyOverrides}
                  mouseOverrides={mouseOverrides}
                  onKeyOverridesChange={setKeyOverrides}
                  onMouseOverridesChange={setMouseOverrides}
                  onGetMasksRef={getMasksRef}
                />
              </div>
              </div>
            ) : (
              <>
                <div className="w-full flex-1 min-h-0 flex items-center justify-center rounded-xl"
                  style={editMode ? {} : { backgroundImage: "url(editor-checker-tile.png)", backgroundSize: "136px 54px", backgroundRepeat: "repeat", backgroundColor: "#1a1a22" }}>
                  <div className="w-full h-full max-w-3xl flex items-center">
                    <div className={`w-full rounded-xl overflow-hidden ${editMode ? "border shadow-2xl" : ""}`}
                      style={editMode ? { borderColor: "hsl(262 80% 65% / 0.6)", borderWidth: "2px" } : undefined}>
                      <ControllerPreview config={config} overrides={overrides} showButtonLabels={showButtonLabels}
                        editMode={editMode} onOverridesChange={setOverrides} />
                    </div>
                  </div>
                </div>
                {!editMode && (
                  <div className="w-full max-w-3xl flex items-center justify-between gap-4 px-1" style={{ opacity: gp.connected ? 1 : 0.35 }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-white/60 font-mono w-5">{ltLabel}</span>
                      <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden border border-white/10">
                        <div className="h-full bg-orange-400 rounded-full transition-all duration-[60ms]" style={{ width: `${(gp.triggers[0] ?? 0) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-white/40 font-mono w-5">{Math.round((gp.triggers[0] ?? 0) * 100)}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">{gp.connected ? "Press buttons to test" : "Connect a gamepad"}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-white/40 font-mono w-5 text-right">{Math.round((gp.triggers[1] ?? 0) * 100)}</span>
                      <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden border border-white/10">
                        <div className="h-full bg-orange-400 rounded-full transition-all duration-[60ms]" style={{ width: `${(gp.triggers[1] ?? 0) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-white/60 font-mono w-5">{rtLabel}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Right panel — context-aware */}
        <aside className="w-56 flex-none border-l border-border bg-card/40 flex flex-col">
          <div className="flex-1 overflow-hidden flex flex-col p-3">
            {mkbMode
              ? <MkbConfigPanel
                  overlayName={mkbOverlayName} onOverlayNameChange={setMkbOverlayName}
                  color={mkbColor} onColorChange={setMkbColor}
                  keyPressColor={keyPressColor} onKeyPressColorChange={setKeyPressColor}
                  keyPressOpacity={keyPressOpacity} onKeyPressOpacity={setKeyPressOpacity}
                  keyPressGlow={keyPressGlow} onKeyPressGlow={setKeyPressGlow}
                  mouseColor={mouseColor} onMouseColorChange={setMouseColor}
                  keyOverrides={keyOverrides} mouseOverrides={mouseOverrides}
                  rgbStyle={mkbRgbStyle} onRgbStyleChange={setMkbRgbStyle}
                  rainbow={mkbRainbow} onRainbowChange={setMkbRainbow}
                  kbOpacity={kbOpacity} onKbOpacity={setKbOpacity}
                  kbGlow={kbGlow} onKbGlow={setKbGlow}
                  mouseOpacity={mouseOpacity} onMouseOpacity={setMouseOpacity}
                  mouseGlow={mouseGlow} onMouseGlow={setMouseGlow}
                  mouseInnerFade={mouseInnerFade} onMouseInnerFade={setMouseInnerFade}
                  mouseOuterFade={mouseOuterFade} onMouseOuterFade={setMouseOuterFade}
                  mouseSnapBack={mouseSnapBack} onMouseSnapBack={setMouseSnapBack}
                  mouseRgbEnabled={mouseRgbEnabled} onMouseRgbEnabled={setMouseRgbEnabled}
                  mouseRgbMode={mouseRgbMode} onMouseRgbMode={setMouseRgbMode}
                  mouseRgbSpeed={mouseRgbSpeed} onMouseRgbSpeed={setMouseRgbSpeed}
                  mouseRgbIntensity={mouseRgbIntensity} onMouseRgbIntensity={setMouseRgbIntensity}
                  mouseRgbColor={mouseRgbColor} onMouseRgbColor={setMouseRgbColor}
                  mouseRgbRainbow={mouseRgbRainbow} onMouseRgbRainbow={setMouseRgbRainbow}
                  mkbShowShadow={mkbShowShadow} onMkbShowShadow={setMkbShowShadow}
                  mkbShadowIntensity={mkbShadowIntensity} onMkbShadowIntensity={setMkbShadowIntensity}
                  mkbShadowDistance={mkbShadowDistance} onMkbShadowDistance={setMkbShadowDistance}
                  mkbShadowAngle={mkbShadowAngle} onMkbShadowAngle={setMkbShadowAngle}
                  kbSkinUrl={kbSkinUrl} kbButtonsUrl={kbButtonsUrl} mouseSkinUrl={mouseSkinUrl}
                  mkbWidth={mkbWidth} mkbHeight={mkbHeight}
                  onMkbSizeChange={(w,h)=>{setMkbWidth(w);setMkbHeight(h);}}
                  onExport={handleExportMkb} exporting={mkbExporting}
                />
              : <ConfigPanel config={config} overrides={overrides} onChange={handleChange}
                  onResetOverrides={handleResetOverrides} showButtonLabels={showButtonLabels}
                  onToggleLabels={setShowButtonLabels} />
            }
          </div>
        </aside>
        </>
        )}
      </div>
    </div>
  );
}

// ── MKB Skin Panel ────────────────────────────────────────────────────────
/** Keyboard Body, Keyboard Keys, and Mouse libraries — each is a single flat
 *  list, no tabs, strictly scoped to its own section (MKB only has one shape,
 *  unlike controller body which varies per controller type). */
const KEYBOARD_BODY_LIBRARY: LibraryEntry[] = [
  { id:"kb-default", name:"Default", url:"mkb/keyboard-empty.png" },
];
const KEYBOARD_KEYS_LIBRARY: LibraryEntry[] = [
  { id:"kb-keys-default", name:"Default", url:"mkb/keyboard-buttons.png" },
];
const MOUSE_LIBRARY: LibraryEntry[] = [
  { id:"mouse-default", name:"Default", url:"mkb/mouse.png" },
];

function MkbUploadSlot({ label, value, defaultUrl, onUpload, onClear, accept, hint, allowVideo, isVideo, videoFit, onVideoFit, contrast, onContrast, saturate, onSaturate, onOpenLibrary }: {
  label: string; value: string; defaultUrl: string;
  onUpload: (u: string) => void; onClear: () => void;
  accept?: string; hint?: string; allowVideo?: boolean;
  isVideo?: boolean;
  videoFit?: "contain"|"cover"; onVideoFit?: (v:"contain"|"cover")=>void;
  contrast?: number; onContrast?: (v:number)=>void;
  saturate?: number; onSaturate?: (v:number)=>void;
  onOpenLibrary?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => { if (typeof ev.target?.result === "string") onUpload(ev.target.result); };
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  const isTemplate = value === defaultUrl;
  const hasValue = !!value;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-none">{label}</label>
        {onOpenLibrary && (
          <button onClick={onOpenLibrary}
            className="flex-none flex items-center gap-0.5 text-[10px] text-primary border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded transition-all font-medium whitespace-nowrap">
            ＋ Library
          </button>
        )}
      </div>
      {hasValue ? (
        <Popover>
          <div className="relative rounded-lg border border-border bg-card group">
            <div className="w-full h-36 p-2 rounded-lg overflow-hidden" style={{
              backgroundImage:"url(editor-checker-tile.png)",
              backgroundSize:"136px 54px", backgroundRepeat:"repeat", backgroundColor:"#1a1a22",
            }}>
              {isVideo
                ? <video src={value} autoPlay loop muted playsInline className="w-full h-full object-contain" />
                : <img src={value} alt={label} className="w-full h-full object-contain" />
              }
            </div>
            {isVideo && (
              <div className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] bg-violet-600/90 text-white px-1.5 py-0.5 rounded font-medium">
                <Film size={9} /> WebM
              </div>
            )}
            {isTemplate && !isVideo && (
              <div className="absolute top-1.5 left-1.5 text-[9px] bg-primary/80 text-white px-1.5 py-0.5 rounded font-medium">Template</div>
            )}
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isVideo && allowVideo && (
                <PopoverTrigger asChild>
                  <button className="p-1 rounded-full bg-black/60 text-violet-300 hover:bg-violet-600 transition-colors" title="Video options">
                    <Settings2 size={11} />
                  </button>
                </PopoverTrigger>
              )}
              <button onClick={onClear}
                className="p-1 rounded-full bg-black/60 text-white hover:bg-destructive transition-colors">
                <X size={11} />
              </button>
            </div>
          </div>
          {isVideo && allowVideo && (
            <PopoverContent side="right" sideOffset={8} align="start" className="w-56 p-3 space-y-3">
              <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Film size={10} className="text-violet-400" /> WebM Options
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Fit</label>
                <div className="grid grid-cols-2 gap-1">
                  {(["contain","cover"] as const).map(mode => (
                    <button key={mode} onClick={() => onVideoFit?.(mode)}
                      className={`flex flex-col items-center py-1.5 rounded text-[10px] border transition-all ${
                        (videoFit ?? "contain") === mode
                          ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                          : "bg-muted/20 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}>
                      <span className="font-semibold capitalize">{mode}</span>
                      <span className="opacity-60 mt-0.5">{mode === "contain" ? "Letterbox" : "Crop sides"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] text-muted-foreground">Contrast</label>
                  <span className="text-[10px] font-mono text-muted-foreground">{(contrast ?? 1).toFixed(2)}×</span>
                </div>
                <input type="range" min="0.5" max="2" step="0.01" value={contrast ?? 1}
                  onChange={e => onContrast?.(parseFloat(e.target.value))}
                  className="w-full h-1 accent-violet-500" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] text-muted-foreground">Saturation</label>
                  <span className="text-[10px] font-mono text-muted-foreground">{(saturate ?? 1).toFixed(2)}×</span>
                </div>
                <input type="range" min="0.5" max="2" step="0.01" value={saturate ?? 1}
                  onChange={e => onSaturate?.(parseFloat(e.target.value))}
                  className="w-full h-1 accent-violet-500" />
              </div>
              <p className="text-[9px] text-muted-foreground/50 leading-snug border-t border-border pt-2">
                Washed out? Try Contrast 1.15 + Saturation 1.10. Permanent fix: re-encode with{" "}
                <code className="bg-muted/40 px-0.5 rounded">-color_range 2</code> in FFmpeg.
              </p>
            </PopoverContent>
          )}
        </Popover>
      ) : (
        <button onClick={() => inputRef.current?.click()}
          className="w-full h-36 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground">
          <Upload size={18} />
          <span className="text-xs">Upload {label}</span>
          {hint && <span className="text-[10px] opacity-60">{hint}</span>}
        </button>
      )}
      <input ref={inputRef} type="file" accept={accept ?? "image/png,image/jpeg,image/webp"} className="hidden" onChange={handleFile} />
    </div>
  );
}

function isVideoUrl(url: string): boolean {
  return url.startsWith("data:video/") || url.startsWith("blob:") || url.endsWith(".webm") || url.endsWith(".mp4");
}

function MkbSkinPanel({ kbSkinUrl, mouseSkinUrl, kbButtonsUrl, onKbChange, onMouseChange, onKbButtonsChange,
  kbSkinVideoFit, onKbVideoFit, kbSkinContrast, onKbContrast, kbSkinSaturate, onKbSaturate,
  mouseSkinVideoFit, onMouseVideoFit, mouseSkinContrast, onMouseContrast, mouseSkinSaturate, onMouseSaturate }: {
  kbSkinUrl:string; mouseSkinUrl:string; kbButtonsUrl:string;
  onKbChange:(u:string)=>void; onMouseChange:(u:string)=>void; onKbButtonsChange:(u:string)=>void;
  kbSkinVideoFit:"contain"|"cover"; onKbVideoFit:(v:"contain"|"cover")=>void;
  kbSkinContrast:number; onKbContrast:(v:number)=>void;
  kbSkinSaturate:number; onKbSaturate:(v:number)=>void;
  mouseSkinVideoFit:"contain"|"cover"; onMouseVideoFit:(v:"contain"|"cover")=>void;
  mouseSkinContrast:number; onMouseContrast:(v:number)=>void;
  mouseSkinSaturate:number; onMouseSaturate:(v:number)=>void;
}) {
  const DEFAULT_KB = "mkb/keyboard-empty.png";
  const DEFAULT_KB_BTN = "mkb/keyboard-buttons.png";
  const DEFAULT_MOUSE = "mkb/mouse.png";
  const [showKbLib, setShowKbLib] = React.useState(false);
  const [showKbKeysLib, setShowKbKeysLib] = React.useState(false);
  const [showMouseLib, setShowMouseLib] = React.useState(false);
  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <ImageIcon size={16} className="text-primary" />
        <span className="text-sm font-semibold">MKB Skins</span>
      </div>
      <MkbUploadSlot label="Keyboard Body" value={kbSkinUrl} defaultUrl={DEFAULT_KB}
        onUpload={onKbChange} onClear={() => onKbChange(DEFAULT_KB)}
        accept="image/png,image/jpeg,image/webp,video/webm" allowVideo
        isVideo={isVideoUrl(kbSkinUrl)}
        videoFit={kbSkinVideoFit} onVideoFit={onKbVideoFit}
        contrast={kbSkinContrast} onContrast={onKbContrast}
        saturate={kbSkinSaturate} onSaturate={onKbSaturate}
        onOpenLibrary={() => setShowKbLib(true)} />
      {showKbLib && (
        <LibraryPicker title="Keyboard Body Library" section="kb-body" staticEntries={KEYBOARD_BODY_LIBRARY}
          current={kbSkinUrl} onSelect={onKbChange} onClose={() => setShowKbLib(false)} allowVideo />
      )}

      <MkbUploadSlot label="Keyboard Keys" value={kbButtonsUrl} defaultUrl={DEFAULT_KB_BTN}
        onUpload={onKbButtonsChange} onClear={() => onKbButtonsChange(DEFAULT_KB_BTN)}
        accept="image/png,image/jpeg,image/webp" hint="Transparent key shapes overlay"
        onOpenLibrary={() => setShowKbKeysLib(true)} />
      {showKbKeysLib && (
        <LibraryPicker title="Keyboard Keys Library" section="kb-keys" staticEntries={KEYBOARD_KEYS_LIBRARY}
          current={kbButtonsUrl} onSelect={onKbButtonsChange} onClose={() => setShowKbKeysLib(false)} />
      )}

      <MkbUploadSlot label="Mouse" value={mouseSkinUrl} defaultUrl={DEFAULT_MOUSE}
        onUpload={onMouseChange} onClear={() => onMouseChange(DEFAULT_MOUSE)}
        accept="image/png,image/jpeg,image/webp,video/webm" allowVideo
        isVideo={isVideoUrl(mouseSkinUrl)}
        videoFit={mouseSkinVideoFit} onVideoFit={onMouseVideoFit}
        contrast={mouseSkinContrast} onContrast={onMouseContrast}
        saturate={mouseSkinSaturate} onSaturate={onMouseSaturate}
        onOpenLibrary={() => setShowMouseLib(true)} />
      {showMouseLib && (
        <LibraryPicker title="Mouse Skin Library" section="mouse" staticEntries={MOUSE_LIBRARY}
          current={mouseSkinUrl} onSelect={onMouseChange} onClose={() => setShowMouseLib(false)} allowVideo />
      )}
    </div>
  );
}

// ── MKB helper UI components ─────────────────────────────────────────────────
function MkbSlider({label,value,min,max,step,display,onChange}:{label:string;value:number;min:number;max:number;step:number;display:string;onChange:(v:number)=>void}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-foreground/50">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))}
        className="w-full accent-primary h-1.5 rounded-full cursor-pointer" />
    </div>
  );
}
function MkbToggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button onClick={()=>onChange(!value)} style={{minWidth:"36px"}}
        className={"relative flex-none w-9 h-5 rounded-full transition-colors duration-200 "+(value?"bg-primary":"bg-muted")}>
        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200"
          style={{left:value?"calc(100% - 18px)":"2px"}}/>
      </button>
    </div>
  );
}
function MkbDropdown({title, children}:{title:string; children:React.ReactNode}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-card hover:bg-muted/40 transition-colors">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">{title}</span>
        <span className={`text-muted-foreground text-xs transition-transform duration-200 ${open?"rotate-180":""}`}>▾</span>
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2 border-t border-border bg-background/50">
          {children}
        </div>
      )}
    </div>
  );
}

// ── MKB Config Panel (right sidebar when in MKB mode) ─────────────────────
type RgbStyle = 1|2|3;

interface MkbConfigProps {
  overlayName: string; onOverlayNameChange: (v:string)=>void;
  color: string; onColorChange: (c:string)=>void;
  keyPressColor: string; onKeyPressColorChange: (c:string)=>void;
  keyPressOpacity: number; onKeyPressOpacity: (v:number)=>void;
  keyPressGlow: number; onKeyPressGlow: (v:number)=>void;
  mouseColor: string; onMouseColorChange: (c:string)=>void;
  rgbStyle: RgbStyle; onRgbStyleChange: (s:RgbStyle)=>void;
  rainbow: boolean; onRainbowChange: (v:boolean)=>void;
  kbOpacity: number; onKbOpacity: (v:number)=>void;
  kbGlow: number; onKbGlow: (v:number)=>void;
  mouseOpacity: number; onMouseOpacity: (v:number)=>void;
  mouseGlow: number; onMouseGlow: (v:number)=>void;
  mouseInnerFade: boolean; onMouseInnerFade: (v:boolean)=>void;
  mouseOuterFade: boolean; onMouseOuterFade: (v:boolean)=>void;
  mouseSnapBack: boolean; onMouseSnapBack: (v:boolean)=>void;
  mouseRgbEnabled: boolean; onMouseRgbEnabled: (v:boolean)=>void;
  mouseRgbMode: "wave"|"breathing"; onMouseRgbMode: (v:"wave"|"breathing")=>void;
  mouseRgbSpeed: number; onMouseRgbSpeed: (v:number)=>void;
  mouseRgbIntensity: number; onMouseRgbIntensity: (v:number)=>void;
  mouseRgbColor: string; onMouseRgbColor: (v:string)=>void;
  mouseRgbRainbow: boolean; onMouseRgbRainbow: (v:boolean)=>void;
  mkbShowShadow: boolean; onMkbShowShadow: (v:boolean)=>void;
  mkbShadowIntensity: number; onMkbShadowIntensity: (v:number)=>void;
  mkbShadowDistance: number; onMkbShadowDistance: (v:number)=>void;
  mkbShadowAngle: number; onMkbShadowAngle: (v:number)=>void;
  keyOverrides: Record<string,{cx:number;cy:number;w:number;h:number}>;
  mouseOverrides: {id:string;cx:number;cy:number;w:number;h:number}[];
  kbSkinUrl: string; kbButtonsUrl: string; mouseSkinUrl: string;
  mkbWidth: number; mkbHeight: number;
  onMkbSizeChange: (w:number,h:number)=>void;
  onExport: ()=>void;
  exporting: boolean;
}

function MkbConfigPanel({ overlayName, onOverlayNameChange, color, onColorChange, keyPressColor, onKeyPressColorChange, keyPressOpacity, onKeyPressOpacity, keyPressGlow, onKeyPressGlow, mouseColor, onMouseColorChange,
  rgbStyle, onRgbStyleChange, rainbow, onRainbowChange,
  kbOpacity, onKbOpacity, kbGlow, onKbGlow,
  mouseOpacity, onMouseOpacity, mouseGlow, onMouseGlow, mouseInnerFade, onMouseInnerFade, mouseOuterFade, onMouseOuterFade, mouseSnapBack, onMouseSnapBack,
  mouseRgbEnabled, onMouseRgbEnabled, mouseRgbMode, onMouseRgbMode, mouseRgbSpeed, onMouseRgbSpeed,
  mouseRgbIntensity, onMouseRgbIntensity, mouseRgbColor, onMouseRgbColor, mouseRgbRainbow, onMouseRgbRainbow,
  mkbShowShadow, onMkbShowShadow, mkbShadowIntensity, onMkbShadowIntensity, mkbShadowDistance, onMkbShadowDistance, mkbShadowAngle, onMkbShadowAngle,
  keyOverrides, mouseOverrides,
  kbSkinUrl, kbButtonsUrl, mouseSkinUrl, mkbWidth, mkbHeight, onMkbSizeChange, onExport, exporting }: MkbConfigProps) {
  const styleLabels: Record<RgbStyle,string> = {1:"Breathe",2:"Wave",3:"Ripple"};

  // Raw <input type="color"> elements below need the same drag-lag fix as
  // ConfigPanel's ColorField — every native color-drag tick was calling
  // these onChange props directly, cascading into a full Studio re-render.
  const [colorLocal, handleColorChange] = useThrottledColor(color, onColorChange);
  const [keyPressColorLocal, handleKeyPressColorChange] = useThrottledColor(keyPressColor, onKeyPressColorChange);
  const [mouseColorLocal, handleMouseColorChange] = useThrottledColor(mouseColor, onMouseColorChange);
  const [mouseRgbColorLocal, handleMouseRgbColorChange] = useThrottledColor(mouseRgbColor, onMouseRgbColor);

  // Export handled by parent via prop


  return (
    <div className="flex flex-col gap-3 h-full">

      {/* Scrollable content */}
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
      {/* Overlay name */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 pb-0.5 border-b border-border">
          <Tag size={11} className="text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">Name</span>
        </div>
        <input type="text" value={overlayName} onChange={e => onOverlayNameChange(e.target.value)}
          placeholder="My Keyboard"
          className="w-full text-xs px-2 py-1 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors" />
      </div>

      {/* Keyboard appearance + RGB */}
      <MkbDropdown title="⌨️ Keyboard">
        <div className="flex items-center gap-2">
          <input type="color" value={keyPressColorLocal} onChange={e => handleKeyPressColorChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5" />
          <span className="text-xs font-mono text-foreground/50">{keyPressColorLocal}</span>
          <span className="text-xs text-foreground/40">Key Press</span>
        </div>
        <MkbSlider label="Opacity" value={keyPressOpacity} min={0.05} max={1} step={0.05}
          display={Math.round(keyPressOpacity*100)+"%"} onChange={onKeyPressOpacity} />
        <MkbSlider label="Glow Strength" value={keyPressGlow} min={0} max={20} step={1}
          display={keyPressGlow+"px"} onChange={onKeyPressGlow} />

        <div className="flex flex-col gap-1.5 pt-1.5 mt-1 border-t border-border">
          {([1,2,3] as RgbStyle[]).map(s => (
            <button key={s} onClick={() => onRgbStyleChange(s)}
              className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-all text-left ${rgbStyle===s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
              Style {s} · {styleLabels[s]}
            </button>
          ))}
          <button onClick={() => onRainbowChange(!rainbow)}
            className="text-xs px-3 py-1.5 rounded-md border font-medium transition-all text-left"
            style={rainbow ? {background:"linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)",color:"#fff",borderColor:"transparent"} : {background:"var(--card)",borderColor:"var(--border)",color:"var(--muted-foreground)"}}>
            🌈 Rainbow {rainbow ? "(on)" : "(off)"}
          </button>
          <div className="flex items-center gap-2">
            <input type="color" value={colorLocal} onChange={e => handleColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5" />
            <span className="text-xs font-mono text-foreground/50">{colorLocal}</span>
            <span className="text-xs text-foreground/40">RGB Color</span>
          </div>
          <MkbSlider label="Glow Strength" value={kbOpacity} min={0.05} max={1} step={0.05}
            display={Math.round(kbOpacity*100)+"%"} onChange={onKbOpacity} />
        </div>
      </MkbDropdown>

      {/* Mouse appearance + RGB */}
      <MkbDropdown title="🖱️ Mouse">
        <div className="flex items-center gap-2">
          <input type="color" value={mouseColorLocal} onChange={e => handleMouseColorChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5" />
          <span className="text-xs font-mono text-foreground/50">{mouseColorLocal}</span>
        </div>
        <MkbSlider label="Opacity" value={mouseOpacity} min={0.05} max={1} step={0.05}
          display={Math.round(mouseOpacity*100)+"%"} onChange={onMouseOpacity} />
        <MkbSlider label="Glow Strength" value={mouseGlow} min={0} max={20} step={1}
          display={mouseGlow+"px"} onChange={onMouseGlow} />
        <MkbToggle label="Inner Fade" value={mouseInnerFade} onChange={onMouseInnerFade} />
        <MkbToggle label="Outer Fade" value={mouseOuterFade} onChange={onMouseOuterFade} />

        <div className="flex flex-col gap-1.5 pt-1.5 mt-1 border-t border-border">
          <MkbToggle label="Enable RGB" value={mouseRgbEnabled} onChange={onMouseRgbEnabled} />
          {mouseRgbEnabled && (
            <>
              <div className="grid grid-cols-2 gap-1">
                {(["wave","breathing"] as const).map(m=>(
                  <button key={m} onClick={()=>onMouseRgbMode(m)}
                    className={`text-xs px-1.5 py-1 rounded border transition-all ${mouseRgbMode===m?"bg-primary text-primary-foreground border-primary":"bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
                    {m==="wave"?"Wave":"Breathing"}
                  </button>
                ))}
              </div>
              <MkbSlider label="Speed" value={mouseRgbSpeed} min={1} max={20} step={0.5}
                display={`${mouseRgbSpeed}s`} onChange={onMouseRgbSpeed} />
              <MkbSlider label="Intensity" value={mouseRgbIntensity} min={0.05} max={1} step={0.05}
                display={`${Math.round(mouseRgbIntensity*100)}%`} onChange={onMouseRgbIntensity} />
              <MkbToggle label="Rainbow" value={mouseRgbRainbow} onChange={onMouseRgbRainbow} />
              {!mouseRgbRainbow && (
                <div className="flex items-center gap-2">
                  <input type="color" value={mouseRgbColorLocal} onChange={e=>handleMouseRgbColorChange(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5" />
                  <span className="text-xs font-mono text-foreground/50">{mouseRgbColorLocal}</span>
                </div>
              )}
            </>
          )}
        </div>
      </MkbDropdown>

      {/* Settings */}
      <MkbDropdown title="⚙️ Settings">
        <MkbToggle label="Snap Back to Center" value={mouseSnapBack} onChange={onMouseSnapBack} />
        <MkbToggle label="Drop Shadow" value={mkbShowShadow} onChange={onMkbShowShadow} />
        {mkbShowShadow && (
          <>
            <MkbSlider label="Intensity" value={mkbShadowIntensity} min={0.1} max={1} step={0.05}
              display={Math.round(mkbShadowIntensity*100)+"%"} onChange={onMkbShadowIntensity} />
            <MkbSlider label="Distance" value={mkbShadowDistance} min={1} max={40} step={1}
              display={mkbShadowDistance+"px"} onChange={onMkbShadowDistance} />
            <MkbSlider label="Angle" value={mkbShadowAngle} min={0} max={360} step={1}
              display={mkbShadowAngle+"°"} onChange={onMkbShadowAngle} />
          </>
        )}
      </MkbDropdown>
      </div>{/* end scrollable content */}

      {/* Export — pinned at bottom */}
      <div className="space-y-1 pt-1 border-t border-border">
        <p className="text-[10px] text-muted-foreground/50">OBS Browser Source: 1920×1080</p>
        <button onClick={onExport} disabled={exporting}
          className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/30 disabled:opacity-60 disabled:cursor-wait">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {exporting ? "Exporting…" : "Export HTML for OBS"}
        </button>
      </div>
    </div>
  );
}
