import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, MathUtils, Vector3,
} from 'three';

export type PalMood = 'idle' | 'curious' | 'concerned' | 'relieved' | 'happy';
type LeafStyle = 'split' | 'heart' | 'sword' | 'ribbon' | 'aloe' | 'palm' | 'oval' | 'fiddle';
type LeafSpec = { angle: number; pitch: number; length: number; width: number; lift: number };
type PalStyle = { shape: LeafStyle; pot: string; band: string; foliage: [string, string, string]; leaves: LeafSpec[] };

function fans(count: number, size: number, width: number, pitch: number, lift: number): LeafSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    angle: index * Math.PI * 2 / count + .23,
    pitch: pitch + .15 * Math.sin(index * 2.2),
    length: size * (.82 + .26 * Math.sin(index * 1.8 + 1.6) ** 2),
    width: width * (.77 + .25 * Math.cos(index * 1.9) ** 2),
    lift: lift + .1 * Math.cos(index * 2.1),
  }));
}

const styles: PalStyle[] = [
  { shape: 'split', pot: '#d79968', band: '#b56243', foliage: ['#193928', '#397148', '#8faa59'], leaves: fans(6, 1.17, .53, .87, .36) },
  { shape: 'heart', pot: '#dcb75e', band: '#b9812e', foliage: ['#264528', '#718a3b', '#c1c969'], leaves: fans(9, .90, .30, 1.02, .23) },
  { shape: 'sword', pot: '#9aa695', band: '#4b675d', foliage: ['#284834', '#5b854c', '#d6ca6b'], leaves: fans(8, 1.31, .15, .22, .12) },
  { shape: 'ribbon', pot: '#e2c39c', band: '#89a066', foliage: ['#456d43', '#589055', '#d4dd89'], leaves: fans(11, 1.23, .072, .91, .27) },
  { shape: 'aloe', pot: '#b36547', band: '#dfaa73', foliage: ['#30634c', '#57986d', '#afbb7e'], leaves: fans(9, 1.14, .16, .55, .11) },
  { shape: 'palm', pot: '#d5a467', band: '#92704c', foliage: ['#294e34', '#658a47', '#a9b962'], leaves: fans(8, 1.13, .31, 1.04, .47) },
  { shape: 'oval', pot: '#9a6471', band: '#bd8490', foliage: ['#234836', '#5b805b', '#c9ce8a'], leaves: fans(8, 1.03, .33, .87, .25) },
  { shape: 'fiddle', pot: '#b38a62', band: '#715542', foliage: ['#253d30', '#477651', '#9ba658'], leaves: fans(6, 1.10, .32, .64, .28) },
];

function halfWidth(shape: LeafStyle, t: number) {
  const arc = Math.sin(t * Math.PI);
  if (shape === 'split') return arc ** .65 * (.63 + .37 * Math.abs(Math.sin(t * Math.PI * 6)));
  if (shape === 'heart') return arc ** .64 * (1.34 - t * .80);
  if (shape === 'sword') return arc ** .52 * (.72 + .25 * t);
  if (shape === 'ribbon') return arc ** .55;
  if (shape === 'aloe') return arc ** .49 * (1.41 - t);
  if (shape === 'palm') return arc ** .70 * (.09 + .91 * Math.abs(Math.sin(t * Math.PI * 13)) ** .73);
  if (shape === 'fiddle') return arc ** .52 * (.83 + .17 * Math.cos(t * Math.PI * 4));
  return arc ** .61;
}

