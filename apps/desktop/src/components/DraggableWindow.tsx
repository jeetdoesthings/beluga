import React, { useState, useRef, useEffect } from "react";

interface DraggableWindowProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  width?: number;
  maxHeight?: number | string;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
}

let highestZIndex = 100;

export const DraggableWindow: React.FC<DraggableWindowProps> = ({
  id,
  title,
  icon,
  defaultPosition = { x: 20, y: 70 },
  width = 300,
  maxHeight = "calc(100vh - 140px)",
  onClose,
  children,
  className = "",
}) => {
  const [position, setPosition] = useState(defaultPosition);
  const [zIndex, setZIndex] = useState(() => ++highestZIndex);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, winX: defaultPosition.x, winY: defaultPosition.y });
  const windowRef = useRef<HTMLDivElement>(null);

  // Initialize position safely within viewport
  useEffect(() => {
    setPosition((prev) => {
      const maxX = Math.max(10, window.innerWidth - width - 20);
      const maxY = Math.max(10, window.innerHeight - 100);
      return {
        x: Math.min(Math.max(10, defaultPosition.x), maxX),
        y: Math.min(Math.max(10, defaultPosition.y), maxY),
      };
    });
  }, [defaultPosition.x, defaultPosition.y, width]);

  const bringToFront = () => {
    // Only re-render if we're actually changing the z-index
    if (zIndex < highestZIndex) {
      highestZIndex += 1;
      setZIndex(highestZIndex);
    }
  };

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    // Ignore clicks on buttons inside header
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button !== 0) return;

    e.preventDefault();
    bringToFront();

    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      winX: position.x,
      winY: position.y,
    };

    document.body.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();

    const onPointerMove = (moveEvt: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvt.clientX - dragStartRef.current.mouseX;
      const dy = moveEvt.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(10, Math.min(window.innerWidth - width - 10, dragStartRef.current.winX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 60, dragStartRef.current.winY + dy));

      setPosition({ x: newX, y: newY });
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div
      ref={windowRef}
      className={`draggable-window glass-overlay ${className}`}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: `${width}px`,
        maxHeight: isCollapsed ? "auto" : maxHeight,
        zIndex,
      }}
      onPointerDown={(e) => {
        // Don't re-render on clicks on form elements (select, input, button, slider)
        if ((e.target as HTMLElement).closest("button, select, input, textarea")) return;
        bringToFront();
      }}
    >
      {/* Draggable Title Bar */}
      <div className="window-header" onPointerDown={handleHeaderPointerDown}>
        <div className="window-title-group">
          {icon && <div className="window-icon">{icon}</div>}
          <h4 className="window-title">{title}</h4>
        </div>

        <div className="window-actions">
          <button
            type="button"
            className="window-btn minimize"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {isCollapsed ? <polyline points="6 9 12 15 18 9" /> : <line x1="5" y1="12" x2="19" y2="12" />}
            </svg>
          </button>

          {onClose && (
            <button
              type="button"
              className="window-btn close"
              onClick={onClose}
              title="Close Panel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Window Body Content */}
      {!isCollapsed && <div className="window-body">{children}</div>}
    </div>
  );
};
