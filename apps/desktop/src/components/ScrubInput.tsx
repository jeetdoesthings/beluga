import React, { useState, useRef, useEffect } from "react";

interface ScrubInputProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  onChange: (val: number) => void;
  className?: string;
}

export const ScrubInput: React.FC<ScrubInputProps> = ({
  label,
  value,
  min = -Infinity,
  max = Infinity,
  step = 0.01,
  decimals = 2,
  unit = "m",
  onChange,
  className = "",
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toFixed(decimals));
  const [isScrubbing, setIsScrubbing] = useState(false);

  const startXRef = useRef(0);
  const startValRef = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing && !isScrubbing) {
      setTempValue(value.toFixed(decimals));
    }
  }, [value, isEditing, isScrubbing, decimals]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isEditing) return;
    if (e.button !== 0) return;

    e.preventDefault();
    document.body.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();

    startXRef.current = e.clientX;
    startValRef.current = value;
    setIsScrubbing(true);

    const onPointerMove = (moveEvt: PointerEvent) => {
      moveEvt.preventDefault();
      const dx = moveEvt.clientX - startXRef.current;
      if (Math.abs(dx) > 2) {
        const sensitivity = moveEvt.shiftKey ? step * 0.1 : step;
        const deltaVal = dx * sensitivity;
        let nextVal = startValRef.current + deltaVal;
        nextVal = Math.max(min, Math.min(max, nextVal));
        const rounded = parseFloat(nextVal.toFixed(decimals));
        onChange(rounded);
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setIsScrubbing(false);

      const dx = Math.abs(upEvt.clientX - startXRef.current);
      if (dx < 3) {
        setIsEditing(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 10);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempValue(e.target.value);
  };

  const handleInputBlur = () => {
    commitEdit();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setTempValue(value.toFixed(decimals));
    }
  };

  const commitEdit = () => {
    setIsEditing(false);
    let parsed = parseFloat(tempValue);
    if (isNaN(parsed)) {
      setTempValue(value.toFixed(decimals));
      return;
    }
    parsed = Math.max(min, Math.min(max, parsed));
    const rounded = parseFloat(parsed.toFixed(decimals));
    onChange(rounded);
    setTempValue(rounded.toFixed(decimals));
  };

  return (
    <div
      className={`scrub-input-container ${isScrubbing ? "scrubbing" : ""} ${className}`}
      onPointerDown={handlePointerDown}
      title={`${label}: Click & Drag horizontally to adjust, click to type`}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <span className="scrub-label">{label}</span>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="scrub-text-input"
          value={tempValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          autoFocus
        />
      ) : (
        <div className="scrub-value-display">
          <span className="scrub-num">{value.toFixed(decimals)}</span>
          {unit && <span className="scrub-unit">{unit}</span>}
        </div>
      )}
    </div>
  );
};
