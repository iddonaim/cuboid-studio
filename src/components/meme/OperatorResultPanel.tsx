import React from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import type { TranslationRecordView } from '../../lib/operators/recordView';
import { TranslationRecordSummary } from './TranslationRecord';
import { Button } from '@/components/ui/button';

const floatingCls =
  'absolute top-4 right-4 bg-ink-100 border border-ink-200 rounded-lg p-4 w-[280px] max-h-[70vh] overflow-y-auto';
const dockedCls =
  'pointer-events-auto w-full bg-card border border-ink-200 rounded-lg p-4 shadow-[0_4px_20px_hsl(45_9%_13%/0.08)]';

/**
 * Inspector card for the latest translation on the working cube / targeted
 * assembly cube. Deliberately compact — headline, chips, confidence at a
 * glance; the complete two-pass prose lives in the shared full-reading
 * drawer (TranslationRecord), one click away.
 */
export const OperatorResultPanel: React.FC<{ docked?: boolean }> = ({ docked = false }) => {
  const lastResult = useMemeStore(s => s.lastResult);
  const lastPass1 = useMemeStore(s => s.lastPass1);
  const lastPass2 = useMemeStore(s => s.lastPass2);
  const lastConfidenceVector = useMemeStore(s => s.lastConfidenceVector);
  const lastModel = useMemeStore(s => s.lastModel);
  const lastCutterGeometry = useMemeStore(s => s.lastCutterGeometry);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const revertLastOperator = useMemeStore(s => s.revertLastOperator);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const standaloneOperators = useMemeStore(s => s.operators);
  const cubeTranslations = useMemeStore(s => s.cubeTranslations);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);
  const workingGeometry = useMemeStore(s => s.workingGeometry);
  const selectedMemeImageUrl = useMemeStore(s => s.selectedMemeImageUrl);
  const selectedMemeTitle = useMemeStore(s => s.selectedMemeTitle);
  const operators = targetCubeId ? (cubeOperators[targetCubeId] || []) : standaloneOperators;

  // The meme behind the shown result. When a cube is selected we trust its
  // stored translation snapshot (never the panel's current meme picker, which
  // may point at a different meme); standalone mode uses the live selection.
  const translation = targetCubeId ? cubeTranslations[targetCubeId] : undefined;
  const memeImageUrl = targetCubeId ? (translation?.memeImageUrl ?? null) : selectedMemeImageUrl;
  const memeTitle = targetCubeId ? (translation?.memeTitle ?? null) : selectedMemeTitle;
  const memeDescription = targetCubeId ? (translation?.memeDescription ?? null) : null;

  // While a translation is in flight the ApiActivityIndicator card covers
  // this rail slot, so this panel stays hidden instead of doubling up.
  if (isTranslating) return null;

  if (!lastResult) return null;

  const lastOp = operators.length > 0 ? operators[operators.length - 1] : undefined;
  const view: TranslationRecordView = {
    key: targetCubeId ?? 'standalone',
    title:
      lastPass1?.meme_summary ||
      memeTitle ||
      memeDescription?.split('\n')[0] ||
      'Applied change',
    status: 'applied',
    origin: lastOp?.origin ?? null,
    createdAt: lastOp?.createdAt ?? null,
    memeTitle,
    memeDescription,
    memeImageUrl,
    operator: lastResult.operator,
    magnitude: lastResult.magnitude,
    targets: lastResult.targets,
    cutterType: lastResult.cutter.type,
    reasoning: lastResult.reasoning ?? null,
    pass1: lastPass1,
    pass2: lastPass2,
    confidenceVector: lastConfidenceVector ?? lastPass2?.confidence_vector ?? null,
    model: lastModel,
    // Thumbnail: the cut result plus the cutter that produced it.
    snapshotGeometry: targetCubeId
      ? (cubeGeometryOverrides[targetCubeId] ?? null)
      : workingGeometry,
    snapshotCutter: (targetCubeId ? translation?.cutterGeometry : lastCutterGeometry) ?? null,
  };

  return (
    <div className={docked ? dockedCls : floatingCls}>
      <p className="text-ink-500 text-[10px] uppercase tracking-wider m-0 mb-2">
        Latest translation
      </p>
      <TranslationRecordSummary view={view} />

      {operators.length > 0 && (
        <Button
          onClick={revertLastOperator}
          className="w-full h-auto py-2 mt-3 text-[13px] bg-destructive/10 hover:bg-destructive/20 text-destructive border-0"
        >
          Revert Last
        </Button>
      )}
    </div>
  );
};
