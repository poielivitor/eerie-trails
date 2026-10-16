import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import lanternArm from "@/assets/lantern-arm.png";
import { GameAudio } from "./audio";

/* ---------------- constants ---------------- */
const CAVE_HALF = 2.4;
const PATH_HALF = 2.6;
const START_Z = 8;
export const TOTAL_METERS = 250;
const CABIN_Z = START_Z - TOTAL_METERS; // -242
const PATH_END = CABIN_Z - 28;
const WALK = 2.2;
const TURN = 1.6;
const OIL_DRAIN = 1.6;
const OIL_PICKUP = 35;
const PITCH_LIMIT = 1.5;

const pathX = (z: number) => Math.sin(z * 0.03) * 5 + Math.sin(z * 0.011 + 1) * 9;

function caveDepth(x: number, z: number, caveX: number) {
  return Math.abs(x - caveX) <= CAVE_HALF ? Math.max(0, z - 12) : 0;
}
function isGameOver(oil: number, depth: number) {
  return oil <= 0 || depth > 3;
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647), (s - 1) / 2147483646);
}
function pixelTexture(
  size: number,
  draw: (c: CanvasRenderingContext2D, r: () => number) => void,
  repeat: number,
) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d")!, rng(7));
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const grassTex = () =>
  pixelTexture(
    64,
    (c, r) => {
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const v = r();
          c.fillStyle = v > 0.85 ? "#2a3a22" : v > 0.5 ? "#1c2818" : v > 0.2 ? "#172014" : "#22301c";
          c.fillRect(x, y, 1, 1);
        }
    },
    120,
  );
const dirtTex = () => {
  const t = pixelTexture(
    32,
    (c, r) => {
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const v = r();
          c.fillStyle = v > 0.92 ? "#6b6258" : v > 0.6 ? "#4a3626" : v > 0.3 ? "#3d2b1e" : "#543d2a";
          c.fillRect(x, y, 1, 1);
        }
    },
    1,
  );
  t.repeat.set(1, 1);
  return t;
};
const barkTex = () =>
  pixelTexture(
    16,
    (c, r) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          c.fillStyle = x % 4 === 0 ? "#140d08" : r() > 0.5 ? "#2a1c12" : "#21160e";
          c.fillRect(x, y, 1, 1);
        }
    },
    1,
  );
const leafTex = () =>
  pixelTexture(
    32,
    (c, r) => {
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const v = r();
          c.fillStyle = v > 0.8 ? "#1f3324" : v > 0.4 ? "#13241a" : "#0c1a12";
          c.fillRect(x, y, 1, 1);
        }
    },
    1,
  );

