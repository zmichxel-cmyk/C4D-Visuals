import { ControllerConfig } from "../types/config";

// ── Add-on pricing ────────────────────────────────────────────────────────
// The base controller price isn't known here — it's set per-product in your
// catalog and only comes together with these add-ons at checkout. Every
// value below is a placeholder; edit freely, this is the single place
// prices live for the customer-facing editor.
export const PRICING = {
  thumbstickSkin: 5,
  stickColor: 5,
  logo: 15,
  bezels: 20,
  buttonPress: 10,
  rgbBody: 10,
  bodyEffects: {
    bodyEffectPulseGlowEnabled: 8,
    bodyEffectParticlesEnabled: 8,
    bodyEffectFireEnabled: 12,
    bodyEffectReactiveEnabled: 10,
    bodyEffectReactiveFireEnabled: 12,
    bodyEffectParticleBurstEnabled: 10,
  } as Record<string, number>,
  stickEffects: {
    leftStickCometEnabled: 6, rightStickCometEnabled: 6,
    leftStickElectricEnabled: 6, rightStickElectricEnabled: 6,
    leftStickSparkEnabled: 6, rightStickSparkEnabled: 6,
  } as Record<string, number>,
};

const BODY_EFFECT_LABELS: Record<string, string> = {
  bodyEffectPulseGlowEnabled: "Pulse Glow",
  bodyEffectParticlesEnabled: "Particles",
  bodyEffectFireEnabled: "Fire",
  bodyEffectReactiveEnabled: "Reactive",
  bodyEffectReactiveFireEnabled: "Reactive Fire",
  bodyEffectParticleBurstEnabled: "Burst",
};
const STICK_EFFECT_LABELS: Record<string, string> = {
  leftStickCometEnabled: "Left Stick — Comet",
  rightStickCometEnabled: "Right Stick — Comet",
  leftStickElectricEnabled: "Left Stick — Electric",
  rightStickElectricEnabled: "Right Stick — Electric",
  leftStickSparkEnabled: "Left Stick — Spark",
  rightStickSparkEnabled: "Right Stick — Spark",
};

export interface PricedItem { label: string; price: number; }

/** Compares the current config against the product's starting config (plus
 *  whether a logo has been applied) to produce the itemized add-on list the
 *  "Your Custom Build" panel shows. Base effect/thumbstick/logo prices are
 *  flat — enabling something always costs the same regardless of how its
 *  color/speed/intensity sliders are set. */
export function computeAddedItems(
  startConfig: ControllerConfig,
  config: ControllerConfig,
  hasCustomLogo: boolean,
  hasCustomBezels: boolean,
): PricedItem[] {
  const items: PricedItem[] = [];

  if (hasCustomLogo) items.push({ label: "Custom Logo", price: PRICING.logo });
  if (hasCustomBezels) items.push({ label: "Custom Bezels", price: PRICING.bezels });

  if (config.leftStickSkin !== startConfig.leftStickSkin) {
    items.push({ label: "Left Thumbstick Skin", price: PRICING.thumbstickSkin });
  }
  if (config.rightStickSkin !== startConfig.rightStickSkin) {
    items.push({ label: "Right Thumbstick Skin", price: PRICING.thumbstickSkin });
  }

  const buttonFields: (keyof ControllerConfig)[] = [
    "buttonColor", "buttonColorOpacity", "buttonColorMode", "buttonColorInner",
    "buttonColorOuter", "buttonOpacity", "usePerButtonColors", "glowSize", "buttonGlowIntensity",
  ];
  if (buttonFields.some(k => config[k] !== startConfig[k])) {
    items.push({ label: "Custom Button Press", price: PRICING.buttonPress });
  }

  const stickColorFields: (keyof ControllerConfig)[] = [
    "leftStickColor", "rightStickColor", "linkStickColors",
    "stickGlowEnabled", "stickGlowSize", "stickGlowIntensity", "stickOpacity",
    "stickHighlightEnabled", "stickHighlightIntensity", "stickHighlightColor",
    "stickShadowEnabled", "stickShadowIntensity", "stickShadowDistance", "stickShadowAngle",
  ];
  if (stickColorFields.some(k => config[k] !== startConfig[k])) {
    items.push({ label: "Custom Stick Color", price: PRICING.stickColor });
  }

  if (config.rgbBodyEnabled && !startConfig.rgbBodyEnabled) {
    items.push({ label: "RGB Body", price: PRICING.rgbBody });
  }

  for (const [key, price] of Object.entries(PRICING.bodyEffects)) {
    if ((config as unknown as Record<string, unknown>)[key]) {
      items.push({ label: BODY_EFFECT_LABELS[key] ?? key, price });
    }
  }
  for (const [key, price] of Object.entries(PRICING.stickEffects)) {
    if ((config as unknown as Record<string, unknown>)[key]) {
      items.push({ label: STICK_EFFECT_LABELS[key] ?? key, price });
    }
  }

  return items;
}
