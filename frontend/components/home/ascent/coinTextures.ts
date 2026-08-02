import * as THREE from "three";

// Runtime-generated medallion artwork — 0 network bytes, no .glb/image downloads.
// The coin is Bullseye's "verdict medallion": a machined bullseye with a ₹ core.
// Two faces are drawn on <canvas> and uploaded as textures for the coin's caps.

const SIZE = 512;

function baseDisc(x: CanvasRenderingContext2D) {
  const g = x.createRadialGradient(SIZE / 2, SIZE / 2, 24, SIZE / 2, SIZE / 2, SIZE / 2);
  g.addColorStop(0, "#0e1613");
  g.addColorStop(0.7, "#080b0a");
  g.addColorStop(1, "#04070a");
  x.fillStyle = g;
  x.beginPath();
  x.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  x.fill();
}

function bullseyeRings(x: CanvasRenderingContext2D, rings: Array<[number, string, number]>) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  for (const [r, col, w] of rings) {
    x.lineWidth = w;
    x.strokeStyle = col;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
  }
}

/** Front face: bullseye + ₹ core + wordmark — the face shown at rest. */
export function makeMedallionFace(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const x = canvas.getContext("2d")!;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  baseDisc(x);
  bullseyeRings(x, [
    [232, "rgba(245,196,81,0.92)", 7],
    [186, "rgba(52,211,153,0.5)", 4],
    [138, "rgba(245,196,81,0.85)", 6],
    [92, "rgba(52,211,153,0.45)", 4],
  ]);

  // Gold core with ₹.
  const core = x.createRadialGradient(cx - 14, cy - 16, 6, cx, cy, 54);
  core.addColorStop(0, "#ffe9ad");
  core.addColorStop(1, "#e0a83a");
  x.fillStyle = core;
  x.beginPath();
  x.arc(cx, cy, 52, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#05080b";
  x.font = "700 66px Georgia, 'Times New Roman', serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("₹", cx, cy + 3);

  // Wordmark + subtitle.
  x.fillStyle = "rgba(245,196,81,0.92)";
  x.font = "600 30px Georgia, serif";
  x.fillText("B U L L S E Y E", cx, 66);
  x.fillStyle = "rgba(198,198,205,0.72)";
  x.font = "500 18px Inter, system-ui, sans-serif";
  x.fillText("A I   V E R D I C T", cx, SIZE - 60);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Back face: concentric rings only, so the coin reads on both sides mid-flip. */
export function makeMedallionBack(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const x = canvas.getContext("2d")!;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  baseDisc(x);
  bullseyeRings(x, [
    [232, "rgba(245,196,81,0.6)", 6],
    [176, "rgba(52,211,153,0.4)", 4],
    [120, "rgba(245,196,81,0.55)", 5],
    [64, "rgba(52,211,153,0.35)", 4],
  ]);
  x.fillStyle = "rgba(245,196,81,0.85)";
  x.beginPath();
  x.arc(cx, cy, 20, 0, Math.PI * 2);
  x.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial dot sprite used for the market-swarm points. */
export function makeDotSprite(): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const x = canvas.getContext("2d")!;
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
