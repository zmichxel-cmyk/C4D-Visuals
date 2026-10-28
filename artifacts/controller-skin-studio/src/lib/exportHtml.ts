import { ControllerConfig, LayoutOverrides } from "../types/config";
import { LAYOUTS } from "./layouts";
import { WATERMARK_DATA_URL } from "./watermarkData";
import { watermarkCenterY, WATERMARK_LOGO_CENTER_IN_VIDEO } from "./watermarkPosition";

const DEAD_ZONE = 0.06;

async function toDataUrl(url: string): Promise<string> {
  // fetch() resolves relative URLs against the current document on its own —
  // manually prepending window.location.origin used to be needed, but breaks
  // under Electron's file:// protocol (origin serializes as the literal
  // string "file://" with no path, producing "file:///sticks/x.png" instead
  // of the correct location). Stripping a leading slash and letting fetch()
  // resolve it naturally works correctly in both the dev server and the
  // packaged app.
  const resolvedUrl = url.startsWith("http") || url.startsWith("blob:") || url.startsWith("data:")
    ? url
    : url.startsWith("/") ? url.slice(1) : url;
  try {
    const resp = await fetch(resolvedUrl);
    if (!resp.ok) {
      console.error(`[exportHtml] Failed to fetch "${resolvedUrl}" — status ${resp.status}`);
      return "";
    }
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error(`[exportHtml] Failed to fetch "${resolvedUrl}":`, err);
    return "";
  }
}

// ── Export obfuscation ───────────────────────────────────────────────────
// Strips comments/whitespace and renames known top-level helper functions in
// the exported overlay's embedded <script>, so the downloaded HTML isn't
// trivially readable. This is a hand-written, string/comment-aware pass (not
// a full JS parser) — it walks the source character by character so it never
// touches the contents of string or template literals (critical: those
// contain getElementById() id strings like 'lstick-wrap' that must exactly
// match the HTML, and CSS custom property names like '--c'/'--cx'). Renaming
// is limited to a fixed, manually-verified list of top-level function names
// that are only ever called by name within this same script (no
// window.fnName references, no string-based lookups), so there's no risk of
// a rename silently breaking the export.
function minifyJs(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  let lastWasSpace = false;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i]; i++;
      }
      if (i < n) { out += src[i]; i++; }
      lastWasSpace = false;
      continue;
    }

    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }

    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      if (!lastWasSpace) { out += " "; lastWasSpace = true; }
      i++;
      continue;
    }

    out += c;
    lastWasSpace = false;
    i++;
  }
  return out.trim();
}

// Renames whole-word identifier occurrences outside of string/template
// literals. Only ever called with the verified-safe function-name map below.
function renameIdentifiers(src: string, renameMap: Record<string, string>): string {
  let out = "";
  let i = 0;
  const n = src.length;
  const isIdentChar = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

  while (i < n) {
    const c = src[i];

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i]; i++;
      }
      if (i < n) { out += src[i]; i++; }
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && isIdentChar(src[j])) j++;
      const word = src.slice(i, j);
      out += renameMap[word] !== undefined ? renameMap[word] : word;
      i = j;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

// Manually verified: every one of these is a top-level function in the
// export's outer IIFE, called only by its own name within that same scope.
// Do not add names here without re-checking for collisions with nested
// function scopes (e.g. "tick" and "getC" are reused inside separate nested
// IIFEs for different purposes and must NOT be renamed via this map).
const EXPORT_FN_RENAME_MAP: Record<string, string> = {
  hexToRgba: "_hrgba",
  twoToneBg: "_ttbg",
  dead: "_dz",
  applyBtn: "_abtn",
  applyStickTilt: "_astk",
  poll: "_poll",
};

function obfuscateScript(js: string): string {
  return minifyJs(renameIdentifiers(js, EXPORT_FN_RENAME_MAP));
}