function pathGeometry() {
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const N = 400;
  const span = 15 - PATH_END;
  for (let i = 0; i <= N; i++) {
    const z = 15 - (span * i) / N;
    const x = pathX(z);
    const w = PATH_HALF + Math.sin(z * 0.37) * 0.4;
    pos.push(x - w, 0.01, z, x + w, 0.01, z);
    uv.push(0, -z / 2.5, 2, -z / 2.5);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function treeData() {
  const r = rng(42);
  const out: { x: number; z: number; s: number; r: number }[] = [];
  for (let z = 20; z > PATH_END - 20; z -= 1.1)
    for (let k = 0; k < 4; k++) {
      const side = r() > 0.5 ? 1 : -1;
      const d = 4.5 + r() ** 1.6 * 30;
      out.push({ x: pathX(z) + side * d, z: z + r(), s: 0.7 + r() * 0.9, r: r() * Math.PI });
    }
  // keep the cabin clearing free
  return out.filter((t) => !(Math.abs(t.z - CABIN_Z) < 7 && Math.abs(t.x - pathX(CABIN_Z)) < 8));
}
function flaskData() {
  const r = rng(9);
  const out: { x: number; z: number }[] = [];
  for (let z = -35; z > CABIN_Z + 15; z -= 38 + r() * 20) out.push({ x: pathX(z) + (r() - 0.5) * 3, z });
  return out;
}

/* ---------------- shared mutable game state ---------------- */
type Phase = "menu" | "playing" | "entering" | "dead" | "won";
type EventName = "shadow" | "bat" | "runner" | "lantern" | "scream" | "squirrel" | "hey";
type Fired = { t0: number; x: number; z: number; yaw: number };
const EVENTS: { name: EventName; at: number }[] = [
  { name: "shadow", at: 75 },
  { name: "bat", at: 91 },
  { name: "runner", at: 110 },
  { name: "lantern", at: 135 },
  { name: "scream", at: 170 },
  { name: "squirrel", at: 200 },
  { name: "hey", at: 220 },
];

const S = {
  phase: "menu" as Phase,
  oil: 100,
  x: pathX(START_Z),
  z: START_Z,
  yaw: 0,
  pitch: 0,
  bob: 0,
  moving: false,
  keys: new Set<string>(),
  collected: new Set<number>(),
  audio: null as GameAudio | null,
  flicker: 1,
  inCave: false,
  events: new Map<EventName, Fired>(),
  lanternOffUntil: 0,
  enterT: 0,
  enterFrom: null as null | { x: number; z: number; yaw: number; pitch: number },
  doorOpen: 0,
  fade: 0,
  doorCreaked: false,
};
function resetState() {
  S.oil = 100;
  S.z = START_Z;
  S.x = pathX(START_Z);
  S.yaw = 0;
  S.pitch = 0;
  S.bob = 0;
  S.inCave = false;
  S.keys.clear();
  S.collected.clear();
  S.events.clear();
  S.lanternOffUntil = 0;
  S.enterT = 0;
  S.enterFrom = null;
  S.doorOpen = 0;
  S.fade = 0;
  S.doorCreaked = false;
}

/* ---------------- world ---------------- */
function Cave() {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-5.5, -0.2);
    s.lineTo(-5.5, 2.5);
    s.lineTo(-4.3, 5);
    s.lineTo(-1.8, 6.2);
    s.lineTo(1.8, 6.4);
    s.lineTo(4.5, 4.8);
    s.lineTo(5.5, 2);
    s.lineTo(5.5, -0.2);
    s.lineTo(CAVE_HALF, -0.2);
    s.lineTo(CAVE_HALF, 2.3);
    s.lineTo(1.5, 3.5);
    s.lineTo(-1.3, 3.7);
    s.lineTo(-CAVE_HALF, 2.4);
    s.lineTo(-CAVE_HALF, -0.2);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: false });
  }, []);
  const stone = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue("--cave-stone").trim() || "#45474a",
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[pathX(8), 0, 12]}>
      <mesh geometry={geo}>
        <meshLambertMaterial color={stone} flatShading />
      </mesh>
      <mesh position={[0, 1.85, 0.02]}>
        <planeGeometry args={[CAVE_HALF * 2, 3.7]} />
        <meshBasicMaterial color={0} fog={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Trees() {
  const data = useMemo(treeData, []);
  const trunk = useRef<THREE.InstancedMesh>(null);
  const l0 = useRef<THREE.InstancedMesh>(null);
  const l1 = useRef<THREE.InstancedMesh>(null);
  const l2 = useRef<THREE.InstancedMesh>(null);
  const leaves = [l0, l1, l2];
  const bark = useMemo(barkTex, []);
  const leaf = useMemo(leafTex, []);
  useEffect(() => {
    const o = new THREE.Object3D();
    data.forEach((t, i) => {
      o.position.set(t.x, 2.5 * t.s, t.z);
      o.rotation.set(0, t.r, 0);
      o.scale.set(t.s, t.s, t.s);
      o.updateMatrix();
      trunk.current!.setMatrixAt(i, o.matrix);
      leaves.forEach((ref, n) => {
        o.position.set(t.x, (3.5 + n * 2.6) * t.s, t.z);
        o.scale.set(t.s * (1 - n * 0.25), t.s, t.s * (1 - n * 0.25));
        o.updateMatrix();
        ref.current!.setMatrixAt(i, o.matrix);
      });
    });
    trunk.current!.instanceMatrix.needsUpdate = true;
    leaves.forEach((r) => (r.current!.instanceMatrix.needsUpdate = true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, data.length]}>
        <cylinderGeometry args={[0.18, 0.32, 5, 6]} />
        <meshLambertMaterial map={bark} />
      </instancedMesh>
      {leaves.map((ref, n) => (
        <instancedMesh key={n} ref={ref} args={[undefined, undefined, data.length]}>
          <coneGeometry args={[2.2, 4.2, 7]} />
          <meshLambertMaterial map={leaf} />
        </instancedMesh>
      ))}
    </>
  );
}

function Ground() {
  const grass = useMemo(grassTex, []);
  const dirt = useMemo(dirtTex, []);
  const path = useMemo(pathGeometry, []);
  const len = 60 - PATH_END + 40;
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 60 - len / 2]}>
        <planeGeometry args={[400, len]} />
        <meshLambertMaterial map={grass} />
      </mesh>
      <mesh geometry={path}>
        <meshLambertMaterial map={dirt} />
      </mesh>
    </>
  );
}

