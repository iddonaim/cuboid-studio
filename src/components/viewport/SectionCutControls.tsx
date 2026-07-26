import React, { useEffect, useMemo } from 'react';
import { useSectionCutStore } from '../../store/useSectionCutStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { assemblyBoundsFromPositions } from '../../lib/viewport/assemblyBounds';
import { CUBE_SIZE } from '../../lib/cube/constants';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

interface SectionCutControlsProps {
  /** When false, omits the top separator (e.g. when not first in a panel). */
  showSeparator?: boolean;
}

/** Margin past the assembly's actual extent, so the cut plane can clear both ends entirely. */
const CUT_RANGE_MARGIN = CUBE_SIZE;

export const SectionCutControls: React.FC<SectionCutControlsProps> = ({
  showSeparator = true,
}) => {
  const enabled = useSectionCutStore(s => s.enabled);
  const setEnabled = useSectionCutStore(s => s.setEnabled);
  const axis = useSectionCutStore(s => s.axis);
  const setAxis = useSectionCutStore(s => s.setAxis);
  const position = useSectionCutStore(s => s.position);
  const setPosition = useSectionCutStore(s => s.setPosition);

  const placedCubes = useBuilderStore(s => s.placedCubes);
  const bounds = useMemo(
    () => assemblyBoundsFromPositions(placedCubes.map(c => c.position)),
    [placedCubes]
  );

  const min = bounds.min[axis] - CUT_RANGE_MARGIN;
  const max = bounds.max[axis] + CUT_RANGE_MARGIN;

  // Re-clamp the stored cut position whenever the assembly (or selected axis) changes
  // its range, so the plane never gets stuck outside the composition's actual extent.
  useEffect(() => {
    if (position < min) setPosition(min);
    else if (position > max) setPosition(max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]);

  return (
    <>
      {showSeparator && <Separator className="mt-3 bg-ink-200" />}
      <div className="mt-3">
        {enabled && (
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="flex gap-1">
              {(['x', 'y', 'z'] as const).map(a => (
                <Button
                  key={a}
                  onClick={() => setAxis(a)}
                  className={`flex-1 h-auto py-1 px-0 text-[12px] rounded-sm border-0 ${
                    axis === a
                      ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                      : 'bg-card text-muted-foreground hover:bg-ink-200'
                  }`}
                >
                  {a.toUpperCase()}
                </Button>
              ))}
            </div>
            <Slider
              min={min}
              max={max}
              value={[position]}
              onValueChange={([v]) => setPosition(v)}
            />
            <span className="text-ink-500 text-[11px] text-center">
              {axis.toUpperCase()} = {Math.round(position)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(on) => {
              // Turning the cut on with the plane parked outside the assembly
              // looks like the toggle does nothing — snap it to mid-assembly
              // so enabling always shows a visible cut.
              if (on && (position <= bounds.min[axis] || position >= bounds.max[axis])) {
                setPosition((bounds.min[axis] + bounds.max[axis]) / 2);
              }
              setEnabled(on);
            }}
            id="section-cut"
            className="data-[state=checked]:bg-accent"
          />
          <label
            htmlFor="section-cut"
            className={`text-[13px] cursor-pointer ${enabled ? 'text-accent' : 'text-ink-500'}`}
          >
            Section Cut
          </label>
        </div>
      </div>
    </>
  );
};
