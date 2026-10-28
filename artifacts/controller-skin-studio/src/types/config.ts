import { ControllerType } from "../lib/layouts";

export type { ControllerType };

export interface ControllerConfig {
  controllerType: ControllerType;
  overlayName: string;
  controllerSkin: string | null;
  leftStickSkin: string | null;
  rightStickSkin: string | null;
  controllerSkinLoop: boolean;
  controllerSkinVideoFit: "contain" | "cover";
  controllerSkinContrast: number;
  controllerSkinSaturate: number;
  showWatermark: boolean;
  showShadow: boolean;
  shadowIntensity: number; // 0-1
  shadowDistance: number;  // px
  shadowAngle: number;     // 0-360 degrees
  buttonColor: string;
  // Intensity of the button press glow/ring itself — independent from
  // buttonOpacity, which only controls the Fill layer's opacity.
  buttonColorOpacity: number;
  // Solid = flat buttonColor fill. Two-tone = radial gradient between
  // buttonColorInner (center) and buttonColorOuter (edge). Stroke is a
  // separate additive toggle (strokeEnabled) layered on top of either mode,
  // not a mode itself.
  buttonColorMode: "solid" | "twoTone";
  buttonColorInner: string;
  buttonColorOuter: string;
  buttonOpacity: number;
  usePerButtonColors: boolean;
  glowEnabled: boolean;
  glowSize: number;
  // Separate multiplier stacked on top of buttonColorOpacity, applied only
  // to the glow's own bloom layers (not the ring's own color) — lets the
  // glow read as bright/soft or dim/tight independent of how visible the
  // ring itself is.
  buttonGlowIntensity: number;
  strokeEnabled: boolean;
  strokeWidth: number;
  strokeColor: string;
  stickTravel: number;
  width: number;
  height: number;
  leftStickColor: string;
  rightStickColor: string;
  linkStickColors: boolean;
  stickGlowEnabled: boolean;
  stickGlowSize: number;
  stickGlowIntensity: number; // 0-1
  stickOpacity: number;
  stickHighlightEnabled: boolean;
  stickHighlightIntensity: number; // 0-1
  stickHighlightColor: string;
  stickShadowEnabled: boolean;
  stickShadowIntensity: number;    // 0-1
  stickShadowDistance: number;     // px
  stickShadowAngle: number;        // 0-360 degrees
  // Comet LED — a glowing dot that revolves around each thumbstick's rim,
  // leaving a fading trail behind it. Independent per stick.
  leftStickCometEnabled: boolean;
  leftStickCometColor: string;
  leftStickCometSpeed: number;     // seconds per revolution
  rightStickCometEnabled: boolean;
  rightStickCometColor: string;
  rightStickCometSpeed: number;    // seconds per revolution
  // Electric — a crackling current ring around the stick's rim plus random
  // arcing bolts jumping outward. Independent per stick, separate from the
  // comet LED (both can be on at once).
  leftStickElectricEnabled: boolean;
  leftStickElectricColor: string;
  leftStickElectricSpeed: number;  // flicker/arc frequency multiplier
  rightStickElectricEnabled: boolean;
  rightStickElectricColor: string;
  rightStickElectricSpeed: number;
  // Spark — comet-style revolving head/trail that also flings off sparks as
  // it travels, like the crackling embers along the rim of a portal ring.
  // Independent per stick, separate from both the comet LED and electric.
  leftStickSparkEnabled: boolean;
  leftStickSparkColor: string;
  leftStickSparkSpeed: number;     // seconds per revolution
  rightStickSparkEnabled: boolean;
  rightStickSparkColor: string;
  rightStickSparkSpeed: number;
  // Body effects — independent toggles (not mutually exclusive, same pattern
  // as the thumbstick effects) so any combination can run at once.
  bodyEffectPulseGlowEnabled: boolean;
  bodyEffectParticlesEnabled: boolean;
  bodyEffectFireEnabled: boolean;
  bodyEffectReactiveEnabled: boolean;
  bodyEffectReactiveFireEnabled: boolean;
  bodyEffectParticleBurstEnabled: boolean;
  bodyEffectSpeed: number;
  bodyEffectIntensity: number;
  pulseGlowColor: string;
  particlesColor: string;
  particlesRainbow: boolean;
  reactiveRippleColor: string;
  reactiveRippleRainbow: boolean;
  fireColor1: string;
  fireGlowSpeed: number;
  fireEmberSpeed: number;
  fireColor2: string;
  rgbBodyEnabled: boolean;
  rgbBodySpeed: number;
  rgbBodyMode: "wave" | "breathing";
  rgbBodyIntensity: number;
  rgbBodyWaveColor: string;
  rgbBodyWaveRainbow: boolean;
  rgbBodyBreathingColor: string;
  rgbBodyBreathingRainbow: boolean;
  homeButtonZone: HomeButtonZone | null;
  // Bezel placement metadata — captured at bake time alongside the flattened
  // controllerSkin so the customer-facing editor can let a customer swap
  // which material sits in an already-placed slot without ever exposing
  // move/resize controls. baseSkinNoBezels is the skin exactly as it stood
  // right before these bezels were baked in, so a material swap can be
  // recomposited from a clean base rather than stacking on top of the old one.
  bezelSlots: BezelSlot[];
  baseSkinNoBezels: string | null;
}

export interface HomeButtonZone {
  xPercent: number;
  yPercent: number;
  sizePercent: number;
}

export interface BezelSlot {
  id: number;
  x: number; y: number; size: number;
  bezelUrl: string;
  hue: number; brightness: number; contrast: number; saturate: number;
}

