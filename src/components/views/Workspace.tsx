import { useState, useEffect } from 'react';
import {
    Bookmark, Trash2, FileText, Clock, Microscope, File, Edit3,
    Check, X, Briefcase, HardDrive,
} from 'lucide-react';
import { workspaceApi, type Bookmark as BookmarkType } from '../../api/workspace.api';
import { casesApi } from '../../api/cases.api';
import { evidenceApi } from '../../api/evidence.api';
import toast from 'react-hot-toast';

const ENTITY_ICONS: Record<string, React.ElementType> = {
    FILE: File,
    ARTIFACT: Microscope,
    TIMELINE: Clock,
    EVIDENCE: Briefcase,
    CASE: FileText,
};

const SEVERITY_COLORS: Record<string, string> = {
    FILE: 'border-l-accent-cyan',
    ARTIFACT: 'border-l-purple-400',
    TIMELINE: 'border-l-amber-400',
    EVIDENCE: 'border-l-green-400',
    CASE: 'border-l-blue-400',
};

const TABS = ['ALL', 'FILE', 'ARTIFACT', 'TIMELINE', 'EVIDENCE', 'CASE'] as const;

function bytesToHuman(bytes: number | string): string {
    const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(n)) return '—';
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TB`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
    return `${(n / 1e3).toFixed(1)} KB`;
}

function EditableNote({ note, onSave }: { note?: string; onSave: (n: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(note ?? '');

    return editing ? (
        <div className="flex items-start gap-2 mt-2">
            <textarea
                value={val}
                onChange={e => setVal(e.target.value)}
                rows={2}
                className="flex-1 text-xs rounded px-2 py-1 border outline-none resize-none"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                autoFocus
            />
            <button onClick={() => { setEditing(false); onSave(val); }} className="p-1 text-green-400 hover:text-green-300">
                <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setEditing(false); setVal(note ?? ''); }} className="p-1 text-red-400 hover:text-red-300">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    ) : (
        <button
            onClick={() => setEditing(true)}
            className="mt-2 flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors group"
        >
            <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            {note ? <span className="truncate text-text-muted">{note}</span> : <span className="italic">Add investigation note...</span>}
        </button>
    );
}

export default function Workspace() {
    const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<string>('ALL');

    const [recentCases, setRecentCases] = useState<any[]>([]);
    const [recentEvidence, setRecentEvidence] = useState<any[]>([]);

    useEffect(() => {
        fetchWorkspaceData();
    }, []);

    async function fetchWorkspaceData() {
        try {
            setLoading(true);
            const [bookmarkRes, casesRes] = await Promise.allSettled([
                workspaceApi.getBookmarks(),
                casesApi.getAll(),
            ]);

            if (bookmarkRes.status === 'fulfilled') {
                setBookmarks(bookmarkRes.value);
            } else {
                toast.error('Failed to load bookmarks');
            }

            if (casesRes.status === 'fulfilled') {
                const c = Array.isArray(casesRes.value) ? casesRes.value : (casesRes.value?.data ?? []);
                setRecentCases(c.slice(0, 4));
            }

            const firstCaseId = casesRes.status === 'fulfilled'
                ? (Array.isArray(casesRes.value) ? casesRes.value?.[0]?.id : casesRes.value?.data?.[0]?.id)
                : undefined;

            if (firstCaseId) {
                const ev = await evidenceApi.getByCaseId(firstCaseId);
                const list = Array.isArray(ev) ? ev : (ev?.data ?? []);
                setRecentEvidence(list.slice(0, 6));
            }
        } catch {
            toast.error('Failed to load workspace data');
        } finally {
            setLoading(false);
        }
    }

    async function handleRemove(id: string) {
        try {
            await workspaceApi.removeBookmark(id);
            setBookmarks(prev => prev.filter(b => b.id !== id));
            toast.success('Bookmark removed');
        } catch {
            toast.error('Failed to remove bookmark');
        }
    }

    async function handleNoteUpdate(id: string, note: string) {
        try {
            const updated = await workspaceApi.updateNote(id, note);
            setBookmarks(prev => prev.map(b => b.id === id ? { ...b, note: updated.note } : b));
        } catch {
            toast.error('Failed to save note');
        }
    }

    const filtered = activeTab === 'ALL' ? bookmarks : bookmarks.filter(b => b.entityType === activeTab);
    const countByType = bookmarks.reduce<Record<string, number>>((acc, b) => {
        acc[b.entityType] = (acc[b.entityType] ?? 0) + 1;
        return acc;
    }, {});

    return (
        <div className="flex flex-col h-full p-6 gap-6">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-accent-cyan" />
                </div>
                <div>
                    <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Investigation Workspace</h1>
                    <p className="text-xs mono" style={{ color: 'var(--text-muted)' }}>
                        {bookmarks.length} bookmarked item{bookmarks.length !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-1 border-b pb-0" style={{ borderColor: 'var(--border)' }}>
                {TABS.map(tab => {
                    const count = tab === 'ALL' ? bookmarks.length : (countByType[tab] ?? 0);
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-2 text-xs mono font-medium border-b-2 transition-colors -mb-px ${activeTab === tab
                                ? 'border-accent-cyan text-accent-cyan'
                                : 'border-transparent text-text-muted hover:text-text-secondary'
                                }`}
                        >
                            {tab} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-accent-cyan/20 border-t-accent-cyan rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex-1 grid grid-cols-2 gap-4 auto-rows-min">
                    <div className="rounded-lg border border-bg-border p-5 bg-bg-panel">
                        <div className="flex items-center gap-2 mb-2">
                            <Bookmark className="w-4 h-4 text-accent-cyan" />
                            <h3 className="text-text-primary text-sm font-semibold">No bookmarks yet</h3>
                        </div>
                        <p className="text-text-muted text-xs leading-relaxed">
                            Files, timeline events and artifacts that you bookmark will appear here.
                        </p>
                    </div>

                    <div className="rounded-lg border border-bg-border p-5 bg-bg-panel">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-accent-cyan" />
                            <h3 className="text-text-primary text-sm font-semibold">Recent Cases</h3>
                        </div>
                        <div className="space-y-1.5">
                            {recentCases.length > 0 ? recentCases.map((c: any) => (
                                <div key={c.id} className="text-xs mono text-text-secondary truncate">
                                    {c.caseNumber ?? c.id} · {c.title ?? 'Untitled Case'}
                                </div>
                            )) : <div className="text-xs mono text-text-muted">No case data available</div>}
                        </div>
                    </div>

                    <div className="col-span-2 rounded-lg border border-bg-border p-5 bg-bg-panel">
                        <div className="flex items-center gap-2 mb-2">
                            <HardDrive className="w-4 h-4 text-accent-cyan" />
                            <h3 className="text-text-primary text-sm font-semibold">Recent Evidence</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {recentEvidence.length > 0 ? recentEvidence.map((e: any) => (
                                <div key={e.id} className="rounded border border-bg-border bg-bg-elevated/40 px-3 py-2">
                                    <div className="text-xs mono text-text-primary truncate">{e.originalFilename ?? e.name}</div>
                                    <div className="text-[10px] mono text-text-muted">{bytesToHuman(e.sizeBytes ?? 0)}</div>
                                </div>
                            )) : <div className="text-xs mono text-text-muted">No evidence data available</div>}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto grid gap-3 auto-rows-min">
                    {filtered.map(b => {
                        const Icon = ENTITY_ICONS[b.entityType] ?? Bookmark;
                        const borderColor = SEVERITY_COLORS[b.entityType] ?? 'border-l-text-muted';
                        return (
                            <div
                                key={b.id}
                                className={`rounded-lg border border-l-4 p-4 transition-all hover:shadow-lg ${borderColor}`}
                                style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-md bg-bg-elevated border border-bg-border flex items-center justify-center flex-shrink-0">
                                        <Icon className="w-4 h-4 text-text-muted" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-[10px] mono font-bold uppercase tracking-widest text-text-muted">{b.entityType}</span>
                                        </div>
                                        <div className="text-sm font-medium text-text-primary truncate font-mono">{b.entityId}</div>
                                        <EditableNote note={b.note} onSave={note => handleNoteUpdate(b.id, note)} />
                                        <div className="text-[10px] mono text-text-muted mt-1">
                                            Bookmarked {new Date(b.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemove(b.id)}
                                        className="p-1.5 rounded text-text-muted hover:text-status-error hover:bg-status-error/10 transition-colors flex-shrink-0"
                                        title="Remove bookmark"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
