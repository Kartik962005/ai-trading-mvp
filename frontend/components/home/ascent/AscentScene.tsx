"use client";

// The Ascent scene: a single ₹ verdict-medallion at the origin, a cloud of NSE
// "stock nodes" around it, and a camera that flies a hand-authored path as the
// page scrolls (progress 0→1). Everything is scroll-driven so an idle page
// renders nothing (frameloop="demand"): huge battery/mobile win.

import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { makeMedallionFace, makeMedallionBack, makeStarSprite } from "./coinTextures";

export type ScrollApi = { invalidate: () => void };
type Pointer = { x: number; y: number };

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** 1 inside [a,b] with soft edges — toggles per-scene accents on/off. */
function window01(p: number, a: number, b: number, edge = 0.05) {
  if (p <= a - edge || p >= b + edge) return 0;
  if (p < a + edge) return smooth((p - (a - edge)) / (2 * edge));
  if (p > b - edge) return smooth(((b + edge) - p) / (2 * edge));
  return 1;
}

type CamKey = {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
  coinS: number;
  spin: number;
};

// Hand-authored camera path. The camera does the traveling (movie-like); the
// coin mostly holds the origin, spinning + scaling. Spin lands on a multiple of
// 2π at p=1 so the face is dead-on for the CTA.
const CAM: CamKey[] = [
  // Landing: coin parked UPPER-RIGHT so it never sits on the headline (left)
  // or the live stock cards (bottom). lookAt is offset down-left of the coin,
  // which pushes the coin up-right on screen.
  { p: 0.0, pos: [0.0, 0.2, 3.9], look: [-0.85, -0.6, 0], coinS: 1.0, spin: 0.0 },
  { p: 0.22, pos: [0.0, 0.6, 13.5], look: [0, 0, 0], coinS: 0.95, spin: Math.PI * 1.0 },
  { p: 0.46, pos: [3.6, 1.7, 4.6], look: [-0.6, 0.1, -7.5], coinS: 0.8, spin: Math.PI * 2.2 },
  { p: 0.68, pos: [0.0, 0.1, 5.6], look: [0, 0, 0], coinS: 1.12, spin: Math.PI * 3.6 },
  { p: 1.0, pos: [-1.95, 0.05, 4.3], look: [0.5, 0, 0], coinS: 1.15, spin: Math.PI * 5 },
];

type Sample = { pos: THREE.Vector3; look: THREE.Vector3; coinS: number; spin: number };

function sampleCam(p: number, out: Sample) {
  const t = clamp01(p);
  let a = CAM[0];
  let b = CAM[CAM[0].p === t ? 0 : CAM.length - 1];
  for (let i = 0; i < CAM.length - 1; i++) {
    if (t >= CAM[i].p && t <= CAM[i + 1].p) {
      a = CAM[i];
      b = CAM[i + 1];
      break;
    }
  }
  const span = b.p - a.p || 1;
  const k = smooth(clamp01((t - a.p) / span));
  out.pos.set(
    a.pos[0] + (b.pos[0] - a.pos[0]) * k,
    a.pos[1] + (b.pos[1] - a.pos[1]) * k,
    a.pos[2] + (b.pos[2] - a.pos[2]) * k,
  );
  out.look.set(
    a.look[0] + (b.look[0] - a.look[0]) * k,
    a.look[1] + (b.look[1] - a.look[1]) * k,
    a.look[2] + (b.look[2] - a.look[2]) * k,
  );
  out.coinS = a.coinS + (b.coinS - a.coinS) * k;
  out.spin = a.spin + (b.spin - a.spin) * k;
  return out;
}

function Rig({
  progress,
  pointer,
  easedRef,
}: {
  progress: MutableRefObject<number>;
  pointer: MutableRefObject<Pointer>;
  easedRef: MutableRefObject<number>;
}) {
  const { camera, invalidate } = useThree();
  const sample = useMemo<Sample>(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), coinS: 1, spin: 0 }), []);
  useFrame(() => {
    // Ease the raw scroll value so fast flicks feel weighty. Lower factor =
    // more lag = slower, heavier camera (tuned down from 0.16).
    const delta = progress.current - easedRef.current;
    easedRef.current += delta * 0.075;
    // frameloop="demand" only renders on invalidate(); keep the loop alive
    // while the eased value is still catching up, otherwise the glide freezes
    // mid-travel the moment scrolling stops.
    if (Math.abs(delta) > 0.0002) invalidate();
    const s = sampleCam(easedRef.current, sample);
    camera.position.set(
      s.pos.x + pointer.current.x * 0.5,
      s.pos.y + pointer.current.y * 0.4,
      s.pos.z,
    );
    camera.lookAt(s.look);
  });
  return null;
}

