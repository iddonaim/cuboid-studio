import React, { useState, useEffect, useCallback } from 'react';
import type { ArchthesisMeme, CuboidMemeInput, FetchMemesResponse } from '../../types/archthesis';
import { mapMemeToCuboidInput } from '../../lib/meme-mapper';

interface ArchthesisBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (input: CuboidMemeInput, meme: ArchthesisMeme) => void;
}

type SortMode = 'recent' | 'popular' | 'oldest';

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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Browse archthesis memes</h2>
          <button onClick={onClose} style={styles.closeBtn}>&times;</button>
        </div>

        {/* Filters */}
        <div style={styles.filters}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memes..."
            style={styles.searchInput}
          />
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="Filter by tag..."
            style={{ ...styles.searchInput, width: 140 }}
          />
          <select value={sort} onChange={e => setSort(e.target.value as SortMode)} style={styles.sortSelect}>
            <option value="recent">Recent</option>
            <option value="popular">Popular</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Meme grid */}
        <div style={styles.grid}>
          {memes.map(meme => (
            <div
              key={meme.id}
              style={{
                ...styles.card,
                border: selectedMeme?.id === meme.id ? '2px solid #22d3ee' : '2px solid transparent',
              }}
              onClick={() => handleSelect(meme)}
            >
              <img
                src={meme.imageUrl}
                alt={meme.topText || meme.description || 'meme'}
                style={styles.cardImage}
                loading="lazy"
              />
              <div style={styles.cardBody}>
                <div style={styles.cardText}>
                  {meme.topText && <span>{meme.topText}</span>}
                  {meme.bottomText && <span style={{ opacity: 0.7 }}> / {meme.bottomText}</span>}
                  {!meme.topText && !meme.bottomText && meme.description && (
                    <span style={{ opacity: 0.7 }}>{meme.description.slice(0, 60)}</span>
                  )}
                </div>
                <div style={styles.cardMeta}>
                  <span>{meme.likes} likes</span>
                  {meme.location?.display_name && (
                    <span style={{ opacity: 0.6 }}> &middot; {meme.location.display_name}</span>
                  )}
                </div>
                {meme.tags.length > 0 && (
                  <div style={styles.tagRow}>
                    {meme.tags.slice(0, 3).map(t => (
                      <span key={t} style={styles.tagBadge}>{t}</span>
                    ))}
                    {meme.tags.length > 3 && (
                      <span style={{ ...styles.tagBadge, opacity: 0.5 }}>+{meme.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && <div style={styles.loadingText}>Loading...</div>}
          {!loading && memes.length === 0 && <div style={styles.loadingText}>No memes found</div>}
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <button onClick={() => fetchMemes(true)} style={styles.loadMoreBtn}>
            Load more
          </button>
        )}

        {/* Footer: selection preview + confirm */}
        {selectedMeme && (
          <div style={styles.footer}>
            <div style={styles.previewRow}>
              <img src={selectedMeme.imageUrl} alt="" style={styles.previewThumb} />
              <div style={styles.previewInfo}>
                <div style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>
                  {selectedMeme.topText || selectedMeme.description?.slice(0, 40) || selectedMeme.id}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>
                  {selectedMeme.likes} likes
                  {selectedMeme.location?.display_name && ` · ${selectedMeme.location.display_name}`}
                  {` · engagement → ${mapMemeToCuboidInput(selectedMeme).engagementLevel}/100`}
                </div>
              </div>
            </div>
            <button onClick={handleConfirm} style={styles.confirmBtn}>
              Use this meme
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b',
    width: '90vw', maxWidth: 800, maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid #1e293b',
  },
  title: { color: 'white', fontSize: 16, margin: 0, fontWeight: 600 },
  closeBtn: {
    background: 'none', border: 'none', color: '#94a3b8', fontSize: 24,
    cursor: 'pointer', padding: '0 4px', lineHeight: 1,
  },
  filters: {
    display: 'flex', gap: 8, padding: '12px 20px',
    borderBottom: '1px solid #1e293b', flexWrap: 'wrap' as const,
  },
  searchInput: {
    flex: 1, minWidth: 120, padding: 6, background: '#1e293b',
    border: '1px solid #334155', borderRadius: 4, color: 'white', fontSize: 12,
  },
  sortSelect: {
    padding: 6, background: '#1e293b', border: '1px solid #334155',
    borderRadius: 4, color: 'white', fontSize: 12,
  },
  error: {
    margin: '8px 20px', padding: 8, background: '#7f1d1d',
    borderRadius: 4, color: '#fca5a5', fontSize: 11,
  },
  grid: {
    flex: 1, overflow: 'auto', padding: 16,
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12, alignContent: 'start',
  },
  card: {
    background: '#1e293b', borderRadius: 8, overflow: 'hidden',
    cursor: 'pointer', transition: 'border-color 0.15s',
  },
  cardImage: {
    width: '100%', height: 120, objectFit: 'contain', display: 'block',
    background: '#0f172a',
  },
  cardBody: {
    padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
  },
  cardText: {
    color: 'white', fontSize: 11, lineHeight: 1.3,
    overflow: 'hidden', textOverflow: 'ellipsis',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
  },
  cardMeta: { color: '#64748b', fontSize: 10 },
  tagRow: { display: 'flex', gap: 4, flexWrap: 'wrap' as const },
  tagBadge: {
    background: '#334155', color: '#94a3b8', fontSize: 9,
    padding: '1px 5px', borderRadius: 3,
  },
  loadingText: {
    gridColumn: '1 / -1', textAlign: 'center' as const,
    color: '#64748b', padding: 32, fontSize: 13,
  },
  loadMoreBtn: {
    margin: '0 20px 12px', padding: 8, background: '#1e293b',
    border: '1px solid #334155', borderRadius: 6, color: '#94a3b8',
    cursor: 'pointer', fontSize: 12,
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', borderTop: '1px solid #1e293b', gap: 12,
  },
  previewRow: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  previewThumb: { width: 40, height: 40, borderRadius: 4, objectFit: 'cover' },
  previewInfo: { flex: 1, minWidth: 0 },
  confirmBtn: {
    padding: '8px 16px', background: '#065f46', border: 'none',
    borderRadius: 6, color: 'white', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' as const,
  },
};