// Build-time hex+alpha → rgba() string, for baking STATIC (non-gamepad-
// reactive) colors directly into generated CSS — e.g. the thumbstick rim
// highlight/drop shadow, which never change at runtime, unlike button/stick
// press colors which are computed in the export's own runtime JS instead.
function hexToRgbaStatic(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Build-time hex → [hue, saturation%, lightness%] — mirrors
// BodyEffectOverlay.tsx's hexToHsl exactly (same fallback [270,80,55] for an
// invalid/missing hex). Used to bake the Fire glow's actual color (not a
// hardcoded 90%/50% stand-in) into the export.
function hexToHslStatic(hex: string): [number, number, number] {
  if (!hex.startsWith("#") || hex.length !== 7) return [270, 80, 55];
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

export async function generateExportHtml(config: ControllerConfig, overrides: LayoutOverrides): Promise<string> {
  const baseLayout = LAYOUTS[config.controllerType];
  const SHIFT_BOX_UP = ["c4d4","c4d5","c4d5-edge"].includes(config.controllerType);

  // Disconnected-box px values below are scaled relative to the export
  // canvas width so the box stays the same proportion of the controller as
  // it is in the app preview (whose container caps at 768px), no matter
  // what OBS export width (config.width) is chosen.
  const vw = (px: number) => `${(px / 768 * 100).toFixed(3)}vw`;

  const buttons = baseLayout.buttons.map((b) => ({
    ...b,
    ...(overrides.buttons[b.index] ?? {}),
  }));
  const sticks = baseLayout.sticks.map((s, i) => ({
    ...s,
    ...(overrides.sticks[i] ?? {}),
  }));

  const lStick = sticks[0];
  const rStick = sticks[1];


  // ── Output dimensions — derive height from skin aspect ratio,
  //    exactly like the live preview's `aspectRatio: skinWidth/skinHeight` ──
  const EXPORT_W = config.width;
  const EXPORT_H = Math.round(EXPORT_W * baseLayout.skinHeight / baseLayout.skinWidth);
  const scale = EXPORT_W / baseLayout.skinWidth;
  const renderedImgW = baseLayout.skinWidth * scale;
  const renderedImgH = baseLayout.skinHeight * scale;

  // ── Embed CROPPED mask images as base64 — matches ControllerPreview's
  //    masks-cropped/ approach, sized 100% 100% ─────────────────────────────
  const maskDataUrls: Record<number, string> = {};
  await Promise.all(
    buttons.map(async (btn) => {
      const maskDef = baseLayout.buttonMasks[btn.index];
      if (maskDef) {
        const croppedUrl = maskDef.url.replace("masks/", "masks-cropped/");
        maskDataUrls[btn.index] = await toDataUrl(croppedUrl);
      }
    })
  );

  // ── Embed skin images too ────────────────────────────────────────────────
  const [skinDataUrl, leftStickDataUrl, rightStickDataUrl, rgbBodyMaskDataUrl] = await Promise.all([
    config.controllerSkin ? toDataUrl(config.controllerSkin) : Promise.resolve(""),
    config.leftStickSkin  ? toDataUrl(config.leftStickSkin)  : Promise.resolve(""),
    config.rightStickSkin ? toDataUrl(config.rightStickSkin) : Promise.resolve(""),
    config.rgbBodyEnabled && baseLayout.bodyMaskUrl ? toDataUrl(baseLayout.bodyMaskUrl) : Promise.resolve(""),
  ]);

  const MAX_OP = config.buttonOpacity;
  const BTN_COLOR_OPACITY = config.buttonColorOpacity ?? 1;
  const BTN_GLOW_INTENSITY = config.buttonGlowIntensity ?? 1;
  const GLOW = config.glowEnabled;
  const GLOW_SIZE = config.glowSize;
  const BTN_MODE = config.buttonColorMode;
  const INNER_COLOR = config.buttonColorInner;
  const OUTER_COLOR = config.buttonColorOuter;
  const STROKE_ENABLED = config.strokeEnabled;
  const STROKE_WIDTH = config.strokeWidth;
  const STROKE_COLOR = config.strokeColor;
  const PER_BTN = config.usePerButtonColors;
  const DEF_COLOR = config.buttonColor;
  const TRAVEL = config.stickTravel * (EXPORT_W / 1280);
  // Body effects — independent toggles (not mutually exclusive), same
  // pattern as the thumbstick effects, so any combination can run at once.
  const BODY_EFFECTS_ENABLED: { id: string; enabled: boolean }[] = [
    { id: "pulseGlow", enabled: config.bodyEffectPulseGlowEnabled },
    { id: "particles", enabled: config.bodyEffectParticlesEnabled },
    { id: "fire", enabled: config.bodyEffectFireEnabled },
    { id: "reactive", enabled: config.bodyEffectReactiveEnabled },
    { id: "reactiveFire", enabled: config.bodyEffectReactiveFireEnabled },
    { id: "particleBurst", enabled: config.bodyEffectParticleBurstEnabled },
  ];
  const ANY_BODY_EFFECT = BODY_EFFECTS_ENABLED.some(e => e.enabled);
  const BODY_EFFECT_SPEED = config.bodyEffectSpeed;
  const BODY_EFFECT_INTENSITY = config.bodyEffectIntensity;
  const RGB_BODY_ENABLED = config.rgbBodyEnabled && !!rgbBodyMaskDataUrl;
  const RGB_BODY_SPEED = config.rgbBodySpeed;
  const RGB_BODY_MODE = config.rgbBodyMode;
  const RGB_BODY_INTENSITY = config.rgbBodyIntensity;
  const RGB_BODY_COLOR = config.rgbBodyMode === "breathing" ? config.rgbBodyBreathingColor : config.rgbBodyWaveColor;
  const RGB_BODY_RAINBOW = config.rgbBodyMode === "breathing" ? config.rgbBodyBreathingRainbow : config.rgbBodyWaveRainbow;

  // ── Shared button position/press-state data for reactive body effects
  //    (reactive ripple, orbit trail, lightning strike, RGB body "reactive"
  //    mode) — mirrors the `buttonPositions`/`pressedButtons` props consumed
  //    by BodyEffectOverlay.tsx / RgbBodyCanvas.tsx in the live preview.
  const skinAspect = EXPORT_H / EXPORT_W;
  const btnPositionsForEffects: Record<number, { x: number; y: number; size: number; shape: string; maskSw?: number; maskSh?: number; skinAspect?: number }> = {};
  buttons.forEach((btn) => {
    const maskDef = baseLayout.buttonMasks[btn.index];
    const btnOverride = overrides.buttons[btn.index];
    const defaultX = maskDef ? maskDef.cx : btn.x;
    const defaultY = maskDef ? maskDef.cy : btn.y;
    btnPositionsForEffects[btn.index] = {
      x: btnOverride?.x !== undefined ? btnOverride.x : defaultX,
      y: btnOverride?.y !== undefined ? btnOverride.y : defaultY,
      size: btnOverride?.size !== undefined ? btnOverride.size : btn.size,
      shape: btn.shape,
      ...(maskDef ? { maskSw: maskDef.sw, maskSh: maskDef.sh, skinAspect } : {}),
    };
  });
  // Thumbstick clicks (L3/R3) — mirrors ControllerPreview.tsx's sticks.forEach,
  // which was missing here entirely, so reactive body effects had no position
  // to draw at when a stick was clicked in.
  sticks.forEach((s) => {
    btnPositionsForEffects[s.pressBtn] = { x: s.x, y: s.y, size: s.size, shape: "circle" };
  });

  // ── Per-button CSS — mirrors ControllerPreview.tsx's CURRENT button system
  //    exactly (isTouchpadTest is permanently true there — this is not the
  //    older solid-fill model). Each pressed button is a genuinely hollow
  //    ring (via mask-composite exclude, real photographed silhouette for
  //    masked buttons) plus a soft outside-only glow, a separate dark
  //    press-tint layer, and an optional Fill/stroke outline — nothing is
  //    ever painted solid across the button's own face. --c carries
  //    whichever color the ring/glow tints off (two-tone uses its Inner
  //    color only — the two-tone gradient itself is dead code in the live
  //    preview since isTouchpadTest never takes that branch, so it's
  //    intentionally not reproduced here either).
  const RING_GAP_PX = 6;
  const btnCss = buttons.map((btn) => {
    const maskDef = baseLayout.buttonMasks[btn.index];
    const color = BTN_MODE === "twoTone" ? INNER_COLOR
      : (PER_BTN ? (baseLayout.buttonColors[btn.index] ?? DEF_COLOR) : DEF_COLOR);
    const maskUrl = maskDataUrls[btn.index];

    const hPct = btn.shape === "pill-h" || btn.shape === "rect" ? btn.size * 0.45 : btn.size;

    // Natural size from shape pixel bounds (mirrors ControllerPreview natW/natH)
    const natW = maskDef ? (maskDef.sw / 100) * renderedImgW / EXPORT_W * 100 : btn.size;
    const natH = maskDef ? (maskDef.sh / 100) * renderedImgH / EXPORT_H * 100 : hPct;

    // Position + size with overrides applied
    const btnOverride = overrides.buttons[btn.index];
    const defaultX = maskDef ? maskDef.cx : btn.x;
    const defaultY = maskDef ? maskDef.cy : btn.y;
    const posX = btnOverride?.x !== undefined ? btnOverride.x : defaultX;
    const posY = btnOverride?.y !== undefined ? btnOverride.y : defaultY;
    const finalW = btnOverride?.size !== undefined ? btnOverride.size : natW;
    const finalH = natH * (finalW / natW);

    const wrapRule = `
  [data-wrap="${btn.index}"] {
    left: ${posX}%; top: ${posY}%;
    width: ${finalW}%; height: ${finalH}%;
    transform: translate(-50%,-50%);
    position: absolute;
    --c: ${color};
    --c2: ${OUTER_COLOR};
  }`;

    if (maskUrl) {
      const strokeRule = STROKE_ENABLED ? `
  [data-stroke="${btn.index}"] {
    position: absolute;
    inset: -${STROKE_WIDTH}px;
    background: ${STROKE_COLOR};
    -webkit-mask-image: url("${maskUrl}");
    mask-image: url("${maskUrl}");
    -webkit-mask-size: 100% 100%;
    mask-size: 100% 100%;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }` : "";
      // Ring: fixed-pixel gap (not a percentage) so the ring stays
      // uniform-width regardless of the button's aspect ratio — mirrors
      // ControllerPreview.tsx's ringGapPx exactly. The outer cutout mask
      // punches a hole exactly the button's true (unenlarged) shape out of
      // an otherwise-opaque, generously-oversized box, so the glow's own
      // blur bleed never paints inside the real face; the mid layer holds
      // the actual filter (drop-shadow stack) since filter+mask-image on
      // the same element clips the blur to nothing in this engine.
      return `${wrapRule}${strokeRule}
  [data-dark="${btn.index}"] {
    position: absolute;
    inset: 0;
    -webkit-mask-image: url("${maskUrl}");
    mask-image: url("${maskUrl}");
    -webkit-mask-size: 100% 100%;
    mask-size: 100% 100%;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }
  [data-ringouter="${btn.index}"] {
    position: absolute;
    inset: -160px;
    -webkit-mask-image: linear-gradient(black, black), url("${maskUrl}");
    mask-image: linear-gradient(black, black), url("${maskUrl}");
    -webkit-mask-size: 800px 800px, calc(100% - 320px) calc(100% - 320px);
    mask-size: 800px 800px, calc(100% - 320px) calc(100% - 320px);
    -webkit-mask-position: center, center;
    mask-position: center, center;
    -webkit-mask-repeat: no-repeat, no-repeat;
    mask-repeat: no-repeat, no-repeat;
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
    display: none;
  }
  [data-ringmid="${btn.index}"] {
    position: absolute;
    inset: 160px;
  }
  [data-ring="${btn.index}"] {
    position: absolute;
    inset: 0;
    -webkit-mask-image: url("${maskUrl}"), url("${maskUrl}");
    mask-image: url("${maskUrl}"), url("${maskUrl}");
    -webkit-mask-size: 100% 100%, calc(100% - ${RING_GAP_PX * 2}px) calc(100% - ${RING_GAP_PX * 2}px);
    mask-size: 100% 100%, calc(100% - ${RING_GAP_PX * 2}px) calc(100% - ${RING_GAP_PX * 2}px);
    -webkit-mask-position: center, center;
    mask-position: center, center;
    -webkit-mask-repeat: no-repeat, no-repeat;
    mask-repeat: no-repeat, no-repeat;
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
  }`;
    }

    // Geometric fallback — no real mask to follow, so a plain box-shadow
    // glow on a border-radius shape is the simplest equivalent, exactly
    // like ControllerPreview.tsx's own geometric fallback.
    const radius = btn.shape === "circle" || btn.shape.startsWith("cross")
      ? "50%" : btn.shape === "rect" ? "8px" : "9999px";
    const strokeRuleGeo = STROKE_ENABLED ? `
  [data-stroke="${btn.index}"] {
    position: absolute;
    inset: -${STROKE_WIDTH}px;
    background: ${STROKE_COLOR};
    border-radius: ${radius};
  }` : "";
    return `${wrapRule}${strokeRuleGeo}
  [data-dark="${btn.index}"] {
    position: absolute;
    inset: 0;
    border-radius: ${radius};
  }
  [data-geoglow="${btn.index}"] {
    position: absolute;
    inset: 0;
    border-radius: ${radius};
    background: transparent;
  }`;
  }).join("");

  const isMasked = (idx: number) => !!maskDataUrls[idx];
  const btnHtml = buttons.map((btn) => {
    const strokeHtml = STROKE_ENABLED ? `<div class="btn-stroke" data-stroke="${btn.index}"></div>` : "";
    const glowHtml = isMasked(btn.index)
      ? `<div class="btn-ring-outer" data-ringouter="${btn.index}"><div class="btn-ring-mid" data-ringmid="${btn.index}"><div class="btn-ring" data-ring="${btn.index}"></div></div></div>`
      : `<div class="btn-geo-glow" data-geoglow="${btn.index}"></div>`;
    return `<div class="btn-wrap" data-wrap="${btn.index}">${strokeHtml}<div class="btn-dark" data-dark="${btn.index}"></div>${glowHtml}</div>`;
  }).join("\n    ");

  // Video skins are stored as `data:video/...` (uploaded via FileReader.readAsDataURL)
  // — never `blob:` in practice, since blob: URLs don't survive a reload and get
  // stripped before persisting. Mirrors the canonical isVideoSkin() helper in
  // SkinPanel.tsx / MkbView.tsx. (Previously this checked config.controllerSkin for
  // a "blob:" prefix, which uploaded video skins never actually have — silently
  // treating every video skin as a static image and rendering nothing for the body.)
  const isVideoSkin = !!config.controllerSkin &&
    (config.controllerSkin.startsWith("data:video/") || config.controllerSkin.startsWith("blob:") ||
     config.controllerSkin.endsWith(".webm") || config.controllerSkin.endsWith(".mp4"));
  const controllerBg = (!isVideoSkin && skinDataUrl) ? `url("${skinDataUrl}") center/contain no-repeat` : "none";
  const videoFit = config.controllerSkinVideoFit ?? "contain";
  // Color correction goes on a wrapper div, NOT the <video> itself — applying a
  // CSS filter directly to <video> makes Chrome composite it onto a white
  // offscreen buffer first, washing out the colors. Mirrors ControllerPreview.tsx.
  const videoFilter = [
    config.controllerSkinContrast !== 1 ? `contrast(${config.controllerSkinContrast})` : "",
    config.controllerSkinSaturate !== 1 ? `saturate(${config.controllerSkinSaturate})` : "",
  ].filter(Boolean).join(" ");
  const leftStickImg = leftStickDataUrl
    ? `<img src="${leftStickDataUrl}" class="stick-img" id="lstick-img" />`
    : `<div class="stick-fallback" id="lstick-img"></div>`;
  const rightStickImg = rightStickDataUrl
    ? `<img src="${rightStickDataUrl}" class="stick-img" id="rstick-img" />`
    : `<div class="stick-fallback" id="rstick-img"></div>`;

  // Stick drop shadow + rim highlight — both fully static (config-driven,
  // never change at runtime unlike press glow/dark), so baked directly into
  // inline styles here rather than updated by the export's JS. Mirrors
  // ControllerPreview.tsx's Layer 1 (shadow) / Layer 3 (highlight) exactly —
  // previously missing from the export entirely.
  const stickShadowAngleRad = ((config.stickShadowAngle ?? 135) * Math.PI) / 180;
  const stickShadowDist = config.stickShadowDistance ?? 10;
  const stickSdx = Math.sin(stickShadowAngleRad) * stickShadowDist;
  const stickSdy = Math.cos(stickShadowAngleRad) * stickShadowDist;
  const stickShadowIntensity = config.stickShadowIntensity ?? 0.65;
  const stickShadowHtml = (config.stickShadowEnabled ?? true)
    ? `<div style="position:absolute;inset:0;border-radius:50%;box-shadow:${stickSdx}px ${stickSdy}px ${stickShadowDist * 1.8}px rgba(0,0,0,${stickShadowIntensity}), ${stickSdx * 0.4}px ${stickSdy * 0.4}px ${stickShadowDist * 0.6}px rgba(0,0,0,${Math.min(stickShadowIntensity + 0.15, 1)})"></div>`
    : "";
  const stickHighlightColor = config.stickHighlightColor ?? "#ffffff";
  const stickHighlightIntensity = config.stickHighlightIntensity ?? 0.35;
  const stickHighlightHtml = (config.stickHighlightEnabled ?? true)
    ? `<div style="position:absolute;inset:0;border-radius:50%;pointer-events:none;background:radial-gradient(circle, transparent 52%, ${hexToRgbaStatic(stickHighlightColor, stickHighlightIntensity * 0.65)} 68%, ${hexToRgbaStatic(stickHighlightColor, stickHighlightIntensity)} 78%, transparent 90%)"></div>`
    : "";

  // Stick press colors — user-configurable per stick, optionally linked
  const lStickColor = config.leftStickColor;
  const rStickColor = config.linkStickColors ? config.leftStickColor : config.rightStickColor;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${config.overlayName || "Controller Overlay"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:transparent; overflow:hidden; font-family:'Inter', sans-serif; }
  body { width:${EXPORT_W}px; height:${EXPORT_H}px; }

  #controller { position:relative; width:100%; height:100%; }
  /* Blur wrapper — blurs all controller content when disconnected, but NOT the
     "No controller detected" box below, which is a sibling that renders on top
     unblurred (mirrors ControllerPreview.tsx's blur-wrapper structure). */
  #controller-blur-wrap { position:absolute; inset:0; filter:blur(4px); transition:filter 0.4s ease; }
  #controller.connected #controller-blur-wrap { filter:none; }
  #controller-skin { position:absolute; inset:0; width:100%; height:100%; background:${controllerBg}; pointer-events:none; }
  #controller-video-wrap { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
  #controller-video { width:100%; height:100%; object-fit:${videoFit}; display:block; background:transparent; }
  /* Drop shadow — a standalone silhouette layer rendered BEHIND both the RGB
     glow and the controller art (see markup order below). Previously this was
     a filter:drop-shadow() on #controller-skin itself; since that element
     paints above #rgb-body in stacking order, the dark shadow silhouette was
     compositing directly over the glow and dimming it heavily. Rendering the
     shadow as its own bottom-most layer keeps it fully independent. */
  .controller-shadow-layer { position:absolute; inset:0; width:100%; height:100%; background:${controllerBg}; pointer-events:none; }

  /* Wrapper: holds position/size only — nothing is ever painted solid across
     a button's own face, matching ControllerPreview.tsx's current (ring +
     glow + dark-tint, no fill) button system exactly. */
  .btn-wrap {
    pointer-events:none;
  }

  /* Fill/stroke layer: enlarged duplicate mask, the only persistent-color
     layer — controlled by the Fill toggle + its own opacity, independent of
     the ring/glow. */
  .btn-stroke {
    pointer-events:none;
    opacity:0;
    transition: opacity .04s;
  }

  /* Dark press-tint layer — same translucent shade as a keyboard key press,
     sized to the button's true shape. */
  .btn-dark {
    pointer-events:none;
  }

  /* Ring/glow (masked buttons): outer holds the cutout mask (no filter of
     its own, so it isn't subject to the filter+mask-same-element clipping
     bug); mid holds the actual drop-shadow filter stack; inner is the
     hollow ring itself. */
  .btn-ring-outer { pointer-events:none; }
  .btn-ring-mid { pointer-events:none; }
  .btn-ring { pointer-events:none; }

  /* Ring/glow (geometric fallback) — plain box-shadow on a border-radius shape. */
  .btn-geo-glow { pointer-events:none; }

  ${btnCss}

  .stick-wrap {
    position:absolute;
    transform:translate(-50%,-50%);
    perspective: 120px;
  }
  #lstick-wrap { left:${lStick.x}%; top:${lStick.y}%; width:${lStick.size}%; height:${lStick.size * (EXPORT_W / EXPORT_H)}%; }
  #rstick-wrap { left:${rStick.x}%; top:${rStick.y}%; width:${rStick.size}%; height:${rStick.size * (EXPORT_W / EXPORT_H)}%; }
  /* .stick-inner itself is NOT clipped — clipping the stick image to a
     circle happens one level deeper, in .stick-img-clip, specifically so
     that comet/electric/spark/press-glow/press-dark can be REAL DOM
     CHILDREN of .stick-inner (siblings of .stick-img-clip) and still bleed
     outward past the rim. This matters for more than just clipping: under
     CSS 3D perspective, rotating a LARGER box by the same rotateX/rotateY
     angle around the same center as a SMALLER box does NOT perspective-
     project identically — foreshortening is distance-based, not a plain
     linear scale, so the two boxes visibly diverge (the ring reads as
     shifted/ovaled relative to the rim) the more the stick tilts. Nesting
     the enlarged wrappers as children of the SAME rotated element as the
     stick image (one rigid transformed subtree, exactly like
     ControllerPreview.tsx already does) avoids ever needing to apply a
     second independent copy of the same rotation to a differently-sized
     box, which is what caused that drift — copying .stick-inner's
     transform onto separate sibling wrappers, even in perfect sync, was
     never going to look right at a tilt. */
  .stick-inner { width:100%; height:100%; border-radius:50%; transform-style:preserve-3d; transition: transform .04s ease-out, filter .04s; }
  .stick-img-clip { position:absolute; inset:0; border-radius:50%; overflow:hidden; }
  .stick-img,.stick-fallback { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
  /* Press darken — same dark translucent shade the face buttons get when
     pressed. Rendered ABOVE the glow (after .stick-press-glow in the
     markup) since the glow's drop-shadow fills the whole face and would
     otherwise wash the dim out. */
  .stick-press-dark { position:absolute; inset:0; border-radius:50%; pointer-events:none; background:rgba(0,0,0,0); transition: background .04s ease-out; }
  .stick-fallback { background:rgba(255,255,255,.12); border:2px solid rgba(255,255,255,.25); box-sizing:border-box; }
  /* Comet LED wrapper — enlarged 24% beyond the stick's own box so the ring's
     glow can bleed outward past the rim without being clipped by the canvas
     bounds. Mirrors ControllerPreview.tsx's inline inset (-12% each side). */
  .stick-comet-wrap { position:absolute; inset:-12%; pointer-events:none; }
  .stick-comet-wrap canvas { width:100%; height:100%; display:block; }
  /* Electric wrapper — enlarged 40% beyond the stick's own box (more room
     than the comet's since arcing bolts jump further out). Mirrors
     ControllerPreview.tsx's inline inset (-20% each side). */
  .stick-electric-wrap { position:absolute; inset:-20%; pointer-events:none; }
  .stick-electric-wrap canvas { width:100%; height:100%; display:block; }
  /* Spark wrapper — comet-style head/trail that also flings off sparks as it
     travels, enlarged a bit more than the plain comet's own margin since
     sparks fly outward further. Mirrors ControllerPreview.tsx's inline inset
     (-17.5% each side, matching SPARK_CONTAINER_SCALE = 1.35). */
  .stick-spark-wrap { position:absolute; inset:-17.5%; pointer-events:none; }
  .stick-spark-wrap canvas { width:100%; height:100%; display:block; }
  /* Press glow — layered box-shadow, same recipe as ControllerPreview.tsx's
     pressBoxShadow, scaled by stickGlowIntensity. */
  .stick-press-glow { position:absolute; inset:0; border-radius:50%; pointer-events:none; transition: box-shadow .04s; }


  #disconnected-msg {
    position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    pointer-events:none;
    transition: opacity 0.4s;
  }
  #disconnected-box {
    background:rgba(10,10,14,0.85);
    border:1px solid rgba(255,255,255,0.10);
    border-radius:${vw(16)};
    padding:${vw(22)} ${vw(32)};
    backdrop-filter:blur(${vw(10)});
    -webkit-backdrop-filter:blur(${vw(10)});
    text-align:center;
    box-shadow:0 ${vw(8)} ${vw(32)} rgba(0,0,0,0.9), 0 ${vw(2)} ${vw(8)} rgba(0,0,0,0.8), 0 0 0 ${vw(1)} rgba(255,255,255,0.06);
    min-width:${vw(220)};
    ${config.controllerType === "c4d4" ? "margin-bottom:10%;" : SHIFT_BOX_UP ? "margin-bottom:14%;" : ""}
  }
  #disconnected-box img { width:${vw(160)}; margin:0 auto ${vw(14)}; display:block; }
  #disconnected-box .title { font-size:${vw(12)}; font-weight:600; color:rgba(255,255,255,0.9); margin:0 0 ${vw(5)}; }
  #disconnected-box .sub { font-size:${vw(10)}; color:rgba(255,255,255,0.45); margin:0; }

  /* Animated body effects — masked to the controller skin's silhouette.
     Class selector (not an id) since multiple effects can now run at once,
     each in its own stacked div sharing this same styling. */
  .body-effect {
    position:absolute; inset:0; pointer-events:none; overflow:hidden;
    -webkit-mask-image:${(!isVideoSkin && controllerBg !== "none") ? `url("${skinDataUrl}")` : "none"};
    mask-image:${(!isVideoSkin && controllerBg !== "none") ? `url("${skinDataUrl}")` : "none"};
    -webkit-mask-size:contain; mask-size:contain;
    -webkit-mask-position:center; mask-position:center;
    -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  }
  .body-effect canvas { width:100%; height:100%; display:block; mix-blend-mode:screen; }
  /* Black backdrop — same silhouette mask as #rgb-body, filled solid black so
     there's no transparency showing through behind the RGB glow (mirrors the
     mouse/keyboard RGB backdrop treatment; see ControllerPreview.tsx). */
  #rgb-body-black {
    position:absolute; inset:0; pointer-events:none; background:#000;
    -webkit-mask-image:${RGB_BODY_ENABLED ? `url("${rgbBodyMaskDataUrl}")` : "none"};
    mask-image:${RGB_BODY_ENABLED ? `url("${rgbBodyMaskDataUrl}")` : "none"};
    -webkit-mask-size:contain; mask-size:contain;
    -webkit-mask-position:center; mask-position:center;
    -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  }
  #rgb-body {
    position:absolute; inset:0; pointer-events:none; overflow:hidden;
    -webkit-mask-image:${RGB_BODY_ENABLED ? `url("${rgbBodyMaskDataUrl}")` : "none"};
    mask-image:${RGB_BODY_ENABLED ? `url("${rgbBodyMaskDataUrl}")` : "none"};
    -webkit-mask-size:contain; mask-size:contain;
    -webkit-mask-position:center; mask-position:center;
    -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  }
  #rgb-body canvas { width:100%; height:100%; display:block; }
  #watermark-canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
