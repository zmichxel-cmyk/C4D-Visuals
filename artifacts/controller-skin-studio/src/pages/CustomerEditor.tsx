import { useEffect, useRef, useState } from "react";
import { ControllerConfig, DEFAULT_CONFIG, LayoutOverrides, DEFAULT_OVERRIDES, migrateLegacyConfig } from "../types/config";
import { ControllerPreview } from "../components/ControllerPreview";
import { ConfigPanel } from "../components/ConfigPanel";
import { C4D1_STICKS, PS_STICKS } from "../components/SkinPanel";
import { useLogoCompositor, LogoCanvas, LogoControls } from "../components/LogoEditor";
import { BezelSlotPicker } from "../components/BezelSlotPicker";
import { ThumbstickSlotPicker } from "../components/ThumbstickSlotPicker";
import { computeAddedItems, PricedItem } from "../lib/pricing";
import { CONTROLLER_TYPES } from "../lib/layouts";
import { generateExportHtml } from "../lib/exportHtml";
import { supabase } from "../lib/supabase";

interface ProductData {
  config: ControllerConfig;
  overrides: LayoutOverrides;
}

interface CtrlPreset {
  name: string;
  config: ControllerConfig;
  overrides: LayoutOverrides;
}

// DEV TESTING: presets saved in the internal Studio tool (index.html) live
// in this same browser's localStorage under css-presets-<controllerType> —
// same origin, same storage, so a preset saved there is readable here too.
// Searches every controller type since the slug alone doesn't say which one
// it's under. Returns null (not DEFAULT_CONFIG) when nothing matches, so the
// caller can fall through to the real product-catalog fetch.
function loadFromLocalPreset(productSlug: string): ProductData | null {
  for (const { id } of CONTROLLER_TYPES) {
    try {
      const raw = localStorage.getItem(`css-presets-${id}`);
      if (!raw) continue;
      const presets: CtrlPreset[] = JSON.parse(raw);
      const match = presets.find(p => p.name === productSlug);
      if (match) {
        migrateLegacyConfig(match.config);
        return {
          config: { ...DEFAULT_CONFIG, ...match.config },
          overrides: match.overrides ?? DEFAULT_OVERRIDES,
        };
      }
    } catch { /* malformed entry for this type — keep checking the others */ }
  }
  return null;
}

// ── Product config loading ───────────────────────────────────────────────
// The base skin/color is locked to whatever the customer bought — this page
// never lets them swap it. The starting config comes from the product they
// clicked "Customize" on, identified via ?product=<slug> in the URL.
//
// A product is exactly a Studio.tsx preset — { config, overrides } — saved
// when the controller was built in the internal tool. config already carries
// bezelSlots/baseSkinNoBezels (bezel position+size, captured at bake time)
// and overrides already carries button/stick position+size — so nothing
// customers see here ever needs to be moved, only swapped from a library.
//
// Product configs are static JSON files at /products/<slug>.json — that's
// the real product catalog for now: a preset exported from the internal
// tool's { config, overrides } shape, dropped as a plain file into the
// website repo (see C4D-Website/products/RGB.json for the first one).
// Swap for a real backend/CMS query later if the catalog outgrows static
// files; the shape returned here is all that matters to the rest of this page.
//
// PRODUCT_BASE_URL exists only because local dev runs the customizer (Vite,
// :5173) and the website (:4173) on different origins — a same-origin
// relative fetch is all that's needed once both are actually deployed under
// one domain. Override via ?productBase=http://localhost:4173 while testing
// the iframe locally; defaults to same-origin otherwise.
const PRODUCT_BASE_URL = new URLSearchParams(window.location.search).get("productBase") ?? "";

async function loadProductConfig(productSlug: string | null): Promise<ProductData> {
  if (!productSlug) return { config: DEFAULT_CONFIG, overrides: DEFAULT_OVERRIDES };
  const local = loadFromLocalPreset(productSlug);
  if (local) return local;
  try {
    const res = await fetch(`${PRODUCT_BASE_URL}/products/${encodeURIComponent(productSlug)}.json`);
    if (!res.ok) return { config: DEFAULT_CONFIG, overrides: DEFAULT_OVERRIDES };
    const parsed = await res.json();
    migrateLegacyConfig(parsed.config);
    return {
      config: { ...DEFAULT_CONFIG, ...parsed.config },
      overrides: parsed.overrides ?? DEFAULT_OVERRIDES,
    };
  } catch {
    return { config: DEFAULT_CONFIG, overrides: DEFAULT_OVERRIDES };
  }
}

