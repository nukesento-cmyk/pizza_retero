"use client";

import { MeshReflectorMaterial, RoundedBox } from "@react-three/drei";
import { checkerFloor, poster, terrazzo, wallTiles } from "./textures";

const W = 16; // room width (x), depth (z) ~ 16

/** Floor, walls, ceiling, wainscot stripe, counters, shelves and the story wall. */
export function Room({ quality }: { quality: "high" | "low" }) {
  return (
    <group>
      {/* wet-shiny checkerboard floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W + 4, W + 10]} />
        {quality === "high" ? (
          <MeshReflectorMaterial
            map={checkerFloor()}
            resolution={512}
            mirror={0.35}
            mixStrength={1.4}
            blur={[400, 120]}
            mixBlur={1}
            roughness={0.75}
            depthScale={0.6}
            minDepthThreshold={0.5}
            maxDepthThreshold={1.3}
            metalness={0.05}
          />
        ) : (
          <meshStandardMaterial map={checkerFloor()} roughness={0.4} />
        )}
      </mesh>

      {/* back + side walls: tile wainscot, racing stripe, warm plaster */}
      {[
        { pos: [0, 0, -8] as const, rot: 0, len: W },
        { pos: [-8, 0, 0] as const, rot: Math.PI / 2, len: W },
        { pos: [8, 0, 0] as const, rot: -Math.PI / 2, len: W },
      ].map((w, i) => (
        <group key={i} position={w.pos} rotation-y={w.rot}>
          <mesh position={[0, 0.7, 0]} receiveShadow>
            <planeGeometry args={[w.len, 1.4]} />
            <meshStandardMaterial map={wallTiles()} roughness={0.25} />
          </mesh>
          {(["#c8402b", "#f06a2e", "#e7a33e"] as const).map((c, k) => (
            <mesh key={c} position={[0, 1.44 + k * 0.07, 0.005]}>
              <planeGeometry args={[w.len, 0.07]} />
              <meshStandardMaterial color={c} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 3.3, 0]}>
            <planeGeometry args={[w.len, 3.8]} />
            <meshStandardMaterial color="#d8b98a" roughness={0.95} />
          </mesh>
        </group>
      ))}

      {/* ceiling */}
      <mesh position={[0, 5.2, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[W, W + 6]} />
        <meshStandardMaterial color="#2a1a13" roughness={1} />
      </mesh>

      {/* entrance archway */}
      <group position={[0, 0, 8]}>
        {[-2.2, 2.2].map((x) => (
          <mesh key={x} position={[x, 1.6, 0]} castShadow>
            <boxGeometry args={[0.35, 3.2, 0.35]} />
            <meshStandardMaterial color="#2a1a13" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 3.35, 0]}>
          <boxGeometry args={[4.75, 0.3, 0.35]} />
          <meshStandardMaterial color="#2a1a13" roughness={0.6} />
        </mesh>
        {/* front wall either side of the door */}
        {[-5.2, 5.2].map((x) => (
          <mesh key={x} position={[x, 2.6, 0]}>
            <boxGeometry args={[5.6, 5.2, 0.2]} />
            <meshStandardMaterial color="#c8402b" roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 4.35, 0]}>
          <boxGeometry args={[4.8, 1.7, 0.2]} />
          <meshStandardMaterial color="#c8402b" roughness={0.7} />
        </mesh>
      </group>

      <Counter position={[-5.3, 0, 0.3]} length={7} cabinet="#c8402b" />
      <Counter position={[5.3, 0, 0.6]} length={6} cabinet="#2e6b52" />
      {/* island */}
      <Counter position={[0, 0, 0]} length={2.6} depth={1.5} cabinet="#e7a33e" rotate />

      {/* shelves with jars over the side counters */}
      <Shelf position={[-7.75, 2.35, 0.4]} rotation={Math.PI / 2} />
      <Shelf position={[7.75, 2.35, 0.8]} rotation={-Math.PI / 2} />

      {/* story wall */}
      <group position={[-4.4, 2.35, -7.95]}>
        {(["since", "sunburst", "slice"] as const).map((k, i) => (
          <group key={k} position={[(i - 1) * 1.25, i === 1 ? 0.2 : 0, 0]}>
            <mesh position={[0, 0, 0.01]}>
              <boxGeometry args={[1.05, 1.32, 0.05]} />
              <meshStandardMaterial color="#2a1a13" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0, 0.04]}>
              <planeGeometry args={[0.92, 1.18]} />
              <meshStandardMaterial map={poster(k)} roughness={0.85} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Counter({
  position, length, depth = 1.2, cabinet, rotate = false,
}: { position: [number, number, number]; length: number; depth?: number; cabinet: string; rotate?: boolean }) {
  const [w, d] = rotate ? [length, depth] : [depth, length];
  return (
    <group position={position}>
      <RoundedBox args={[w, 0.88, d]} radius={0.06} position={[0, 0.44, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={cabinet} roughness={0.35} clearcoat={0.8} clearcoatRoughness={0.25} />
      </RoundedBox>
      {/* chrome kick strip */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[w + 0.02, 0.08, d + 0.02]} />
        <meshStandardMaterial color="#c9c3b8" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* terrazzo top */}
      <RoundedBox args={[w + 0.12, 0.07, d + 0.12]} radius={0.025} position={[0, 0.915, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={terrazzo()} roughness={0.3} />
      </RoundedBox>
    </group>
  );
}

const JAR_COLORS = ["#e7a33e", "#c8402b", "#2e6b52", "#f6ecd9", "#8f2a1c", "#d7a35a"];

function Shelf({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      {[0, 0.75].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh castShadow>
            <boxGeometry args={[5.2, 0.05, 0.35]} />
            <meshStandardMaterial color="#6b4423" roughness={0.7} />
          </mesh>
          {JAR_COLORS.map((c, i) => (
            <group key={c} position={[-2.2 + i * 0.85, 0.2, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.13, 0.13, 0.34, 20]} />
                <meshPhysicalMaterial color="#ffffff" transmission={0.6} roughness={0.15} thickness={0.2} transparent opacity={0.55} />
              </mesh>
              <mesh position={[0, -0.04, 0]}>
                <cylinderGeometry args={[0.115, 0.115, 0.22, 20]} />
                <meshStandardMaterial color={c} roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.19, 0]}>
                <cylinderGeometry args={[0.14, 0.14, 0.04, 20]} />
                <meshStandardMaterial color="#c9c3b8" metalness={0.8} roughness={0.3} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