</style>
</head>
<body>
<div id="controller">
<div id="controller-blur-wrap">
  ${config.showShadow ? (() => {
    const rad = (config.shadowAngle * Math.PI) / 180;
    const dist = config.shadowDistance ?? 16;
    const x = Math.round(Math.sin(rad) * dist);
    const y = Math.round(-Math.cos(rad) * dist);
    const a = config.shadowIntensity;
    return `<div class="controller-shadow-layer" style="filter:brightness(0) blur(24px);opacity:${a};transform:translate(${x}px,${y}px)"></div>
  <div class="controller-shadow-layer" style="filter:brightness(0) blur(8px);opacity:${Math.min(a+0.1,1)};transform:translate(${Math.round(x*0.4)}px,${Math.round(y*0.4)}px)"></div>`;
  })() : ""}
  ${RGB_BODY_ENABLED ? `<div id="rgb-body-black"></div><div id="rgb-body"><canvas id="rgb-body-canvas"></canvas></div>` : ""}
  <div id="controller-skin"></div>
  ${isVideoSkin ? `<div id="controller-video-wrap"${videoFilter ? ` style="filter:${videoFilter}"` : ""}><video id="controller-video" src="${skinDataUrl}" autoplay ${config.controllerSkinLoop ? "loop" : ""} muted playsinline></video></div>` : ""}
  ${BODY_EFFECTS_ENABLED.filter(e => e.enabled).map(e => `<div class="body-effect" id="body-effect-${e.id}"><canvas id="body-effect-canvas-${e.id}"></canvas></div>`).join("")}
  ${btnHtml}
  <div class="stick-wrap" id="lstick-wrap"><div class="stick-inner" id="lstick-inner">${stickShadowHtml}<div class="stick-img-clip">${leftStickImg}</div>${stickHighlightHtml}${config.leftStickCometEnabled ? `<div class="stick-comet-wrap"><canvas id="lstick-comet"></canvas></div>` : ""}${config.leftStickElectricEnabled ? `<div class="stick-electric-wrap"><canvas id="lstick-electric"></canvas></div>` : ""}${config.leftStickSparkEnabled ? `<div class="stick-spark-wrap"><canvas id="lstick-spark"></canvas></div>` : ""}<div class="stick-press-glow" id="lstick-press-glow"></div><div class="stick-press-dark" id="lstick-press-dark"></div></div></div>
  <div class="stick-wrap" id="rstick-wrap"><div class="stick-inner" id="rstick-inner">${stickShadowHtml}<div class="stick-img-clip">${rightStickImg}</div>${stickHighlightHtml}${config.rightStickCometEnabled ? `<div class="stick-comet-wrap"><canvas id="rstick-comet"></canvas></div>` : ""}${config.rightStickElectricEnabled ? `<div class="stick-electric-wrap"><canvas id="rstick-electric"></canvas></div>` : ""}${config.rightStickSparkEnabled ? `<div class="stick-spark-wrap"><canvas id="rstick-spark"></canvas></div>` : ""}<div class="stick-press-glow" id="rstick-press-glow"></div><div class="stick-press-dark" id="rstick-press-dark"></div></div></div>
</div><!-- end controller-blur-wrap -->
  <div id="disconnected-msg">
    <div id="disconnected-box">
      <img src="data:image/png;base64,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" alt="Customs4daez"/>
      <p class="title">No controller detected</p>
      <p class="sub">Press any button on your controller</p>
    </div>
  </div>
</div>
${config.showWatermark ? `` : ""}

