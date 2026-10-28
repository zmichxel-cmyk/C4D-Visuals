import { useEffect, useRef, useState } from "react";
import { HomeButtonZone } from "../types/config";

// Customer-facing extraction of ImageEditor.tsx's logo-placement feature —
// upload, drag/resize/rotate directly on the big preview, blend mode,
// opacity, blur, plus the same WebGL "surface-aware" effects the internal
// tool has: Blend If (fades the logo into the surface's own shadows/
// highlights instead of sitting flatly on top) and Displacement (warps the
// logo along the surface's edges, like it's embossed into the material).
// Falls back to a flat Canvas2D composite if WebGL is unavailable.
//
// Split into a state hook (useLogoCompositor) plus two presentational
// pieces — LogoCanvas (the big interactive preview, meant to replace the
// center ControllerPreview while this step is active) and LogoControls
// (upload + effect sliders, meant for the sidebar) — so the canvas the
// customer actually drags the logo on is the same one they've been looking
// at the whole time, not a separate thumbnail off to the side.

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
type BlendModeId = typeof BLEND_MODES[number]["id"];
const BLEND_MODE_IDX: Record<string, number> = Object.fromEntries(BLEND_MODES.map((m, i) => [m.id, i]));
const MODE_2D: Record<BlendModeId, GlobalCompositeOperation> = {
  "normal": "source-over", "multiply": "multiply", "screen": "screen", "overlay": "overlay",
  "soft-light": "soft-light", "hard-light": "hard-light", "color-dodge": "color-dodge",
  "color-burn": "color-burn", "darken": "darken", "lighten": "lighten",
  "difference": "difference", "luminosity": "luminosity",
};

type LogoPos = { x: number; y: number; w: number; h: number; rot: number };
type DragMode = "move" | "resize" | "rotate";
type FeatherRange = { shLo: number; shHi: number; hiLo: number; hiHi: number };
const DEFAULT_RANGE: FeatherRange = { shLo: 0, shHi: 0, hiLo: 255, hiHi: 255 };