function Medallion({ easedRef }: { easedRef: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const faceMat = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const sample = useMemo<Sample>(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), coinS: 1, spin: 0 }), []);

  const [faceTex, backTex] = useMemo(() => [makeMedallionFace(), makeMedallionBack()], []);
  const geometry = useMemo(() => {
    // Thinner + more segments: reads as a machined disc rather than a chunky
    // token, and the rim highlight stays smooth in close-ups.
    const g = new THREE.CylinderGeometry(1.3, 1.3, 0.09, 160, 1);
    g.rotateX(Math.PI / 2); // caps face ±Z so the front looks at the camera
    return g;
  }, []);

  useEffect(() => {
    return () => {
      faceTex.dispose();
      backTex.dispose();
      geometry.dispose();
    };
  }, [faceTex, backTex, geometry]);

  useFrame(() => {
    const e = easedRef.current;
    const s = sampleCam(e, sample);
    if (group.current) {
      group.current.rotation.y = s.spin;
      group.current.rotation.x = 0.16 + Math.sin(e * 2.4) * 0.02;
      group.current.scale.setScalar(s.coinS);
    }
    // Verdict stamp: face flares, a ring sweeps in around p≈0.66.
    const stamp = window01(e, 0.58, 0.82, 0.05);
    if (faceMat.current) faceMat.current.emissiveIntensity = 0.32 + stamp * 1.5;
    if (ring.current && ringMat.current) {
      const sweep = smooth(clamp01((e - 0.58) / 0.14));
      const rs = 2.6 - 1.6 * sweep;
      ring.current.scale.setScalar(rs);
      ringMat.current.opacity = stamp * 0.9;
    }
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        {/* [side(rim), top(front), bottom(back)] */}
        <meshStandardMaterial attach="material-0" color="#e8c579" metalness={1} roughness={0.18} />
        <meshPhysicalMaterial
          ref={faceMat}
          attach="material-1"
          map={faceTex}
          emissive="#0e6a49"
          emissiveMap={faceTex}
          emissiveIntensity={0.3}
          metalness={0.7}
          roughness={0.22}
          clearcoat={1}
          clearcoatRoughness={0.12}
        />
        <meshStandardMaterial attach="material-2" map={backTex} metalness={0.75} roughness={0.3} />
      </mesh>
      {/* Stamp ring (in front of the coin face). */}
      <mesh ref={ring} position={[0, 0, 0.2]}>
        <ringGeometry args={[1.34, 1.46, 64]} />
        <meshBasicMaterial
          ref={ringMat}
          color="#f5c451"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function MarketSwarm({ easedRef }: { easedRef: MutableRefObject<number> }) {
  const points = useRef<THREE.Points>(null);
  const sprite = useMemo(() => makeStarSprite(), []);

  const geometry = useMemo(() => {
    const COUNT = 620;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    // Sector-tinted palette, weighted emerald/gold with a few cool accents.
    const palette = [
      new THREE.Color("#34d399"),
      new THREE.Color("#34d399"),
      new THREE.Color("#f5c451"),
      new THREE.Color("#6ee7b7"),
      new THREE.Color("#7dd3fc"),
      new THREE.Color("#c4b5fd"),
    ];
    for (let i = 0; i < COUNT; i++) {
      // Hollow-ish shell so the camera can fly among the nodes.
      const r = 4.2 + Math.random() * 8.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = (r * Math.cos(phi)) * 0.6;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 2;
      const c = palette[(Math.random() * palette.length) | 0];
      // Vary brightness so the field has depth. A real sky is mostly faint with
      // a few bright stars, so bias the distribution low (cubed) rather than
      // uniform — 620 equally-bright points read as a texture, not a starfield.
      const brightness = 0.28 + Math.pow(Math.random(), 3) * 0.72;
      colors[i * 3] = c.r * brightness;
      colors[i * 3 + 1] = c.g * brightness;
      colors[i * 3 + 2] = c.b * brightness;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      sprite.dispose();
    };
  }, [geometry, sprite]);

  useFrame(() => {
    if (points.current) points.current.rotation.y = easedRef.current * 0.55;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        // Smaller than the old 0.5. The star sprite carries its detail in a
        // tight core plus spikes, so it stays legible small — whereas the old
        // soft blob needed size to be visible, which is what made near nodes
        // bloom into blurred discs under sizeAttenuation.
        size={0.34}
        map={sprite}
        vertexColors
        transparent
        opacity={0.95}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function AscentScene({
  progress,
  apiRef,
}: {
  progress: MutableRefObject<number>;
  apiRef: MutableRefObject<ScrollApi | null>;
}) {
  const pointer = useRef<Pointer>({ x: 0, y: 0 });
  const easedRef = useRef(0);

  return (
    <Canvas
      className="!absolute inset-0"
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0.7, 0.15, 3.15], fov: 42, near: 0.1, far: 100 }}
      onCreated={({ invalidate }) => {
        apiRef.current = { invalidate };
        invalidate();
      }}
      onPointerMove={(e) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        pointer.current.x = (e.clientX / w) * 2 - 1;
        pointer.current.y = -((e.clientY / h) * 2 - 1);
        apiRef.current?.invalidate();
      }}
    >
      <AdaptiveDpr />
      <fog attach="fog" args={["#04070a", 9, 24]} />
      <ambientLight intensity={0.4} />
      {/* Key */}
      <directionalLight position={[4, 6, 8]} intensity={2.1} color="#fff4d6" />
      {/* Emerald fill */}
      <pointLight position={[-3, -2, 4]} intensity={38} distance={18} color="#34d399" />
      {/* Rim/back light — separates the gold edge from the black void. */}
      <directionalLight position={[-5, 2, -6]} intensity={1.4} color="#f5c451" />
      <Rig progress={progress} pointer={pointer} easedRef={easedRef} />
      <Medallion easedRef={easedRef} />
      <MarketSwarm easedRef={easedRef} />
    </Canvas>
  );
}