function OilFlasks() {
  const data = useMemo(flaskData, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    data.forEach((f, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.visible = !S.collected.has(i);
      g.rotation.y = clock.elapsedTime;
      g.position.y = 0.35 + Math.sin(clock.elapsedTime * 2 + i) * 0.05;
      if (g.visible && S.phase === "playing" && Math.hypot(f.x - S.x, f.z - S.z) < 1.4) {
        S.collected.add(i);
        S.oil = Math.min(100, S.oil + OIL_PICKUP);
        S.audio?.pickup();
      }
    });
  });
  return (
    <>
      {data.map((f, i) => (
        <group key={i} position={[f.x, 0.35, f.z]} ref={(g) => void (refs.current[i] = g)}>
          <mesh>
            <cylinderGeometry args={[0.13, 0.15, 0.4, 6]} />
            <meshLambertMaterial color="#8a5a1c" emissive="#3a2006" />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.15, 6]} />
            <meshLambertMaterial color="#3b2a1a" />
          </mesh>
          <pointLight color="#ffaa44" intensity={0.6} distance={3} />
        </group>
      ))}
    </>
  );
}

function Cabin() {
  const cx = pathX(CABIN_Z);
  const wood = useMemo(barkTex, []);
  const door = useRef<THREE.Group>(null);
  const inner = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (door.current) door.current.rotation.y = -S.doorOpen * 1.9;
    if (inner.current) inner.current.intensity = 0.6 + S.doorOpen * 3;
  });
  const T = 0.15;
  const wall = (pos: [number, number, number], size: [number, number, number], k: string) => (
    <mesh key={k} position={pos}>
      <boxGeometry args={size} />
      <meshLambertMaterial map={wood} side={THREE.DoubleSide} />
    </mesh>
  );
  return (
    <group position={[cx, 0, CABIN_Z]}>
      {wall([0, 1.4, -2 + T / 2], [5, 2.8, T], "back")}
      {wall([-2.5 + T / 2, 1.4, 0], [T, 2.8, 4], "left")}
      {wall([2.5 - T / 2, 1.4, 0], [T, 2.8, 4], "right")}
      {wall([-1.875, 1.4, 2 - T / 2], [1.25, 2.8, T], "fl")}
      {wall([1.075, 1.4, 2 - T / 2], [2.85, 2.8, T], "fr")}
      {wall([-0.8, 2.3, 2 - T / 2], [0.9, 1, T], "ft")}
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[4.8, 3.8]} />
        <meshLambertMaterial color="#2a1c12" />
      </mesh>
      <mesh position={[0, 2.8, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[5, 4]} />
        <meshLambertMaterial color="#140d08" />
      </mesh>
      <mesh position={[0, 3.4, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[4.2, 1.8, 4]} />
        <meshLambertMaterial color="#1a120c" />
      </mesh>
      {/* window */}
      <mesh position={[1.2, 1.5, 2.01]}>
        <planeGeometry args={[0.8, 0.7]} />
        <meshBasicMaterial color="#ffb347" />
      </mesh>
      {/* hinged door */}
      <group ref={door} position={[-1.25, 0, 2.01]}>
        <mesh position={[0.45, 0.9, 0]}>
          <boxGeometry args={[0.9, 1.8, 0.06]} />
          <meshLambertMaterial color="#1a100a" />
        </mesh>
      </group>
      {/* interior: table + candle */}
      <mesh position={[1, 0.45, -1]}>
        <boxGeometry args={[1.2, 0.9, 0.8]} />
        <meshLambertMaterial map={wood} />
      </mesh>
      <mesh position={[1, 1.0, -1]}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 6]} />
        <meshBasicMaterial color="#ffd38a" />
      </mesh>
      <pointLight ref={inner} position={[1, 1.4, -1]} color="#ffa040" intensity={0.6} distance={7} />
      <pointLight position={[1.2, 1.5, 3]} color="#ffa040" intensity={4} distance={14} />
    </group>
  );
}

