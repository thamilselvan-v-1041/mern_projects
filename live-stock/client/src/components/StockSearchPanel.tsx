import { useEffect, useMemo, useState } from 'react';

type SearchStock = {
  symbol: string;
  name: string;
  market?: string;
  segment?: string;
};

type Props = {
  open: boolean;
  onSelect: (stock: SearchStock) => void;
  onClose: () => void;
  onRemoteSearch: (query: string) => Promise<SearchStock[]>;
  onQueryChange?: (query: string) => void;
};

export default function StockSearchPanel({ open, onSelect, onClose, onRemoteSearch, onQueryChange }: Props) {
  const [query, setQuery] = useState('');
  const [remoteMatches, setRemoteMatches] = useState<SearchStock[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    if (!open || !q) {
      setRemoteMatches([]);
      setRemoteLoading(false);
      return;
    }
    setRemoteLoading(true);
    const t = setTimeout(() => {
      onRemoteSearch(q)
        .then((rows) => {
          if (!cancelled) setRemoteMatches(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (!cancelled) setRemoteMatches([]);
        })
        .finally(() => {
          if (!cancelled) setRemoteLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, q, onRemoteSearch]);

  const displayMatches = useMemo(() => remoteMatches, [remoteMatches]);

  if (!open) return null;

  const handleClose = () => {
    setQuery('');
    setRemoteMatches([]);
    setRemoteLoading(false);
    onQueryChange?.('');
    onClose();
  };

  return (
    <div className="stock-search-panel">
      <div className="stock-search-head">
        <input
          type="text"
          className="stock-search-input"
          placeholder="Search stock name (e.g. Tata Power, INFY, Apple)"
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            onQueryChange?.(next);
          }}
          autoFocus
        />
        <button type="button" className="stock-search-close" onClick={handleClose} aria-label="Close search">
          ×
        </button>
      </div>
      <div className="stock-search-results">
        {q.length <= 0 ? null : displayMatches.length === 0 ? (
          <p className="stock-search-empty">
            {remoteLoading ? 'Searching stocks...' : 'No matching stocks.'}
          </p>
        ) : (
          <ul className="stock-search-list">
            {displayMatches.map((s) => (
              <li key={`${s.symbol}-${s.market || ''}-${s.segment || ''}`}>
                <button
                  type="button"
                  className="stock-search-item"
                  onClick={() => onSelect(s)}
                  title={`${s.name} (${s.symbol})`}
                >
                  <span className="stock-search-item-symbol">{String(s.symbol || '').replace(/\.NS$/i, '')}</span>
                  <span className="stock-search-item-name">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
