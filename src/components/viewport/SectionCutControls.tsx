import React from 'react';
import { useSectionCutStore } from '../../store/useSectionCutStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

interface SectionCutControlsProps {
  /** When false, omits the top separator (e.g. when not first in a panel). */
  showSeparator?: boolean;
}

export const SectionCutControls: React.FC<SectionCutControlsProps> = ({
  showSeparator = true,
}) => {
  const enabled = useSectionCutStore(s => s.enabled);
  const setEnabled = useSectionCutStore(s => s.setEnabled);
  const axis = useSectionCutStore(s => s.axis);
  const setAxis = useSectionCutStore(s => s.setAxis);
  const position = useSectionCutStore(s => s.position);
  const setPosition = useSectionCutStore(s => s.setPosition);

  return (
    <>
      {showSeparator && <Separator className="mt-3 bg-slate-700" />}
      <div className="mt-3">
        {enabled && (
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="flex gap-1">
              {(['x', 'y', 'z'] as const).map(a => (
                <Button
                  key={a}
                  onClick={() => setAxis(a)}
                  className={`flex-1 h-auto py-1 px-0 text-[11px] rounded-sm border-0 ${
                    axis === a
                      ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                      : 'bg-card text-muted-foreground hover:bg-slate-700'
                  }`}
                >
                  {a.toUpperCase()}
                </Button>
              ))}
            </div>
            <Slider
              min={-100}
              max={200}
              value={[position]}
              onValueChange={([v]) => setPosition(v)}
            />
            <span className="text-slate-500 text-[10px] text-center">
              {axis.toUpperCase()} = {position}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            id="section-cut"
            className="data-[state=checked]:bg-accent"
          />
          <label
            htmlFor="section-cut"
            className={`text-xs cursor-pointer ${enabled ? 'text-accent' : 'text-slate-500'}`}
          >
            Section Cut
          </label>
        </div>
      </div>
    </>
  );
};