/* Moon + stars: always centred on the camera, so they stay fixed in the sky. */
function Sky() {
  const geo = useMemo(() => {
    const p: number[] = [];
    const r = rng(1234);
    for (let i = 0; i < 400; i++) {
      const a = r() * Math.PI * 2,
        e = 0.2 + r() * 1.2;
      p.push(Math.cos(a) * Math.cos(e) * 300, Math.sin(e) * 300, Math.sin(a) * Math.cos(e) * 300);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => ref.current?.position.copy(camera.position), 1);
  return (
    <group ref={ref}>
      <points geometry={geo}>
        <pointsMaterial color="#c8d4ff" size={1.5} sizeAttenuation={false} fog={false} />
      </points>
      <mesh position={[30, 85, -160]}>
        <sphereGeometry args={[5, 10, 10]} />
        <meshBasicMaterial color="#e8f0ff" fog={false} />
      </mesh>
      <mesh position={[30, 85, -162]}>
        <sphereGeometry args={[9, 10, 10]} />
        <meshBasicMaterial color="#9fb4d8" transparent opacity={0.15} fog={false} />
      </mesh>
    </group>
  );
}

/* ---------------- scripted scares ---------------- */
function ShadowFigure({ innerRef }: { innerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group ref={innerRef} visible={false}>
      <mesh position={[0, 1.05, 0]}>
        <capsuleGeometry args={[0.32, 1.3, 4, 8]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.93} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <sphereGeometry args={[0.24, 8, 8]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.93} />
      </mesh>
      <mesh position={[0.08, 2.08, 0.2]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshBasicMaterial color="#ff2a1a" fog={false} />
      </mesh>
      <mesh position={[-0.08, 2.08, 0.2]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshBasicMaterial color="#ff2a1a" fog={false} />
      </mesh>
    </group>
  );
}

function Scares() {
  const shadow = useRef<THREE.Group>(null);
  const runner = useRef<THREE.Group>(null);
  const bat = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Mesh>(null);
  const wingR = useRef<THREE.Mesh>(null);
  const squirrel = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const basis = (e: Fired) => ({
      fx: -Math.sin(e.yaw),
      fz: -Math.cos(e.yaw),
      rx: Math.cos(e.yaw),
      rz: -Math.sin(e.yaw),
    });

    // 75 m – shadow crosses in front
    const sh = S.events.get("shadow");
    if (shadow.current) {
      const dt = sh ? now - sh.t0 : -1;
      shadow.current.visible = !!sh && dt >= 0 && dt < 1.6;
      if (sh && shadow.current.visible) {
        const b = basis(sh);
        const side = -5 + (dt / 1.6) * 10;
        shadow.current.position.set(sh.x + b.fx * 6 + b.rx * side, Math.sin(dt * 9) * 0.04, sh.z + b.fz * 6 + b.rz * side);
        shadow.current.rotation.set(0, sh.yaw - Math.PI / 2, 0.15);
      }
    }

    // 91 m – bat flies past the head
    const bt = S.events.get("bat");
    if (bat.current) {
      const dt = bt ? now - bt.t0 : -1;
      bat.current.visible = !!bt && dt >= 0 && dt < 1.4;
      if (bt && bat.current.visible) {
        const b = basis(bt);
        const k = dt / 1.4;
        const fwd = 9 - k * 14; // from 9 m ahead to 5 m behind
        const side = -2.5 + k * 3.4;
        const y = 3.2 - Math.sin(k * Math.PI) * 1.3 + Math.sin(dt * 25) * 0.08;
        bat.current.position.set(bt.x + b.fx * fwd + b.rx * side, y, bt.z + b.fz * fwd + b.rz * side);
        bat.current.rotation.set(0, bt.yaw, 0);
        const flap = Math.sin(dt * 45) * 0.9;
        if (wingL.current) wingL.current.rotation.z = flap;
        if (wingR.current) wingR.current.rotation.z = -flap;
      }
    }

    // 110 m – shadow rushes past beside the player and vanishes ahead
    const rn = S.events.get("runner");
    if (runner.current) {
      const dt = rn ? now - rn.t0 : -1;
      runner.current.visible = !!rn && dt >= 0 && dt < 4.5;
      if (rn && runner.current.visible) {
        const b = basis(rn);
        const fwd = -2 + dt * 11;
        runner.current.position.set(rn.x + b.fx * fwd + b.rx * 1.6, Math.abs(Math.sin(dt * 14)) * 0.12, rn.z + b.fz * fwd + b.rz * 1.6);
        runner.current.rotation.set(-0.25, rn.yaw + Math.PI, 0);
      }
    }

    // 200 m – squirrel darts across
    const sq = S.events.get("squirrel");
    if (squirrel.current) {
      const dt = sq ? now - sq.t0 : -1;
      squirrel.current.visible = !!sq && dt >= 0 && dt < 1.1;
      if (sq && squirrel.current.visible) {
        const b = basis(sq);
        const side = 3.5 - (dt / 1.1) * 7;
        squirrel.current.position.set(sq.x + b.fx * 3.5 + b.rx * side, Math.abs(Math.sin(dt * 18)) * 0.15, sq.z + b.fz * 3.5 + b.rz * side);
        squirrel.current.rotation.set(0, sq.yaw + Math.PI / 2, 0);
      }
    }
  });

  return (
    <>
      <ShadowFigure innerRef={shadow} />
      <ShadowFigure innerRef={runner} />
      <group ref={bat} visible={false}>
        <mesh>
          <sphereGeometry args={[0.09, 6, 6]} />
          <meshLambertMaterial color="#120c0a" />
        </mesh>
        <mesh ref={wingL} position={[0, 0, 0]}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <mesh position={[-0.2, 0, 0]}>
            <boxGeometry args={[0.38, 0.02, 0.18]} />
            <meshLambertMaterial color="#0d0807" />
          </mesh>
        </mesh>
        <mesh ref={wingR} position={[0, 0, 0]}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <mesh position={[0.2, 0, 0]}>
            <boxGeometry args={[0.38, 0.02, 0.18]} />
            <meshLambertMaterial color="#0d0807" />
          </mesh>
        </mesh>
      </group>
      <group ref={squirrel} visible={false}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.14, 0.12, 0.28]} />
          <meshLambertMaterial color="#7a4a24" />
        </mesh>
        <mesh position={[0, 0.2, 0.17]}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshLambertMaterial color="#7a4a24" />
        </mesh>
        <mesh position={[0, 0.3, -0.2]} rotation-x={-0.5}>
          <boxGeometry args={[0.1, 0.32, 0.1]} />
          <meshLambertMaterial color="#9a6232" />
        </mesh>
      </group>
    </>
  );
}

