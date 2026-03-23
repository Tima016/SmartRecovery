import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, File, Clock, Microscope, Tag, FileText, Loader } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { globalSearchApi, type GlobalSearchResult } from '../../api/global-search.api';

const ENTITY_ICONS: Record<string, React.ElementType> = {
    FILE: File,
    ARTIFACT: Microscope,
    TIMELINE: Clock,
    NOTE: FileText,
    TAG: Tag,
};

const ENTITY_COLORS: Record<string, string> = {
    FILE: 'text-accent-cyan',
    ARTIFACT: 'text-purple-400',
    TIMELINE: 'text-amber-400',
    NOTE: 'text-green-400',
    TAG: 'text-pink-400',
};

const ENTITY_BG: Record<string, string> = {
    FILE: 'bg-accent-cyan/10',
    ARTIFACT: 'bg-purple-400/10',
    TIMELINE: 'bg-amber-400/10',
    NOTE: 'bg-green-400/10',
    TAG: 'bg-pink-400/10',
};

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function GlobalSearch({ open, onClose }: Props) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<GlobalSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { caseId } = useParams<{ caseId: string }>();

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setResults([]);
            setSelectedIdx(0);
        }
    }, [open]);

    // Debounced search
    useEffect(() => {
        if (!query || query.length < 2 || !caseId) {
            setResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const res = await globalSearchApi.search(caseId, query);
                setResults(res);
                setSelectedIdx(0);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 280);
        return () => clearTimeout(timer);
    }, [query, caseId]);

    const navigateTo = useCallback((result: GlobalSearchResult) => {
        onClose();
        if (!caseId) return;
        switch (result.entityType) {
            case 'FILE':
                navigate(`/cases/${caseId}/filesystem`);
                break;
            case 'ARTIFACT':
                navigate(`/cases/${caseId}/artifacts`);
                break;
            case 'TIMELINE':
                navigate(`/cases/${caseId}/timeline`);
                break;
            case 'NOTE':
            case 'TAG':
                navigate(`/cases/${caseId}/filesystem`);
                break;
        }
    }, [caseId, navigate, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && results[selectedIdx]) { navigateTo(results[selectedIdx]); }
    };

    const grouped = results.reduce<Record<string, GlobalSearchResult[]>>((acc, r) => {
        acc[r.entityType] = acc[r.entityType] || [];
        acc[r.entityType].push(r);
        return acc;
    }, {});

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[999] flex items-start justify-center pt-[10vh] px-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="w-full max-w-2xl rounded-lg overflow-hidden shadow-2xl border"
                style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                onKeyDown={handleKeyDown}
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    {loading
                        ? <Loader className="w-4 h-4 text-accent-cyan animate-spin flex-shrink-0" />
                        : <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
                    }
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search files, artifacts, events, notes, tags..."
                        className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
                    />
                    {!caseId && (
                        <span className="text-xs text-status-error/70 mono flex-shrink-0">Open a case first</span>
                    )}
                    <button onClick={onClose} className="p-0.5 rounded hover:bg-bg-elevated transition-colors">
                        <X className="w-4 h-4 text-text-muted" />
                    </button>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {query.length >= 2 && !loading && results.length === 0 && (
                        <div className="py-10 text-center text-text-muted text-sm">
                            No results found for "<span className="text-text-secondary">{query}</span>"
                        </div>
                    )}

                    {query.length < 2 && (
                        <div className="py-8 text-center">
                            <Search className="w-8 h-8 text-text-muted/30 mx-auto mb-2" />
                            <p className="text-text-muted text-sm">Type at least 2 characters to search</p>
                            <p className="text-text-muted/60 text-xs mt-1 mono">Files · Artifacts · Events · Notes · Tags</p>
                        </div>
                    )}

                    {Object.entries(grouped).map(([type, items]) => {
                        const Icon = ENTITY_ICONS[type] || File;
                        const color = ENTITY_COLORS[type];
                        const bg = ENTITY_BG[type];
                        return (
                            <div key={type}>
                                <div className="px-4 py-1.5 flex items-center gap-2 border-b" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                                    <Icon className={`w-3 h-3 ${color}`} />
                                    <span className={`text-[10px] mono font-bold uppercase tracking-widest ${color}`}>{type}</span>
                                    <span className="ml-auto text-[10px] mono text-text-muted">{items.length} results</span>
                                </div>
                                {items.map((result) => {
                                    const flatIdx = results.indexOf(result);
                                    const isSelected = flatIdx === selectedIdx;
                                    return (
                                        <button
                                            key={result.entityId}
                                            onClick={() => navigateTo(result)}
                                            onMouseEnter={() => setSelectedIdx(flatIdx)}
                                            className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-b ${isSelected ? '' : 'hover:bg-bg-elevated'}`}
                                            style={{
                                                borderColor: 'var(--border)',
                                                background: isSelected ? 'var(--bg-elevated)' : undefined,
                                            }}
                                        >
                                            <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${bg}`}>
                                                <Icon className={`w-3.5 h-3.5 ${color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-text-primary font-medium truncate">{result.title}</div>
                                                <div className="text-xs text-text-muted truncate mt-0.5 mono">{result.snippet}</div>
                                            </div>
                                            {isSelected && (
                                                <span className="text-[9px] mono text-text-muted border border-bg-border rounded px-1 py-0.5 self-center flex-shrink-0">↵</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {/* Footer hint */}
                {results.length > 0 && (
                    <div className="px-4 py-2 flex items-center gap-4 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                        <span className="text-[10px] mono text-text-muted">↑↓ navigate</span>
                        <span className="text-[10px] mono text-text-muted">↵ open</span>
                        <span className="text-[10px] mono text-text-muted">Esc close</span>
                        <span className="ml-auto text-[10px] mono text-text-muted">{results.length} total results</span>
                    </div>
                )}
            </div>
        </div>
    );
}
