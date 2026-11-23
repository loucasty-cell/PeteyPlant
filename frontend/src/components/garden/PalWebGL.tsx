import { Component, useEffect, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { PalCharacter, type PalMood } from './PalCharacter';

class RenderGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function ClearCanvas() {
  useFrame(({ gl }) => gl.clear(), 0);
  return null;
}

export function PalRenderer() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(typeof WebGL2RenderingContext !== 'undefined');
  }, []);
  if (!available) return null;
  return <div className="pal-canvas" aria-hidden="true">
    <RenderGuard>
      <Canvas
        camera={{ position: [0, .93, 5.8], fov: 35 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, .44, 0);
          gl.setClearColor(0x000000, 0);
          gl.domElement.dataset.palRenderer = 'ready';
          gl.domElement.addEventListener('webglcontextlost', () => setAvailable(false), { once: true });
        }}
      >
        <ClearCanvas />
        <View.Port />
      </Canvas>
    </RenderGuard>
  </div>;
}

export function PalView({ variant, mood, play, reduced }: {
  variant: number; mood: PalMood; play: number; reduced: boolean;
}) {
  return <View as="span" className="pal-view" visible>
    <PalCharacter variant={variant} mood={mood} play={play} reduced={reduced} />
  </View>;
}