function blade(shape: LeafStyle, colors: PalStyle['foliage']) {
  const geometry = new BufferGeometry();
  const coords: number[] = [];
  const shades: number[] = [];
  const indices: number[] = [];
  const deep = new Color(colors[0]), green = new Color(colors[1]), accent = new Color(colors[2]);
  const rows = shape === 'palm' ? 48 : 32;
  const columns = 8;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let column = 0; column <= columns; column++) {
      const side = column / columns * 2 - 1;
      const edge = halfWidth(shape, t);
      const center = 1 - Math.abs(side);
      const arch = shape === 'ribbon' || shape === 'palm' ? .66 : .23;
      coords.push(edge * side, t, Math.sin(t * Math.PI * 1.5) * arch + center * edge * .13);
      const wave = .5 + .5 * Math.sin(t * 31 + center * 5);
      let detail = center ** 11 * .66 + wave ** 11 * .14;
      if (shape === 'sword') detail += (1 - center) ** 7 * .76 + wave ** 4 * .18;
      if (shape === 'ribbon') detail += (1 - center) ** 3 * .82;
      if (shape === 'heart') detail += (.5 + .5 * Math.sin(t * 21 - side * 4)) ** 8 * .34;
      if (shape === 'oval') detail += center * (1 - wave * .7) * .65;
      const color = deep.clone().lerp(green, .37 + .46 * center).lerp(accent, Math.min(1, detail));
      shades.push(color.r, color.g, color.b);
      if (row < rows && column < columns) {
        const i = row * (columns + 1) + column;
        const splitWindow = shape === 'split' && [9, 15, 21].includes(row) && [1, 6].includes(column);
        if (splitWindow) continue;
        indices.push(i, i + 1, i + columns + 1, i + 1, i + columns + 2, i + columns + 1);
      }
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(coords, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(shades, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const mouthCurves = {
  idle: [-.02, -.058, -.012],
  curious: [-.03, -.065, -.038],
  concerned: [-.061, -.016, -.061],
  relieved: [-.012, -.082, -.014],
  happy: [.015, -.105, .015],
};

export function PalCharacter({ variant, mood, play, reduced }: {
  variant: number; mood: PalMood; play: number; reduced: boolean;
}) {
  const style = styles[variant] ?? styles[0];
  const leaf = useMemo(() => blade(style.shape, style.foliage), [style]);
  const mouth = useMemo(() => new CatmullRomCurve3(
    mouthCurves[mood].map((height, index) => new Vector3((index - 1) * .115, height, 0)),
  ), [mood]);
  const body = useRef<Group>(null);
  const crown = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const initialPlay = useRef(play);
  const start = useRef(-10);
  useFrame(({ clock }, delta) => {
    if (!body.current || !crown.current || !eyes.current || !arm.current) return;
    const time = clock.elapsedTime;
    if (play !== initialPlay.current) {
      initialPlay.current = play;
      start.current = time;
    }
    const t = time + variant * .66;
    const elapsed = time - start.current;
    const dancing = !reduced && elapsed < 2.55;
    const energy = mood === 'concerned' ? .37 : mood === 'happy' ? 1.35 : 1;
    const rhythm = dancing ? Math.sin(elapsed * 12) : 0;
    body.current.position.y = reduced ? 0 : Math.sin(t * 1.8) * .019 * energy + Math.abs(rhythm) * .18;
    const lean = mood === 'curious' ? -.12 : mood === 'concerned' ? .10 : 0;
    body.current.rotation.z = MathUtils.damp(body.current.rotation.z,
      lean + (reduced ? 0 : Math.sin(t * 1.45) * .04 * energy + rhythm * .24), 7, delta);
    body.current.rotation.y = reduced ? -.08 : Math.sin(t * 1.06) * .12 + rhythm * .20;
    crown.current.rotation.x = MathUtils.damp(crown.current.rotation.x,
      (mood === 'concerned' ? .22 : -.04) + (reduced ? 0 : Math.sin(t * 2.3) * .065 + rhythm * .10), 6, delta);
    const blink = t % 4.7;
    eyes.current.scale.y = (!reduced && blink > 4.49) ? .12 : mood === 'relieved' ? .34 : mood === 'concerned' ? .81 : 1;
    arm.current.rotation.z = dancing ? -.45 + rhythm * .60 : -.03 + (reduced ? 0 : .09 * Math.sin(t * 1.55));
  });

  return <>
    <ambientLight intensity={1.5} color="#f9e9d6" />
    <directionalLight position={[-2, 5, 6]} intensity={2.3} color="#fff0cd" />
    <directionalLight position={[3, 2, -3]} intensity={1.3} color="#c3e8bd" />
    <mesh position={[0, -.88, -.16]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.05, .51, 1]}>
      <circleGeometry args={[1, 48]} />
      <meshBasicMaterial color="#513b22" transparent opacity={.17} depthWrite={false} />
    </mesh>
    <group ref={body}>
      <mesh position={[0, -.43, 0]}>
        <cylinderGeometry args={[.64, .47, .78, 52, 1]} />
        <meshStandardMaterial color={style.pot} roughness={.72} />
      </mesh>
      <mesh position={[0, -.66, 0]}>
        <cylinderGeometry args={[.535, .48, .26, 52]} />
        <meshStandardMaterial color={style.band} roughness={.68} />
      </mesh>
      <mesh position={[0, -.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[.585, .077, 12, 52]} />
        <meshStandardMaterial color={style.pot} roughness={.54} />
      </mesh>
      <mesh position={[0, -.025, 0]}>
        <cylinderGeometry args={[.54, .54, .05, 44]} />
        <meshStandardMaterial color="#4b3629" roughness={1} />
      </mesh>
      <group ref={crown} position={[0, .015, 0]}>
        {style.leaves.map(({ angle, pitch, length, width, lift }) => (
          <group key={angle} rotation={[0, angle, 0]}>
            <group position={[0, 0, .10]} rotation={[pitch, 0, 0]}>
              <mesh position={[0, lift * .45, 0]}>
                <cylinderGeometry args={[.022, .032, lift, 7]} />
                <meshStandardMaterial color={style.foliage[1]} roughness={.83} />
              </mesh>
              <mesh geometry={leaf} position={[0, lift * .77, 0]} scale={[width, length, length]}>
                <meshStandardMaterial vertexColors side={2} roughness={.53} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      <group ref={eyes} position={[0, -.295, .562]}>
        {[-1, 1].map(s => <group key={s} position={[s * .187, 0, 0]}>
          <mesh scale={[.076, .091, .035]}>
            <sphereGeometry args={[1, 20, 14]} /><meshStandardMaterial color="#252722" roughness={.35} />
          </mesh>
          <mesh position={[-.019, .032, .027]} scale={[.019, .023, .011]}>
            <sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial color="#fff9e9" />
          </mesh>
        </group>)}
      </group>
      {[-1, 1].map(s => <group key={s}>
        <mesh position={[s * .32, -.42, .488]} rotation={[0, s * .52, 0]} scale={[.091, .034, .023]}>
          <sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color="#d98665" roughness={.75} />
        </mesh>
        {mood === 'concerned' && <mesh position={[s * .188, -.17, .556]} rotation={[0, 0, s * -.38]} scale={[.081, .017, .016]}>
          <sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#4b3329" />
        </mesh>}
      </group>)}
      <mesh position={[0, -.411, .563]}>
        <tubeGeometry key={mood} args={[mouth, 18, .017, 8, false]} /><meshStandardMaterial color="#3b2a25" />
      </mesh>
      <group position={[.53, -.51, .15]} ref={arm}>
        <mesh position={[.09, -.036, .025]} rotation={[0, .22, .55]} scale={[.19, .095, .105]}>
          <sphereGeometry args={[1, 20, 14]} /><meshStandardMaterial color={style.band} roughness={.67} />
        </mesh>
      </group>
      <mesh position={[-.62, -.55, .17]} rotation={[0, -.22, -.55]} scale={[.158, .091, .10]}>
        <sphereGeometry args={[1, 20, 14]} /><meshStandardMaterial color={style.band} roughness={.67} />
      </mesh>
    </group>
  </>;
}
