import { useState } from "react";
import { Settings, Download, Zap, Palette, Tag, Loader2, Sparkles, ChevronDown } from "lucide-react";
import { ControllerConfig, LayoutOverrides } from "../types/config";
import { LAYOUTS } from "../lib/layouts";
import { generateExportHtml } from "../lib/exportHtml";
import { useThrottledColor } from "../hooks/useThrottledColor";

export type ConfigPanelSection = "stickColors" | "buttonPress" | "bodyEffects" | "rgbBody" | "stickEffects" | "settings";

interface Props {
  config: ControllerConfig;
  overrides: LayoutOverrides;
  onChange: (updates: Partial<ControllerConfig>) => void;
  onResetOverrides: () => void;
  showButtonLabels: boolean;
  onToggleLabels: (v: boolean) => void;
  // When provided, only these sections render (no Appearance/Effects tab
  // switcher — everything shows in one flat list) and the bottom "Export
  // HTML for OBS" button is hidden. Used by the curated customer-facing
  // editor build, which needs a fixed subset of controls and its own
  // save/checkout action instead of a direct file download. Omit entirely
  // to keep the full studio experience unchanged.
  sections?: ConfigPanelSection[];
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground leading-tight flex-1">{label}</span>
      <button onClick={() => onChange(!value)} style={{ minWidth: "36px" }}
        className={`relative flex-none w-9 h-5 rounded-full transition-colors duration-200 ${value ? "bg-primary" : "bg-muted"}`}>
        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200"
          style={{ left: value ? "calc(100% - 18px)" : "2px" }} />
      </button>
    </div>
  );
}

// Shared style for the box-button grids (Body Effects, RGB Body mode,
// Thumbstick Effects). No fixed/clipped height — the box grows to fit
// however many lines its label wraps to, so nothing gets cut off.
function boxBtnClass(active: boolean) {
  return `text-xs px-1.5 py-1.5 rounded border transition-all leading-tight break-words flex items-center justify-center text-center min-h-[2.25rem] ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`;
}

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono text-foreground/60">{display ?? value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary h-1.5 rounded-full cursor-pointer" />
    </div>
  );
}

