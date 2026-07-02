import React, { useState, useEffect, useCallback } from 'react';
import type { ArchthesisMeme, CuboidMemeInput, FetchMemesResponse } from '../../types/archthesis';
import { mapMemeToCuboidInput } from '../../lib/meme-mapper';
import { Button } from '@/components/ui/button';

interface ArchthesisBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (input: CuboidMemeInput, meme: ArchthesisMeme) => void;
}

type SortMode = 'recent' | 'popular' | 'oldest';

const inputCls = "flex-1 min-w-[120px] px-1.5 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-xs";

export const ArchthesisBrowser: React.FC<ArchthesisBrowserProps> = ({ open, onClose, onSelect }) => {
  const [memes, setMemes] = useState<ArchthesisMeme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [hasMore, setHasMore] = useState(false);
  const [selectedMeme, setSelectedMeme] = useState<ArchthesisMeme | null>(null);

  const fetchMemes = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('limit', '20');
    params.set('sort', sort);
    if (search.trim()) params.set('search', search.trim());
    if (tag.trim()) params.set('tag', tag.trim());
    if (append && memes.length > 0) {
      params.set('offset', memes[memes.length - 1].timestamp);
    }

    try {
      const res = await fetch(`/api/fetch-memes?${params}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Error ${res.status}: ${body}`);
      }
      const data: FetchMemesResponse = await res.json();
      setMemes(prev => append ? [...prev, ...data.memes] : data.memes);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memes');
    } finally {
      setLoading(false);
    }
  }, [sort, search, tag, memes]);

  // Fetch on open and when filters change
  useEffect(() => {
    if (open) fetchMemes();
  }, [open, sort, tag]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchMemes(), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSelect = (meme: ArchthesisMeme) => {
    setSelectedMeme(meme);
  };

  const handleConfirm = () => {
    if (!selectedMeme) return;
    const input = mapMemeToCuboidInput(selectedMeme);
    onSelect(input, selectedMeme);
    onClose();
    setSelectedMeme(null);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-ink-100 rounded-xl border border-ink-200 w-[90vw] max-w-[800px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-ink-200">
          <h2 className="text-ink-900 text-base font-semibold m-0">Browse archthesis memes</h2>
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-ink-600 text-2xl cursor-pointer p-1 leading-none"
          >
            &times;
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-5 py-3 border-b border-ink-200 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memes..."
            className={inputCls}
          />
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="Filter by tag..."
            className={`${inputCls} flex-none w-36`}
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortMode)}
            className="px-1.5 py-1.5 bg-ink-100 border border-ink-200 rounded text-ink-900 text-xs"
          >
            <option value="recent">Recent</option>
            <option value="popular">Popular</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 my-2 p-2 bg-destructive/10 rounded text-destructive text-[11px]">
            {error}
          </div>
        )}

        {/* Meme grid */}
        <div className="flex-1 overflow-auto p-4 grid gap-3 content-start [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {memes.map(meme => (
            <div
              key={meme.id}
              className={`bg-ink-100 rounded-lg overflow-hidden cursor-pointer transition-colors border-2 ${
                selectedMeme?.id === meme.id ? 'border-primary' : 'border-transparent'
              }`}
              onClick={() => handleSelect(meme)}
            >
              <img
                src={meme.imageUrl}
                alt={meme.topText || meme.description || 'meme'}
                className="w-full h-[120px] object-contain block bg-ink-100"
                loading="lazy"
              />
              <div className="p-2 flex flex-col gap-1">
                <div className="text-ink-900 text-[11px] leading-snug line-clamp-2">
                  {meme.topText && <span>{meme.topText}</span>}
                  {meme.bottomText && <span className="opacity-70"> / {meme.bottomText}</span>}
                  {!meme.topText && !meme.bottomText && meme.description && (
                    <span className="opacity-70">{meme.description.slice(0, 60)}</span>
                  )}
                </div>
                <div className="text-ink-500 text-[10px]">
                  <span>{meme.likes} likes</span>
                  {meme.location?.display_name && (
                    <span className="opacity-60"> &middot; {meme.location.display_name}</span>
                  )}
                </div>
                {meme.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {meme.tags.slice(0, 3).map(t => (
                      <span key={t} className="bg-ink-200 text-ink-600 text-[9px] px-1 py-px rounded">
                        {t}
                      </span>
                    ))}
                    {meme.tags.length > 3 && (
                      <span className="bg-ink-200 text-ink-600 text-[9px] px-1 py-px rounded opacity-50">
                        +{meme.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="col-span-full text-center text-ink-500 py-8 text-sm">
              Loading...
            </div>
          )}
          {!loading && memes.length === 0 && (
            <div className="col-span-full text-center text-ink-500 py-8 text-sm">
              No memes found
            </div>
          )}
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <button
            onClick={() => fetchMemes(true)}
            className="mx-5 mb-3 py-2 bg-ink-100 border border-ink-200 rounded-md text-ink-600 cursor-pointer text-xs"
          >
            Load more
          </button>
        )}

        {/* Footer: selection preview + confirm */}
        {selectedMeme && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-ink-200 gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <img
                src={selectedMeme.imageUrl}
                alt=""
                className="w-10 h-10 rounded object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-ink-900 text-xs font-semibold truncate">
                  {selectedMeme.topText || selectedMeme.description?.slice(0, 40) || selectedMeme.id}
                </div>
                <div className="text-ink-600 text-[10px]">
                  {selectedMeme.likes} likes
                  {selectedMeme.location?.display_name && ` · ${selectedMeme.location.display_name}`}
                  {` · engagement → ${mapMemeToCuboidInput(selectedMeme).engagementLevel}/100`}
                </div>
              </div>
            </div>
            <Button
              onClick={handleConfirm}
              className="h-auto py-2 px-4 text-xs font-semibold bg-primary hover:bg-primary/85 text-white border-0 whitespace-nowrap"
            >
              Use this meme
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
