import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildPreviewModel } from '../game/modelPreview';
import { preloadImportedFurniture } from '../game/importedFurniture';

interface ModelInspectorProps {
  catalogId: string;
  colour?: string;
  active?: boolean;
  /** Transparent catalog render shown while WebGL starts or when unavailable. */
  fallbackSrc?: string;
  label?: string;
  className?: string;
}

/**
 * Live 3D inspector: renders the exact model the build tool places, lit and
 * turnable. Falls back to the catalog's transparent render when WebGL is
 * unavailable (older devices, software rendering disabled).
 */
export const ModelInspector: React.FC<ModelInspectorProps> = ({
  catalogId,
  colour,
  active = true,
  fallbackSrc,
  label,
  className,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [importedFurnitureRevision, setImportedFurnitureRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void preloadImportedFurniture().then((revision) => {
      if (!cancelled) setImportedFurnitureRevision(revision);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 120);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 1.1);
    fill.position.set(-4, 2, -3);
    scene.add(key, fill, new THREE.AmbientLight(0xffffff, 1.1));

    const model = buildPreviewModel(catalogId, colour, active);
    if (!model) {
      setFailed(true);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      return;
    }
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    model.position.sub(centre);
    pivot.add(model);
    scene.add(pivot);

    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    let yaw = -0.55;
    let pitch = 0.35;
    let distance = radius * 3.4;
    const fit = () => {
      if (host.clientWidth < 2) return;
      const aspect = host.clientWidth / Math.max(1, host.clientHeight);
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      camera.aspect = aspect;
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance
      );
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    fit();
    distance *= 1.02;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      yaw -= (event.clientX - lastX) * 0.012;
      pitch = Math.max(-0.2, Math.min(1.15, pitch + (event.clientY - lastY) * 0.008));
      lastX = event.clientX;
      lastY = event.clientY;
      fit();
    };
    const onPointerUp = () => {
      dragging = false;
      renderer.domElement.style.cursor = 'grab';
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      distance = Math.max(radius * 1.6, Math.min(radius * 8, distance * (1 + event.deltaY * 0.0012)));
      fit();
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const observer = new ResizeObserver(() => fit());
    observer.observe(host);

    let spin = 0;
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!dragging) {
        spin += 0.0035;
        pivot.rotation.y = spin;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material?.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [catalogId, colour, active, importedFurnitureRevision]);

  if (failed && fallbackSrc) {
    return (
      <div className={`flex items-center justify-center ${className ?? ''}`}>
        <img src={fallbackSrc} alt={label ?? 'Catalog preview'} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={hostRef} className="h-full w-full" aria-label={label ? `${label} 3D preview` : '3D preview'} role="img" />
      <span className="pointer-events-none absolute bottom-1 left-2 text-[9px] uppercase tracking-[0.14em] text-white/35">
        Drag to rotate
      </span>
    </div>
  );
};
