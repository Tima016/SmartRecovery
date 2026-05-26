import { useEffect, useMemo, useState } from 'react';
import {
    Filter,
    Search,
    Download,
    ChevronUp,
    ChevronDown,
    Activity,
    Loader2,
    Eye,
    X,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { BarChart, Bar, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { recoveryApi } from '../../api/recovery.api';
import { TOKEN_KEY } from '../../api/client';
import { useCase } from '../../context/CaseContext';

interface RecoveredFile {
    id: string;
    name: string;
    path: string;
    size: string;
    sizeBytes: number;
    type: string;
    mimeType?: string;
    status: string;
    method: string;
    hasValidHeader?: boolean;
    hasValidFooter?: boolean;
    byteContinuityOk?: boolean;
    prob: number;
    entropy: number;
    deleted: string;
}

type SortKey = 'name' | 'size' | 'prob';
type PreviewMode = 'text' | 'image' | 'hex';

const probColor = (p: number) => p >= 90 ? '#00C896' : p >= 60 ? '#D97706' : '#C0392B';
const statusColor: Record<string, string> = {
    COMPLETED: 'bg-status-ok/15 text-status-ok border-status-ok/30',
    RECOVERED: 'bg-status-ok/15 text-status-ok border-status-ok/30',
    PARTIAL: 'bg-status-warn/15 text-status-warn border-status-warn/30',
    IN_PROGRESS: 'bg-status-info/15 text-status-info border-status-info/30',
    FAILED: 'bg-status-error/15 text-status-error border-status-error/30',
    OVERWRITTEN: 'bg-status-error/15 text-status-error border-status-error/30',
};

const imageMimePrefixes = ['image/'];
const textMimeSubstrings = ['text/', 'json', 'xml', 'javascript', 'csv'];

const toHexPreview = (bytes: Uint8Array, rows = 80) => {
    const lines: string[] = [];
    const perRow = 16;
    const maxLen = Math.min(bytes.length, rows * perRow);

    for (let i = 0; i < maxLen; i += perRow) {
        const chunk = bytes.slice(i, i + perRow);
        const offset = i.toString(16).padStart(8, '0');
        const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
        const ascii = Array.from(chunk).map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
        lines.push(`${offset}  ${hex}  ${ascii}`);
    }

    if (bytes.length > maxLen) {
        lines.push('... truncated ...');
    }

    return lines.join('\n');
};

const formatBytes = (size: number) => {
    if (!Number.isFinite(size) || size < 0) return 'N/A';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const isIntegrityGood = (f: RecoveredFile) =>
    Boolean(f.hasValidHeader) && Boolean(f.byteContinuityOk) && (Boolean(f.hasValidFooter) || f.method === 'METADATA');

export default function RecoveryEngine() {
    const { caseId: urlCaseId } = useParams<{ caseId: string }>();
    const { selectedCaseId, setSelectedCaseId } = useCase();
    const effectiveCaseId = urlCaseId || selectedCaseId;

    const [files, setFiles] = useState<RecoveredFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('prob');
    const [sortDesc, setSortDesc] = useState(true);
    const [scanMode, setScanMode] = useState<'metadata' | 'deep'>('deep');

    const [selectedFile, setSelectedFile] = useState<RecoveredFile | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [previewWarning, setPreviewWarning] = useState('');
    const [previewType, setPreviewType] = useState<PreviewMode>('text');
    const [previewContent, setPreviewContent] = useState('');
    const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        if (urlCaseId && urlCaseId !== selectedCaseId) {
            setSelectedCaseId(urlCaseId);
        }
    }, [urlCaseId, selectedCaseId, setSelectedCaseId]);

    useEffect(() => {
        let cancelled = false;

        const fetchRecovery = async () => {
            if (!effectiveCaseId) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError('');
                const data = await recoveryApi.getFiles(effectiveCaseId);
                if (cancelled) return;
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                const mapped: RecoveredFile[] = list.map((f: any) => {
                    const rawSize = Number(f.sizeBytes ?? f.fileSize ?? f.size ?? 0);
                    return {
                        id: f.id,
                        name: f.name ?? f.filename ?? 'unknown',
                        path: f.path ?? f.filePath ?? '/',
                        size: formatBytes(rawSize),
                        sizeBytes: Number.isFinite(rawSize) ? rawSize : 0,
                        type: f.type ?? f.extension ?? (f.filename?.split('.').pop() ?? ''),
                        mimeType: f.mimeType,
                        status: String(f.status ?? 'COMPLETED').toUpperCase(),
                        method: String(f.method ?? 'UNKNOWN').toUpperCase(),
                        hasValidHeader: Boolean(f.hasValidHeader),
                        hasValidFooter: Boolean(f.hasValidFooter),
                        byteContinuityOk: Boolean(f.byteContinuityOk),
                        prob: Number(f.probability ?? f.prob ?? f.confidence ?? 0),
                        entropy: Number(f.entropy ?? f.entropyScore ?? 0),
                        deleted: f.deletedAt ?? f.recoveredAt ?? f.deleted ?? 'N/A',
                    };
                });
                setFiles(mapped);
                setSelectedFile((prev) => prev ? mapped.find((f) => f.id === prev.id) ?? null : null);
            } catch (err: unknown) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load recovery data');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchRecovery();
        return () => { cancelled = true; };
    }, [effectiveCaseId]);

    useEffect(() => {
        return () => {
            if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
        };
    }, [previewBlobUrl]);

    const sorted = useMemo(() => [...files]
        .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()) || f.path.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
            const av = sortKey === 'prob' ? a.prob : sortKey === 'name' ? a.name.toLowerCase() : a.sizeBytes;
            const bv = sortKey === 'prob' ? b.prob : sortKey === 'name' ? b.name.toLowerCase() : b.sizeBytes;
            if (av === bv) return 0;
            return sortDesc ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
        }), [files, search, sortKey, sortDesc]);

    const entropyData = files.map((f, i) => ({ name: f.name.split('.')[0].slice(0, 6), entropy: f.entropy, i }));

    const toggle = (k: SortKey) => {
        if (sortKey === k) setSortDesc((d) => !d);
        else { setSortKey(k); setSortDesc(true); }
    };

    const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
        ? (sortDesc ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
        : null;

    const openPreview = async (file: RecoveredFile) => {
        if (!effectiveCaseId) return;
        if (previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl);
            setPreviewBlobUrl(null);
        }

        setPreviewOpen(true);
        setPreviewLoading(true);
        setPreviewError('');
        setPreviewWarning('');
        setPreviewContent('');
        setPreviewType('text');

        try {
            const token = localStorage.getItem(TOKEN_KEY);
            const response = await fetch(recoveryApi.getPreviewUrl(effectiveCaseId, file.id), {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!response.ok) throw new Error('Preview fetch failed');

            const warningHeader = response.headers.get('x-recovery-warning');
            if (warningHeader) setPreviewWarning(warningHeader);

            const contentType = (response.headers.get('content-type') || file.mimeType || '').toLowerCase();
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            if (imageMimePrefixes.some((p) => contentType.startsWith(p))) {
                const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' });
                const objectUrl = URL.createObjectURL(blob);
                setPreviewBlobUrl(objectUrl);
                setPreviewType('image');
            } else if (textMimeSubstrings.some((p) => contentType.includes(p))) {
                setPreviewContent(new TextDecoder().decode(bytes));
                setPreviewType('text');
            } else {
                setPreviewContent(toHexPreview(bytes));
                setPreviewType('hex');
            }
        } catch (err: any) {
            setPreviewError(err?.message || 'Failed to open preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const downloadFile = async (file: RecoveredFile) => {
        if (!effectiveCaseId) return;
        try {
            const token = localStorage.getItem(TOKEN_KEY);
            const response = await fetch(recoveryApi.getDownloadUrl(effectiveCaseId, file.id), {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!response.ok) throw new Error('Download failed');
            const warningHeader = response.headers.get('x-recovery-warning');
            if (warningHeader) {
                setError(warningHeader);
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            setError('Recovered file download failed');
        }
    };

    if (!effectiveCaseId) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4 p-4 overflow-y-auto min-h-[400px]">
                <h2 className="text-xl font-bold text-text-primary mono">No Case Selected</h2>
                <p className="text-text-muted text-sm mono">Please select a case to view recovery data</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    if (error && files.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-status-error text-sm mono">{error}</div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4 relative">
            {previewOpen && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-5xl h-[82vh] bg-bg-primary border border-bg-border rounded-sm overflow-hidden flex flex-col">
                        <div className="px-4 py-2 border-b border-bg-border bg-bg-elevated flex items-center justify-between">
                            <div className="text-xs mono text-text-primary truncate pr-4">{selectedFile?.name ?? 'Recovered File Preview'}</div>
                            <button onClick={() => setPreviewOpen(false)} className="p-1.5 border border-bg-border rounded-sm text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            {previewLoading && <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 text-accent-cyan animate-spin" /></div>}
                            {!previewLoading && previewError && <div className="text-status-error text-sm mono">{previewError}</div>}
                            {!previewLoading && !previewError && previewWarning && (
                                <div className="mb-3 p-2 text-[11px] mono border border-status-warn/40 text-status-warn bg-status-warn/10 rounded-sm">{previewWarning}</div>
                            )}
                            {!previewLoading && !previewError && previewType === 'image' && previewBlobUrl && (
                                <div className="h-full flex items-center justify-center"><img src={previewBlobUrl} alt="preview" className="max-w-full max-h-full object-contain" /></div>
                            )}
                            {!previewLoading && !previewError && previewType !== 'image' && (
                                <pre className="text-[11px] mono text-text-primary leading-relaxed whitespace-pre-wrap break-all">{previewContent}</pre>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 bg-bg-elevated border border-bg-border rounded-sm px-3 py-1.5">
                    <Search className="w-3.5 h-3.5 text-text-muted" />
                    <input type="text" placeholder="Filter by filename or path..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent text-text-primary text-xs outline-none placeholder-text-muted mono" />
                </div>
                <div className="flex items-center gap-1">
                    {(['metadata', 'deep'] as const).map((mode) => (
                        <button key={mode} onClick={() => setScanMode(mode)} className={`px-3 py-1.5 text-xs mono border transition-colors rounded-sm ${scanMode === mode ? 'bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan' : 'border-bg-border text-text-muted hover:text-text-secondary'}`}>
                            {mode === 'metadata' ? 'Metadata Scan' : 'Deep Scan'}
                        </button>
                    ))}
                </div>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs hover:text-text-primary transition-colors rounded-sm"><Filter className="w-3.5 h-3.5" />Filter</button>
                {selectedFile && (
                    <button onClick={() => downloadFile(selectedFile)} className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs hover:text-text-primary transition-colors rounded-sm"><Download className="w-3.5 h-3.5" />Download Selected</button>
                )}
            </div>

            {error && <div className="text-status-warn text-[11px] mono">{error}</div>}

            <div className="grid grid-cols-4 gap-3 mb-1">
                {[
                    { label: 'Total Found', value: files.length, color: 'text-accent-cyan' },
                    { label: 'Recoverable', value: files.filter((f) => f.prob >= 90).length, color: 'text-status-ok' },
                    { label: 'Partial', value: files.filter((f) => f.prob >= 50 && f.prob < 90).length, color: 'text-status-warn' },
                    { label: 'Low Confidence', value: files.filter((f) => f.prob < 50).length, color: 'text-status-error' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="glass-panel rounded-sm p-3 flex items-center justify-between">
                        <span className="text-text-muted text-[10px] mono">{label}</span>
                        <span className={`${color} mono font-bold`}>{value}</span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3 glass-panel rounded-sm overflow-hidden">
                    <div className="grid grid-cols-[1.8fr_1.8fr_0.7fr_0.7fr_0.9fr_0.9fr_0.8fr_1fr] gap-2 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide">
                        <button className="flex items-center gap-1 text-left hover:text-text-secondary" onClick={() => toggle('name')}>Filename <SortIcon k="name" /></button>
                        <span>Path</span>
                        <button className="flex items-center gap-1" onClick={() => toggle('size')}>Size <SortIcon k="size" /></button>
                        <span>Status</span>
                        <span>Integrity</span>
                        <button className="flex items-center gap-1" onClick={() => toggle('prob')}>Recovery % <SortIcon k="prob" /></button>
                        <span>Method</span>
                        <span>Actions</span>
                    </div>
                    <div className="divide-y divide-bg-border/30 max-h-[340px] overflow-y-auto">
                        {sorted.length > 0 ? sorted.map((f) => (
                            <div key={f.id} className={`grid grid-cols-[1.8fr_1.8fr_0.7fr_0.7fr_0.9fr_0.9fr_0.8fr_1fr] gap-2 px-4 py-2 items-center cursor-pointer ${selectedFile?.id === f.id ? 'bg-accent-cyan/8' : 'table-row-hover'}`} onClick={() => setSelectedFile(f)}>
                                <span className="text-text-primary text-[11px] mono font-medium truncate">{f.name}</span>
                                <span className="text-text-muted text-[10px] mono truncate">{f.path}</span>
                                <span className="text-text-secondary text-[10px] mono">{f.size}</span>
                                <span className={`tag border text-[9px] self-center ${statusColor[f.status] ?? statusColor.PARTIAL}`}>{f.status}</span>
                                <span className={`text-[9px] mono ${isIntegrityGood(f) ? 'text-status-ok' : 'text-status-warn'}`}>{isIntegrityGood(f) ? 'Verified' : 'Risky'}</span>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-bg-elevated rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${f.prob}%`, background: probColor(f.prob) }} /></div>
                                    <span className="text-[10px] mono" style={{ color: probColor(f.prob) }}>{f.prob}%</span>
                                </div>
                                <span className="text-text-muted text-[9px] mono">{f.method}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedFile(f); void openPreview(f); }} className="px-2 py-1 text-[10px] mono border border-bg-border rounded-sm hover:text-text-primary text-text-muted flex items-center gap-1"><Eye className="w-3 h-3" />View</button>
                                    <button onClick={(e) => { e.stopPropagation(); void downloadFile(f); }} className="px-2 py-1 text-[10px] mono border border-bg-border rounded-sm hover:text-text-primary text-text-muted flex items-center gap-1"><Download className="w-3 h-3" />Save</button>
                                </div>
                            </div>
                        )) : (
                            <div className="px-4 py-6 text-center text-text-muted text-xs mono">No recovered files found</div>
                        )}
                    </div>
                </div>

                <div className="glass-panel rounded-sm p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-3"><Activity className="w-3.5 h-3.5 text-accent-cyan" /><span className="text-text-primary text-xs font-semibold">Entropy Profile</span></div>
                    {entropyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={entropyData} layout="vertical" margin={{ left: 0, right: 8 }}>
                                <Tooltip contentStyle={{ background: '#1D2128', border: '1px solid #23262E', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB', borderRadius: 2 }} />
                                <Bar dataKey="entropy" radius={1} maxBarSize={12}>{entropyData.map((d) => <Cell key={d.i} fill={d.entropy >= 7 ? '#C0392B' : d.entropy >= 5.5 ? '#D97706' : '#00C896'} />)}</Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="flex-1 flex items-center justify-center text-text-muted text-xs mono">No entropy data</div>}
                    <div className="mt-2 space-y-1 text-[9px] mono">
                        <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-status-error rounded-sm" /> High (&gt;7)</div>
                        <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-status-warn rounded-sm" /> Medium (5.5-7)</div>
                        <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-accent-cyan rounded-sm" /> Low (&lt;5.5)</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
