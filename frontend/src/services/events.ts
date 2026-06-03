// Global Event Bus helper for UI triggers
export interface ToastEventDetail {
  message: string;
  type: 'success' | 'error' | 'info';
}

export const toastEvent = {
  trigger: (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    window.dispatchEvent(
      new CustomEvent<ToastEventDetail>('app-show-toast', {
        detail: { message, type },
      })
    );
  },
  subscribe: (callback: (detail: ToastEventDetail) => void) => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ToastEventDetail>;
      callback(customEvent.detail);
    };
    window.addEventListener('app-show-toast', handler);
    return () => window.removeEventListener('app-show-toast', handler);
  },
};

export const quickOrderEvent = {
  triggerOpen: () => {
    window.dispatchEvent(new CustomEvent('app-open-quick-order'));
  },
  subscribeOpen: (callback: () => void) => {
    window.addEventListener('app-open-quick-order', callback);
    return () => window.removeEventListener('app-open-quick-order', callback);
  },
};
