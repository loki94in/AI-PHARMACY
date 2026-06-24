import { useEffect } from 'react';
import type { EffectCallback, DependencyList } from 'react';

export const useDeferredEffect = (effect: EffectCallback, deps: DependencyList = []) => {
  useEffect(effect, deps);
};