function fireEvent(name: EventName, now: number) {
  S.events.set(name, { t0: now, x: S.x, z: S.z, yaw: S.yaw });
  const a = S.audio;
  switch (name) {
    case "shadow":
      a?.whisper(0.7);
      break;
    case "bat":
      a?.bat();
      break;
    case "runner":
      a?.rush(0.8);
      break;
    case "lantern":
      S.lanternOffUntil = now + 2;
      a?.sputter();
      window.setTimeout(() => S.audio?.sputter(), 2000);
      break;
    case "scream":
      a?.panicScream();
      break;
    case "squirrel":
      a?.rustle();
      break;
    case "hey":
      a?.hey();
      break;
  }
}

/* ---------------- player / camera ---------------- */
function Player({ onEnd }: { onEnd: () => void }) {
  const { camera } = useThree();
  const lamp = useRef<THREE.PointLight>(null);
  const stepIdx = useRef(0);

  const footsteps = (dt: number) => {
    S.bob += dt * 7;
    const k = Math.floor(S.bob / Math.PI);
    if (k !== stepIdx.current) {
      stepIdx.current = k;
      S.audio?.step();
      if (Math.random() < 0.3) S.audio?.creak();
    }
  };

  useFrame(({ clock }, raw) => {
    const dt = Math.min(raw, 0.05);
    const now = clock.elapsedTime;
    const k = S.keys;
    if (S.phase === "playing") {
      if (k.has("KeyA") || k.has("ArrowLeft")) S.yaw += TURN * dt;
      if (k.has("KeyD") || k.has("ArrowRight")) S.yaw -= TURN * dt;
      let move = 0;
      if (k.has("KeyW") || k.has("ArrowUp")) move += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) move -= 0.6;
      S.moving = move !== 0;
      S.x -= Math.sin(S.yaw) * move * WALK * dt;
      S.z -= Math.cos(S.yaw) * move * WALK * dt;
      const nearCave = S.z > 10;
      const cx = pathX(nearCave ? 8 : S.z);
      const half = nearCave ? CAVE_HALF - 0.2 : 3.6;
      S.x = THREE.MathUtils.clamp(S.x, cx - half, cx + half);
      S.z = Math.min(S.z, 20);
      const depth = caveDepth(S.x, S.z, pathX(8));
      S.inCave = depth > 0;
      if (S.moving) footsteps(dt);

      const walked = START_Z - S.z;
      for (const ev of EVENTS) if (walked >= ev.at && !S.events.has(ev.name)) fireEvent(ev.name, now);

      S.oil = Math.max(0, S.oil - OIL_DRAIN * dt);
      if (isGameOver(S.oil, depth)) onEnd();
      else if (S.z < CABIN_Z + 5) {
        S.phase = "entering";
        S.enterT = 0;
        S.enterFrom = { x: S.x, z: S.z, yaw: S.yaw, pitch: S.pitch };
        S.keys.clear();
      }
    } else if (S.phase === "entering" && S.enterFrom) {
      S.enterT += dt;
      const T = S.enterT;
      const F = S.enterFrom;
      const doorX = pathX(CABIN_Z) - 0.8;
      const a = smooth(T / 1.3);
      const yawTarget = Math.round(F.yaw / (Math.PI * 2)) * Math.PI * 2;
      S.x = THREE.MathUtils.lerp(F.x, doorX, a);
      S.z = THREE.MathUtils.lerp(F.z, CABIN_Z + 3.2, a);
      S.yaw = THREE.MathUtils.lerp(F.yaw, yawTarget, a);
      S.pitch = THREE.MathUtils.lerp(F.pitch, 0, a);
      if (T > 1.3 && !S.doorCreaked) {
        S.doorCreaked = true;
        S.audio?.creak();
        window.setTimeout(() => S.audio?.creak(), 250);
      }
      S.doorOpen = smooth((T - 1.3) / 1);
      if (T > 2.3) S.z = THREE.MathUtils.lerp(CABIN_Z + 3.2, CABIN_Z - 0.6, smooth((T - 2.3) / 1.8));
      S.moving = T < 1.3 || (T > 2.3 && T < 4.1);
      if (S.moving) footsteps(dt);
      S.fade = clamp01((T - 3.5) / 1.2);
      if (T > 5) S.phase = "won";
    } else S.moving = false;

    const bobY = S.moving ? Math.abs(Math.sin(S.bob)) * 0.07 : 0;
    camera.position.set(S.x, 1.6 + bobY, S.z);
    camera.rotation.set(S.pitch, S.yaw, Math.sin(S.bob) * 0.008, "YXZ");

    const flick =
      0.85 + Math.sin(now * 13) * 0.05 + Math.sin(now * 23.7) * 0.04 + (Math.random() - 0.5) * 0.08;
    const lanternOff = now < S.lanternOffUntil;
    const fuel = S.phase === "dead" || S.inCave || lanternOff ? 0 : Math.min(1, S.oil / 40);
    S.flicker = flick * fuel;
    if (lamp.current) {
      const off = new THREE.Vector3(-0.5, -0.5, -0.6).applyEuler(camera.rotation);
      lamp.current.position.copy(camera.position).add(off);
      lamp.current.intensity = 9 * flick * fuel;
      lamp.current.distance = 4 + 10 * fuel;
    }
  });

  return <pointLight ref={lamp} color="#ff9a3c" decay={1.4} />;
}

