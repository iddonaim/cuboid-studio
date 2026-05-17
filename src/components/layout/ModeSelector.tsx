import React from 'react';
import { useAppStore, AppMode } from '../../store/useAppStore';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MODES: { key: AppMode; label: string; enabled: boolean }[] = [
  { key: 'builder',      label: 'Builder',      enabled: true },
  { key: 'pataphysical', label: 'Pataphysical',  enabled: true },
  { key: 'encoding',     label: 'Encoding',      enabled: true },
  { key: 'evolution',    label: 'Evolution',     enabled: true },
];

export const ModeSelector: React.FC = () => {
  const activeMode = useAppStore(s => s.activeMode);
  const setActiveMode = useAppStore(s => s.setActiveMode);

  return (
    <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as AppMode)}>
      <TabsList className="flex w-full h-auto gap-0.5 bg-transparent p-0 mb-3 pb-2 border-b border-slate-700">
        {MODES.map(mode => (
          <TabsTrigger
            key={mode.key}
            value={mode.key}
            disabled={!mode.enabled}
            className="flex-1 px-1 py-1.5 text-[10px] font-normal rounded-sm text-muted-foreground
              data-[state=active]:bg-slate-700 data-[state=active]:text-slate-200
              data-[state=active]:font-semibold data-[state=active]:shadow-none
              disabled:cursor-not-allowed"
          >
            {mode.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