// ── Finalize / checkout ──────────────────────────────────────────────────
// The full config (can be multi-MB with embedded logo/bezel images) is way
// past what Stripe's metadata fields can carry, so the flow is:
//   1. Generate the actual OBS-ready export HTML from the finished design
//      (same generateExportHtml() the internal Studio tool's own "Export
//      HTML for OBS" button uses) and upload it to Supabase Storage.
//   2. Insert a `customizer_orders` row (status "pending") referencing that
//      file — see supabase-customizer-orders-schema.sql in the website repo.
//   3. Call the create-checkout-session Edge Function with just the order's
//      id + amount; it creates the real Stripe Checkout Session (needs the
//      secret key, so that part can't run in the browser) and returns its
//      URL to redirect to.
// The order stays "pending" until the stripe-webhook Edge Function sees
// Stripe's checkout.session.completed event, marks it "paid", and emails
// the customer the generated file + a README — nothing here grants the
// file before payment actually clears.
async function saveForCheckout(
  productSlug: string | null, config: ControllerConfig, overrides: LayoutOverrides, addOnsTotal: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Checkout isn't configured yet (missing Supabase env vars)." };

  try {
    const html = await generateExportHtml(config, overrides);
    const orderId = crypto.randomUUID();
    const exportPath = `${orderId}.html`;

    const { error: uploadError } = await supabase.storage
      .from("customizer-exports")
      .upload(exportPath, new Blob([html], { type: "text/html" }), { contentType: "text/html" });
    if (uploadError) return { ok: false, error: `Couldn't save your design: ${uploadError.message}` };

    const { error: insertError } = await supabase.from("customizer_orders").insert({
      id: orderId,
      product_slug: productSlug,
      config, overrides,
      export_html_path: exportPath,
      add_ons_total: addOnsTotal,
      status: "pending",
    });
    if (insertError) return { ok: false, error: `Couldn't save your design: ${insertError.message}` };

    // create-checkout-session only ever sees the order id + total, never the
    // config itself — it looks the order up server-side before building the
    // Stripe session, same as the webhook does after payment.
    const { data, error: fnError } = await supabase.functions.invoke("create-checkout-session", {
      body: { orderId, addOnsTotal },
    });
    if (fnError || !data?.url) return { ok: false, error: `Couldn't start checkout: ${fnError?.message ?? "no checkout URL returned"}` };

    window.location.href = data.url;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong starting checkout." };
  }
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

const STEPS = [
  { key: "bezels", label: "Bezels & Thumbsticks" },
  { key: "effects", label: "Effects" },
  { key: "logo", label: "Logo" },
  { key: "finalize", label: "Finalize" },
] as const;
type StepKey = typeof STEPS[number]["key"];

export function CustomerEditor() {
  const productSlug = new URLSearchParams(window.location.search).get("product");

  // startConfig is a frozen snapshot of the product's starting point — every
  // add-on price is computed as a diff against it, never mutated afterward.
  const [startConfig, setStartConfig] = useState<ControllerConfig | null>(null);
  const [config, setConfig] = useState<ControllerConfig | null>(null);
  const [overrides, setOverrides] = useState<LayoutOverrides>(DEFAULT_OVERRIDES);
  const [hasCustomLogo, setHasCustomLogo] = useState(false);
  const [hasCustomBezels, setHasCustomBezels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("bezels");
  // Left card height, frozen at the first click inside it so opening a
  // bezel/thumbstick picker scrolls inside the card instead of growing it.
  const leftCardRef = useRef<HTMLDivElement>(null);
  const [leftCardH, setLeftCardH] = useState<number | null>(null);
  useEffect(() => { setLeftCardH(null); }, [step]);
  // How many bezel/thumbstick pickers are currently open; the bottom fade shows only while > 0.
  const [openPickerCount, setOpenPickerCount] = useState(0);
  const onPickerOpenChange = (open: boolean) => setOpenPickerCount(c => c + (open ? 1 : -1));
  const stepIdx = STEPS.findIndex(s => s.key === step);

  // Every field the customer touches — bezels, thumbsticks, colors, effects,
  // logo — already lands directly in `config`, so there's nothing left to
  // technically "apply" before checkout. `baked` is a deliberate confirmation
  // gate instead: Add to Cart stays disabled until the customer reaches
  // Finalize and explicitly confirms the design (with a brief animated
  // moment, not a real data transform), and any further edit after that
  // un-confirms it again.
  const [baked, setBaked] = useState(false);
  const [baking, setBaking] = useState(false);
  const bakeVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadProductConfig(productSlug).then(({ config, overrides }) => {
      if (cancelled) return;
      setConfig(config);
      setStartConfig(config);
      setOverrides(overrides);
    });
    return () => { cancelled = true; };
  }, [productSlug]);

  // Lets a host page (showroom.html's preload-then-reveal splash) know this
  // isn't just an empty iframe shell anymore — the product data has loaded
  // and the controller has actually painted. Double-rAF so it fires after
  // the browser has committed that paint, not just after React's render.
  useEffect(() => {
    if (!config) return;
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.parent?.postMessage({ type: "c4d-customize-ready" }, "*");
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [config]);

  const handleChange = (updates: Partial<ControllerConfig>) => {
    setConfig(c => (c ? { ...c, ...updates } : c));
    setBaked(false);
  };

  const handleFinalize = () => {
    setBaking(true);
  };

  // Plays the full logo animation (not a trimmed/fixed-length cut) — waits
  // for the video's own "ended" event once it's mounted, with a short
  // fallback in case playback fails to start at all.
  useEffect(() => {
    if (!baking) return;
    const video = bakeVideoRef.current;
    if (!video) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setBaking(false);
      setBaked(true);
    };
    video.currentTime = 0;
    video.play().catch(() => {});
    video.addEventListener("ended", finish);
    video.addEventListener("error", finish);
    const fallback = setTimeout(finish, 8000);
    return () => {
      video.removeEventListener("ended", finish);
      video.removeEventListener("error", finish);
      clearTimeout(fallback);
    };
  }, [baking]);

  const addedItems: PricedItem[] = config && startConfig ? computeAddedItems(startConfig, config, hasCustomLogo, hasCustomBezels) : [];
  const addOnsTotal = addedItems.reduce((sum, i) => sum + i.price, 0);

  // Called unconditionally (hooks rule) — the compositor just idles until a
  // logo is uploaded, and its base image tracks whatever the current skin is.
  const logoEditor = useLogoCompositor(config?.controllerSkin ?? "", config?.homeButtonZone);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveForCheckout(productSlug, config, overrides, addOnsTotal);
      if (!result.ok) setSaveError(result.error);
      // On success saveForCheckout already redirected the page to Stripe —
      // nothing left to do here, and setSaving(false) below never actually
      // renders since the navigation happens first.
    } finally {
      setSaving(false);
    }
  };

  const defaultTab: "c4d1" | "ps" =
    config && (config.controllerType === "c4d1" || config.controllerType === "c4d1-edge") ? "c4d1" : "ps";

  if (!config) {
    return (
      <div className="customize-theme w-screen h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading your controller…
      </div>
    );
  }

  return (
    <div className="customize-theme w-screen h-screen bg-black flex flex-col text-foreground overflow-hidden relative isolate">
      <div aria-hidden className="absolute inset-0 -z-10 pointer-events-none"
        style={{ backgroundImage: "url(./wood-panel-bg.webp)", backgroundRepeat: "no-repeat", backgroundPosition: "center 100%", backgroundSize: "cover", boxShadow: "inset 0 70px 60px -25px rgba(0,0,0,0.9), inset 0 -70px 60px -25px rgba(0,0,0,0.9)" }} />
      {/* Tracker sits above the framed area entirely, on plain black —
          not part of the bordered video frame below. */}
      <div className="relative flex-none flex items-center justify-center px-6 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2.5">
              {/* Purely a progress display now — Back/Next in the sidebar
                  are the only way to change steps, so a customer can't
                  jump ahead to Finalize (or anywhere else) without
                  actually going through each step. */}
              <div className="flex items-center gap-1.5">
                <span className={`step-badge flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border-2 transition-all ${
                  i < stepIdx ? "bg-primary border-primary text-primary-foreground"
                  : i === stepIdx ? "step-badge-active border-primary text-primary bg-black/60"
                  : "border-border text-muted-foreground bg-black/60"
                }`}>
                  {i < stepIdx ? "✓" : i + 1}
                </span>
                <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
                  i === stepIdx ? "text-foreground" : "text-muted-foreground"
                }`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className={`w-8 h-[2px] rounded-full ${i < stepIdx ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Three columns sitting directly on the plain black background — the
          editor card and cart card live in the black margins on either
          side, NOT inside the video frame. Only the controller sits inside
          the bordered frame in the middle. */}
      <div className="relative flex-1 flex overflow-hidden gap-4 px-6 pb-2">
        {/* Left — current step's controls, floating in the black area. */}
        <div ref={leftCardRef} style={leftCardH ? { height: leftCardH } : undefined}
          onPointerDownCapture={() => { if (step === "bezels" && leftCardH === null && leftCardRef.current) setLeftCardH(leftCardRef.current.offsetHeight); }}
          className="relative w-[300px] flex-none self-start flex flex-col max-h-full">
          <div className="customize-scroll flex-1 min-h-0 rounded-2xl bg-card/85 backdrop-blur-md border border-white/10 shadow-2xl overflow-y-auto p-4 space-y-3">
          {step === "bezels" && (
            <>
              {startConfig!.bezelSlots.length > 0 && startConfig!.baseSkinNoBezels ? (
                <BezelSlotPicker
                  onPickerOpenChange={onPickerOpenChange}
                  baseSkinNoBezels={startConfig!.baseSkinNoBezels}
                  slots={startConfig!.bezelSlots}
                  onApply={(dataUrl, changed) => {
                    // BezelSlotPicker also fires this on mount (once its base
                    // image finishes loading), not just on an actual material
                    // swap — and its recomposite only draws bezels, never the
                    // home button, so blindly applying that first call was
                    // silently stripping the home button from the product's
                    // already-correct baked controllerSkin. Only a real,
                    // user-driven change should ever overwrite it.
                    if (!changed) return;
                    handleChange({ controllerSkin: dataUrl });
                    setHasCustomBezels(true);
                  }}
                />
              ) : (
                <div className="border border-border rounded-lg bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground/70">This controller doesn't have any bezel materials to customize.</p>
                </div>
              )}
              <div className="space-y-2">
                <div className="pb-2 border-b border-border">
                  <span className="text-sm font-semibold">Thumbsticks</span>
                </div>
                <ThumbstickSlotPicker
                  onPickerOpenChange={onPickerOpenChange}
                  label="Left Thumbstick"
                  value={config.leftStickSkin}
                  entries={defaultTab === "c4d1" ? C4D1_STICKS : PS_STICKS}
                  onSelect={(url) => handleChange({ leftStickSkin: url })}
                />
                <ThumbstickSlotPicker
                  onPickerOpenChange={onPickerOpenChange}
                  label="Right Thumbstick"
                  value={config.rightStickSkin}
                  entries={defaultTab === "c4d1" ? C4D1_STICKS : PS_STICKS}
                  onSelect={(url) => handleChange({ rightStickSkin: url })}
                />
              </div>
            </>
          )}

          {step === "effects" && (
            <ConfigPanel
              config={config}
              overrides={overrides}
              onChange={handleChange}
              onResetOverrides={() => {}}
              showButtonLabels={false}
              onToggleLabels={() => {}}
              sections={["stickColors", "buttonPress", "bodyEffects", "rgbBody", "stickEffects"]}
            />
          )}

          {step === "logo" && (
            <LogoControls
              editor={logoEditor}
              onApply={(dataUrl) => { handleChange({ controllerSkin: dataUrl }); setHasCustomLogo(true); }}
            />
          )}

          {step === "finalize" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Review Your Build</p>
              <p className="text-xs text-muted-foreground/70">
                Check the preview on the right, then confirm your design below to unlock Add to Cart — you can still jump back to any step above first.
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">Controller Name</label>
                <input value={config.overlayName} onChange={e => handleChange({ overlayName: e.target.value })}
                  className="w-full text-xs bg-background/60 border border-border rounded-lg px-2.5 py-2" />
              </div>
              <button onClick={handleFinalize} disabled={baking || baked}
                className={`w-full py-2.5 px-3 rounded-lg font-semibold text-sm transition-all ${
                  baked ? "bg-primary/20 text-primary border border-primary/40 cursor-default"
                  : "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
                }`}>
                {baked ? "✓ Design Confirmed" : baking ? "Finalizing…" : "Finalize Design"}
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {stepIdx > 0 && (
              <button onClick={() => setStep(STEPS[stepIdx - 1].key)}
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                Back
              </button>
            )}
            {stepIdx < STEPS.length - 1 && (
              <button onClick={() => setStep(STEPS[stepIdx + 1].key)}
                className="flex-1 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-all">
                Next
              </button>
            )}
          </div>
          </div>
          {/* Soft fade at the bottom of the bezels/thumbsticks box so content
              reads as scrolling away rather than cut off. Only on that step. */}
          {step === "bezels" && openPickerCount > 0 && (
            <div aria-hidden className="pointer-events-none absolute left-0 right-0 bottom-0 h-14 rounded-b-2xl"
              style={{ background: "linear-gradient(to top, hsl(240 8% 4% / 1), hsl(240 8% 4% / 0))" }} />
          )}
        </div>

        {/* Center — the bordered video frame, containing ONLY the
            controller (no editor/cart boxes in here at all — those live in
            the black margins on either side). The video is clipped to this
            frame instead of bleeding full-width behind everything. */}
        <div className="customize-bg relative flex-1 min-w-0 mx-3 mt-0 mb-6 rounded-2xl border border-white/20 shadow-2xl overflow-hidden flex items-center justify-center p-10">
          <video className="customize-bg-video absolute inset-0 w-full h-full object-cover" src="c4d-customize.mov"
            style={{ transform: "scale(1.2)" }}
            autoPlay loop muted playsInline />
          <div className="customize-bg-overlay absolute inset-0 pointer-events-none" />
          <div className="absolute top-4 right-4 flex items-center gap-0.5 pointer-events-none">
            <span className="text-[10px] uppercase tracking-wide text-white/50">Powered by</span>
            <img src="./c4d_visuals.png" alt="C4D Visuals" className="h-10 w-auto opacity-90" />
          </div>
          <div className="relative w-full h-full flex items-center justify-center">
            {step === "logo" ? (
              <LogoCanvas editor={logoEditor} />
            ) : (
              <div className="w-full max-w-2xl drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]">
                <ControllerPreview config={config} overrides={overrides} showButtonLabels={false} hideDisconnectedOverlay />
              </div>
            )}
          </div>
        </div>

        {/* Right — build summary card, floating in the black area, same
            treatment as the left card (normal flex sibling now, not an
            absolutely-positioned overlay). */}
        <div className="w-[260px] flex-none self-start max-h-full flex flex-col gap-3 p-4 rounded-2xl bg-card/85 backdrop-blur-md border border-white/10 shadow-2xl overflow-y-auto customize-scroll">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60 pb-2 border-b border-border">
            Your Custom Build
          </p>

          {addedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">No add-ons selected yet — customize the controller to see pricing here.</p>
          ) : (
            <div className="space-y-1.5">
              {addedItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-mono text-foreground/80">{money(item.price)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-1">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Add-ons Total</span>
              <span className="font-mono text-primary">{money(addOnsTotal)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/70">+ base controller price, shown at checkout</p>
          </div>

          {saveError && (
            <p className="text-[10px] text-destructive leading-relaxed">{saveError}</p>
          )}

          {/* Locked until the customer reaches Finalize and confirms — see
              handleFinalize/baked above. */}
          <button onClick={handleSave} disabled={saving || !baked}
            title={!baked ? "Confirm your design on the Finalize step first" : undefined}
            className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40">
            {saving ? "Saving…" : "Add to Cart"}
          </button>
        </div>
      </div>

      {/* Purely a dramatic confirmation beat — nothing here changes config,
          it's already fully applied. Reuses the same brand splash video as
          the site's page-transition splash. */}
      {baking && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
          <video ref={bakeVideoRef} className="w-[min(360px,50vw)]" src="logoanimation.webm" muted playsInline />
          <p className="text-sm font-semibold uppercase tracking-wider text-foreground/80">Finalizing your design…</p>
        </div>
      )}
    </div>
  );
}