/* ---------------- HUD ---------------- */
function Hud({ phase, onStart }: { phase: Phase; onStart: () => void }) {
  const arm = useRef<HTMLImageElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const [oil, setOil] = useState(100);
  const [dist, setDist] = useState(TOTAL_METERS);
  const [inCave, setInCave] = useState(false);

  useEffect(() => {
    let raf = 0,
      last = 0;
    const tick = (t: number) => {
      setInCave((c) => (c === S.inCave ? c : S.inCave));
      const sx = Math.sin(S.bob) * 10,
        sy = Math.abs(Math.cos(S.bob)) * 12,
        rot = Math.sin(t / 700) * 1.5;
      if (arm.current) arm.current.style.transform = `translate(${sx}px, ${sy}px) rotate(${rot + sx * 0.15}deg)`;
      if (glow.current) glow.current.style.opacity = String(0.25 + S.flicker * 0.55);
      if (fade.current) fade.current.style.opacity = String(S.fade);
      if (t - last > 150) {
        last = t;
        setOil(S.oil);
        setDist(Math.max(0, Math.round(S.z - CABIN_Z)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (phase === "dead")
    return (
      <div className="fixed inset-0 z-20 flex select-none items-center justify-center bg-darkness font-pixel text-ending-text" role="status">
        <h1 className="text-7xl md:text-8xl">FIM</h1>
      </div>
    );
  if (phase === "playing" && inCave) return <div className="pointer-events-none fixed inset-0 z-10 bg-darkness" />;

  const active = phase === "playing" || phase === "entering";
  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none font-pixel">
      <div className="vignette absolute inset-0" />
      <div ref={glow} className="lantern-glow absolute inset-0" />
      {active && (
        <img
          ref={arm}
          src={lanternArm}
          alt=""
          width={768}
          height={1024}
          className="pixelated absolute -bottom-8 -left-6 h-[78vh] w-auto origin-top-left"
        />
      )}
      {phase === "playing" && (
        <div className="absolute right-6 top-6 w-56 space-y-2 text-right text-hud">
          <div className="text-xl tracking-widest">ÓLEO</div>
          <div className="h-3 w-full border-2 border-hud/60 bg-background/60">
            <div className="h-full bg-hud transition-[width]" style={{ width: `${oil}%` }} />
          </div>
          <div className="text-lg text-muted-foreground">{dist} m até a cabana</div>
        </div>
      )}
      {phase === "entering" && <div ref={fade} className="absolute inset-0 bg-darkness opacity-0" />}
      {!active && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background/70 px-6 text-center">
          <h1 className="text-6xl tracking-[0.2em] text-hud md:text-8xl">
            {phase === "menu" ? "O TRILHO" : "CHEGASTE À CABANA"}
          </h1>
          <p className="max-w-md text-2xl text-muted-foreground">
            {phase === "menu"
              ? "Segue o caminho de terra. Recolhe frascos de óleo antes que o candeeiro se apague."
              : "Por esta noite, estás a salvo."}
          </p>
          <button onClick={onStart} className="btn-pixel h-auto cursor-pointer whitespace-normal rounded-none">
            {phase === "menu" ? "ACENDER O CANDEEIRO" : "TENTAR DE NOVO"}
          </button>
          <p className="text-lg text-muted-foreground">
            W/S ou ↑/↓ andar · A/D ou ←/→ girar · rato para olhar à volta (360°)
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------- root ---------------- */
export function Game() {
  const [phase, setPhase] = useState<Phase>("menu");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => S.keys.add(e.code);
    const up = (e: KeyboardEvent) => S.keys.delete(e.code);
    const look = (e: MouseEvent) => {
      if (!document.pointerLockElement || S.phase !== "playing") return;
      S.yaw -= e.movementX * 0.0025;
      S.pitch = THREE.MathUtils.clamp(S.pitch - e.movementY * 0.0025, -PITCH_LIMIT, PITCH_LIMIT);
    };
    const poll = window.setInterval(() => {
      setPhase((p) => (p === S.phase ? p : S.phase));
      if (S.phase !== "playing" && document.pointerLockElement) document.exitPointerLock();
    }, 100);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", look);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", look);
      clearInterval(poll);
      S.audio?.close();
      S.audio = null;
    };
  }, []);

  return (
    <div
      ref={root}
      className="fixed inset-0 bg-background"
      onClick={() => S.phase === "playing" && !document.pointerLockElement && root.current?.requestPointerLock?.()}
    >
      <Canvas className="pixelated" dpr={0.33} gl={{ antialias: false }} camera={{ fov: 70, near: 0.1, far: 400 }}>
        <color attach="background" args={["#05070d"]} />
        <fogExp2 attach="fog" args={["#0d1320", 0.055]} />
        <hemisphereLight args={["#3a4c70", "#0a0c08", 0.55]} />
        <directionalLight position={[30, 85, -160]} color="#9fb4e0" intensity={0.35} />
        <Ground />
        <Trees />
        <OilFlasks />
        <Cabin />
        <Cave />
        <Scares />
        <Player
          onEnd={() => {
            if (S.phase !== "playing") return;
            S.oil = 0;
            S.flicker = 0;
            S.moving = false;
            S.keys.clear();
            S.phase = "dead";
            setPhase("dead");
            S.audio?.despair();
          }}
        />
        <Sky />
      </Canvas>
      <Hud
        phase={phase}
        onStart={() => {
          resetState();
          S.audio?.close();
          S.audio = new GameAudio();
          S.phase = "playing";
          setPhase("playing");
          root.current?.requestPointerLock?.();
        }}
      />
    </div>
  );
}
