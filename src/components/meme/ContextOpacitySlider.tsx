import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import { Slider } from '@/components/ui/slider';

/**
 * Transparency of the rest of the composition while a cube+meme is being
 * viewed — the focused cube stays solid, everything else recedes by this
 * much. Shown wherever a cube is focused (Pataphysical target box, Evolve
 * change card); one shared value, so the setting follows the architect
 * between the two surfaces.
 */
export const ContextOpacitySlider: React.FC = () => {
  const contextOpacity = useMemeStore(s => s.contextOpacity);
  const setContextOpacity = useMemeStore(s => s.setContextOpacity);
  const transparency = Math.round((1 - contextOpacity) * 100);

  return (
    <div className="mt-1.5">
      <div className="flex justify-between mb-1">
        <label className="text-ink-500 text-[10px]">Fade rest of composition</label>
        <span className="text-ink-600 text-[10px]">{transparency}%</span>
      </div>
      <Slider
        min={0}
        max={95}
        step={5}
        value={[transparency]}
        onValueChange={([v]) => setContextOpacity(1 - v / 100)}
      />
    </div>
  );
};