export const DEFAULT_CONFIG: ControllerConfig = {
  controllerType: "c4d1",
  overlayName: "My Controller",
  controllerSkin: "skins/c4d1-base.png",
  leftStickSkin: "sticks/c4d1-left.png",
  rightStickSkin: "sticks/c4d1-right.png",
  controllerSkinLoop: true,
  controllerSkinVideoFit: "contain",
  controllerSkinContrast: 1,
  controllerSkinSaturate: 1,
  showWatermark: true,
  showShadow: true,
  shadowIntensity: 0.9,
  shadowDistance: 16,
  shadowAngle: 180,
  buttonColor: "#ffffff",
  buttonColorOpacity: 1,
  buttonColorMode: "solid",
  buttonColorInner: "#ffffff",
  buttonColorOuter: "#e40707",
  buttonOpacity: 0.65,
  usePerButtonColors: false,
  glowEnabled: true,
  glowSize: 14,
  buttonGlowIntensity: 1,
  strokeEnabled: true,
  strokeWidth: 2,
  strokeColor: "#ffffff",
  stickTravel: 40,
  width: 1280,
  height: 1024,
  leftStickColor: "#e40707",
  rightStickColor: "#e40707",
  linkStickColors: true,
  stickGlowEnabled: false,
  stickGlowSize: 8,
  stickGlowIntensity: 0.85,
  stickOpacity: 1,
  stickHighlightEnabled: true,
  stickHighlightIntensity: 0.35,
  stickHighlightColor: "#ffffff",
  stickShadowEnabled: true,
  stickShadowIntensity: 0.65,
  stickShadowDistance: 10,
  stickShadowAngle: 135,
  leftStickCometEnabled: false,
  leftStickCometColor: "#00e5ff",
  leftStickCometSpeed: 3,
  rightStickCometEnabled: false,
  rightStickCometColor: "#00e5ff",
  rightStickCometSpeed: 3,
  leftStickElectricEnabled: false,
  leftStickElectricColor: "#4de2ff",
  leftStickElectricSpeed: 3,
  rightStickElectricEnabled: false,
  rightStickElectricColor: "#4de2ff",
  rightStickElectricSpeed: 3,
  leftStickSparkEnabled: false,
  leftStickSparkColor: "#ff9d3c",
  leftStickSparkSpeed: 3,
  rightStickSparkEnabled: false,
  rightStickSparkColor: "#ff9d3c",
  rightStickSparkSpeed: 3,
  bodyEffectPulseGlowEnabled: false,
  bodyEffectParticlesEnabled: false,
  bodyEffectFireEnabled: false,
  bodyEffectReactiveEnabled: false,
  bodyEffectReactiveFireEnabled: false,
  bodyEffectParticleBurstEnabled: false,
  bodyEffectSpeed: 6,
  bodyEffectIntensity: 0.5,
  pulseGlowColor: "#7b2ff7",
  particlesColor: "#ffffff",
  particlesRainbow: true,
  reactiveRippleColor: "#ffffff",
  reactiveRippleRainbow: true,
  fireColor1: "#ff2200",
  fireGlowSpeed: 4,
  fireEmberSpeed: 6,
  fireColor2: "#ff8800",
  rgbBodyEnabled: false,
  rgbBodySpeed: 6,
  rgbBodyMode: "wave",
  rgbBodyIntensity: 1,
  rgbBodyWaveColor: "#e40707",
  rgbBodyWaveRainbow: true,
  rgbBodyBreathingColor: "#e40707",
  rgbBodyBreathingRainbow: true,
  homeButtonZone: null,
  bezelSlots: [],
  baseSkinNoBezels: null,
};

/** Migrates a raw (possibly legacy) parsed config/preset object in place —
 *  buttonColorMode briefly had a third "stroke" option (no fill, outline
 *  only) before stroke became a plain additive toggle again. Any config
 *  saved during that window still has "stroke" as its mode; map it back to
 *  solid with the toggle on, which is the closest equivalent look. Applied
 *  wherever a raw config can be loaded (auto-persisted "last state" and
 *  named presets) so both stay consistent. */
export function migrateLegacyConfig(parsed: any): any {
  if (parsed && parsed.buttonColorMode === "stroke") {
    parsed.buttonColorMode = "solid";
    parsed.strokeEnabled = true;
  }
  // bodyEffect used to be a single mutually-exclusive selection; now each
  // effect is an independent toggle. Map whichever single effect an old
  // saved config/preset had selected onto the matching new boolean field.
  if (parsed && typeof parsed.bodyEffect === "string") {
    const map: Record<string, string> = {
      pulseGlow: "bodyEffectPulseGlowEnabled",
      particles: "bodyEffectParticlesEnabled",
      fire: "bodyEffectFireEnabled",
      reactive: "bodyEffectReactiveEnabled",
      reactiveFire: "bodyEffectReactiveFireEnabled",
      particleBurst: "bodyEffectParticleBurstEnabled",
    };
    const key = map[parsed.bodyEffect];
    if (key) parsed[key] = true;
    delete parsed.bodyEffect;
  }
  return parsed;
}

export interface ButtonOverride {
  x: number;
  y: number;
  size: number;
}

export interface StickOverride {
  x: number;
  y: number;
  size: number;
}

export interface LayoutOverrides {
  buttons: Record<number, Partial<ButtonOverride>>;
  sticks: Record<number, Partial<StickOverride>>;
}

export const DEFAULT_OVERRIDES: LayoutOverrides = {
  buttons: {},
  sticks: {},
};