const VS = `attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*0.5+0.5;v_uv.y=1.0-v_uv.y;gl_Position=vec4(a_pos,0.0,1.0);}`;
const FS = `precision mediump float;uniform sampler2D u_surface,u_logo;uniform vec2 u_res;uniform float u_opacity;uniform int u_blendMode;uniform vec4 u_biThis,u_biUnd;uniform vec2 u_disp;varying vec2 v_uv;vec3 lw=vec3(0.299,0.587,0.114);vec3 bmMul(vec3 b,vec3 s){return b*s;}vec3 bmScr(vec3 b,vec3 s){return 1.0-(1.0-b)*(1.0-s);}vec3 bmOvr(vec3 b,vec3 s){return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(0.5,b));}vec3 bmSL(vec3 b,vec3 s){return mix(2.0*b*s+b*b*(1.0-2.0*s),sqrt(b)*(2.0*s-1.0)+2.0*b*(1.0-s),step(0.5,s));}vec3 bmHL(vec3 b,vec3 s){return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(0.5,s));}vec3 bmCD(vec3 b,vec3 s){return clamp(b/max(1.0-s,0.001),0.0,1.0);}vec3 bmCB(vec3 b,vec3 s){return clamp(1.0-(1.0-b)/max(s,0.001),0.0,1.0);}vec3 bmLum(vec3 b,vec3 s){float bl=dot(b,lw),sl=dot(s,lw);return clamp(b+(sl-bl),0.0,1.0);}void main(){vec4 surf=texture2D(u_surface,v_uv);vec2 px=1.0/u_res;float tl=dot(texture2D(u_surface,v_uv+vec2(-px.x,-px.y)).rgb,lw),tm=dot(texture2D(u_surface,v_uv+vec2(0,-px.y)).rgb,lw),tr=dot(texture2D(u_surface,v_uv+vec2(px.x,-px.y)).rgb,lw),ml=dot(texture2D(u_surface,v_uv+vec2(-px.x,0)).rgb,lw),mr=dot(texture2D(u_surface,v_uv+vec2(px.x,0)).rgb,lw),bl2=dot(texture2D(u_surface,v_uv+vec2(-px.x,px.y)).rgb,lw),bm=dot(texture2D(u_surface,v_uv+vec2(0,px.y)).rgb,lw),br=dot(texture2D(u_surface,v_uv+vec2(px.x,px.y)).rgb,lw);float gx=(tr+2.0*mr+br)-(tl+2.0*ml+bl2),gy=(bl2+2.0*bm+br)-(tl+2.0*tm+tr);vec2 du=clamp(v_uv+vec2(gx*u_disp.x,gy*u_disp.y)*px,0.0,1.0);vec4 lc=texture2D(u_logo,du);float a=lc.a;if(a<0.01){gl_FragColor=surf;return;}vec3 lr=lc.rgb;float ll=dot(lr,lw),sl=dot(surf.rgb,lw),e=0.001;float tA=smoothstep(u_biThis.x,max(u_biThis.x+e,u_biThis.y),ll)*(1.0-smoothstep(u_biThis.z,max(u_biThis.z+e,u_biThis.w),ll));float uA=smoothstep(u_biUnd.x,max(u_biUnd.x+e,u_biUnd.y),sl)*(1.0-smoothstep(u_biUnd.z,max(u_biUnd.z+e,u_biUnd.w),sl));float ta=a*tA*uA;if(ta<0.01){gl_FragColor=surf;return;}vec3 bld;if(u_blendMode==1)bld=bmMul(surf.rgb,lr);else if(u_blendMode==2)bld=bmScr(surf.rgb,lr);else if(u_blendMode==3)bld=bmOvr(surf.rgb,lr);else if(u_blendMode==4)bld=bmSL(surf.rgb,lr);else if(u_blendMode==5)bld=bmHL(surf.rgb,lr);else if(u_blendMode==6)bld=bmCD(surf.rgb,lr);else if(u_blendMode==7)bld=bmCB(surf.rgb,lr);else if(u_blendMode==8)bld=min(surf.rgb,lr);else if(u_blendMode==9)bld=max(surf.rgb,lr);else if(u_blendMode==10)bld=abs(surf.rgb-lr);else if(u_blendMode==11)bld=bmLum(surf.rgb,lr);else bld=lr;gl_FragColor=vec4(mix(surf.rgb,clamp(bld,0.0,1.0),u_opacity*clamp(ta*1.5,0.0,1.0)),surf.a>0.0?1.0:0.0);}`;

export interface LogoCompositor {
  containerRef: React.RefObject<HTMLDivElement | null>;
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  imgDims: { w: number; h: number } | null;
  logoSrc: string | null;
  logoPos: LogoPos;
  logoSelected: boolean;
  /** The product's protected home-button circle, if any — no logo can ever
   *  render over it (see drawComposite's masking pass). */
  homeButtonZone: HomeButtonZone | null;
  logoBlendMode: BlendModeId;
  setLogoBlendMode: (m: BlendModeId) => void;
  logoOpacity: number;
  setLogoOpacity: (v: number) => void;
  logoBlur: number;
  setLogoBlur: (v: number) => void;
  biThis: FeatherRange;
  setBiThis: (r: FeatherRange) => void;
  biUnd: FeatherRange;
  setBiUnd: (r: FeatherRange) => void;
  dispX: number;
  dispY: number;
  setDispX: (v: number) => void;
  setDispY: (v: number) => void;
  handleLogoFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeLogo: () => void;
  handleCanvasMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  startResize: (e: React.MouseEvent) => void;
  startRotate: (e: React.MouseEvent) => void;
  handleApply: () => string | null;
  /** Re-draws the (already-loaded) base image + composite into whatever
   *  canvas elements are currently mounted. LogoCanvas calls this on mount
   *  since the base image may have finished loading before its canvas
   *  existed in the DOM (e.g. loaded while a different wizard step was active). */
  resync: () => void;
}

