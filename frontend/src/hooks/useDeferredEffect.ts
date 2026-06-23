import { useEffect, useRef, EffectCallback, DependencyList } from 'react';

const scheduleIdle = (callback: FrameRequestCallback | IdleRequestCallback) => {
  if (typeof window === 'undefined') {
    return window.setTimeout(callback as TimerHandler, 120);
  }
  if ('requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(callback);
  }
  return window.setTimeout(callback as TimerHandler, 120);
};

const cancelIdle = (handle: number) => {
  if (typeof window === 'undefined') {
    window.clearTimeout(handle);
    return;
  }
  if ('cancelIdleCallback' in window) {
    (window as any).cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
};

export const useDeferredEffect = (effect: EffectCallback, deps: DependencyList = []) => {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    let cleanup: void | (() => void);
    let handle: number;

    handle = scheduleIdle(() => {
      const returned = effectRef.current();
      if (typeof returned === 'function') {
        cleanup = returned;
      }
    });

    return () => {
      cancelIdle(handle);
      if (typeof cleanup === 'function') cleanup();
    };
  }, deps);
};
