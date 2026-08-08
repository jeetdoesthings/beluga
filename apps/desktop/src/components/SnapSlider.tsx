import React from "react";

export interface SnapPoint {
  value: number;
  label: string;
}

interface SnapSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  snapThreshold?: number;
  snapPoints: SnapPoint[];
  onChange: (val: number) => void;
  unit?: string;
}

export const SnapSlider: React.FC<SnapSliderProps> = ({
  value,
  min,
  max,
  step = 1,
  snapThreshold = 4,
  snapPoints,
  onChange,
  unit = "°",
}) => {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawVal = parseFloat(e.target.value);

    // Magnetic snap checking
    for (const sp of snapPoints) {
      if (Math.abs(rawVal - sp.value) <= snapThreshold) {
        rawVal = sp.value;
        break;
      }
    }

    onChange(rawVal);
  };

  return (
    <div className="snap-slider-wrap">
      <div className="snap-slider-track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          className="studio-slider snap-range-input"
          value={value}
          onChange={handleSliderChange}
        />
      </div>

      {/* Ruler-Style Scale with Vertical Ticks & Numbers matching hand drawing */}
      <div className="ruler-scale-container">
        <div className="ruler-baseline" />
        {snapPoints.map((sp) => {
          const percent = ((sp.value - min) / (max - min)) * 100;
          const isSnapped = Math.abs(value - sp.value) < 1.5;
          return (
            <div
              key={sp.value}
              className={`ruler-tick-group ${isSnapped ? "active" : ""}`}
              style={{ left: `${percent}%` }}
              onClick={() => onChange(sp.value)}
              title={`Snap to ${sp.value}${unit}`}
            >
              <div className="ruler-tick-line" />
              <span className="ruler-tick-label">{sp.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
