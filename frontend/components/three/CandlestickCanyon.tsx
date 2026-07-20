"use client";

// Candlestick Canyon — a real WebGL scene (three.js / React Three Fiber).
// Two walls of glowing candlesticks recede into fog, and the camera FLIES
// FORWARD through the canyon as the page scrolls. Scroll position drives the
// camera z directly (damped), so the motion is tied to the user's scroll.
//
// Perf: everything is instanced (2 draw calls for ~360 candles + wicks), DPR is
// capped, and rendering pauses when the tab is hidden.

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const ROWS = 90; // candles per wall
const SPACING = 2.3; // distance between candles along z
const DEPTH = ROWS * SPACING;
const WALL_X = 5.4;

type Candle = { x: number; y: number; z: number; h: number; up: boolean; wick: number };

/** Deterministic RNG so the canyon looks identical on every load/SSR. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildCandles(): Candle[] {
  const rng = makeRng(20260720);
  const out: Candle[] = [];
  // One "price" walk per wall so each side reads like a real chart.
  const price = [9, 9];
  for (let i = 0; i < ROWS; i++) {
    [-1, 1].forEach((side, sideIndex) => {
      const drift = (rng() - 0.47) * 2.6;
      price[sideIndex] = Math.max(2.5, Math.min(17, price[sideIndex] + drift));
      const h = Math.max(1.2, price[sideIndex] * (0.5 + rng() * 0.45));
      out.push({
        x: side * (WALL_X + rng() * 1.8),
        y: h / 2 - 4.2,
        z: -i * SPACING,
        h,
        up: drift >= 0,
        wick: h * (1.25 + rng() * 0.5),
      });
    });
  }
  return out;
}

function CanyonInstances({ candles }: { candles: Candle[] }) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const wickRef = useRef<THREE.InstancedMesh>(null);

  const [up, down] = useMemo(
    () => [new THREE.Color("#2bf5b0"), new THREE.Color("#ff5d7e")],
    []
  );

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const wick = wickRef.current;
    if (!body || !wick) return;

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();

    candles.forEach((c, i) => {
      const color = c.up ? up : down;

      pos.set(c.x, c.y, c.z);
      scale.set(1.05, c.h, 1.05);
      matrix.compose(pos, quat, scale);
      body.setMatrixAt(i, matrix);
      body.setColorAt(i, color);

      // Thin wick through the middle of the body.
      pos.set(c.x, c.y, c.z);
      scale.set(0.22, c.wick, 0.22);
      matrix.compose(pos, quat, scale);
      wick.setMatrixAt(i, matrix);
      wick.setColorAt(i, color);
    });

    body.instanceMatrix.needsUpdate = true;
    wick.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (wick.instanceColor) wick.instanceColor.needsUpdate = true;
  }, [candles, up, down]);

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[null as never, null as never, candles.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.35}
          metalness={0.15}
          emissive="#0b2a3a"
          emissiveIntensity={0.35}
        />
      </instancedMesh>
      <instancedMesh ref={wickRef} args={[null as never, null as never, candles.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Drives the camera down the canyon from the page's scroll progress. */
function ScrollRig({ progress }: { progress: React.RefObject<number> }) {
  useFrame((state, delta) => {
    const travel = DEPTH - 26;
    const targetZ = 6 - (progress.current ?? 0) * travel;
    const cam = state.camera;
    cam.position.z = THREE.MathUtils.damp(cam.position.z, targetZ, 3.2, delta);
    // Gentle drift so it feels like flying, not sliding on rails.
    const t = (progress.current ?? 0) * Math.PI * 4;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, Math.sin(t) * 1.1, 2, delta);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, Math.cos(t * 0.7) * 0.5, 2, delta);
    cam.lookAt(0, 0, cam.position.z - 14);
  });
  return null;
}

/** Page scroll -> 0..1, written to a ref (no re-renders). */
function useScrollProgress() {
  const progress = useRef(0);
  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      progress.current = Math.min(1, Math.max(0, window.scrollY / max));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return progress;
}

export default function CandlestickCanyon({ className }: { className?: string }) {
  const candles = useMemo(buildCandles, []);
  const progress = useScrollProgress();
  const [visible, setVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onVisibility();
    onResize();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className={className} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, isMobile ? 1.25 : 1.75]}
        gl={{ antialias: !isMobile, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 64, near: 0.1, far: 220, position: [0, 0, 6] }}
      >
        <fog attach="fog" args={["#03060e", 14, 96]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 14, 6]} intensity={1.15} />
        <pointLight position={[0, 2, -18]} intensity={40} distance={70} color="#3ba9ff" />
        <CanyonInstances candles={candles} />
        <ScrollRig progress={progress} />
      </Canvas>
    </div>
  );
}