<script>
(function(){
  var DEAD=${DEAD_ZONE}, TRAVEL=${TRAVEL}, MAX_OP=${MAX_OP};
  var BTN_COLOR_OPACITY=${BTN_COLOR_OPACITY};
  var BTN_GLOW_INTENSITY=${BTN_GLOW_INTENSITY};
  var GLOW=${GLOW}, GLOW_SIZE=${GLOW_SIZE};
  var BTN_MODE="${BTN_MODE}";
  var DEF_COLOR="${DEF_COLOR}";
  var L_STICK_COLOR="${lStickColor}";
  var R_STICK_COLOR="${rStickColor}";
  var L_PRESS_BTN=${lStick.pressBtn};
  var R_PRESS_BTN=${rStick.pressBtn};
  var STICK_OPACITY=${config.stickOpacity ?? 1};
  var STICK_GLOW=${config.stickGlowEnabled ? "true" : "false"};
  var STICK_GLOW_SIZE=${config.stickGlowSize ?? 8};
  var STICK_GLOW_INTENSITY=${config.stickGlowEnabled ? (config.stickGlowIntensity ?? 0.85) : 0};
  var L_COMET_ENABLED=${config.leftStickCometEnabled ? "true" : "false"};
  var L_COMET_COLOR="${config.leftStickCometColor || "#00e5ff"}";
  var L_COMET_SPEED=${config.leftStickCometSpeed ?? 3};
  var R_COMET_ENABLED=${config.rightStickCometEnabled ? "true" : "false"};
  var R_COMET_COLOR="${config.rightStickCometColor || "#00e5ff"}";
  var R_COMET_SPEED=${config.rightStickCometSpeed ?? 3};
  var L_ELECTRIC_ENABLED=${config.leftStickElectricEnabled ? "true" : "false"};
  var L_ELECTRIC_COLOR="${config.leftStickElectricColor || "#4de2ff"}";
  var L_ELECTRIC_SPEED=${config.leftStickElectricSpeed ?? 3};
  var R_ELECTRIC_ENABLED=${config.rightStickElectricEnabled ? "true" : "false"};
  var R_ELECTRIC_COLOR="${config.rightStickElectricColor || "#4de2ff"}";
  var R_ELECTRIC_SPEED=${config.rightStickElectricSpeed ?? 3};
  var L_SPARK_ENABLED=${config.leftStickSparkEnabled ? "true" : "false"};
  var L_SPARK_COLOR="${config.leftStickSparkColor || "#ff9d3c"}";
  var L_SPARK_SPEED=${config.leftStickSparkSpeed ?? 3};
  var R_SPARK_ENABLED=${config.rightStickSparkEnabled ? "true" : "false"};
  var R_SPARK_COLOR="${config.rightStickSparkColor || "#ff9d3c"}";
  var R_SPARK_SPEED=${config.rightStickSparkSpeed ?? 3};

  // Shared across the RGB-body and body-effect sub-IIFEs below (closures
  // over the same mutable objects) so reactive effects can react to live
  // gamepad button presses without re-polling the gamepad themselves.
  var pressedButtons = {};
  var btnPositions = ${JSON.stringify(btnPositionsForEffects)};
  function buttonHWHH(pos, w){
    if(pos.shape === 'rect' && pos.maskSw != null && pos.maskSh != null && pos.skinAspect != null){
      var hw = (pos.maskSw/200)*w;
      var hh = (pos.maskSh/200)*(w*pos.skinAspect);
      return [hw, hh];
    }
    var r = (pos.size/200)*w;
    return [r, r];
  }

  function hexToRgba(hex, a){
    var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }
  function twoToneBg(c1, c2, cx, cy){
    return 'radial-gradient(circle at '+cx+' '+cy+', '+c1+' 0%, '+c2+' 100%)';
  }
  function dead(v){ return Math.abs(v)<DEAD ? 0 : v; }

  var lstickWrap = document.getElementById('lstick-wrap');
  var rstickWrap = document.getElementById('rstick-wrap');
  var lstickInner = document.getElementById('lstick-inner');
  var rstickInner = document.getElementById('rstick-inner');
  var msgEl = document.getElementById('disconnected-msg');
  var btnWraps = document.querySelectorAll('.btn-wrap');

  // Mirrors ControllerPreview.tsx's button press system exactly (see its
  // pressAmt/colorAmt/testGlowShadow/testDropGlow — isTouchpadTest is
  // permanently true there, so this IS the current model, not a fallback).
  // pressAmt is the raw 0-1 "how pressed" fraction — analog pull for
  // triggers, 1/0 for every other button — from which everything else here
  // (Fill opacity, dark press-tint, ring/glow alpha) is derived directly.
  // Note GLOW/glowEnabled is intentionally NOT read here: the live preview's
  // own glowFilter is gated behind a branch (!isTouchpadTest) that never
  // runs, so the ring/glow currently always shows regardless of that toggle
  // — this mirrors that real (if perhaps unintended) live behavior exactly.
  function applyBtn(idx, pressAmt){
    var wrapEl = document.querySelector('[data-wrap="'+idx+'"]');
    if (!wrapEl) return;
    var c = getComputedStyle(wrapEl).getPropertyValue('--c').trim() || DEF_COLOR;
    var activeOpacity = pressAmt * MAX_OP;
    var colorAmt = pressAmt * BTN_COLOR_OPACITY;
    // Separate multiplier for the glow's own bloom layers only (not the
    // ring's own color, which stays governed by colorAmt) — mirrors
    // ControllerPreview.tsx's glowAmt exactly.
    var glowAmt = colorAmt * BTN_GLOW_INTENSITY;
    var testActive = pressAmt > 0.01;

    var strokeEl = document.querySelector('[data-stroke="'+idx+'"]');
    if (strokeEl) strokeEl.style.opacity = activeOpacity;

    var darkEl = document.querySelector('[data-dark="'+idx+'"]');
    if (darkEl) darkEl.style.background = testActive ? 'rgba(0,0,0,'+(0.5*pressAmt)+')' : 'rgba(0,0,0,0)';

    var ringOuterEl = document.querySelector('[data-ringouter="'+idx+'"]');
    if (ringOuterEl) {
      if (testActive) {
        ringOuterEl.style.display = 'block';
        var ringEl = document.querySelector('[data-ring="'+idx+'"]');
        if (ringEl) ringEl.style.background = hexToRgba(c, colorAmt);
        var midEl = document.querySelector('[data-ringmid="'+idx+'"]');
        if (midEl) {
          midEl.style.filter =
            'blur(4px) drop-shadow(0 0 4px rgba(255,255,255,'+(0.9*glowAmt)+')) '+
            'drop-shadow(0 0 '+(GLOW_SIZE*0.4)+'px '+hexToRgba(c,glowAmt)+') '+
            'drop-shadow(0 0 '+(GLOW_SIZE*0.8)+'px '+hexToRgba(c,0.6*glowAmt)+') '+
            'drop-shadow(0 0 '+(GLOW_SIZE*1.2)+'px '+hexToRgba(c,0.3*glowAmt)+') '+
            'drop-shadow(3px 5px 6px rgba(0,0,0,'+(0.55*pressAmt)+'))';
        }
      } else {
        ringOuterEl.style.display = 'none';
      }
      return;
    }

    var geoEl = document.querySelector('[data-geoglow="'+idx+'"]');
    if (geoEl) {
      geoEl.style.boxShadow = testActive
        ? '0 0 4px 2px rgba(255,255,255,'+(0.9*glowAmt)+'), '+
          '0 0 '+(GLOW_SIZE*0.6)+'px '+(GLOW_SIZE*0.6)+'px '+hexToRgba(c,glowAmt)+', '+
          '0 0 '+(GLOW_SIZE*1.4)+'px '+(GLOW_SIZE*1.4)+'px '+hexToRgba(c,0.6*glowAmt)+', '+
          '0 0 '+(GLOW_SIZE*2.4)+'px '+(GLOW_SIZE*2)+'px '+hexToRgba(c,0.3*glowAmt)+', '+
          '3px 5px 6px rgba(0,0,0,'+(0.55*pressAmt)+')'
        : 'none';
    }
  }

  function applyStickTilt(inner, ax, ay, pressed, color){
    var tiltAmount = 18;
    var tiltX = -ay * tiltAmount;
    var tiltY = ax * tiltAmount;
    var t = 'translate('+(ax*TRAVEL)+'px,'+(ay*TRAVEL)+'px) rotateX('+tiltX+'deg) rotateY('+tiltY+'deg)';
    // Every effect (comet/electric/spark/press-glow/press-dark) is now a
    // real DOM child of .stick-inner (see .stick-img-clip comment above),
    // so setting the transform here ONCE is enough — they all tilt as one
    // rigid subtree instead of each needing the same rotation copied onto
    // them separately, which is what caused the ring to visibly drift/oval
    // away from the rim the more the stick tilted (rotating a differently-
    // sized box by the same angle around the same center does not
    // perspective-project identically to rotating the original box).
    inner.style.transform = t;
    inner.style.filter = 'none';
    var wrap = inner.parentElement;
    if(wrap) wrap.style.opacity = '';

    // Layered box-shadow (not drop-shadow) — same exact recipe as
    // ControllerPreview.tsx's pressBoxShadow, scaled by STICK_GLOW_INTENSITY
    // (previously ignored entirely: a fixed, unscaled drop-shadow filter).
    var glowEl = inner.querySelector('.stick-press-glow');
    if (glowEl) {
      glowEl.style.boxShadow = pressed
        ? '0 0 4px 2px rgba(255,255,255,'+(0.9*STICK_GLOW_INTENSITY)+'), '+
          '0 0 '+(STICK_GLOW_SIZE*0.6)+'px '+(STICK_GLOW_SIZE*0.6)+'px '+hexToRgba(color,STICK_GLOW_INTENSITY)+', '+
          '0 0 '+(STICK_GLOW_SIZE*1.4)+'px '+(STICK_GLOW_SIZE*1.4)+'px '+hexToRgba(color,STICK_GLOW_INTENSITY*0.6)+', '+
          '0 0 '+(STICK_GLOW_SIZE*2.4)+'px '+(STICK_GLOW_SIZE*2)+'px '+hexToRgba(color,STICK_GLOW_INTENSITY*0.3)
        : 'none';
    }
    // Press darken — same dark translucent shade the face buttons get,
    // rendered AFTER (on top of) the glow above — the glow's drop-shadow
    // renders as a mostly solid blurred disc covering the whole face
    // (unlike the face buttons' hollow-ring glow), so putting the darken
    // underneath it made the dim completely invisible, washed out by the
    // much brighter glow on top of it.
    var darkEl = inner.querySelector('.stick-press-dark');
    if (darkEl) darkEl.style.background = pressed ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)';
  }

  function poll(){
    var gps = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = null;
    for(var i=0;i<gps.length;i++){ if(gps[i]){ gp=gps[i]; break; } }
    if(!gp){ requestAnimationFrame(poll); return; }

    if(msgEl) msgEl.style.opacity = '0';
    document.getElementById('controller').classList.add('connected');

    var ltVal = gp.buttons[6] ? gp.buttons[6].value : 0;
    var rtVal = gp.buttons[7] ? gp.buttons[7].value : 0;
    if(gp.axes.length>4) ltVal = Math.max(ltVal,(gp.axes[4]+1)/2);
    if(gp.axes.length>5) rtVal = Math.max(rtVal,(gp.axes[5]+1)/2);
    if(ltVal < 0.04) ltVal = 0;
    if(rtVal < 0.04) rtVal = 0;

    for(var b=0;b<btnWraps.length;b++){
      var idx = parseInt(btnWraps[b].getAttribute('data-wrap'));
      // Triggers (6/7) get their own analog pressAmt from ltVal/rtVal, but
      // still need to feed pressedButtons — otherwise reactive body effects
      // never see them as pressed (this used to continue before setting that).
      if(idx===6){ applyBtn(idx, ltVal); pressedButtons[idx] = ltVal>0.1; continue; }
      if(idx===7){ applyBtn(idx, rtVal); pressedButtons[idx] = rtVal>0.1; continue; }
      var pressed = gp.buttons[idx] ? (gp.buttons[idx].pressed || gp.buttons[idx].value>0.1) : false;
      applyBtn(idx, pressed ? 1 : 0);
      pressedButtons[idx] = pressed;
    }


    var lx=dead(gp.axes[0]||0), ly=dead(gp.axes[1]||0);
    var rx=dead(gp.axes[2]||0), ry=dead(gp.axes[3]||0);
    var lPressed = gp.buttons[L_PRESS_BTN] ? gp.buttons[L_PRESS_BTN].pressed : false;
    var rPressed = gp.buttons[R_PRESS_BTN] ? gp.buttons[R_PRESS_BTN].pressed : false;
    // Stick clicks (L3/R3) drive their own tilt-color feedback above, but were
    // never written into pressedButtons — so reactive body effects never fired
    // for a thumbstick click even though the position data now exists for it.
    pressedButtons[L_PRESS_BTN] = lPressed;
    pressedButtons[R_PRESS_BTN] = rPressed;
    applyStickTilt(lstickInner, lx, ly, lPressed, L_STICK_COLOR);
    applyStickTilt(rstickInner, rx, ry, rPressed, R_STICK_COLOR);

    requestAnimationFrame(poll);
  }

  window.addEventListener('gamepadconnected', function(){ requestAnimationFrame(poll); });
  requestAnimationFrame(poll);

  // ── RGB Body Silhouette (standalone, independent of Body Effects) ──
  ${RGB_BODY_ENABLED ? `
  (function(){
    var canvas = document.getElementById('rgb-body-canvas');
    var wrap = document.getElementById('rgb-body');
    if(!canvas || !wrap) return;
    var ctx = canvas.getContext('2d');
    var SPEED = ${RGB_BODY_SPEED};
    var ss = 1 / Math.max(SPEED, 0.5);
    var MODE = '${RGB_BODY_MODE}';
    var INTENSITY = ${RGB_BODY_INTENSITY};
    var RAINBOW = ${RGB_BODY_RAINBOW ? "true" : "false"};
    var COLOR_R = ${parseInt(RGB_BODY_COLOR.slice(1, 3), 16) || 228};
    var COLOR_G = ${parseInt(RGB_BODY_COLOR.slice(3, 5), 16) || 7};
    var COLOR_B = ${parseInt(RGB_BODY_COLOR.slice(5, 7), 16) || 7};
    var t = 0;
    var started = false;

    function getC(hue, alpha){
      if(RAINBOW){
        var h = ((hue*360)%360+360)%360;
        return 'hsla('+h+',100%,55%,'+alpha+')';
      }
      return 'rgba('+COLOR_R+','+COLOR_G+','+COLOR_B+','+alpha+')';
    }

    var ro = new ResizeObserver(function(entries){
      var e = entries[0];
      canvas.width = e.contentRect.width;
      canvas.height = e.contentRect.height;
      if(!started && canvas.width > 0 && canvas.height > 0){
        started = true;
        tick();
      }
    });
    ro.observe(wrap);

    function tick(){
      t += 0.016 * ss;
      var w = canvas.width, h = canvas.height;
      if(w > 0 && h > 0){
        ctx.clearRect(0,0,w,h);
        if(MODE === 'breathing'){
          // Full-bright color that cycles hue over time while pulsing in/out — never blank
          var raw = 0.5 + 0.5*Math.sin(t*2.5);
          var pulse = 0.3 + 0.7*raw; // dim floor, never transparent — mirrors RgbBodyCanvas.tsx exactly
          var hue = RAINBOW ? t*0.08 : 0;
          ctx.fillStyle = getC(hue, INTENSITY * pulse);
          ctx.fillRect(0,0,w,h);
        } else {
          // Wave — smoothly blended hue bands via a triangle-wave hue path
          // (no sawtooth 360->0 jump, so there's no hard color-reversal seam),
          // with a continuous brightness pulse layered on top
          var repeats = 1;
          var pulseRaw = 0.5 + 0.5*Math.sin(t*3);
          var pulse2 = 0.25 + 0.75*pulseRaw; // wider dim-to-bright swing, never transparent — mirrors RgbBodyCanvas.tsx exactly
          var grad = ctx.createLinearGradient(0,0,w,0);
          var steps = 120;
          for(var i=0; i<=steps; i++){
            var frac = i/steps;
            var phase = frac*repeats + t*0.18;
            var x = ((phase % 1) + 1) % 1;
            var tri = Math.abs(x*2 - 1);
            var hue2 = RAINBOW ? tri : 0;
            grad.addColorStop(frac, getC(hue2, INTENSITY * pulse2));
          }
          ctx.fillStyle = grad;
          ctx.fillRect(0,0,w,h);
        }
      }
      requestAnimationFrame(tick);
    }
  })();
  ` : ""}

  // ── Thumbstick Comet LED — a glowing dot that revolves around each
  //    stick's rim, leaving a fading trail behind it. Independent per
  //    stick; mirrors StickCometOverlay.tsx exactly. ──
  function initStickComet(canvasId, color, speed, phaseOffset){
    var canvas = document.getElementById(canvasId);
    if(!canvas) return;
    var ctx = canvas.getContext('2d');
    var wrap = canvas.parentElement;
    var CONTAINER_SCALE = 1.24;
    var r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
    var t = 0, last = performance.now();

    function draw(w, h){
      ctx.clearRect(0,0,w,h);
      var cx=w/2, cy=h/2;
      var R = (Math.min(w,h)/2) / CONTAINER_SCALE;
      var period = Math.max(speed, 0.5);
      var headAngle = (t/period) * Math.PI*2 - Math.PI/2 + phaseOffset;

      // Continuous tapered tail — a polyline of overlapping round-capped
      // segments (not discrete dots), extended and eased so it fades out
      // gradually — mirrors StickCometOverlay.tsx exactly.
      var tailSteps = 56, tailSpan = Math.PI*1.35;
      var prevX = cx + Math.cos(headAngle)*R, prevY = cy + Math.sin(headAngle)*R;
      ctx.lineCap = 'round';
      for(var i=1; i<=tailSteps; i++){
        var f = i/tailSteps;
        var ang = headAngle - f*tailSpan;
        var px = cx + Math.cos(ang)*R, py = cy + Math.sin(ang)*R;
        var fade = Math.pow(1-f, 2.6);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(px, py);
        ctx.lineWidth = 3.6*Math.pow(1-f, 1.3);
        ctx.strokeStyle = 'rgba('+r+','+g+','+b+','+fade+')';
        ctx.stroke();
        prevX = px; prevY = py;
      }

      // LED head — pulses independently, colored to match the picked color,
      // with a soft radial-gradient glow (fades smoothly instead of a
      // hard-edge blob) plus a glare highlight.
      var pulse = 0.5 + 0.5*Math.sin(t*Math.PI*2*1.6);
      var hx = cx + Math.cos(headAngle)*R, hy = cy + Math.sin(headAngle)*R;
      var headR = 3.0 + 0.8*pulse;

      var glowR = headR*4.5;
      var glowGrd = ctx.createRadialGradient(hx,hy,0,hx,hy,glowR);
      glowGrd.addColorStop(0, 'rgba('+r+','+g+','+b+','+(0.55+0.3*pulse)+')');
      glowGrd.addColorStop(0.45, 'rgba('+r+','+g+','+b+','+(0.18+0.12*pulse)+')');
      glowGrd.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
      ctx.fillStyle = glowGrd;
      ctx.beginPath(); ctx.arc(hx,hy,glowR,0,Math.PI*2); ctx.fill();

      ctx.beginPath(); ctx.arc(hx,hy,headR,0,Math.PI*2);
      ctx.fillStyle = 'rgba('+r+','+g+','+b+',1)';
      ctx.fill();

      ctx.beginPath(); ctx.arc(hx-headR*0.35, hy-headR*0.35, headR*0.4, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,'+(0.75+0.2*pulse)+')';
      ctx.fill();
    }

    function tick(now){
      var dt = Math.min(0.05, (now-last)/1000);
      last = now; t += dt;
      if(canvas.width > 0 && canvas.height > 0) draw(canvas.width, canvas.height);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // Sizing is handled independently of the draw loop above (rAF is
    // suspended entirely for backgrounded/inactive tabs, which would
    // otherwise leave the canvas stuck at its default 300x150 buffer).
    // ResizeObserver is the primary mechanism; a synchronous read at mount
    // and a low-frequency interval both backstop cases where the observer's
    // callback doesn't fire promptly (seen for elements nested inside a
    // transform-style:preserve-3d ancestor — the stick's tilt container).
    // Mirrors StickCometOverlay.tsx exactly.
    function applySize(width, height){
      var w = Math.round(width), h = Math.round(height);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    var ro = new ResizeObserver(function(entries){
      var e = entries[0];
      applySize(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(wrap);
    // offsetWidth/offsetHeight, NOT getBoundingClientRect() — inside the
    // stick's 3D-rotated tilt container, getBoundingClientRect() reports the
    // foreshortened, post-perspective on-screen box, which shrinks and goes
    // non-square as the stick tilts. offsetWidth/offsetHeight reflect the
    // untransformed CSS layout box instead, matching ResizeObserver.
    applySize(wrap.offsetWidth, wrap.offsetHeight);
    setInterval(function(){
      applySize(wrap.offsetWidth, wrap.offsetHeight);
    }, 500);
  }
  if (L_COMET_ENABLED) initStickComet('lstick-comet', L_COMET_COLOR, L_COMET_SPEED, 0);
  if (R_COMET_ENABLED) initStickComet('rstick-comet', R_COMET_COLOR, R_COMET_SPEED, Math.PI);

  // ── Thumbstick Spark — comet-style revolving head/trail that also flings
  //    off sparks as it travels, like the crackling embers along the rim of
  //    a portal ring. Independent per stick; mirrors StickSparkOverlay.tsx
  //    exactly. ──
  function initStickSpark(canvasId, color, speed, phaseOffset){
    var canvas = document.getElementById(canvasId);
    if(!canvas) return;
    var ctx = canvas.getContext('2d');
    var wrap = canvas.parentElement;
    var CONTAINER_SCALE = 1.35;
    var r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
    var t = 0, last = performance.now();
    var sparks = [];

    function draw(w, h, dt){
      ctx.clearRect(0,0,w,h);
      var cx=w/2, cy=h/2;
      var R = (Math.min(w,h)/2) / CONTAINER_SCALE;
      var period = Math.max(speed, 0.5);
      var headAngle = (t/period) * Math.PI*2 - Math.PI/2 + phaseOffset;

      var tailSteps = 56, tailSpan = Math.PI*1.35;
      var prevX = cx + Math.cos(headAngle)*R, prevY = cy + Math.sin(headAngle)*R;
      ctx.lineCap = 'round';
      for(var i=1; i<=tailSteps; i++){
        var f = i/tailSteps;
        var ang = headAngle - f*tailSpan;
        var px = cx + Math.cos(ang)*R, py = cy + Math.sin(ang)*R;
        var fade = Math.pow(1-f, 2.6);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(px, py);
        ctx.lineWidth = 3.6*Math.pow(1-f, 1.3);
        ctx.strokeStyle = 'rgba('+r+','+g+','+b+','+fade+')';
        ctx.stroke();
        prevX = px; prevY = py;
      }

      var pulse = 0.5 + 0.5*Math.sin(t*Math.PI*2*1.6);
      var hx = cx + Math.cos(headAngle)*R, hy = cy + Math.sin(headAngle)*R;
      var headR = 3.0 + 0.8*pulse;

      var glowR = headR*4.5;
      var glowGrd = ctx.createRadialGradient(hx,hy,0,hx,hy,glowR);
      glowGrd.addColorStop(0, 'rgba('+r+','+g+','+b+','+(0.55+0.3*pulse)+')');
      glowGrd.addColorStop(0.45, 'rgba('+r+','+g+','+b+','+(0.18+0.12*pulse)+')');
      glowGrd.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
      ctx.fillStyle = glowGrd;
      ctx.beginPath(); ctx.arc(hx,hy,glowR,0,Math.PI*2); ctx.fill();

      ctx.beginPath(); ctx.arc(hx,hy,headR,0,Math.PI*2);
      ctx.fillStyle = 'rgba('+r+','+g+','+b+',1)';
      ctx.fill();

      ctx.beginPath(); ctx.arc(hx-headR*0.35, hy-headR*0.35, headR*0.4, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,'+(0.75+0.2*pulse)+')';
      ctx.fill();

      // Spark emission — thrown off mostly tangent to the head's direction
      // of travel, with a splash of outward randomness.
      var tangentAng = headAngle + Math.PI/2;
      var emitCount = 2 + Math.floor(Math.random()*3);
      for (var ei=0; ei<emitCount; ei++){
        var spread = (Math.random()-0.5)*2.2;
        var ang2 = tangentAng + spread;
        var launchSpd = R * (0.9 + Math.random()*1.6);
        sparks.push({
          x: hx, y: hy,
          vx: Math.cos(ang2)*launchSpd, vy: Math.sin(ang2)*launchSpd,
          life: 0,
          maxLife: 0.35 + Math.random()*0.4,
          size: 1.1 + Math.random()*1.6
        });
      }

      // Update + draw each spark as a short streak; friction slows it and a
      // gentle pull back toward the stick's center curls the tail off as it
      // fizzles, mirroring StickSparkOverlay.tsx exactly.
      ctx.lineCap = 'round';
      for (var si=sparks.length-1; si>=0; si--){
        var s = sparks[si];
        s.life += dt;
        if (s.life >= s.maxLife){ sparks.splice(si,1); continue; }
        s.vx *= 0.93;
        s.vy *= 0.93;
        var toCx = cx - s.x, toCy = cy - s.y;
        var toLen = Math.hypot(toCx, toCy) || 1;
        s.vx += (toCx/toLen) * 5 * dt * R;
        s.vy += (toCy/toLen) * 5 * dt * R;
        var prevSX = s.x, prevSY = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        var sFade = 1 - s.life/s.maxLife;
        ctx.beginPath();
        ctx.moveTo(prevSX, prevSY);
        ctx.lineTo(s.x, s.y);
        ctx.lineWidth = s.size * sFade;
        ctx.strokeStyle = 'rgba('+r+','+g+','+b+','+sFade+')';
        ctx.shadowBlur = 5*sFade;
        ctx.shadowColor = 'rgba('+r+','+g+','+b+','+(0.7*sFade)+')';
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    function tick(now){
      var dt = Math.min(0.05, (now-last)/1000);
      last = now; t += dt;
      if(canvas.width > 0 && canvas.height > 0) draw(canvas.width, canvas.height, dt);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    function applySize(width, height){
      var w = Math.round(width), h = Math.round(height);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    var roS = new ResizeObserver(function(entries){
      var e = entries[0];
      applySize(e.contentRect.width, e.contentRect.height);
    });
    roS.observe(wrap);
    // offsetWidth/offsetHeight, NOT getBoundingClientRect() — see comment on
    // the comet init above; same fix, same reason.
    applySize(wrap.offsetWidth, wrap.offsetHeight);
    setInterval(function(){
      applySize(wrap.offsetWidth, wrap.offsetHeight);
    }, 500);
  }
  if (L_SPARK_ENABLED) initStickSpark('lstick-spark', L_SPARK_COLOR, L_SPARK_SPEED, 0);
  if (R_SPARK_ENABLED) initStickSpark('rstick-spark', R_SPARK_COLOR, R_SPARK_SPEED, Math.PI);

  // ── Thumbstick Electric — a crackling current trail (comet-style, not a
  //    fully-lit ring) around the stick's rim plus sporadic thin arcing
  //    bolts jumping outward. Independent per stick, separate from the
  //    comet LED. Mirrors StickElectricOverlay.tsx exactly. ──
  function buildBoltPath(x0, y0, x1, y1, roughness, depth){
    if (depth <= 0) return [{x:x0,y:y0},{x:x1,y:y1}];
    var mx=(x0+x1)/2, my=(y0+y1)/2;
    var dx=x1-x0, dy=y1-y0;
    var len=Math.sqrt(dx*dx+dy*dy)||1;
    var nx=-dy/len, ny=dx/len;
    var disp=(Math.random()-0.5)*roughness;
    var midX=mx+nx*disp, midY=my+ny*disp;
    var left=buildBoltPath(x0,y0,midX,midY,roughness*0.55,depth-1);
    var right=buildBoltPath(midX,midY,x1,y1,roughness*0.55,depth-1);
    return left.concat(right.slice(1));
  }

  function initStickElectric(canvasId, color, speed, phaseOffset){
    var canvas = document.getElementById(canvasId);
    if(!canvas) return;
    var ctx = canvas.getContext('2d');
    var wrap = canvas.parentElement;
    var CONTAINER_SCALE = 1.4;
    var r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
    var t = 0, last = performance.now();

    var ptN = 40;
    var jitter = new Array(ptN).fill(0);
    // Per-bucket jaggedness intensity and thickness — both drift slowly on
    // their own so some stretches of the trail read as calm/thin and others
    // as violently jagged/thick, instead of uniform crackle everywhere.
    var jitterAmp = new Array(ptN).fill(1);
    var widthNoise = new Array(ptN).fill(1);
    var pulseNoise = 0;
    var nextArcAt = 0;
    var nextBigArcAt = 2 + Math.random()*3;
    var arcs = [];

    function draw(w, h){
      ctx.clearRect(0,0,w,h);
      var cx=w/2, cy=h/2;
      var R = (Math.min(w,h)/2) / CONTAINER_SCALE;
      var spd = Math.max(speed, 0.5);
      var period = spd;
      var headAngle = (t/period) * Math.PI*2 - Math.PI/2 + phaseOffset;
      var tailSpan = Math.PI*1.5;

      // lineCap "round" on a trail drawn as many short independent
      // segments read as "a bunch of little balls" — round caps at BOTH
      // ends of every tiny segment overlap into beads. "butt" caps abut
      // cleanly since consecutive segments share exact endpoints.
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';

      for(var i=0;i<ptN;i++){
        jitterAmp[i] += (Math.random()-0.5)*0.15;
        jitterAmp[i] = Math.max(0.35, Math.min(2.4, jitterAmp[i]));
        jitter[i] += (Math.random()-0.5)*2.2*jitterAmp[i];
        jitter[i] *= 0.85;

        widthNoise[i] += (Math.random()-0.5)*0.12;
        widthNoise[i] = Math.max(0.45, Math.min(1.9, widthNoise[i]));
      }

      pulseNoise += (Math.random()-0.5)*1.8;
      pulseNoise = Math.max(-1, Math.min(1, pulseNoise*0.9));
      var trailPulse = Math.max(0.25, 0.75 + 0.3*Math.sin(t*Math.PI*2*3.1 + phaseOffset*1.7) + 0.35*pulseNoise);

      var steps = 44;
      var prevX=0, prevY=0, havePrev=false;
      for(var i2=0; i2<=steps; i2++){
        var f = i2/steps;
        var ang = headAngle - f*tailSpan;
        var bucket = ((Math.floor((ang/(Math.PI*2))*ptN) % ptN) + ptN) % ptN;
        var rr = R + jitter[bucket];
        var px = cx + Math.cos(ang)*rr, py = cy + Math.sin(ang)*rr;
        if (havePrev){
          var flicker = 0.7 + Math.random()*0.6;
          var fade = Math.pow(1-f, 1.6) * trailPulse * flicker;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(px, py);
          ctx.lineWidth = (3.4*(1-f*0.6)) * widthNoise[bucket] * (0.85 + Math.random()*0.35);
          ctx.strokeStyle = 'rgba('+r+','+g+','+b+','+Math.min(1, 0.95*fade)+')';
          ctx.shadowBlur = 10*fade;
          ctx.shadowColor = 'rgba('+r+','+g+','+b+','+Math.min(1, 0.85*fade)+')';
          ctx.stroke();
        }
        prevX = px; prevY = py; havePrev = true;
      }
      ctx.shadowBlur = 0;

      // Arcing bolts INWARD onto the stick's face (not outward past the
      // rim), no head marker/ball, frequency pulled back down.
      if (t > nextArcAt){
        var startAng = Math.random()*Math.PI*2;
        var x0 = cx + Math.cos(startAng)*R, y0 = cy + Math.sin(startAng)*R;
        var reach = R*(0.25+Math.random()*0.4);
        var endAng = startAng + (Math.random()-0.5)*0.7;
        var innerR = Math.max(R*0.15, R-reach);
        var x1 = cx + Math.cos(endAng)*innerR, y1 = cy + Math.sin(endAng)*innerR;
        arcs.push({
          path: buildBoltPath(x0,y0,x1,y1,R*0.22,6),
          life: 0,
          maxLife: 0.09+Math.random()*0.07,
          width: 1.0+Math.random()*1.0
        });
        nextArcAt = t + (0.3+Math.random()*0.9)/spd;
      }

      // Occasional BIG bolt reaching across the stick's face, rim to rim —
      // rarer, thicker, more jagged, and sometimes forks into a second
      // branch partway along, like a real lightning strike splitting off.
      if (t > nextBigArcAt){
        var bStartAng = Math.random()*Math.PI*2;
        var bx0 = cx + Math.cos(bStartAng)*R, by0 = cy + Math.sin(bStartAng)*R;
        var bEndAng = bStartAng + Math.PI + (Math.random()-0.5)*1.1;
        var bEndR = R*(0.75+Math.random()*0.25);
        var bx1 = cx + Math.cos(bEndAng)*bEndR, by1 = cy + Math.sin(bEndAng)*bEndR;
        var bRoughness = R*(0.3+Math.random()*0.28);
        var mainPath = buildBoltPath(bx0,by0,bx1,by1,bRoughness,7);
        var bMaxLife = 0.12+Math.random()*0.09;
        var bWidth = 2.1+Math.random()*1.6;
        arcs.push({ path: mainPath, life: 0, maxLife: bMaxLife, width: bWidth });

        if (Math.random() < 0.55){
          var splitIdx = Math.floor(mainPath.length * (0.3+Math.random()*0.35));
          var sp = mainPath[splitIdx];
          var branchAng = Math.atan2(sp.y-cy, sp.x-cx) + (Math.random()-0.5)*1.8;
          var branchLen = R*(0.3+Math.random()*0.4);
          var bx = sp.x + Math.cos(branchAng)*branchLen;
          var by = sp.y + Math.sin(branchAng)*branchLen;
          arcs.push({
            path: buildBoltPath(sp.x, sp.y, bx, by, bRoughness*0.7, 5),
            life: 0,
            maxLife: bMaxLife*(0.7+Math.random()*0.3),
            width: bWidth*0.55
          });
        }

        nextBigArcAt = t + (1.5+Math.random()*2.6)/spd;
      }

      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      for (var ai=arcs.length-1; ai>=0; ai--){
        var arc = arcs[ai];
        arc.life += 1/60;
        if (arc.life >= arc.maxLife){ arcs.splice(ai,1); continue; }
        var fade2 = 1 - arc.life/arc.maxLife;
        ctx.beginPath();
        for (var pi=0; pi<arc.path.length; pi++){
          var p = arc.path[pi];
          if (pi===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
        ctx.lineWidth = arc.width*1.8;
        ctx.strokeStyle = 'rgba('+r+','+g+','+b+','+(0.45*fade2)+')';
        ctx.shadowBlur = 9;
        ctx.shadowColor = 'rgba('+r+','+g+','+b+','+(0.75*fade2)+')';
        ctx.stroke();
        ctx.lineWidth = arc.width*0.55;
        ctx.strokeStyle = 'rgba(255,255,255,'+fade2+')';
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
    }

    function tick(now){
      var dt = Math.min(0.05, (now-last)/1000);
      last = now; t += dt;
      if(canvas.width > 0 && canvas.height > 0) draw(canvas.width, canvas.height);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    function applySize(width, height){
      var w = Math.round(width), h = Math.round(height);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    var ro2 = new ResizeObserver(function(entries){
      var e = entries[0];
      applySize(e.contentRect.width, e.contentRect.height);
    });
    ro2.observe(wrap);
    // offsetWidth/offsetHeight, NOT getBoundingClientRect() — see comment on
    // the comet init above; same fix, same reason.
    applySize(wrap.offsetWidth, wrap.offsetHeight);
    setInterval(function(){
      applySize(wrap.offsetWidth, wrap.offsetHeight);
    }, 500);
  }
  if (L_ELECTRIC_ENABLED) initStickElectric('lstick-electric', L_ELECTRIC_COLOR, L_ELECTRIC_SPEED, 0);
  if (R_ELECTRIC_ENABLED) initStickElectric('rstick-electric', R_ELECTRIC_COLOR, R_ELECTRIC_SPEED, Math.PI);

  // ── Body Effects ──
  ${ANY_BODY_EFFECT ? `
  function initBodyEffect(canvasId, wrapId, EFFECT){
    var canvas = document.getElementById(canvasId);
    var wrap = document.getElementById(wrapId);
    if(!canvas || !wrap) return;
    var ctx = canvas.getContext('2d');
    var SPEED = ${BODY_EFFECT_SPEED};
    var INTENSITY = ${BODY_EFFECT_INTENSITY};
    var BASE_HUE = ${(() => {
      const c = config.pulseGlowColor || '#7b2ff7';
      if (!c.startsWith('#') || c.length !== 7) return 270;
      const r = parseInt(c.slice(1,3),16)/255, g = parseInt(c.slice(3,5),16)/255, b = parseInt(c.slice(5,7),16)/255;
      const max = Math.max(r,g,b), min = Math.min(r,g,b);
      if (max === min) return 0;
      const d = max - min;
      let h = max === r ? (g-b)/d+(g<b?6:0) : max === g ? (b-r)/d+2 : (r-g)/d+4;
      return Math.round(h * 60);
    })()};
    var FIRE_HUE1 = ${hexToHslStatic(config.fireColor1 || '#ff2200')[0]};
    var FIRE_SAT1 = ${hexToHslStatic(config.fireColor1 || '#ff2200')[1]};
    var FIRE_LIGHT1 = ${hexToHslStatic(config.fireColor1 || '#ff2200')[2]};
    var FIRE_HUE2 = ${hexToHslStatic(config.fireColor2 || '#ff8800')[0]};
    var FIRE_SAT2 = ${hexToHslStatic(config.fireColor2 || '#ff8800')[1]};
    var FIRE_LIGHT2 = ${hexToHslStatic(config.fireColor2 || '#ff8800')[2]};
    var FIRE_GLOW_SPEED = ${config.fireGlowSpeed ?? 4};
    var FIRE_EMBER_SPEED = ${config.fireEmberSpeed ?? 6};

    // Wait for real canvas dimensions via ResizeObserver
    var started = false;
    var ro = new ResizeObserver(function(entries){
      var e = entries[0];
      canvas.width = e.contentRect.width;
      canvas.height = e.contentRect.height;
      if(!started && canvas.width > 0 && canvas.height > 0){
        started = true;
        initEffect();
      }
    });
    ro.observe(wrap);

    function initEffect(){
      if(EFFECT === 'particles') initParticles();
      else if(EFFECT === 'pulseGlow') initPulseGlow();
      else if(EFFECT === 'fire') initFire();
      else if(EFFECT === 'reactive') initReactive();
      else if(EFFECT === 'particleBurst') initParticleBurst();
      else if(EFFECT === 'reactiveFire') initReactiveFire();
    }

    var REACTIVE_COLOR = '${config.reactiveRippleColor || "#ffffff"}';
    var REACTIVE_RAINBOW = ${config.reactiveRippleRainbow ? "true" : "false"};
    var PARTICLES_HUE = ${(() => {
      const c = config.particlesColor || '#ffffff';
      if (!c.startsWith('#') || c.length !== 7) return 0;
      const r = parseInt(c.slice(1,3),16)/255, g = parseInt(c.slice(3,5),16)/255, b = parseInt(c.slice(5,7),16)/255;
      const max = Math.max(r,g,b), min = Math.min(r,g,b);
      if (max === min) return 0;
      const d = max-min; let h = max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
      return Math.round(h*60);
    })()};
    var PARTICLES_RAINBOW = ${config.particlesRainbow ? "true" : "false"};
    function reactiveGetC(hue, a){
      if(REACTIVE_RAINBOW){
        var h = ((hue*360)%360+360)%360;
        return 'hsla('+h+',100%,58%,'+a+')';
      }
      var rr=parseInt(REACTIVE_COLOR.slice(1,3),16), rg=parseInt(REACTIVE_COLOR.slice(3,5),16), rb=parseInt(REACTIVE_COLOR.slice(5,7),16);
      return 'rgba('+rr+','+rg+','+rb+','+a+')';
    }

    // Real highlight+shadow bevel instead of an "overlay" composite trough —
    // overlay/multiply blending on near-black is luminance-dependent (barely
    // darkens already-bright pixels), so on a shiny/light controller skin it
    // was nearly invisible. A bright band on one edge and a dark band on the
    // other, both plain alpha-composited, reads as genuine 3D relief
    // regardless of what's underneath. Mirrors BodyEffectOverlay.tsx's
    // drawBevel exactly.
    function drawBevel(cx, cy, R, T, alpha){
      // Toned down (peaks were 0.55/0.65, now 0.32/0.42) and the gradient
      // span widened with a flat mid-plateau instead of a single sharp peak
      // stop — mirrors BodyEffectOverlay.tsx's drawBevel exactly.
      // Highlight alpha halved again (0.32→0.16) — was reading as a bright
      // washed-out white band on top of the color, not a subtle 3D cue.
      var w = canvas.width, h = canvas.height;
      var hiR = Math.max(0, R - T*0.4);
      var hiGrd = ctx.createRadialGradient(cx, cy, Math.max(0, hiR-T*1.3), cx, cy, hiR+T*0.6);
      hiGrd.addColorStop(0,   'rgba(255,255,255,0)');
      hiGrd.addColorStop(0.4, 'rgba(255,255,255,'+(alpha*0.16)+')');
      hiGrd.addColorStop(0.6, 'rgba(255,255,255,'+(alpha*0.16)+')');
      hiGrd.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = hiGrd;
      ctx.fillRect(0,0,w,h);

      var shR = R + T*0.55;
      var shGrd = ctx.createRadialGradient(cx, cy, Math.max(0, shR-T*0.7), cx, cy, shR+T*1.6);
      shGrd.addColorStop(0,   'rgba(0,0,0,0)');
      shGrd.addColorStop(0.4, 'rgba(0,0,0,'+(alpha*0.42)+')');
      shGrd.addColorStop(0.6, 'rgba(0,0,0,'+(alpha*0.42)+')');
      shGrd.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = shGrd;
      ctx.fillRect(0,0,w,h);
    }

    // ── Reactive Ripple ──
    function initReactive(){
      var ripples = [];
      var prevPressed = {};
      var rt = 0;
      function tick(){
        rt += 0.016;
        var w=canvas.width, h=canvas.height;
        ctx.clearRect(0,0,w,h);
        var rippleLife = Math.max(SPEED, 0.5) * 0.22;
        ripples = ripples.filter(function(r){ return rt - r.startT < rippleLife; });
        for(var idx in pressedButtons){
          if(pressedButtons[idx] && !prevPressed[idx]){
            var pos = btnPositions[idx];
            if(pos){
              var hwhh = buttonHWHH(pos, w);
              ripples.push({cx:(pos.x/100)*w, cy:(pos.y/100)*h, startT:rt, edgeR:Math.min(hwhh[0],hwhh[1])});
            }
          }
        }
        prevPressed = {};
        for(var k in pressedButtons) prevPressed[k] = pressedButtons[k];

        for(var i=0;i<ripples.length;i++){
          var rip = ripples[i];
          var age = rt - rip.startT;
          var frac = age / rippleLife;
          var R = rip.edgeR + frac * Math.max(w,h) * 1.3;
          var T = Math.max(w,h) * 0.06;
          // Boosted 1.35x (clamped to 1) — the color was reading
          // washed-out/pastel; shoulders now hold full alpha too.
          var alpha = Math.min(1, Math.max(0, (1-frac) * INTENSITY) * 1.35);
          var hue = (((age/rippleLife)*300 + (rip.cx/w)*120)%360+360)%360;
          var grd = ctx.createRadialGradient(rip.cx, rip.cy, Math.max(0, R-T), rip.cx, rip.cy, R+T);
          grd.addColorStop(0,    reactiveGetC(hue, 0));
          grd.addColorStop(0.15, reactiveGetC(hue, alpha));
          grd.addColorStop(0.3,  reactiveGetC(hue, alpha));
          grd.addColorStop(0.7,  reactiveGetC(hue, alpha));
          grd.addColorStop(0.85, reactiveGetC(hue, alpha));
          grd.addColorStop(1,    reactiveGetC(hue, 0));
          ctx.fillStyle = grd;
          ctx.fillRect(0,0,w,h);

          // Highlight+shadow bevel for real 3D depth — mirrors
          // BodyEffectOverlay.tsx's reactive3DRef exactly.
          drawBevel(rip.cx, rip.cy, R, Math.max(w,h)*0.055, alpha);
        }
        requestAnimationFrame(tick);
      }
      tick();
    }

    // ── Particle Burst — a one-shot explosion of glowing particles flying
    //    outward from the pressed button's edge, decelerating and fading out.
    //    Position is a closed-form function of age (exponentially-decaying
    //    velocity) plus a perpendicular jitter term for organic wander. Sizes/
    //    drag are drawn from weighted tiers (spark/ember/chunk), the same
    //    trick the fire embers use to avoid every particle looking identical.
    //    Velocity is derived from a target travel distance (maxDist = v0/drag)
    //    scaled to canvas size rather than picked independently of drag —
    //    otherwise faster tiers just brake harder and every tier caps out at
    //    nearly the same tiny radius regardless of controller size.
    //    Mirrors BodyEffectOverlay.tsx exactly. ──
    function genBurstParticles(cx,cy,hw,hh,canvasMax,n){
      var arr = [];
      for(var i=0;i<n;i++){
        // Most particles fan out evenly and stay close to the button. A
        // minority ("wild" ones) get both a wider random angle and extra
        // travel distance, so only some visibly rocket off further/more
        // randomly — not all of them.
        var isWild = Math.random() < 0.22;
        var angle = (i/n)*Math.PI*2 + (Math.random()-0.5)*(Math.PI*2/n);
        if(isWild) angle += (Math.random()-0.5) * 1.6;

        var ca=Math.abs(Math.cos(angle)), sa=Math.abs(Math.sin(angle));
        var edgeR = ca<1e-9?hh:sa<1e-9?hw:Math.min(hw/ca,hh/sa);
        var x0 = cx+Math.cos(angle)*edgeR, y0 = cy+Math.sin(angle)*edgeR;

        var roll = Math.random();
        var size, maxDist, drag;
        if(roll < 0.35){
          size = 0.8 + Math.random()*1.0;                    // spark — tiny, fast, snaps to a stop
          maxDist = canvasMax * (0.04 + Math.random()*0.05);
          drag = 3.0 + Math.random()*2.0;
        } else if(roll < 0.75){
          size = 1.8 + Math.random()*2.2;                    // ember — standard
          maxDist = canvasMax * (0.06 + Math.random()*0.06);
          drag = 1.8 + Math.random()*1.4;
        } else {
          size = 3.2 + Math.random()*3.2;                    // chunk — big, slow, lingers
          maxDist = canvasMax * (0.09 + Math.random()*0.08);
          drag = 1.0 + Math.random()*0.8;
        }
        if(isWild) maxDist *= 1.8 + Math.random()*1.4;
        var speed = maxDist * drag;

        arr.push({
          x0:x0, y0:y0, angle:angle, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed,
          size:size, drag:drag, hueOff:(i/n)*360+Math.random()*30,
          jitterAmp: 4+Math.random()*14,
          jitterFreq: 3+Math.random()*6,
          jitterPhase: Math.random()*Math.PI*2,
          flickerSpeed: 2+Math.random()*6,
          flickerPhase: Math.random()*Math.PI*2
        });
      }
      return arr;
    }
    function initParticleBurst(){
      var events = [];
      var prevPressed = {};
      var bt = 0;
      var brr=parseInt(REACTIVE_COLOR.slice(1,3),16), brg=parseInt(REACTIVE_COLOR.slice(3,5),16), brb=parseInt(REACTIVE_COLOR.slice(5,7),16);
      function tick(){
        bt += 0.016;
        var w=canvas.width, h=canvas.height;
        ctx.clearRect(0,0,w,h);
        var life = Math.max(SPEED, 0.5) * 0.5;
        events = events.filter(function(e){ return bt - e.startT < e.life; });
        for(var idx in pressedButtons){
          if(pressedButtons[idx] && !prevPressed[idx]){
            var pos = btnPositions[idx];
            if(pos){
              var hwhh = buttonHWHH(pos, w);
              var n = 14 + Math.floor(Math.random()*10);
              events.push({startT:bt, life:life, particles: genBurstParticles((pos.x/100)*w, (pos.y/100)*h, hwhh[0], hwhh[1], Math.max(w,h), n)});
            }
          }
        }
        prevPressed = {};
        for(var k in pressedButtons) prevPressed[k] = pressedButtons[k];

        for(var ei=0; ei<events.length; ei++){
          var evt = events[ei];
          var age = bt - evt.startT;
          var tn = Math.min(1, age/evt.life);
          var fadeAlpha = Math.max(0, 1 - Math.pow(tn, 1.6)) * INTENSITY;
          if(fadeAlpha <= 0.01) continue;

          for(var pi=0; pi<evt.particles.length; pi++){
            var p = evt.particles[pi];
            var decay = 1 - Math.exp(-p.drag*age);
            var px = p.x0 + (p.vx/p.drag)*decay;
            var py = p.y0 + (p.vy/p.drag)*decay;

            var perpX = -Math.sin(p.angle), perpY = Math.cos(p.angle);
            var jitter = Math.sin(age*p.jitterFreq + p.jitterPhase) * p.jitterAmp * Math.min(1, age*3) * (1-tn);
            px += perpX * jitter;
            py += perpY * jitter;

            var flicker = 0.7 + 0.3*Math.sin(age*p.flickerSpeed + p.flickerPhase);
            var size = p.size * (1 - 0.35*tn) * flicker;
            if(size <= 0.15) continue;
            var alpha = fadeAlpha * flicker;

            var hue = REACTIVE_RAINBOW ? (p.hueOff + age*220)%360 : 0;
            var colorC = REACTIVE_RAINBOW ? 'hsla('+hue+',100%,62%,' : 'rgba('+brr+','+brg+','+brb+',';

            ctx.save();
            ctx.shadowBlur=8; ctx.shadowColor = colorC+(alpha*0.8)+')';
            ctx.fillStyle = colorC+alpha+')';
            ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI*2); ctx.fill();

            ctx.shadowBlur=0;
            ctx.fillStyle = 'rgba(255,255,255,'+(alpha*0.7)+')';
            ctx.beginPath(); ctx.arc(px, py, size*0.4, 0, Math.PI*2); ctx.fill();
            ctx.restore();
          }
        }
        requestAnimationFrame(tick);
      }
      tick();
    }

    // ── Reactive Fire — a ripple rendered in the Fire Color 1/2 palette,
    //    plus embers using the same per-kind rendering as the regular fire
    //    embers — but their position rides the wave's own expanding radius
    //    (with a little wobble/bob) instead of flying off with independent
    //    velocity, so they visibly stay pushed along the wave's outer edge
    //    for as long as it's expanding. Rendered in two passes — every wave,
    //    then every ember — so embers always sit in front of every wave even
    //    when multiple presses overlap. Mirrors BodyEffectOverlay.tsx. ──
    function spawnRideFireEmber(index,n){
      var roll=Math.random(), r, spd, fspd;
      if(roll<0.3){r=0.4+Math.random()*0.8;spd=0.3+Math.random()*1.2;fspd=0.6+Math.random()*1.2;}
      else if(roll<0.6){r=1.2+Math.random()*1.8;spd=0.2+Math.random()*0.9;fspd=0.2+Math.random()*0.5;}
      else if(roll<0.8){r=2.5+Math.random()*3;spd=0.1+Math.random()*0.4;fspd=0.05+Math.random()*0.15;}
      else{r=0.5+Math.random()*1;spd=0.4+Math.random()*1.8;fspd=0.3+Math.random()*0.8;}
      var kind=roll<0.3?'tiny':roll<0.6?'medium':roll<0.8?'large':'line';
      var angle=(index/n)*Math.PI*2 + (Math.random()-0.5)*(Math.PI*2/n);
      var useC1=Math.random()<0.6;
      return {
        angle:angle,
        // Strictly ahead of the wave's edge, tight band — never behind/inside
        // it, clustered close together as one shower riding the front.
        radialOffset: 0.03+Math.random()*0.12,
        wobbleAmp: 0.12+Math.random()*0.3, wobbleFreq: 1+Math.random()*2, wobblePhase: Math.random()*Math.PI*2,
        bobAmp: 0.02+Math.random()*0.04, bobFreq: 1.5+Math.random()*2.5, bobPhase: Math.random()*Math.PI*2,
        r:r, kind:kind,
        hue:useC1?FIRE_HUE1+(Math.random()-0.5)*20:FIRE_HUE2+(Math.random()-0.5)*20,
        sat:90, fp:Math.random()*Math.PI*2, fs:fspd, spd:spd
      };
    }
    function updateAndDrawRideFireEmbers(embers, cx, cy, R, maxSpread, age, alpha, intensity){
      for(var i=0; i<embers.length; i++){
        var em=embers[i];
        var emberAngle = em.angle + Math.sin(age*em.wobbleFreq + em.wobblePhase) * em.wobbleAmp;
        // Bob is 0..bobAmp (not -bobAmp..bobAmp) — a plain sine could swing
        // negative and pull the ember behind the wave despite radialOffset
        // itself always being positive. Mirrors BodyEffectOverlay.tsx exactly.
        var bob = (0.5 + 0.5*Math.sin(age*em.bobFreq + em.bobPhase)) * em.bobAmp;
        var emberR = R + (em.radialOffset + bob)*maxSpread;
        if(emberR < 1) continue;
        var px = cx + Math.cos(emberAngle)*emberR;
        var py = cy + Math.sin(emberAngle)*emberR;

        var flicker=(Math.sin(age*em.fs*4+em.fp)+1)/2;
        var a = alpha*intensity;
        if(a <= 0.01) continue;
        ctx.shadowBlur=0;

        // Lightness caps pulled down across this ride-ember rendering (was
        // 85-95%, functionally white regardless of hue) — Reactive Fire's
        // dense embers ring were reading as one solid white bezel around the
        // wave instead of colored sparks. Mirrors BodyEffectOverlay.tsx's
        // updateAndDrawRideEmbers exactly.
        if(em.kind==='tiny'){
          var ta=a*(0.3+0.7*flicker);
          ctx.beginPath();ctx.arc(px,py,em.r*(0.6+0.4*flicker),0,Math.PI*2);
          ctx.fillStyle='hsla('+em.hue+','+em.sat+'%,'+(62+10*flicker)+'%,'+ta+')';
          ctx.shadowBlur=4+8*flicker;ctx.shadowColor='hsla('+em.hue+','+em.sat+'%,58%,'+ta+')';ctx.fill();
        } else if(em.kind==='medium'){
          var ma=a*(0.4+0.6*flicker);
          ctx.beginPath();ctx.arc(px,py,em.r*(0.5+0.3*flicker),0,Math.PI*2);
          ctx.fillStyle='hsla('+em.hue+','+em.sat+'%,'+(55+15*flicker)+'%,'+ma+')';
          ctx.shadowBlur=5+5*flicker;ctx.shadowColor='hsla('+em.hue+','+em.sat+'%,55%,'+(ma*0.8)+')';ctx.fill();
          if(em.r>1.5){
            var ang0=emberAngle;
            ctx.save();ctx.translate(px-Math.cos(ang0)*em.r*2.5, py-Math.sin(ang0)*em.r*2.5);ctx.rotate(ang0);
            ctx.beginPath();ctx.ellipse(0,0,em.r*0.1,em.r*(0.5+0.4*flicker),0,0,Math.PI*2);
            ctx.fillStyle='hsla('+em.hue+','+em.sat+'%,50%,'+(ma*0.25)+')';ctx.fill();
            ctx.restore();
          }
        } else if(em.kind==='large'){
          var la=a*(0.45+0.55*flicker);
          var gr2=ctx.createRadialGradient(px,py,0,px,py,em.r*(1.2+0.4*flicker));
          gr2.addColorStop(0,'hsla('+em.hue+','+em.sat+'%,62%,'+la+')');
          gr2.addColorStop(0.5,'hsla('+em.hue+','+em.sat+'%,50%,'+(la*0.5)+')');
          gr2.addColorStop(1,'hsla('+em.hue+','+em.sat+'%,40%,0)');
          ctx.beginPath();ctx.arc(px,py,em.r*(1.2+0.4*flicker),0,Math.PI*2);
          ctx.fillStyle=gr2;ctx.fill();
          ctx.beginPath();ctx.arc(px,py,em.r*0.35,0,Math.PI*2);
          ctx.fillStyle='hsla('+em.hue+','+em.sat+'%,68%,'+(la*0.9)+')';ctx.fill();
        } else {
          var lna=a*(0.4+0.6*flicker), ang=emberAngle, len=6+em.spd*8+flicker*6;
          ctx.save();ctx.translate(px,py);ctx.rotate(ang);
          var sg=ctx.createLinearGradient(-len,0,em.r*2,0);
          sg.addColorStop(0,'hsla('+em.hue+','+em.sat+'%,58%,0)');
          sg.addColorStop(0.6,'hsla('+em.hue+','+em.sat+'%,60%,'+(lna*0.6)+')');
          sg.addColorStop(1,'hsla('+em.hue+','+em.sat+'%,68%,'+lna+')');
          ctx.beginPath();ctx.moveTo(-len,0);ctx.lineTo(em.r*2,0);
          ctx.strokeStyle=sg;ctx.lineWidth=em.r*(0.6+0.6*flicker);ctx.lineCap='round';
          ctx.shadowBlur=4+6*flicker;ctx.shadowColor='hsla('+em.hue+','+em.sat+'%,58%,'+(lna*0.8)+')';
          ctx.stroke();ctx.restore();
        }
      }
    }
    function initReactiveFire(){
      var events = [];
      var prevPressed = {};
      var ft = 0;
      function tick(){
        ft += 0.016;
        var w=canvas.width, h=canvas.height;
        ctx.clearRect(0,0,w,h);
        // Same time coefficient as reactive (0.22).
        var life = Math.max(SPEED, 0.5) * 0.22;
        events = events.filter(function(e){ return ft - e.startT < e.life; });
        for(var idx in pressedButtons){
          if(pressedButtons[idx] && !prevPressed[idx]){
            var pos = btnPositions[idx];
            if(pos){
              var cx=(pos.x/100)*w, cy=(pos.y/100)*h;
              var n = 100; // a ton more embers — a dense, busy shower
              var embers = [];
              for(var i=0;i<n;i++) embers.push(spawnRideFireEmber(i,n));
              var lobeCount = 14;
              var lobes = [];
              for(var li=0; li<lobeCount; li++){
                lobes.push({
                  angle: (li/lobeCount)*Math.PI*2 + (Math.random()-0.5)*(Math.PI*2/lobeCount)*0.8,
                  sizeMult: 0.7+Math.random()*0.9,
                  phase: Math.random()*Math.PI*2,
                  freq: 3+Math.random()*4,
                  hueT: Math.random()
                });
              }
              events.push({cx:cx, cy:cy, startT:ft, life:life, embers:embers, lobes:lobes});
            }
          }
        }
        prevPressed = {};
        for(var k in pressedButtons) prevPressed[k] = pressedButtons[k];

        // Matches reactive's spread coefficient (1.3).
        var maxSpread = Math.max(w,h) * 1.3;
        var mixHue = function(t){ return FIRE_HUE1 + (FIRE_HUE2-FIRE_HUE1)*t; };
        var mixSat = function(t){ return FIRE_SAT1 + (FIRE_SAT2-FIRE_SAT1)*t; };

        // Pass 1 — every wave first. A smooth multi-stop blend through the
        // two colors (not a hard 40%/70% split) plus several pulsing "lobes"
        // riding the ring at different angles/phases — that raggedness plus
        // flicker is what actually reads as fire instead of a flat ring.
        for(var ei=0; ei<events.length; ei++){
          var evt = events[ei];
          var age = ft - evt.startT;
          var frac = Math.min(1, age / evt.life);
          var R = frac * maxSpread;
          var alpha = Math.max(0, 1-frac) * INTENSITY;
          if(alpha <= 0.02 || R < 1) continue;
          var T = Math.max(w,h) * 0.05;

          var grd = ctx.createRadialGradient(evt.cx, evt.cy, Math.max(0,R-T), evt.cx, evt.cy, R+T);
          grd.addColorStop(0,    'hsla('+mixHue(0)+','+mixSat(0)+'%,58%,0)');
          grd.addColorStop(0.15, 'hsla('+mixHue(0)+','+mixSat(0)+'%,58%,'+(alpha)+')');
          grd.addColorStop(0.35, 'hsla('+mixHue(0.35)+','+mixSat(0.35)+'%,55%,'+(alpha*0.9)+')');
          grd.addColorStop(0.55, 'hsla('+mixHue(0.6)+','+mixSat(0.6)+'%,52%,'+(alpha*0.75)+')');
          grd.addColorStop(0.8,  'hsla('+mixHue(0.9)+','+mixSat(0.9)+'%,48%,'+(alpha*0.5)+')');
          grd.addColorStop(1,    'hsla('+mixHue(1)+','+mixSat(1)+'%,48%,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(0,0,w,h);

          for(var lo=0; lo<evt.lobes.length; lo++){
            var lobe = evt.lobes[lo];
            var pulse = 0.6 + 0.4*Math.sin(age*lobe.freq + lobe.phase);
            var lobeR = T * lobe.sizeMult * (0.8 + 0.5*pulse);
            var lx = evt.cx + Math.cos(lobe.angle)*R, ly = evt.cy + Math.sin(lobe.angle)*R;
            var lh = mixHue(lobe.hueT), ls = mixSat(lobe.hueT);
            var lgrd = ctx.createRadialGradient(lx, ly, 0, lx, ly, lobeR);
            lgrd.addColorStop(0,   'hsla('+lh+','+ls+'%,64%,'+(alpha*pulse)+')');
            lgrd.addColorStop(0.6, 'hsla('+lh+','+ls+'%,55%,'+(alpha*0.7*pulse)+')');
            lgrd.addColorStop(1,   'hsla('+lh+','+ls+'%,50%,0)');
            ctx.fillStyle = lgrd;
            ctx.beginPath(); ctx.arc(lx, ly, lobeR, 0, Math.PI*2); ctx.fill();
          }

          // Highlight+shadow bevel for real 3D depth — mirrors
          // BodyEffectOverlay.tsx's reactiveFire3DRef exactly.
          drawBevel(evt.cx, evt.cy, R, Math.max(w,h)*0.045, alpha);
        }

        // Pass 2 — every ember on top, riding its wave's current radius
        for(var ej=0; ej<events.length; ej++){
          var evt2 = events[ej];
          var age2 = ft - evt2.startT;
          var frac2 = Math.min(1, age2 / evt2.life);
          var R2 = frac2 * maxSpread;
          var alpha2 = Math.max(0, 1-frac2);
          updateAndDrawRideFireEmbers(evt2.embers, evt2.cx, evt2.cy, R2, maxSpread, age2, alpha2, INTENSITY);
        }
        requestAnimationFrame(tick);
      }
      tick();
    }

    // ── Particles ──
    function initParticles(){
      var particles = [];
      function randP(){
        var a=Math.random()*Math.PI*2, s=0.1+Math.random()*0.7, ml=80+Math.random()*220;
        var hue = PARTICLES_RAINBOW ? Math.random()*360 : PARTICLES_HUE + (Math.random()-0.5)*14;
        var hueShift = PARTICLES_RAINBOW ? (Math.random()-0.5)*1.5 : 0;
        return {x:Math.random()*canvas.width,y:Math.random()*canvas.height,
          vx:Math.cos(a)*s,vy:Math.sin(a)*s-Math.random()*0.3,
          r:0.5+Math.random()*1.8,hue:hue,hueShift:hueShift,
          life:Math.random()*ml,maxLife:ml,twinkle:Math.random()*Math.PI*2,
          twinkleSpeed:0.02+Math.random()*0.08,opacity:0.7+Math.random()*0.3};
      }
      // More, smaller particles — mirrors BodyEffectOverlay.tsx's particleRef.
      var count=Math.round(90*INTENSITY)+60;
      for(var i=0;i<count;i++) particles.push(randP());
      var ss=6/Math.max(SPEED,0.5);
      function tick(){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        for(var i=0;i<particles.length;i++){
          var p=particles[i];
          // Random per-frame jitter plus an occasional hard direction snap
          // for a sporadic/darting motion instead of smooth floating.
          p.vx += (Math.random()-0.5)*0.14; p.vy += (Math.random()-0.5)*0.14;
          if(Math.random()<0.015){ var sa=Math.random()*Math.PI*2, ss2=0.4+Math.random()*0.8; p.vx=Math.cos(sa)*ss2; p.vy=Math.sin(sa)*ss2; }
          var sp=Math.sqrt(p.vx*p.vx+p.vy*p.vy), maxSp=1.3;
          if(sp>maxSp){ p.vx=p.vx/sp*maxSp; p.vy=p.vy/sp*maxSp; }
          p.x+=p.vx*ss; p.y+=p.vy*ss; p.hue=(p.hue+p.hueShift*ss)%360;
          p.life+=ss; p.twinkle+=p.twinkleSpeed*ss;
          if(p.x<-10)p.x=canvas.width+10; if(p.x>canvas.width+10)p.x=-10;
          if(p.y<-10)p.y=canvas.height+10; if(p.y>canvas.height+10)p.y=-10;
          if(p.life>=p.maxLife){particles[i]=randP();continue;}
          var lf=p.life/p.maxLife,fade=lf<0.15?lf/0.15:lf>0.75?1-(lf-0.75)/0.25:1;
          var tw=(Math.sin(p.twinkle)+1)/2;
          // Floor raised from 0.65+0.35*tw to 0.8+0.2*tw, plus an
          // intensity-driven size/glow boost — mirrors BodyEffectOverlay.tsx's
          // particleRef exactly.
          var boost=0.6+0.4*INTENSITY;
          var a=fade*p.opacity*(0.8+0.2*tw)*INTENSITY;
          var pr=p.r*(0.85+0.35*tw)*boost;
          // Soft blurred drop shadow via radial gradient — mirrors
          // BodyEffectOverlay.tsx's particleRef exactly.
          var sx=p.x+pr*0.9, sy=p.y+pr*1.3, sr=pr*2.2;
          var shGrd=ctx.createRadialGradient(sx,sy,0,sx,sy,sr);
          shGrd.addColorStop(0,'rgba(0,0,0,'+(a*0.65)+')');
          shGrd.addColorStop(0.6,'rgba(0,0,0,'+(a*0.35)+')');
          shGrd.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=shGrd;
          ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill();

          ctx.beginPath(); ctx.arc(p.x,p.y,pr,0,Math.PI*2);
          ctx.fillStyle='hsla('+p.hue+',90%,70%,'+a+')';
          ctx.shadowBlur=(4+3*tw)*boost; ctx.shadowColor='hsla('+p.hue+',90%,65%,'+(a*0.6)+')';
          ctx.fill();
          ctx.shadowBlur=0;
        }
        requestAnimationFrame(tick);
      }
      tick();
    }

    // ── Pulse Glow ──
    // Rim hugging the outer edge (punch a blurred, inset hole out of a
    // filled canvas — the wrap's own silhouette CSS mask then clips it to
    // the controller's real shape). Once per cycle a wave detaches from the
    // rim's own inner boundary (not the controller's true outer edge) and
    // travels to the center; rim and wave share one envelope so they read
    // as one pulse instead of two separate layered effects.
    function initPulseGlow(){
      var t=0, ss=1/Math.max(SPEED,0.5);
      var col='${config.pulseGlowColor || "#ffffff"}';
      var r=parseInt(col.slice(1,3),16), g2=parseInt(col.slice(3,5),16), b=parseInt(col.slice(5,7),16);
      function ha(a){ return 'rgba('+r+','+g2+','+b+','+a+')'; }
      function roundRectPath(x,y,w,h,rad){
        var rr=Math.min(rad,w/2,h/2);
        ctx.moveTo(x+rr,y);
        ctx.arcTo(x+w,y,x+w,y+h,rr);
        ctx.arcTo(x+w,y+h,x,y+h,rr);
        ctx.arcTo(x,y+h,x,y,rr);
        ctx.arcTo(x,y,x+w,y,rr);
        ctx.closePath();
      }
      function tick(){
        var w=canvas.width, h=canvas.height;
        ctx.clearRect(0,0,w,h);
        t+=0.016*ss;
        var cyclePos=t-Math.floor(t);
        var env=Math.sin(cyclePos*Math.PI);
        var cx=w/2, cy=h/2;

        var insetFrac=0.14;
        var insetX=w*insetFrac, insetY=h*insetFrac;
        var cornerR=Math.min(insetX,insetY)*1.4;
        var rimAlpha=(0.45+0.55*env)*INTENSITY;
        ctx.save();
        ctx.fillStyle=ha(rimAlpha);
        ctx.fillRect(0,0,w,h);
        ctx.globalCompositeOperation='destination-out';
        ctx.filter='blur('+(Math.max(insetX,insetY)*0.35)+'px)';
        ctx.beginPath();
        roundRectPath(insetX,insetY,w-insetX*2,h-insetY*2,cornerR);
        ctx.fillStyle='rgba(0,0,0,1)';
        ctx.fill();
        ctx.restore();

        var ringStartR=1-insetFrac;
        var ringR=ringStartR*(1-cyclePos);
        var ringFadeIn=Math.min(1,cyclePos/0.05);
        var centerFalloff=Math.pow(ringR/ringStartR,1.4);
        var ringAlpha=ringFadeIn*centerFalloff*INTENSITY*0.95;
        var ringThickness=ringStartR*0.26;
        if(ringR>0.02 && ringAlpha>0.02){
          ctx.save();
          ctx.translate(cx,cy);
          ctx.scale(w/2,h/2);
          var rg=ctx.createRadialGradient(0,0,Math.max(0,ringR-ringThickness),0,0,ringR+ringThickness);
          rg.addColorStop(0,ha(0));
          rg.addColorStop(0.5,ha(ringAlpha));
          rg.addColorStop(1,ha(0));
          ctx.fillStyle=rg;
          ctx.fillRect(-2,-2,4,4);
          ctx.restore();
        }
        requestAnimationFrame(tick);
      }
      tick();
    }

    // ── Fire ──
    function initFire(){
      var embers=[], tGlow=0;
      var ssG=1/Math.max(FIRE_GLOW_SPEED,0.5), ssE=6/Math.max(FIRE_EMBER_SPEED,0.5);

      // Two canvases: glow + embers — we'll draw both on the single canvas sequentially
      function spawnEmber(){
        var roll=Math.random(), r, spd, ml, fspd;
        if(roll<0.3){r=0.4+Math.random()*0.8;spd=0.3+Math.random()*1.2;ml=20+Math.random()*50;fspd=0.6+Math.random()*1.2;}
        else if(roll<0.6){r=1.2+Math.random()*1.8;spd=0.2+Math.random()*0.9;ml=50+Math.random()*100;fspd=0.2+Math.random()*0.5;}
        else if(roll<0.8){r=2.5+Math.random()*3;spd=0.1+Math.random()*0.4;ml=80+Math.random()*140;fspd=0.05+Math.random()*0.15;}
        else{r=0.5+Math.random()*1;spd=2.5+Math.random()*4.5;ml=30+Math.random()*70;fspd=0.3+Math.random()*0.8;}
        var kind=roll<0.3?'tiny':roll<0.6?'medium':roll<0.8?'large':'line';
        // Wider angle spread (1.6→1.9) and taller spawn band (0.65→0.55
        // start) for a more chaotic, sporadic-looking shower.
        var angle=-Math.PI/2+(Math.random()-0.5)*Math.PI*1.9;
        var useC1=Math.random()<0.6;
        return {x:Math.random()*canvas.width, y:canvas.height*(0.55+Math.random()*0.45),
          vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd, r:r,
          life:0, maxLife:ml, kind:kind,
          hue:useC1?FIRE_HUE1+(Math.random()-0.5)*20:FIRE_HUE2+(Math.random()-0.5)*20,
          sat:90, fp:Math.random()*Math.PI*2, fs:fspd, spd:spd};
      }
      // More embers for a busier, more sporadic shower.
      var target=Math.round(75*INTENSITY)+45;
      for(var i=0;i<target;i++){var em=spawnEmber();em.life=Math.random()*em.maxLife;embers.push(em);}

      // Independently-pulsing lobes along the bottom glow's edge — mirrors
      // BodyEffectOverlay.tsx's fireGlowLobesRef exactly.
      var glowLobes=[];
      (function(){
        var n=10;
        for(var i=0;i<n;i++){
          glowLobes.push({
            xFrac:(i+0.5)/n + (Math.random()-0.5)*0.07,
            freq:0.5+Math.random()*1.3,
            phase:Math.random()*Math.PI*2,
            heightMult:0.6+Math.random()*0.9
          });
        }
      })();

      function tick(){
        var w=canvas.width,h=canvas.height;
        ctx.clearRect(0,0,w,h);
        // Glow layer
        tGlow+=0.016*ssG;
        var breathe=0.08*Math.sin(tGlow*Math.PI*2), glowH=h*(0.55+breathe);
        var grd=ctx.createLinearGradient(0,h,0,h-glowH);
        grd.addColorStop(0,'hsla('+FIRE_HUE1+','+FIRE_SAT1+'%,'+FIRE_LIGHT1+'%,'+(0.95*INTENSITY)+')');
        grd.addColorStop(0.22,'hsla('+FIRE_HUE1+','+FIRE_SAT1+'%,'+FIRE_LIGHT1+'%,'+(0.8*INTENSITY)+')');
        grd.addColorStop(0.5,'hsla('+FIRE_HUE2+','+FIRE_SAT2+'%,'+FIRE_LIGHT2+'%,'+(0.45*INTENSITY)+')');
        grd.addColorStop(0.75,'hsla('+FIRE_HUE2+','+FIRE_SAT2+'%,'+FIRE_LIGHT2+'%,'+(0.12*INTENSITY)+')');
        grd.addColorStop(1,'hsla('+FIRE_HUE2+','+FIRE_SAT2+'%,'+FIRE_LIGHT2+'%,0)');
        ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);

        // Uneven flame-line lobes riding the glow's edge, each pulsing on
        // its own frequency/phase instead of one smooth breathing band.
        for(var gl=0; gl<glowLobes.length; gl++){
          var lobe=glowLobes[gl];
          var pulse=0.5+0.5*Math.sin(tGlow*Math.PI*2*lobe.freq+lobe.phase);
          var lx=lobe.xFrac*w;
          var lr=glowH*lobe.heightMult*(0.45+0.55*pulse)*0.8;
          if(lr<1) continue;
          var lgrd=ctx.createRadialGradient(lx,h,0,lx,h,lr);
          lgrd.addColorStop(0,'hsla('+FIRE_HUE1+','+FIRE_SAT1+'%,'+FIRE_LIGHT1+'%,'+(0.6*INTENSITY*pulse)+')');
          lgrd.addColorStop(0.5,'hsla('+FIRE_HUE2+','+FIRE_SAT2+'%,'+FIRE_LIGHT2+'%,'+(0.35*INTENSITY*pulse)+')');
          lgrd.addColorStop(1,'hsla('+FIRE_HUE2+','+FIRE_SAT2+'%,'+FIRE_LIGHT2+'%,0)');
          ctx.fillStyle=lgrd;
          ctx.beginPath(); ctx.arc(lx,h,lr,0,Math.PI*2); ctx.fill();
        }
        // Embers
        while(embers.length<target) embers.push(spawnEmber());
        for(var i=0;i<embers.length;i++){
          var em=embers[i];
          em.x+=em.vx*ssE; em.y+=em.vy*ssE; em.vy-=0.012*ssE; em.vx+=(Math.random()-0.5)*0.05*ssE; em.life+=ssE;
          if(em.life>=em.maxLife||em.y<-10){embers[i]=spawnEmber();continue;}
          var lf=em.life/em.maxLife,fade=lf<0.1?lf/0.1:lf>0.72?1-(lf-0.72)/0.28:1;
          var flicker=(Math.sin(em.life*em.fs+em.fp)+1)/2;
          var bottomBand=h*0.4, vertFadeLinear=Math.max(0,Math.min(1,(h-em.y)/bottomBand)), vertFade=vertFadeLinear*vertFadeLinear;
          var a=fade*INTENSITY*vertFade;
          ctx.shadowBlur=0;
          if(em.kind==='tiny'){
            var ta=a*(0.3+0.7*flicker);
            ctx.beginPath();ctx.arc(em.x,em.y,em.r*(0.6+0.4*flicker),0,Math.PI*2);
            ctx.fillStyle='hsla('+em.hue+','+em.sat+'%,'+(85+10*flicker)+'%,'+ta+')';
            ctx.shadowBlur=4+8*flicker;ctx.shadowColor='hsla('+em.hue+','+em.sat+'%,80%,'+ta+')';ctx.fill();
          } else if(em.kind==='medium'){
            var ma=a*(0.4+0.6*flicker);
            ctx.beginPath();ctx.arc(em.x,em.y,em.r*(0.5+0.3*flicker),0,Math.PI*2);
            ctx.fillStyle='hsla('+em.hue+','+em.sat+'%,'+(75+20*flicker)+'%,'+ma+')';
            ctx.shadowBlur=5+5*flicker;ctx.shadowColor='hsla('+em.hue+','+em.sat+'%,75%,'+(ma*0.8)+')';ctx.fill();
          } else if(em.kind==='large'){
            var la=a*(0.45+0.55*flicker);
            var gr2=ctx.createRadialGradient(em.x,em.y,0,em.x,em.y,em.r*(1.2+0.4*flicker));
            gr2.addColorStop(0,'hsla('+em.hue+','+em.sat+'%,80%,'+la+')');
            gr2.addColorStop(0.5,'hsla('+em.hue+','+em.sat+'%,60%,'+(la*0.5)+')');
            gr2.addColorStop(1,'hsla('+em.hue+','+em.sat+'%,40%,0)');
            ctx.beginPath();ctx.arc(em.x,em.y,em.r*(1.2+0.4*flicker),0,Math.PI*2);
            ctx.fillStyle=gr2;ctx.fill();
          } else {
            var lna=a*(0.4+0.6*flicker), ang=Math.atan2(em.vy,em.vx), len=6+em.spd*8+flicker*6;
            ctx.save();ctx.translate(em.x,em.y);ctx.rotate(ang);
            var sg=ctx.createLinearGradient(-len,0,em.r*2,0);
            sg.addColorStop(0,'hsla('+em.hue+','+em.sat+'%,70%,0)');
            sg.addColorStop(0.6,'hsla('+em.hue+','+em.sat+'%,80%,'+(lna*0.6)+')');
            sg.addColorStop(1,'hsla('+em.hue+','+em.sat+'%,95%,'+lna+')');
            ctx.beginPath();ctx.moveTo(-len,0);ctx.lineTo(em.r*2,0);
            ctx.strokeStyle=sg;ctx.lineWidth=em.r*(0.6+0.6*flicker);ctx.lineCap='round';
            ctx.shadowBlur=4+6*flicker;ctx.shadowColor='hsla('+em.hue+','+em.sat+'%,80%,'+(lna*0.8)+')';
            ctx.stroke();ctx.restore();
          }
        }
        requestAnimationFrame(tick);
      }
      tick();
    }

    // ── Hex Grid ──
  }
  ${BODY_EFFECTS_ENABLED.filter(e => e.enabled).map(e => `initBodyEffect('body-effect-canvas-${e.id}','body-effect-${e.id}','${e.id}');`).join("\n  ")}
  ` : ""}
  // ── Watermark ──
  ${config.showWatermark ? `
  (function(){
    var vid = document.createElement('video');
    vid.src = '${WATERMARK_DATA_URL}';
    vid.muted = true; vid.playsInline = true;
    // Each controller body sits a little differently in frame, so the
    // watermark's vertical position is tuned per controller type rather than
    // using one fixed value for all of them.
    // (See lib/watermarkPosition.ts — top is where the LOGO's center goes.)
    vid.style.cssText = 'position:absolute;top:${watermarkCenterY(config.controllerType)}%;left:50%;transform:translate(-50%,-${WATERMARK_LOGO_CENTER_IN_VIDEO}%);width:50%;pointer-events:none;';
    // Appended inside #controller-blur-wrap (not #controller itself) so it
    // still inherits the blur filter when disconnected, same as everything
    // else inside the wrapper — while #disconnected-msg, a sibling outside
    // the wrapper, always stacks on top of it unblurred.
    document.getElementById('controller-blur-wrap').appendChild(vid);
    // The clip plays all the way through and holds on the finished logo. After
    // that hold, fade it out instead of leaving it up until the next replay.
    // The replay still starts 10s after the clip ends. Keep in sync with
    // ControllerPreview.tsx.
    var HOLD_MS = 2500, FADE_SECONDS = 1, wmFadeTimer = 0;
    function playOnce(){
      clearTimeout(wmFadeTimer);
      vid.style.transition = 'none';
      vid.style.opacity = '1';
      vid.currentTime = 0;
      vid.play();
    }
    vid.onended = function(){
      wmFadeTimer = setTimeout(function(){
        vid.style.transition = 'opacity ' + FADE_SECONDS + 's ease-in-out';
        vid.style.opacity = '0';
      }, HOLD_MS);
      setTimeout(playOnce, 10000);
    };
    playOnce();
  })();
  ` : ""}
})();
<\/script>
</body>
</html>`;

  // Obfuscate the embedded <script>...<\/script> content before returning —
  // every export gets this automatically, no separate build/queue step.
  // The HTML/CSS around it is left untouched (only the JS is processed).
  return html.replace(/<script>([\s\S]*?)<\\\/script>/, (_match, jsContent: string) => {
    return `<script>${obfuscateScript(jsContent)}<\\/script>`;
  });
}
