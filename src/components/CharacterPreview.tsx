import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { createAvatarRig, type AvatarRig } from '../game/avatar';
import type { AvatarConfig } from '../game/types';

const ANGLES = [
  { id: 'front', label: 'Front', value: 0 },
  { id: 'three-quarter', label: '3/4', value: Math.PI * 0.22 },
  { id: 'side', label: 'Side', value: Math.PI / 2 },
  { id: 'back', label: 'Back', value: Math.PI },
];

/**
 * Live 3D character preview used by the studio and the clothing shop. It uses
 * the exact same rig as the world avatar, so height, build, face shape, hair,
 * makeup and every clothing anchor preview exactly what will be saved.
 */
export const CharacterPreview: React.FC<{
  config: AvatarConfig;
  className?: string;
  theme?: 'dark' | 'light';
  compact?: boolean;
}> = ({ config, className = '', theme = 'dark', compact = false }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<AvatarRig | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const angleRef = useRef(ANGLES[0].value);
  const distanceRef = useRef(compact ? 3.25 : 3.45);
  const autoRef = useRef(true);
  const dragRef = useRef<{ x: number; angle: number } | null>(null);
  const [angle, setAngle] = useState(ANGLES[0].value);
  const [distance, setDistance] = useState(compact ? 3.25 : 3.45);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'h-full w-full touch-none';
    renderer.domElement.setAttribute('aria-label', 'Live character preview');
    host.appendChild(renderer.domElement);

    const rig = createAvatarRig(config);
    rig.root.position.y = 0.02;
    scene.add(rig.root);

    scene.add(new THREE.HemisphereLight(0xf5f2ea, 0x334038, 1.25));
    const key = new THREE.DirectionalLight(0xfff3e2, 2.1);
    key.position.set(1.8, 2.8, 2.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fd7ff, 0.75);
    fill.position.set(-2.2, 1.7, 1.1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x9dff8b, 0.85);
    rim.position.set(-0.6, 2.2, -2.4);
    scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.68, 0.035, 48),
      new THREE.MeshStandardMaterial({
        color: theme === 'light' ? 0xe7e5de : 0x121a15,
        roughness: 0.62,
        metalness: 0.05,
      })
    );
    pedestal.position.y = -0.018;
    scene.add(pedestal);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.63, 0.004, 8, 64),
      new THREE.MeshStandardMaterial({
        color: 0x39ff14,
        emissive: 0x39ff14,
        emissiveIntensity: 0.8,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.002;
    scene.add(ring);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (autoRef.current) angleRef.current += dt * 0.24;
      // The rig faces +Z, so a front view places the camera on +Z as well.
      rig.root.rotation.y = angleRef.current;
      const dist = distanceRef.current;
      camera.position.set(
        Math.sin(angleRef.current) * dist,
        1.02 + (dist - 3.4) * 0.06,
        Math.cos(angleRef.current) * dist
      );
      camera.lookAt(0, 0.96, 0);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    rigRef.current = rig;
    rendererRef.current = renderer;
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.remove(rig.root);
      renderer.dispose();
      renderer.domElement.remove();
      rigRef.current = null;
      rendererRef.current = null;
    };
    // The renderer lives for the lifetime of the preview; config updates only
    // rebuild the rig below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rigRef.current?.rebuildAppearance(config);
  }, [config]);

  useEffect(() => {
    autoRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  const frameClass =
    theme === 'dark'
      ? 'border-white/10 bg-[radial-gradient(circle_at_50%_38%,#1c2a21_0%,#090e0b_70%)]'
      : 'border-black/10 bg-[radial-gradient(circle_at_50%_38%,#ffffff_0%,#e8e7e1_72%)]';
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${frameClass} ${className}`}>
      <div
        ref={hostRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, angle: angleRef.current };
          setAutoRotate(false);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const next = dragRef.current.angle + (event.clientX - dragRef.current.x) * 0.012;
          angleRef.current = next;
          setAngle(next);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />

      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <span
          className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] ${
            theme === 'dark' ? 'bg-black/45 text-[#8dff79]' : 'bg-white/80 text-emerald-700'
          }`}
        >
          Live preview
        </span>
      </div>

      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/55 p-1 backdrop-blur">
        {ANGLES.map((view) => {
          const active = Math.abs(((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - ((view.value + Math.PI * 2) % (Math.PI * 2))) < 0.2;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                setAutoRotate(false);
                setAngle(view.value);
              }}
              className={`rounded-full px-2 py-1 text-[9px] font-bold transition ${
                active ? 'bg-[#39ff14] text-[#061006]' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              {view.label}
            </button>
          );
        })}
        <span className="mx-0.5 h-4 w-px bg-white/15" />
        <button
          type="button"
          aria-label="Reset preview rotation"
          onClick={() => {
            setAngle(0);
            setAutoRotate(false);
          }}
          className="rounded-full p-1 text-white/70 hover:bg-white/10"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setDistance((value) => Math.max(2.35, value - 0.25))}
          className="rounded-full p-1 text-white/70 hover:bg-white/10"
        >
          <ZoomIn className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setDistance((value) => Math.min(4.6, value + 0.25))}
          className="rounded-full p-1 text-white/70 hover:bg-white/10"
        >
          <ZoomOut className="h-3 w-3" />
        </button>
      </div>

      <p
        className={`pointer-events-none absolute bottom-11 right-3 z-10 hidden text-[9px] sm:block ${
          theme === 'dark' ? 'text-white/35' : 'text-black/35'
        }`}
      >
        Drag to orbit
      </p>
    </div>
  );
};
