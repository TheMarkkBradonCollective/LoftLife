/**
 * Minimal DOM shim for the preview renderer.
 *
 * A few legacy furniture builders paint detail into a 2D canvas texture. The
 * renderer shades from material colours and never uploads textures, so a
 * no-op canvas is enough to run those builders unchanged in Node — the point is
 * to render their real geometry, not to re-implement them.
 */
export function installCanvasStub() {
  if (globalThis.document?.createElement) return;
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => gradient;
        }
        if (key === 'createPattern') return () => null;
        if (key === 'measureText') return () => ({ width: 10 });
        if (key === 'getImageData') {
          return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        }
        if (key === 'canvas') return null;
        return () => {};
      },
      set() {
        return true;
      },
    }
  );
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') return { style: {}, appendChild() {}, removeChild() {} };
      return {
        width: 1,
        height: 1,
        style: {},
        getContext: () => context,
        toDataURL: () => 'data:image/png;base64,',
        addEventListener() {},
        removeEventListener() {},
      };
    },
    body: { appendChild() {}, removeChild() {} },
  };
  globalThis.window = globalThis.window ?? { devicePixelRatio: 1 };
  globalThis.HTMLCanvasElement = globalThis.HTMLCanvasElement ?? function HTMLCanvasElement() {};
}