export function useLogoCompositor(baseImageUrl: string, homeButtonZone?: HomeButtonZone | null): LogoCompositor {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; origPos: LogoPos; startAngle?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webglRef = useRef<WebGLRenderingContext | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glProgramRef = useRef<WebGLProgram | null>(null);

  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoPos, setLogoPos] = useState<LogoPos>({ x: 0, y: 0, w: 100, h: 100, rot: 0 });
  const [logoBlendMode, setLogoBlendMode] = useState<BlendModeId>("normal");
  const [logoOpacity, setLogoOpacity] = useState(0.85);
  const [logoBlur, setLogoBlur] = useState(0);
  const [logoSelected, setLogoSelected] = useState(false);
  const [biThis, setBiThis] = useState<FeatherRange>(DEFAULT_RANGE);
  const [biUnd, setBiUnd] = useState<FeatherRange>(DEFAULT_RANGE);
  const [dispX, setDispX] = useState(0);
  const [dispY, setDispY] = useState(0);

  const baseImgRef = useRef<HTMLImageElement | null>(null);

  // Draws whatever base image is already loaded into baseCanvasRef — split
  // out so it can also run when LogoCanvas mounts fresh (e.g. the customer
  // navigates to the Logo step after the base image already finished
  // loading, so baseCanvasRef only just became available in the DOM).
  function syncBaseCanvas() {
    const img = baseImgRef.current;
    const canvas = baseCanvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
  }

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImgRef.current = img;
      syncBaseCanvas();
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = baseImageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImageUrl]);

  function ensureWebGL(): boolean {
    if (webglRef.current && webglCanvasRef.current && glProgramRef.current) return true;
    const cv = document.createElement("canvas");
    cv.width = 2; cv.height = 2;
    const gl = cv.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    webglCanvasRef.current = cv;
    webglRef.current = gl;
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    glProgramRef.current = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return true;
  }

  function drawComposite() {
    const display = displayCanvasRef.current;
    const base = baseCanvasRef.current;
    const logo = logoImgRef.current;
    if (!display || !base || !base.width) return;
    const W = base.width, H = base.height;
    display.width = W; display.height = H;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);
    if (!logo || !logoSrc) return;
    const { x, y, w, h, rot } = logoPos;
    const lcx = x + w / 2, lcy = y + h / 2;
    const rotRad = (rot * Math.PI) / 180;

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
        const surfTex = mkTex(0, base);
        const logoCv = document.createElement("canvas"); logoCv.width = W; logoCv.height = H;
        const lctx = logoCv.getContext("2d")!;
        lctx.save(); lctx.translate(lcx, lcy); lctx.rotate(rotRad);
        if (logoBlur > 0) lctx.filter = `blur(${logoBlur}px)`;
        lctx.drawImage(logo, -w / 2, -h / 2, w, h); lctx.restore();
        const logoTex = mkTex(1, logoCv);
        const ul = (n: string) => gl.getUniformLocation(prog, n);
        gl.uniform1i(ul("u_surface"), 0); gl.uniform1i(ul("u_logo"), 1);
        gl.uniform2f(ul("u_res"), W, H); gl.uniform1f(ul("u_opacity"), logoOpacity);
        gl.uniform1i(ul("u_blendMode"), BLEND_MODE_IDX[logoBlendMode] ?? 0);
        gl.uniform4f(ul("u_biThis"), biThis.shLo / 255, biThis.shHi / 255, biThis.hiLo / 255, biThis.hiHi / 255);
        gl.uniform4f(ul("u_biUnd"), biUnd.shLo / 255, biUnd.shHi / 255, biUnd.hiLo / 255, biUnd.hiHi / 255);
        gl.uniform2f(ul("u_disp"), dispX, dispY);
        const buf2 = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf2);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(prog, "a_pos");
        gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        ctx.clearRect(0, 0, W, H); ctx.drawImage(glCv, 0, 0);
        // Clip to the base skin's own alpha shape.
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(base, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        gl.deleteTexture(surfTex); gl.deleteTexture(logoTex); gl.deleteBuffer(buf2);
        webglOk = true;
      } catch (err) { console.warn("WebGL logo composite failed, using 2D:", err); }
    }
    if (!webglOk) {
      ctx.save(); ctx.globalAlpha = logoOpacity;
      ctx.globalCompositeOperation = MODE_2D[logoBlendMode] ?? "source-over";
      ctx.translate(lcx, lcy); ctx.rotate(rotRad);
      if (logoBlur > 0) ctx.filter = `blur(${logoBlur}px)`;
      ctx.drawImage(logo, -w / 2, -h / 2, w, h); ctx.restore();
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(base, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }

    // Protect the home button — no logo is ever allowed to cover it,
    // regardless of blend mode/opacity/displacement. Re-draw the pristine
    // base image clipped to a perfect circle over that zone last, so
    // whatever the logo did everywhere else is undone right there.
    if (homeButtonZone) {
      const hcx = (homeButtonZone.xPercent / 100) * W;
      const hcy = (homeButtonZone.yPercent / 100) * H;
      const hr = (homeButtonZone.sizePercent / 100) * W / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(hcx, hcy, hr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(base, 0, 0);
      ctx.restore();
    }
  }

  useEffect(() => {
    drawComposite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoSrc, logoPos, logoBlendMode, logoOpacity, logoBlur, biThis, biUnd, dispX, dispY, imgDims, homeButtonZone]);

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !imgDims) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result !== "string") return;
      const img = new Image();
      img.onload = () => {
        logoImgRef.current = img;
        const w = imgDims.w * 0.4;
        const h = w * (img.naturalHeight / img.naturalWidth);
        setLogoPos({ x: imgDims.w / 2 - w / 2, y: imgDims.h / 2 - h / 2, w, h, rot: 0 });
        setLogoSrc(result);
        setLogoSelected(true);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoSrc(null);
    logoImgRef.current = null;
    setLogoSelected(false);
    setBiThis(DEFAULT_RANGE); setBiUnd(DEFAULT_RANGE);
    setDispX(0); setDispY(0);
  }

  function toImageSpace(clientX: number, clientY: number): [number, number] {
    const el = displayCanvasRef.current;
    if (!el || !imgDims) return [clientX, clientY];
    const rect = el.getBoundingClientRect();
    const scaleX = imgDims.w / rect.width, scaleY = imgDims.h / rect.height;
    return [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY];
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!logoSrc) return;
    const [mx, my] = toImageSpace(e.clientX, e.clientY);
    const { x, y, w, h, rot } = logoPos;
    const cx = x + w / 2, cy = y + h / 2;
    const rotRad = (rot * Math.PI) / 180;
    const dx = mx - cx, dy = my - cy;
    const localX = dx * Math.cos(-rotRad) - dy * Math.sin(-rotRad);
    const localY = dx * Math.sin(-rotRad) + dy * Math.cos(-rotRad);
    if (localX >= -w / 2 && localX <= w / 2 && localY >= -h / 2 && localY <= h / 2) {
      dragRef.current = { mode: "move", startX: mx, startY: my, origPos: { ...logoPos } };
      setLogoSelected(true);
    } else {
      setLogoSelected(false);
    }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const [mx, my] = toImageSpace(e.clientX, e.clientY);
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
    function onUp() { dragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgDims]);

  function startResize(e: React.MouseEvent) {
    e.stopPropagation();
    const [sx, sy] = toImageSpace(e.clientX, e.clientY);
    dragRef.current = { mode: "resize", startX: sx, startY: sy, origPos: { ...logoPos } };
  }
  function startRotate(e: React.MouseEvent) {
    e.stopPropagation();
    const [sx, sy] = toImageSpace(e.clientX, e.clientY);
    dragRef.current = { mode: "rotate", startX: sx, startY: sy, origPos: { ...logoPos }, startAngle: logoPos.rot };
  }

  function handleApply(): string | null {
    const display = displayCanvasRef.current;
    if (!display) return null;
    return display.toDataURL("image/png");
  }

  return {
    containerRef, baseCanvasRef, displayCanvasRef, fileInputRef,
    imgDims, logoSrc, logoPos, logoSelected, homeButtonZone: homeButtonZone ?? null,
    logoBlendMode, setLogoBlendMode, logoOpacity, setLogoOpacity, logoBlur, setLogoBlur,
    biThis, setBiThis, biUnd, setBiUnd, dispX, dispY, setDispX, setDispY,
    handleLogoFile, removeLogo, handleCanvasMouseDown, startResize, startRotate, handleApply,
    resync: () => { syncBaseCanvas(); drawComposite(); },
  };
}

