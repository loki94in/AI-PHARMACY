import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PipPortalProps {
  isOpen: boolean;
  onClose: () => void;
  width?: number;
  height?: number;
  title?: string;
  children: React.ReactNode;
}

export const PipPortal: React.FC<PipPortalProps> = ({
  isOpen,
  onClose,
  width = 450,
  height = 700,
  title = "Live Cart",
  children,
}) => {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (pipWindow) {
        pipWindow.close();
        (window as any).activePipWindow = null;
        setPipWindow(null);
      }
      return;
    }

    const docPip = (window as any).documentPictureInPicture;
    if (!docPip) {
      alert("Document Picture-in-Picture is not supported in this browser. Please use a modern version of Google Chrome or Microsoft Edge.");
      onClose();
      return;
    }

    let isMounted = true;
    let newWin: Window | null = null;

    const openPip = async () => {
      try {
        newWin = await docPip.requestWindow({
          width,
          height,
        });

        if (!newWin) { onClose(); return; }

        if (!isMounted) {
          newWin.close();
          return;
        }

        newWin.document.title = title;

        // Copy styles from main document to the new window
        Array.from(document.querySelectorAll('link, style')).forEach((el) => {
          newWin?.document.head.appendChild(el.cloneNode(true));
        });

        // Copy classes from the root <html> elements to keep the theme variables
        newWin.document.documentElement.className = document.documentElement.className;
        newWin.document.body.className = "bg-bg text-text overflow-hidden h-screen p-4 flex flex-col font-sans select-none";

        // Listen for close from the OS window control or on page hide
        newWin.addEventListener('pagehide', () => {
          (window as any).activePipWindow = null;
          setPipWindow(null);
          onClose();
        });

        // Set global references so child components can check active PiP status
        (window as any).activePipWindow = newWin;
        setPipWindow(newWin);
      } catch (err) {
        console.error("Failed to open Picture-in-Picture window:", err);
        onClose();
      }
    };

    openPip();

    return () => {
      isMounted = false;
      if (newWin) {
        newWin.close();
      }
      (window as any).activePipWindow = null;
    };
  }, [isOpen]);

  if (!pipWindow) return null;

  return createPortal(children, pipWindow.document.body);
};
