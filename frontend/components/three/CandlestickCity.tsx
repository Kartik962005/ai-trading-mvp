"use client";

// ─── CANDLESTICK CITY ───────────────────────────────────────────────────────
// The market as a glowing metropolis. Hundreds of candlestick "skyscrapers"
// (green = up, red = down) line a central avenue, and the camera FLIES down the
// avenue as the page scrolls — weaving, banking into the turns and bobbing, so
// it feels like a drone shot through a city rather than a rail. Buildings fade
// in from fog as you approach them (cinematic reveal + distance culling).
//
// Performance: every tower body is one instanced draw call, every wick another;
// fog culls the distance; DPR is capped; rendering pauses when the tab hides.

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const DEPTH = 340; // how far the avenue runs into -z
const ROW_GAP = 7; // spacing of buildings along z
const COLS = [5.5, 9.5, 14, 19, 25]; // x offsets of building columns from the avenue
const CLEAR = 3.4; // half-width of the flight lane the camera stays inside

const UP = new THREE.Color("#2fd98f");
const DOWN = new THREE.Color("#ff5f7a");

type Tower = { x: number; z: number; h: number; w: number; up: boolean; wick: number };

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildCity(): Tower[] {
  const rng = makeRng(20260726);
  const towers: Tower[] = [];
  const rows = Math.floor(DEPTH / ROW_GAP);
  // A per-column "price walk" so each row of a column reads like a real chart.
  const price = new Map<string, number>();

  for (let r = 0; r < rows; r++) {
    const z = -r * ROW_GAP - 8;
    for (const side of [-1, 1] as const) {
      for (const col of COLS) {
        // Thin some towers out so the city has gaps and cross-streets.
        if (rng() < 0.14) continue;
        const key = `${side}:${col}`;
        const prev = price.get(key) ?? 12;
        const drift = (rng() - 0.46) * 7;
        const next = Math.max(4, Math.min(46, prev + drift));
        price.set(key, next);
        const jitterX = (rng() - 0.5) * 2.4;
        towers.push({
          x: side * (col + jitterX),
          z: z + (rng() - 0.5) * 3,
          h: next,
          w: 2.4 + rng() * 1.8,
          up: drift >= 0,
          wick: next + 2 + rng() * 5,
        });
      }
    }
  }
  return towers;
}

function CityInstances({ towers }: { towers: Tower[] }) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const wickRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const wick = wickRef.current;
    if (!body || !wick) return;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();

    towers.forEach((t, i) => {
      const color = t.up ? UP : DOWN;

      pos.set(t.x, t.h / 2 - 6, t.z);
      s.set(t.w, t.h, t.w);
      m.compose(pos, q, s);
      body.setMatrixAt(i, m);
      body.setColorAt(i, color);

      pos.set(t.x, t.wick / 2 - 6, t.z);
      s.set(0.32, t.wick, 0.32);
      m.compose(pos, q, s);
      wick.setMatrixAt(i, m);
      wick.setColorAt(i, color);
    });

    body.instanceMatrix.needsUpdate = true;
    wick.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (wick.instanceColor) wick.instanceColor.needsUpdate = true;
  }, [towers]);

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, towers.length]} castShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.25}
          emissive="#0a2a1e"
          emissiveIntensity={0.55}
        />
      </instancedMesh>
      <instancedMesh ref={wickRef} args={[undefined, undefined, towers.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Flies the camera down the avenue from the page's scroll progress. */
function FlyCamera({ progress }: { progress: React.RefObject<number> }) {
  const prevX = useRef(0);
  useFrame((state, delta) => {
    const p = progress.current ?? 0;
    const cam = state.camera;

    const targetZ = 12 - p * (DEPTH - 42);
    // Weave left/right down the avenue, staying inside the clear lane.
    const targetX = Math.sin(p * Math.PI * 3.2) * (CLEAR - 0.6);
    const targetY = 4.2 + Math.sin(p * Math.PI * 6) * 0.9;

    cam.position.z = THREE.MathUtils.damp(cam.position.z, targetZ, 3.2, delta);
    cam.position.x = THREE.MathUtils.damp(cam.position.x, targetX, 2.4, delta);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, targetY, 2.4, delta);

    // Aim a little ahead and slightly up so towers rise past the frame.
    const ahead = new THREE.Vector3(
      Math.sin((p + 0.05) * Math.PI * 3.2) * (CLEAR - 0.6),
      cam.position.y + 1.5,
      cam.position.z - 18
    );
    cam.lookAt(ahead); // this sets orientation with up = +y (roll = 0)

    // Bank into the turns AFTER lookAt: roll ~ how fast x is changing.
    const dx = cam.position.x - prevX.current;
    prevX.current = cam.position.x;
    const targetRoll = THREE.MathUtils.clamp(-dx * 7, -0.34, 0.34);
    cam.rotateZ(targetRoll);
  });
  return null;
}

function useScrollProgress() {
  const progress = useRef(0);
  useEffect(() => {
    const update = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
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

export default function CandlestickCity({ className }: { className?: string }) {
  const towers = useMemo(buildCity, []);
  const progress = useScrollProgress();
  const [visible, setVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onVis();
    onResize();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className={className} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, isMobile ? 1.2 : 1.7]}
        gl={{ antialias: !isMobile, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 70, near: 0.1, far: 200, position: [0, 4.2, 12] }}
      >
        <color attach="background" args={["#03040a"]} />
        <fog attach="fog" args={["#03040a", 10, 78]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 30, 8]} intensity={0.7} />
        <pointLight position={[0, 8, -22]} intensity={55} distance={95} color="#5fe6b0" />
        <pointLight position={[0, 6, -70]} intensity={45} distance={90} color="#f5c451" />
        <CityInstances towers={towers} />
        <FlyCamera progress={progress} />
      </Canvas>
    </div>
  );
}