function Section({ icon: Icon, title }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-1.5 pb-0.5 border-b border-border">
      <Icon size={11} className="text-primary" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">{title}</span>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [local, handleInput] = useThrottledColor(value, onChange);
  return (
    <div className="flex items-center justify-between gap-1.5">
      <span className="text-xs text-muted-foreground leading-tight truncate">{label}</span>
      <div className="flex items-center gap-1 flex-none">
        <input type="color" value={local} onChange={e => handleInput(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border border-border bg-card p-0.5" />
        <span className="text-[10px] font-mono text-foreground/50 w-[52px]">{local}</span>
      </div>
    </div>
  );
}

function Dropdown({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-card hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-1.5">
          <Icon size={11} className="text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">{title}</span>
        </div>
        <ChevronDown size={12} className={`text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1.5 border-t border-border bg-background/50">
          {children}
        </div>
      )}
    </div>
  );
}

export function ConfigPanel({ config, overrides, onChange, onResetOverrides, showButtonLabels, onToggleLabels, sections }: Props) {
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"appearance" | "effects">("appearance");
  const showAll = !sections;
  const show = (key: ConfigPanelSection) => showAll || sections!.includes(key);
  // Full studio: gated by the Appearance/Effects tab switcher. Curated
  // (sections provided): every included section always shows, no tabs.
  const inAppearanceTab = showAll ? activeTab === "appearance" : true;
  const inEffectsTab = showAll ? activeTab === "effects" : true;
  const layout = LAYOUTS[config.controllerType] ?? LAYOUTS["c4d1"];
  const lStickBase = layout.sticks[0];
  const lStickEff = { ...lStickBase, ...(overrides.sticks[0] ?? {}) };
  const stickSizePx = Math.round(config.width * lStickEff.size / 100);

  // Raw <input type="color"> elements below (not the shared ColorField
  // component) still need the same throttling — called unconditionally here
  // regardless of which linked/unlinked or enabled/disabled branch is
  // actually visible, since hooks can't be called conditionally inside JSX.
  const [linkedStickLocal, handleLinkedStickChange] = useThrottledColor(config.leftStickColor, v => onChange({ leftStickColor: v, rightStickColor: v }));
  const [leftStickLocal, handleLeftStickChange] = useThrottledColor(config.leftStickColor, v => onChange({ leftStickColor: v }));
  const [rightStickLocal, handleRightStickChange] = useThrottledColor(config.rightStickColor, v => onChange({ rightStickColor: v }));
  const [highlightLocal, handleHighlightChange] = useThrottledColor(config.stickHighlightColor ?? "#ffffff", v => onChange({ stickHighlightColor: v }));
  const [buttonColorLocal, handleButtonColorChange] = useThrottledColor(config.buttonColor, v => onChange({ buttonColor: v }));
  const [strokeColorLocal, handleStrokeColorChange] = useThrottledColor(config.strokeColor, v => onChange({ strokeColor: v }));

  async function handleExport() {
    setExporting(true);
    try {
      const html = await generateExportHtml(config, overrides);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(config.overlayName || "overlay").replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  return (
    <div className="flex flex-col gap-2 h-full">

      {/* Scrollable content */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">

      {/* Overlay name — internal Studio tool only. The customer editor has
          its own "Controller Name" field on the Finalize step instead, since
          naming isn't an "effect" and belongs at the end of the flow. */}
      {showAll && (
        <div className="space-y-1">
          <Section icon={Tag} title="Name" />
          <input type="text" value={config.overlayName} onChange={e => onChange({ overlayName: e.target.value })}
            placeholder="My Controller"
            className="w-full text-xs px-2 py-1 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors" />
        </div>
      )}

      {/* Tab bar — curated mode (sections provided) skips this entirely and
          shows every included section in one flat list instead. */}
      {showAll && (
        <div className="flex gap-1.5">
          {(["appearance", "effects"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-all font-medium capitalize ${activeTab === tab ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
              {tab === "appearance" ? "Appearance" : "Effects"}
            </button>
          ))}
        </div>
      )}

      {inAppearanceTab && show("stickColors") && (
        <>
          {/* Stick Colors dropdown */}
          <Dropdown title="Stick Colors" icon={Palette}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Link stick colors</span>
              <button onClick={() => onChange({ linkStickColors: !config.linkStickColors })} style={{ minWidth: "36px" }}
                className={`relative flex-none w-9 h-5 rounded-full transition-colors duration-200 ${config.linkStickColors ? "bg-primary" : "bg-muted"}`}>
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200"
                  style={{ left: config.linkStickColors ? "calc(100% - 18px)" : "2px" }} />
              </button>
            </div>
            {config.linkStickColors ? (
              <div className="flex items-center gap-2">
                <input type="color" value={linkedStickLocal} onChange={e => handleLinkedStickChange(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5 flex-none" />
                <div>
                  <p className="text-xs font-medium text-foreground">Both Sticks</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{linkedStickLocal}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input type="color" value={leftStickLocal} onChange={e => handleLeftStickChange(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5 flex-none" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Left Stick</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{leftStickLocal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={rightStickLocal} onChange={e => handleRightStickChange(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5 flex-none" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Right Stick</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{rightStickLocal}</p>
                  </div>
                </div>
              </>
            )}
            <Toggle label="Glow" value={config.stickGlowEnabled} onChange={v => onChange({ stickGlowEnabled: v })} />
            {config.stickGlowEnabled && (
              <>
                <Slider label="Glow Intensity" value={config.stickGlowIntensity ?? 0.85} min={0.05} max={1} step={0.05}
                  display={`${Math.round((config.stickGlowIntensity ?? 0.85) * 100)}%`}
                  onChange={v => onChange({ stickGlowIntensity: v })} />
                <Slider label="Glow Spread" value={config.stickGlowSize} min={2} max={40} step={1}
                  display={`${config.stickGlowSize}px`} onChange={v => onChange({ stickGlowSize: v })} />
              </>
            )}
            <Toggle label="Rim Highlight" value={config.stickHighlightEnabled ?? true} onChange={v => onChange({ stickHighlightEnabled: v })} />
            {(config.stickHighlightEnabled ?? true) && (
              <>
                <Slider label="Intensity" value={config.stickHighlightIntensity ?? 0.35} min={0.05} max={1} step={0.05}
                  display={`${Math.round((config.stickHighlightIntensity ?? 0.35) * 100)}%`}
                  onChange={v => onChange({ stickHighlightIntensity: v })} />
                <div className="flex items-center gap-2">
                  <input type="color" value={highlightLocal}
                    onChange={e => handleHighlightChange(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5 flex-none" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Highlight Color</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{highlightLocal}</p>
                  </div>
                </div>
              </>
            )}
            <Toggle label="Drop Shadow" value={config.stickShadowEnabled ?? true} onChange={v => onChange({ stickShadowEnabled: v })} />
            {(config.stickShadowEnabled ?? true) && (
              <>
                <Slider label="Intensity" value={config.stickShadowIntensity ?? 0.65} min={0.05} max={1} step={0.05}
                  display={`${Math.round((config.stickShadowIntensity ?? 0.65) * 100)}%`}
                  onChange={v => onChange({ stickShadowIntensity: v })} />
                <Slider label="Distance" value={config.stickShadowDistance ?? 10} min={1} max={40} step={1}
                  display={`${config.stickShadowDistance ?? 10}px`}
                  onChange={v => onChange({ stickShadowDistance: v })} />
                <Slider label="Angle" value={config.stickShadowAngle ?? 135} min={0} max={360} step={1}
                  display={`${config.stickShadowAngle ?? 135}°`}
                  onChange={v => onChange({ stickShadowAngle: v })} />
              </>
            )}
          </Dropdown>
        </>
      )}

      {inAppearanceTab && show("buttonPress") && (
        <>
          {/* Button Press dropdown */}
          <Dropdown title="Button Press" icon={Zap}>
            <div className="flex items-center gap-2">
              <input type="color" value={buttonColorLocal} onChange={e => handleButtonColorChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5 flex-none" />
              <div>
                <p className="text-xs font-medium text-foreground">Button Press Color</p>
                <p className="text-[10px] font-mono text-muted-foreground">{buttonColorLocal}</p>
              </div>
            </div>

            <Slider label="Color Opacity" value={config.buttonColorOpacity ?? 1} min={0.05} max={1} step={0.05}
              display={`${Math.round((config.buttonColorOpacity ?? 1) * 100)}%`} onChange={v => onChange({ buttonColorOpacity: v })} />

            <Slider label="Glow Strength" value={config.buttonGlowIntensity ?? 1} min={0.05} max={1} step={0.05}
              display={`${Math.round((config.buttonGlowIntensity ?? 1) * 100)}%`} onChange={v => onChange({ buttonGlowIntensity: v })} />
            <Slider label="Glow Spread" value={config.glowSize} min={2} max={40} step={1}
              display={`${config.glowSize}px`} onChange={v => onChange({ glowSize: v })} />

            <Toggle label="Fill" value={config.strokeEnabled} onChange={v => onChange({ strokeEnabled: v })} />
            {config.strokeEnabled && (
              <>
                <div className="flex items-center gap-2">
                  <input type="color" value={strokeColorLocal} onChange={e => handleStrokeColorChange(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-card p-0.5 flex-none" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Fill Color</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{strokeColorLocal}</p>
                  </div>
                </div>
                <Slider label="Fill Opacity" value={config.buttonOpacity} min={0.05} max={1} step={0.05}
                  display={`${Math.round(config.buttonOpacity * 100)}%`} onChange={v => onChange({ buttonOpacity: v })} />
              </>
            )}
          </Dropdown>
        </>
      )}

      {inEffectsTab && show("bodyEffects") && (
        <>
          {/* Body Effects dropdown — independent toggles (not mutually
              exclusive), same pattern as Thumbstick Effects, so any
              combination can run at once. */}
          <Dropdown title="Body Effects" icon={Sparkles}>
            <div className="grid grid-cols-2 gap-1">
              {([
                { id: "bodyEffectPulseGlowEnabled" as const,      label: "Pulse Glow"    },
                { id: "bodyEffectParticlesEnabled" as const,      label: "Particles"     },
                { id: "bodyEffectFireEnabled" as const,           label: "🔥 Fire"       },
                { id: "bodyEffectReactiveEnabled" as const,       label: "⚡ Reactive"   },
                { id: "bodyEffectReactiveFireEnabled" as const,   label: "🔥 Reactive Fire" },
                { id: "bodyEffectParticleBurstEnabled" as const,  label: "💥 Burst"      },
              ]).map(p => (
                <button key={p.id} onClick={() => onChange({ [p.id]: !config[p.id] } as Partial<ControllerConfig>)}
                  className={boxBtnClass(!!config[p.id])}>
                  {p.label}
                </button>
              ))}
            </div>
            {(config.bodyEffectPulseGlowEnabled || config.bodyEffectParticlesEnabled || config.bodyEffectFireEnabled || config.bodyEffectReactiveEnabled || config.bodyEffectReactiveFireEnabled || config.bodyEffectParticleBurstEnabled) && (
              <>
                {/* Speed/Intensity are shared config fields across several body
                    effects (bodyEffectSpeed / bodyEffectIntensity). Every body
                    effect now wants the same narrow 50-100% intensity range,
                    so that one's unconditional. Speed still varies by group:
                    Pulse Glow alone wants 1-2s, the reactive family (Reactive/
                    Reactive Fire/Burst) alone wants 5-10s, Particles alone
                    keeps the general wide range — mixing effects from
                    different speed groups falls back to that general range
                    since one shared slider can't satisfy two ranges at once. */}
                {(() => {
                  const reactiveFamilyOn = config.bodyEffectReactiveEnabled || config.bodyEffectParticleBurstEnabled || config.bodyEffectReactiveFireEnabled;
                  const speedGroupsOn = [config.bodyEffectPulseGlowEnabled, config.bodyEffectParticlesEnabled, reactiveFamilyOn].filter(Boolean).length;
                  let speedMin = 1, speedMax = 20, speedStep = 0.5;
                  if (speedGroupsOn === 1) {
                    if (config.bodyEffectPulseGlowEnabled) { speedMax = 2; speedStep = 0.1; }
                    else if (reactiveFamilyOn) { speedMin = 5; speedMax = 10; }
                  }
                  const showSpeed = config.bodyEffectPulseGlowEnabled || config.bodyEffectParticlesEnabled || reactiveFamilyOn;
                  return (
                    <>
                      {showSpeed && (
                        <Slider label="Speed" value={config.bodyEffectSpeed}
                          min={speedMin} max={speedMax} step={speedStep}
                          display={`${config.bodyEffectSpeed}s`} onChange={v => onChange({ bodyEffectSpeed: v })} />
                      )}
                      <Slider label="Intensity" value={config.bodyEffectIntensity}
                        min={0.5} max={1} step={0.05}
                        display={`${Math.round(config.bodyEffectIntensity * 100)}%`} onChange={v => onChange({ bodyEffectIntensity: v })} />
                    </>
                  );
                })()}
                {config.bodyEffectPulseGlowEnabled && (
                  <ColorField label="Pulse Glow Color" value={config.pulseGlowColor} onChange={v => onChange({ pulseGlowColor: v })} />
                )}
                {config.bodyEffectParticlesEnabled && (
                  <>
                    <Toggle label="Particles Rainbow" value={config.particlesRainbow} onChange={v => onChange({ particlesRainbow: v })} />
                    {!config.particlesRainbow && (
                      <ColorField label="Particles Color" value={config.particlesColor} onChange={v => onChange({ particlesColor: v })} />
                    )}
                  </>
                )}
                {(config.bodyEffectReactiveEnabled || config.bodyEffectParticleBurstEnabled) && (
                  <>
                    <Toggle label="Reactive Rainbow" value={config.reactiveRippleRainbow} onChange={v => onChange({ reactiveRippleRainbow: v })} />
                    {!config.reactiveRippleRainbow && (
                      <ColorField label="Reactive Color" value={config.reactiveRippleColor} onChange={v => onChange({ reactiveRippleColor: v })} />
                    )}
                  </>
                )}
                {(config.bodyEffectFireEnabled || config.bodyEffectReactiveFireEnabled) && (
                  <>
                    <ColorField label="Fire Color 1" value={config.fireColor1} onChange={v => onChange({ fireColor1: v })} />
                    <ColorField label="Fire Color 2" value={config.fireColor2} onChange={v => onChange({ fireColor2: v })} />
                  </>
                )}
                {config.bodyEffectFireEnabled && (
                  <>
                    <Slider label="Glow Speed" value={config.fireGlowSpeed} min={1} max={10} step={0.5}
                      display={`${config.fireGlowSpeed}s`} onChange={v => onChange({ fireGlowSpeed: v })} />
                    <Slider label="Ember Speed" value={config.fireEmberSpeed} min={1} max={10} step={0.5}
                      display={`${config.fireEmberSpeed}s`} onChange={v => onChange({ fireEmberSpeed: v })} />
                  </>
                )}
              </>
            )}
          </Dropdown>
        </>
      )}

      {inEffectsTab && show("rgbBody") && (
        <>
          {/* RGB Body dropdown */}
          <Dropdown title="RGB Body" icon={Sparkles}>
            <Toggle label="Enable RGB silhouette" value={config.rgbBodyEnabled} onChange={v => onChange({ rgbBodyEnabled: v })} />
            {config.rgbBodyEnabled && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { id: "wave",      label: "Wave"      },
                    { id: "breathing", label: "Breathing" },
                  ] as const).map(m => (
                    <button key={m.id} onClick={() => onChange({ rgbBodyMode: m.id })}
                      className={boxBtnClass(config.rgbBodyMode === m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <Slider label="Speed" value={config.rgbBodySpeed} min={1} max={20} step={0.5}
                  display={`${config.rgbBodySpeed}s`} onChange={v => onChange({ rgbBodySpeed: v })} />
                <Slider label="Intensity" value={config.rgbBodyIntensity} min={0.05} max={1} step={0.05}
                  display={`${Math.round(config.rgbBodyIntensity * 100)}%`} onChange={v => onChange({ rgbBodyIntensity: v })} />
                {config.rgbBodyMode === "wave" ? (
                  <>
                    <Toggle label="Rainbow (Wave)" value={config.rgbBodyWaveRainbow} onChange={v => onChange({ rgbBodyWaveRainbow: v })} />
                    {!config.rgbBodyWaveRainbow && (
                      <ColorField label="Wave Color" value={config.rgbBodyWaveColor} onChange={v => onChange({ rgbBodyWaveColor: v })} />
                    )}
                  </>
                ) : (
                  <>
                    <Toggle label="Rainbow (Breathing)" value={config.rgbBodyBreathingRainbow} onChange={v => onChange({ rgbBodyBreathingRainbow: v })} />
                    {!config.rgbBodyBreathingRainbow && (
                      <ColorField label="Breathing Color" value={config.rgbBodyBreathingColor} onChange={v => onChange({ rgbBodyBreathingColor: v })} />
                    )}
                  </>
                )}
              </>
            )}
          </Dropdown>
        </>
      )}

      {inEffectsTab && show("stickEffects") && (
        <>
          {/* Thumbstick Effects dropdown — comet LED / electric ring / sparks
              around each stick's rim. Each is an independent toggle (not
              mutually exclusive, unlike Body Effects), styled as the same
              kind of box-button grid for visual consistency. */}
          <Dropdown title="Thumbstick Effects" icon={Sparkles}>
            <p className="text-xs font-medium text-foreground pb-0.5">Left Stick</p>
            <div className="grid grid-cols-3 gap-1">
              {([
                { id: "leftStickCometEnabled" as const, label: "🌠 Comet" },
                { id: "leftStickElectricEnabled" as const, label: "⚡ Electric" },
                { id: "leftStickSparkEnabled" as const, label: "✨ Sparks" },
              ]).map(p => (
                <button key={p.id} onClick={() => onChange({ [p.id]: !config[p.id] } as Partial<ControllerConfig>)}
                  className={boxBtnClass(!!config[p.id])}>
                  {p.label}
                </button>
              ))}
            </div>
            {config.leftStickCometEnabled && (
              <>
                <ColorField label="Comet Color" value={config.leftStickCometColor} onChange={v => onChange({ leftStickCometColor: v })} />
                <Slider label="Comet Speed" value={config.leftStickCometSpeed} min={0.5} max={10} step={0.25}
                  display={`${config.leftStickCometSpeed}s`} onChange={v => onChange({ leftStickCometSpeed: v })} />
              </>
            )}
            {config.leftStickElectricEnabled && (
              <>
                <ColorField label="Electric Color" value={config.leftStickElectricColor} onChange={v => onChange({ leftStickElectricColor: v })} />
                <Slider label="Electric Speed" value={config.leftStickElectricSpeed} min={0.5} max={10} step={0.25}
                  display={`${config.leftStickElectricSpeed}s`} onChange={v => onChange({ leftStickElectricSpeed: v })} />
              </>
            )}
            {config.leftStickSparkEnabled && (
              <>
                <ColorField label="Spark Color" value={config.leftStickSparkColor} onChange={v => onChange({ leftStickSparkColor: v })} />
                <Slider label="Spark Speed" value={config.leftStickSparkSpeed} min={0.5} max={10} step={0.25}
                  display={`${config.leftStickSparkSpeed}s`} onChange={v => onChange({ leftStickSparkSpeed: v })} />
              </>
            )}
            <p className="text-xs font-medium text-foreground pb-0.5 mt-2">Right Stick</p>
            <div className="grid grid-cols-3 gap-1">
              {([
                { id: "rightStickCometEnabled" as const, label: "🌠 Comet" },
                { id: "rightStickElectricEnabled" as const, label: "⚡ Electric" },
                { id: "rightStickSparkEnabled" as const, label: "✨ Sparks" },
              ]).map(p => (
                <button key={p.id} onClick={() => onChange({ [p.id]: !config[p.id] } as Partial<ControllerConfig>)}
                  className={boxBtnClass(!!config[p.id])}>
                  {p.label}
                </button>
              ))}
            </div>
            {config.rightStickCometEnabled && (
              <>
                <ColorField label="Comet Color" value={config.rightStickCometColor} onChange={v => onChange({ rightStickCometColor: v })} />
                <Slider label="Comet Speed" value={config.rightStickCometSpeed} min={0.5} max={10} step={0.25}
                  display={`${config.rightStickCometSpeed}s`} onChange={v => onChange({ rightStickCometSpeed: v })} />
              </>
            )}
            {config.rightStickElectricEnabled && (
              <>
                <ColorField label="Electric Color" value={config.rightStickElectricColor} onChange={v => onChange({ rightStickElectricColor: v })} />
                <Slider label="Electric Speed" value={config.rightStickElectricSpeed} min={0.5} max={10} step={0.25}
                  display={`${config.rightStickElectricSpeed}s`} onChange={v => onChange({ rightStickElectricSpeed: v })} />
              </>
            )}
            {config.rightStickSparkEnabled && (
              <>
                <ColorField label="Spark Color" value={config.rightStickSparkColor} onChange={v => onChange({ rightStickSparkColor: v })} />
                <Slider label="Spark Speed" value={config.rightStickSparkSpeed} min={0.5} max={10} step={0.25}
                  display={`${config.rightStickSparkSpeed}s`} onChange={v => onChange({ rightStickSparkSpeed: v })} />
              </>
            )}
          </Dropdown>
        </>
      )}

      {inEffectsTab && show("settings") && (
        <>
          {/* Settings dropdown */}
          <Dropdown title="Settings" icon={Settings}>
            <Toggle label="Watermark" value={config.showWatermark} onChange={v => onChange({ showWatermark: v })} />
            <Toggle label="Drop Shadow" value={config.showShadow} onChange={v => onChange({ showShadow: v })} />
            {config.showShadow && (
              <>
                <Slider label="Shadow Intensity" value={config.shadowIntensity} min={0.1} max={1} step={0.05}
                  display={`${Math.round(config.shadowIntensity * 100)}%`} onChange={v => onChange({ shadowIntensity: v })} />
                <Slider label="Shadow Distance" value={config.shadowDistance ?? 16} min={1} max={40} step={1}
                  display={`${config.shadowDistance ?? 16}px`} onChange={v => onChange({ shadowDistance: v })} />
                <Slider label="Shadow Angle" value={config.shadowAngle} min={0} max={360} step={1}
                  display={`${config.shadowAngle}°`} onChange={v => onChange({ shadowAngle: v })} />
              </>
            )}
          </Dropdown>
        </>
      )}

      </div>{/* end scrollable content */}

      {/* Export — always pinned at bottom, but only in the full studio.
          Curated builds (sections provided) own their own finalize/save
          action instead — see CustomerEditor.tsx. */}
      {showAll && (
        <div className="space-y-1 pt-1 border-t border-border">
          <p className="text-[10px] text-muted-foreground">OBS Browser Source: {config.width}×{Math.round(config.width * layout.skinHeight / layout.skinWidth)}</p>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/30 disabled:opacity-60 disabled:cursor-wait">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? "Exporting…" : "Export HTML for OBS"}
          </button>
        </div>
      )}
    </div>
  );
}