/** The big interactive canvas — meant to occupy the same center stage the
 *  ControllerPreview normally does while the Logo step is active, so the
 *  customer drags/resizes/rotates the logo right where they've been looking
 *  the whole time instead of on a separate thumbnail. */
export function LogoCanvas({ editor }: { editor: LogoCompositor }) {
  const { containerRef, baseCanvasRef, displayCanvasRef, imgDims, logoSrc, logoSelected, logoPos,
    homeButtonZone, handleCanvasMouseDown, startResize, startRotate, resync } = editor;
  const outerRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    resync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Measures the available space and scales the aspect-locked box to fit
  // inside it (same math as CSS object-fit:contain) — needed because the
  // box's width/height/aspect-ratio can't all be driven by CSS alone without
  // one of them silently overriding the other and breaking the ratio.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setBoxSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = imgDims && boxSize.w > 0 && boxSize.h > 0
    ? Math.min(boxSize.w / imgDims.w, boxSize.h / imgDims.h)
    : 1;
  const boxW = imgDims ? imgDims.w * scale : 0;
  const boxH = imgDims ? imgDims.h * scale : 0;

  return (
    <div ref={outerRef} className="w-full h-full max-w-2xl mx-auto flex items-center justify-center min-w-0 min-h-0">
    <div ref={containerRef} className="relative" style={{ width: boxW, height: boxH }}>
      <canvas ref={baseCanvasRef} style={{ display: "none" }} />
      <canvas
        ref={displayCanvasRef}
        style={{
          width: "100%", height: "100%", display: "block",
          cursor: logoSrc ? (logoSelected ? "move" : "pointer") : "default",
        }}
        onMouseDown={handleCanvasMouseDown}
      />
      {/* Protected home-button zone — always shown while a logo is placed,
          not just when selected, so it's clear up front why the logo can
          never actually cover it (drawComposite masks it out regardless). */}
      {logoSrc && homeButtonZone && imgDims && (
        <svg viewBox={`0 0 ${imgDims.w} ${imgDims.h}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
          <circle
            cx={(homeButtonZone.xPercent / 100) * imgDims.w}
            cy={(homeButtonZone.yPercent / 100) * imgDims.h}
            r={(homeButtonZone.sizePercent / 100) * imgDims.w / 2}
            fill="none" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={imgDims.w / 400}
            strokeDasharray={`${imgDims.w / 140} ${imgDims.w / 140}`} />
        </svg>
      )}
      {logoSrc && logoSelected && imgDims && (() => {
        const { x, y, w, h, rot } = logoPos;
        const lcx = x + w / 2, lcy = y + h / 2;
        return (
          <svg viewBox={`0 0 ${imgDims.w} ${imgDims.h}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
            <g transform={`translate(${lcx},${lcy}) rotate(${rot})`}>
              <rect x={-w / 2} y={-h / 2} width={w} height={h}
                fill="none" stroke="#e40707" strokeWidth={imgDims.w / 300} strokeDasharray={`${imgDims.w / 100} ${imgDims.w / 200}`} />
              <circle cx={w / 2} cy={h / 2} r={imgDims.w / 60} fill="#fff" stroke="#e40707" strokeWidth={imgDims.w / 300}
                style={{ pointerEvents: "auto", cursor: "se-resize" }} onMouseDown={startResize} />
              <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - imgDims.w / 20} stroke="#e40707" strokeWidth={imgDims.w / 300} />
              <circle cx={0} cy={-h / 2 - imgDims.w / 20} r={imgDims.w / 60} fill="#fff" stroke="#e40707" strokeWidth={imgDims.w / 300}
                style={{ pointerEvents: "auto", cursor: "grab" }} onMouseDown={startRotate} />
            </g>
          </svg>
        );
      })()}
    </div>
    </div>
  );
}

