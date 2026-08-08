import * as THREE from "three";

// Runtime-generated medallion artwork — 0 network bytes, no .glb/image downloads.
// Design language: a modern precision instrument, not an antique coin. Dark
// glass face, one hairline gold rim, a machined tick ring, an emerald reticle,
// and a single crisp ₹. Thin strokes + negative space do the work.

const SIZE = 1024; // high-res so the rim stays crisp in close-ups
const C = SIZE / 2;

function darkFace(x: CanvasRenderingContext2D) {
  const g = x.createRadialGradient(C, C * 0.82, SIZE * 0.04, C, C, C);
  g.addColorStop(0, "#16201c");
  g.addColorStop(0.55, "#0b110f");
  g.addColorStop(1, "#050807");
  x.fillStyle = g;
  x.beginPath();
  x.arc(C, C, C, 0, Math.PI * 2);
  x.fill();
}

/** Machined tick marks around the rim — reads as a precision bezel. */
function tickRing(x: CanvasRenderingContext2D, radius: number, count: number, len: number, color: string, width: number) {
  x.save();
  x.strokeStyle = color;
  x.lineWidth = width;
  x.lineCap = "butt";
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const major = i % 5 === 0;
    const l = major ? len * 1.9 : len;
    x.globalAlpha = major ? 1 : 0.45;
    x.beginPath();
    x.moveTo(C + Math.cos(a) * radius, C + Math.sin(a) * radius);
    x.lineTo(C + Math.cos(a) * (radius - l), C + Math.sin(a) * (radius - l));
    x.stroke();
  }
  x.restore();
}

function ring(x: CanvasRenderingContext2D, r: number, color: string, w: number, alpha = 1) {
  x.save();
  x.globalAlpha = alpha;
  x.strokeStyle = color;
  x.lineWidth = w;
  x.beginPath();
  x.arc(C, C, r, 0, Math.PI * 2);
  x.stroke();
  x.restore();
}

/** Text on a circular arc, centred at the given angle. */
function arcText(
  x: CanvasRenderingContext2D,
  text: string,
  radius: number,
  centerAngle: number,
  font: string,
  color: string,
  spread = 0.026,
  flip = false,
) {
  x.save();
  x.fillStyle = color;
  x.font = font;
  x.textAlign = "center";
  x.textBaseline = "middle";
  const chars = [...text];
  const start = centerAngle - ((chars.length - 1) * spread) / 2;
  chars.forEach((ch, i) => {
    const a = start + i * spread;
    x.save();
    x.translate(C + Math.cos(a) * radius, C + Math.sin(a) * radius);
    x.rotate(flip ? a - Math.PI / 2 : a + Math.PI / 2);
    x.fillText(ch, 0, 0);
    x.restore();
  });
  x.restore();
}

/** Front face: bezel + reticle + ₹ core — the face shown at rest and stamped. */
export function makeMedallionFace(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const x = canvas.getContext("2d")!;

  darkFace(x);

  // Outer bezel: one hairline gold rim + machined ticks.
  ring(x, C - 10, "rgba(245,196,81,0.95)", 5);
  ring(x, C - 26, "rgba(245,196,81,0.28)", 1.5);
  tickRing(x, C - 34, 120, 12, "rgba(245,196,81,0.8)", 2);

  // Emerald reticle — thin rings + crosshair ticks (the "bullseye", modernised).
  ring(x, 300, "rgba(52,211,153,0.34)", 2);
  ring(x, 214, "rgba(52,211,153,0.22)", 1.5);
  x.save();
  x.strokeStyle = "rgba(52,211,153,0.55)";
  x.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    x.beginPath();
    x.moveTo(C + Math.cos(a) * 196, C + Math.sin(a) * 196);
    x.lineTo(C + Math.cos(a) * 246, C + Math.sin(a) * 246);
    x.stroke();
  }
  x.restore();

  // ₹ core — flat gold disc, clean grotesque numeral, no fake bevel.
  const core = x.createLinearGradient(C - 70, C - 80, C + 70, C + 80);
  core.addColorStop(0, "#ffe6a4");
  core.addColorStop(0.5, "#f5c451");
  core.addColorStop(1, "#d09a2f");
  x.fillStyle = core;
  x.beginPath();
  x.arc(C, C, 104, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#050807";
  x.font = "600 118px Inter, 'Helvetica Neue', system-ui, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("₹", C, C + 6);

  // Wordmark arcs: top and bottom, small-caps tracking.
  arcText(x, "BULLSEYE", C - 62, -Math.PI / 2, "500 40px Inter, system-ui, sans-serif", "rgba(245,196,81,0.92)", 0.062);
  arcText(x, "AI VERDICT", C - 62, Math.PI / 2, "500 30px Inter, system-ui, sans-serif", "rgba(198,198,205,0.6)", 0.05, true);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Back face: the same bezel language, reticle only — reads mid-flip. */
export function makeMedallionBack(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const x = canvas.getContext("2d")!;

  darkFace(x);
  ring(x, C - 10, "rgba(245,196,81,0.7)", 5);
  ring(x, C - 26, "rgba(245,196,81,0.2)", 1.5);
  tickRing(x, C - 34, 120, 12, "rgba(245,196,81,0.5)", 2);

  ring(x, 320, "rgba(52,211,153,0.22)", 2);
  ring(x, 232, "rgba(52,211,153,0.16)", 1.5);
  ring(x, 144, "rgba(245,196,81,0.3)", 2);

  x.fillStyle = "rgba(245,196,81,0.85)";
  x.beginPath();
  x.arc(C, C, 26, 0, Math.PI * 2);
  x.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial dot sprite used for the market-swarm points. */
/**
 * Star sprite for the market swarm.
 *
 * The previous sprite was a plain radial gradient still at 85% alpha a quarter
 * of the way out. Under `sizeAttenuation` any node near the camera blew up into
 * a large soft blob, which read as blurred dots rather than a starfield.
 *
 * A star is legible because of two things: a very tight bright core, and
 * diffraction spikes. Both are generated per-pixel here rather than by stroking
 * lines onto the canvas — stroked spikes alias badly once the texture is scaled,
 * whereas an exponential falloff tapers smoothly at any size.
 *
 *   core   sharp centre, decays fast so the star has a definite point
 *   glow   faint wide halo so it still feels luminous, not a hard pixel
 *   spikes bright along the two axes, fading with distance from centre
 */
export function makeStarSprite(): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(s, s);
  const data = image.data;
  const c = (s - 1) / 2;

  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      const nx = (px - c) / c; // -1 .. 1
      const ny = (py - c) / c;
      const r2 = nx * nx + ny * ny;
      const r = Math.sqrt(r2);

      const core = Math.exp(-r2 * 46);
      const glow = Math.exp(-r2 * 7) * 0.2;
      // Tight in the cross-axis, slow decay along the axis => a long thin spike.
      const falloff = Math.exp(-r * 4.2);
      const hSpike = Math.exp(-ny * ny * 850) * falloff * 0.5;
      const vSpike = Math.exp(-nx * nx * 850) * falloff * 0.5;

      const alpha = Math.min(1, core + glow + hSpike + vSpike);
      const index = (py * s + px) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
