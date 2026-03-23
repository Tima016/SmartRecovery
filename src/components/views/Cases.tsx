import { useState, useEffect } from 'react';
import {
    Plus,
    Search,
    Filter,
    MoreHorizontal,
    Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { casesApi } from '../../api/cases.api';
import { Skeleton } from '../ui/Skeleton';

// ─── Types ────────────────────────────────────────────────────────────
interface Case {
    id: string;
    caseNumber?: string;
    name?: string;
    title?: string;
    investigator?: string;
    createdBy?: { firstName?: string; lastName?: string };
    createdAt?: string;
    date?: string;
    status: string;
    priority?: string;
    tags?: string[];
    hash?: string;
    evidenceCount?: number;
    files?: number;
}

const priorityColor: Record<string, string> = {
    CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
    HIGH: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    MEDIUM: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    LOW: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const statusDot: Record<string, string> = {
    CREATED: 'info',
    IMAGING: 'warn',
    HASHING: 'warn',
    SCANNING: 'warn',
    ANALYZING: 'warn',
    READY: 'ok',
    ERROR: 'error',
    CLOSED: 'info',
    ARCHIVED: 'info',
};

const statusText: Record<string, string> = {
    CREATED: 'text-[#3D7EBF]',
    IMAGING: 'text-[#D97706]',
    HASHING: 'text-[#D97706]',
    SCANNING: 'text-[#D97706]',
    ANALYZING: 'text-[#D97706]',
    READY: 'text-[#00C896]',
    ERROR: 'text-[#C0392B]',
    CLOSED: 'text-[#6B7280]',
    ARCHIVED: 'text-[#6B7280]',
};

export default function Cases() {
    const navigate = useNavigate();
    const [cases, setCases] = useState<Case[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchCases = async () => {
            try {
                const data = await casesApi.getAll();
                if (cancelled) return;
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                setCases(list);
            } catch (err: unknown) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cases');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchCases();
        return () => { cancelled = true; };
    }, []);

    const getCaseDisplayId = (c: Case) => c.caseNumber ?? c.id;
    const getCaseName = (c: Case) => c.name ?? c.title ?? 'Untitled Case';
    const getCaseInvestigator = (c: Case) =>
        c.investigator ?? (c.createdBy ? `${c.createdBy.firstName ?? ''} ${c.createdBy.lastName ?? ''}`.trim() : '—');
    const getCasePriority = (c: Case) => (c.priority ?? 'MEDIUM').toUpperCase();
    const getCaseStatus = (c: Case) => (c.status ?? 'OPEN').toUpperCase();

    const filtered = cases.filter(c => {
        const q = search.toLowerCase();
        return getCaseName(c).toLowerCase().includes(q) || getCaseDisplayId(c).toLowerCase().includes(q);
    });

    const handleNewCase = async () => {
        try {
            setIsCreating(true);

            const data = await casesApi.create({
                title: 'New Investigation'
            });

            const newCaseId = data?.id ?? data?.data?.id;

            if (!newCaseId) {
                throw new Error('No ID returned');
            }

            navigate(`/cases/${newCaseId}`);

        } catch (err: any) {
            console.error(err?.response?.data || err);
            alert(JSON.stringify(err?.response?.data || err.message));
        } finally {
            setIsCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center">
                <div className="flex flex-col w-full max-w-5xl h-full border-r border-l border-bg-border bg-bg-primary">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-border flex-shrink-0">
                        <Skeleton className="flex-1 h-8" />
                        <Skeleton className="w-20 h-8" />
                        <Skeleton className="w-24 h-8" />
                    </div>
                    <div className="grid gap-2 px-4 py-2 bg-bg-elevated border-b border-bg-border">
                        <Skeleton className="h-4 w-full" />
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="flex gap-4 px-4 py-3">
                                <Skeleton className="w-1/4 h-5" />
                                <Skeleton className="flex-1 h-5" />
                                <Skeleton className="w-32 h-5" />
                                <Skeleton className="w-20 h-5" />
                                <Skeleton className="w-16 h-5" />
                            </div>
                        ))}
                    </div>
                </div>
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
        <div className="h-full flex flex-col items-center">
            {/* Full Width Case Table */}
            <div className="flex flex-col w-full max-w-5xl h-full border-r border-l border-bg-border bg-bg-primary">
                {/* Toolbar */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-border flex-shrink-0">
                    <div className="flex items-center gap-2 flex-1 bg-bg-elevated border border-bg-border rounded-sm px-3 py-1.5">
                        <Search className="w-3.5 h-3.5 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Search cases..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="flex-1 bg-transparent text-text-primary text-xs outline-none placeholder-text-muted mono"
                        />
                    </div>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs hover:text-text-primary transition-colors rounded-sm">
                        <Filter className="w-3.5 h-3.5" />
                        Filter
                    </button>
                    <button
                        onClick={handleNewCase}
                        disabled={isCreating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan text-xs hover:bg-accent-cyan/20 transition-colors rounded-sm disabled:opacity-50"
                    >
                        {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        New Case
                    </button>
                </div>

                {/* Table Header */}
                <div className="grid gap-2 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide"
                    style={{ gridTemplateColumns: '1.2fr 2.2fr 1fr 0.8fr 0.7fr 32px' }}>
                    <span>Case ID</span>
                    <span>Name</span>
                    <span>Investigator</span>
                    <span>Status</span>
                    <span>Priority</span>
                    <span />
                </div>

                {/* Rows */}
                <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                    {filtered.length > 0 ? filtered.map(c => {
                        const status = getCaseStatus(c);
                        const priority = getCasePriority(c);
                        return (
                            <div
                                key={c.id}
                                onClick={() => navigate(`/cases/${c.id}`)}
                                className="grid gap-2 px-4 py-2.5 cursor-pointer transition-all items-center table-row-hover border-l-2 border-transparent hover:border-accent-cyan"
                                style={{ gridTemplateColumns: '1.2fr 2.2fr 1fr 0.8fr 0.7fr 32px' }}
                            >
                                <span className="text-accent-cyan text-[11px] mono font-medium truncate">{getCaseDisplayId(c)}</span>
                                <span className="text-text-primary text-xs truncate">{getCaseName(c)}</span>
                                <span className="text-text-secondary text-xs truncate">{getCaseInvestigator(c)}</span>
                                <div className="flex items-center gap-1.5">
                                    <span className={`status-dot ${statusDot[status] ?? 'info'}`} />
                                    <span className={`text-[10px] mono ${statusText[status] ?? 'text-text-muted'}`}>{status}</span>
                                </div>
                                <span className={`tag border text-[9px] self-start ${priorityColor[priority] ?? priorityColor.MEDIUM}`}>{priority}</span>
                                <button className="text-text-muted hover:text-text-secondary">
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        );
                    }) : (
                        <div className="px-4 py-8 text-center text-text-muted text-xs mono">
                            {search ? 'No cases match your search' : 'No cases found'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
