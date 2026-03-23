import { useState, useEffect } from 'react';
import {
    Filter,
    Search,
    Download,
    ChevronUp,
    ChevronDown,
    Activity,
    Loader2,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { BarChart, Bar, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { recoveryApi } from '../../api/recovery.api';

// ─── Types ────────────────────────────────────────────────────────────
interface RecoveredFile {
    name: string;
    path: string;
    size: string;
    type: string;
    status: string;
    prob: number;
    entropy: number;
    deleted: string;
}

const probColor = (p: number) => p >= 90 ? '#00C896' : p >= 60 ? '#D97706' : '#C0392B';
const statusColor: Record<string, string> = {
    RECOVERED: 'bg-status-ok/15 text-status-ok border-status-ok/30',
    PARTIAL: 'bg-status-warn/15 text-status-warn border-status-warn/30',
    OVERWRITTEN: 'bg-status-error/15 text-status-error border-status-error/30',
};

type SortKey = 'name' | 'size' | 'prob';

export default function RecoveryEngine() {
    const { caseId } = useParams<{ caseId: string }>();
    const [files, setFiles] = useState<RecoveredFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('prob');
    const [sortDesc, setSortDesc] = useState(true);
    const [scanMode, setScanMode] = useState<'metadata' | 'deep'>('deep');

    useEffect(() => {
        let cancelled = false;

        const fetchRecovery = async () => {
            if (!caseId) {
                // No case selected — load empty state
                setLoading(false);
                return;
            }

            try {
                const data = await recoveryApi.getFiles(caseId);
                if (cancelled) return;
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                const mapped: RecoveredFile[] = list.map((f: any) => ({
                    name: f.name ?? f.filename ?? 'unknown',
                    path: f.path ?? f.filePath ?? '/',
                    size: f.size ?? f.fileSize ?? '—',
                    type: f.type ?? f.extension ?? (f.name?.split('.').pop() ?? ''),
                    status: (f.status ?? 'RECOVERED').toUpperCase(),
                    prob: f.probability ?? f.prob ?? f.confidence ?? 0,
                    entropy: f.entropy ?? 0,
                    deleted: f.deletedAt ?? f.deleted ?? '—',
                }));
                setFiles(mapped);
            } catch (err: unknown) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load recovery data');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchRecovery();
        return () => { cancelled = true; };
    }, [caseId]);

    const sorted = [...files]
        .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.path.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
            const av = sortKey === 'prob' ? a.prob : sortKey === 'name' ? a.name : a.size;
            const bv = sortKey === 'prob' ? b.prob : sortKey === 'name' ? b.name : b.size;
            return sortDesc ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
        });

    const entropyData = files.map((f, i) => ({ name: f.name.split('.')[0].slice(0, 6), entropy: f.entropy, i }));

    const toggle = (k: SortKey) => {
        if (sortKey === k) setSortDesc(d => !d);
        else { setSortKey(k); setSortDesc(true); }
    };

    const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
        ? (sortDesc ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
        : null;

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center text-status-error text-sm mono">
                {error}
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Top controls */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 bg-bg-elevated border border-bg-border rounded-sm px-3 py-1.5">
                    <Search className="w-3.5 h-3.5 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Filter by filename or path..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="flex-1 bg-transparent text-text-primary text-xs outline-none placeholder-text-muted mono"
                    />
                </div>
                <div className="flex items-center gap-1">
                    {(['metadata', 'deep'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setScanMode(mode)}
                            className={`px-3 py-1.5 text-xs mono border transition-colors rounded-sm ${scanMode === mode
                                ? 'bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan'
                                : 'border-bg-border text-text-muted hover:text-text-secondary'
                                }`}
                        >
                            {mode === 'metadata' ? 'Metadata Scan' : 'Deep Scan'}
                        </button>
                    ))}
                </div>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs hover:text-text-primary transition-colors rounded-sm">
                    <Filter className="w-3.5 h-3.5" />
                    Filter
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs hover:text-text-primary transition-colors rounded-sm">
                    <Download className="w-3.5 h-3.5" />
                    Export
                </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-1">
                {[
                    { label: 'Total Found', value: files.length, color: 'text-accent-cyan' },
                    { label: 'Recoverable', value: files.filter(f => f.prob >= 90).length, color: 'text-status-ok' },
                    { label: 'Partial', value: files.filter(f => f.prob >= 50 && f.prob < 90).length, color: 'text-status-warn' },
                    { label: 'Overwritten', value: files.filter(f => f.prob < 50).length, color: 'text-status-error' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="glass-panel rounded-sm p-3 flex items-center justify-between">
                        <span className="text-text-muted text-[10px] mono">{label}</span>
                        <span className={`${color} mono font-bold`}>{value}</span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-4 gap-4">
                {/* Table */}
                <div className="col-span-3 glass-panel rounded-sm overflow-hidden">
                    <div className="grid grid-cols-[2fr_2fr_0.6fr_0.8fr_0.9fr_0.7fr] gap-2 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide">
                        <button className="flex items-center gap-1 text-left hover:text-text-secondary" onClick={() => toggle('name')}>
                            Filename <SortIcon k="name" />
                        </button>
                        <span>Path</span>
                        <button className="flex items-center gap-1" onClick={() => toggle('size')}>
                            Size <SortIcon k="size" />
                        </button>
                        <span>Status</span>
                        <button className="flex items-center gap-1" onClick={() => toggle('prob')}>
                            Recovery % <SortIcon k="prob" />
                        </button>
                        <span>Deleted</span>
                    </div>
                    <div className="divide-y divide-bg-border/30 max-h-[340px] overflow-y-auto">
                        {sorted.length > 0 ? sorted.map((f, i) => (
                            <div key={i} className="grid grid-cols-[2fr_2fr_0.6fr_0.8fr_0.9fr_0.7fr] gap-2 px-4 py-2 table-row-hover items-center">
                                <span className="text-text-primary text-[11px] mono font-medium truncate">{f.name}</span>
                                <span className="text-text-muted text-[10px] mono truncate">{f.path}</span>
                                <span className="text-text-secondary text-[10px] mono">{f.size}</span>
                                <span className={`tag border text-[9px] self-center ${statusColor[f.status] ?? statusColor.PARTIAL}`}>{f.status}</span>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-bg-elevated rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{ width: `${f.prob}%`, background: probColor(f.prob) }}
                                        />
                                    </div>
                                    <span className="text-[10px] mono" style={{ color: probColor(f.prob) }}>{f.prob}%</span>
                                </div>
                                <span className="text-text-muted text-[9px] mono">{f.deleted.split(' ')[0]}</span>
                            </div>
                        )) : (
                            <div className="px-4 py-6 text-center text-text-muted text-xs mono">No recovered files found</div>
                        )}
                    </div>
                </div>

                {/* Entropy Chart */}
                <div className="glass-panel rounded-sm p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Entropy Profile</span>
                    </div>
                    {entropyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={entropyData} layout="vertical" margin={{ left: 0, right: 8 }}>
                                <Tooltip
                                    contentStyle={{ background: '#1D2128', border: '1px solid #23262E', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB', borderRadius: 2 }}
                                />
                                <Bar dataKey="entropy" radius={1} maxBarSize={12}>
                                    {entropyData.map((d) => (
                                        <Cell
                                            key={d.i}
                                            fill={d.entropy >= 7 ? '#C0392B' : d.entropy >= 5.5 ? '#D97706' : '#00C896'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-text-muted text-xs mono">
                            No entropy data
                        </div>
                    )}
                    <div className="mt-2 space-y-1 text-[9px] mono">
                        <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-status-error rounded-sm" /> High (&gt;7)</div>
                        <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-status-warn rounded-sm" /> Medium (5.5–7)</div>
                        <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-accent-cyan rounded-sm" /> Low (&lt;5.5)</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