function FeatherControl({ label, range, onChange }: { label: string; range: FeatherRange; onChange: (r: FeatherRange) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/60">Shadow</span>
            <span className="text-[9px] font-mono text-foreground/50">{range.shHi}</span>
          </div>
          <input type="range" min={0} max={255} step={1} value={range.shHi}
            onChange={e => onChange({ ...range, shHi: Number(e.target.value) })}
            className="w-full accent-primary h-1 rounded-full cursor-pointer" />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/60">Highlight</span>
            <span className="text-[9px] font-mono text-foreground/50">{range.hiLo}</span>
          </div>
          <input type="range" min={0} max={255} step={1} value={255 - range.hiLo}
            onChange={e => onChange({ ...range, hiLo: 255 - Number(e.target.value) })}
            className="w-full accent-primary h-1 rounded-full cursor-pointer" />
        </div>
      </div>
    </div>
  );
}

/** Sidebar controls — upload + every effect slider. No preview canvas here;
 *  the live preview is LogoCanvas, rendered in the center stage instead. */
export function LogoControls({ editor, onApply }: { editor: LogoCompositor; onApply: (dataUrl: string) => void }) {
  const { fileInputRef, logoSrc, handleLogoFile, removeLogo,
    logoBlendMode, setLogoBlendMode, logoOpacity, setLogoOpacity, logoBlur, setLogoBlur,
    biThis, setBiThis, biUnd, setBiUnd, dispX, dispY, setDispX, setDispY, handleApply } = editor;
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="pb-2 border-b border-border">
        <span className="text-sm font-semibold">Logo</span>
      </div>

      <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Only upload images you own or have the rights to use. We don't review uploads for copyright before printing — if a logo infringes someone else's trademark or copyright, you're solely responsible for it, not us.
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 accent-primary w-4 h-4 flex-none cursor-pointer" />
          <span className="text-xs text-foreground/80 leading-relaxed">
            I confirm I have the rights to any image I upload here, and I accept full responsibility if it isn't.
          </span>
        </label>
      </div>

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoFile} />

      {!logoSrc ? (
        <button onClick={() => fileInputRef.current?.click()} disabled={!agreedToTerms}
          title={!agreedToTerms ? "Accept the terms above first" : undefined}
          className="w-full py-2 px-3 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground">
          Upload a logo (PNG/JPG/WebP)
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Blend Mode</label>
            <select value={logoBlendMode} onChange={e => setLogoBlendMode(e.target.value as BlendModeId)}
              className="text-xs bg-card border border-border rounded px-1.5 py-1">
              {BLEND_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Opacity</label>
              <span className="text-xs font-mono text-foreground/60">{Math.round(logoOpacity * 100)}%</span>
            </div>
            <input type="range" min={0.05} max={1} step={0.05} value={logoOpacity}
              onChange={e => setLogoOpacity(Number(e.target.value))}
              className="w-full accent-primary h-1.5 rounded-full cursor-pointer" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Softness</label>
              <span className="text-xs font-mono text-foreground/60">{logoBlur}px</span>
            </div>
            <input type="range" min={0} max={20} step={1} value={logoBlur}
              onChange={e => setLogoBlur(Number(e.target.value))}
              className="w-full accent-primary h-1.5 rounded-full cursor-pointer" />
          </div>

          <div className="border-t border-border pt-2 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">Surface Blending</p>
            <p className="text-[9px] text-muted-foreground/60 -mt-1">Fades the logo into the controller's own shadows and highlights instead of sitting flat on top.</p>
            <FeatherControl label="Logo Fade" range={biThis} onChange={setBiThis} />
            <FeatherControl label="Surface Fade" range={biUnd} onChange={setBiUnd} />
          </div>

          <div className="border-t border-border pt-2 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">Displacement</p>
            <p className="text-[9px] text-muted-foreground/60 -mt-1">Warps the logo along the surface's edges, like it's embossed into the material.</p>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Horizontal</span>
                <span className="text-[10px] font-mono text-foreground/60">{dispX}</span>
              </div>
              <input type="range" min={-40} max={40} step={1} value={dispX}
                onChange={e => setDispX(Number(e.target.value))}
                className="w-full accent-primary h-1.5 rounded-full cursor-pointer" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Vertical</span>
                <span className="text-[10px] font-mono text-foreground/60">{dispY}</span>
              </div>
              <input type="range" min={-40} max={40} step={1} value={dispY}
                onChange={e => setDispY(Number(e.target.value))}
                className="w-full accent-primary h-1.5 rounded-full cursor-pointer" />
            </div>
          </div>

          <div className="flex gap-1.5 pt-1">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex-1 text-xs px-2 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
              Replace
            </button>
            <button onClick={removeLogo}
              className="flex-1 text-xs px-2 py-1.5 rounded border border-destructive/40 text-destructive/80 hover:bg-destructive/10 transition-all">
              Remove
            </button>
          </div>
          <button onClick={() => { const url = handleApply(); if (url) onApply(url); }}
            className="w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all">
            Apply Logo
          </button>
        </div>
      )}
    </div>
  );
}
