import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    User,
    Calendar,
    Hash,
    Plus,
    Activity,
    Tag,
    HardDrive,
    Search,
    Clock,
    BarChart3,
    FolderTree,
    Shield
} from 'lucide-react';
import { casesApi } from '../../api/cases.api';
import { useSocket } from '../../context/SocketContext';
import { useCase } from '../../context/CaseContext';
import { Skeleton } from '../ui/Skeleton';
import NewCaseWizard from '../modals/NewCaseWizard';
interface CaseDetailsData {
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

export default function CaseDetails() {
    const { caseId } = useParams<{ caseId: string }>();
    const navigate = useNavigate();
    const [caseData, setCaseData] = useState<CaseDetailsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [wizardOpen, setWizardOpen] = useState(false);

    const { setSelectedCaseId } = useCase();
    const { socket, isConnected, joinCase, leaveCase } = useSocket();

    // Sync CaseContext so sidebar navigation works for case-scoped pages
    useEffect(() => {
        if (caseId) {
            setSelectedCaseId(caseId);
        }
    }, [caseId, setSelectedCaseId]);

    useEffect(() => {
        let cancelled = false;
        const fetchCaseData = async () => {
            if (!caseId) return;
            try {
                const data = await casesApi.getById(caseId);
                if (cancelled) return;
                setCaseData(data.data ?? data);
            } catch (err: unknown) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load case');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchCaseData();
        return () => { cancelled = true; };
    }, [caseId]);

    // WebSocket Real-time Reactivity
    useEffect(() => {
        if (!caseId || !socket || !isConnected) return;

        joinCase(caseId);

        socket.on('task.progress', (_data: { caseId: string, progress: number }) => {
            // Progress tracking available for future use
        });

        socket.on('phase.transition', (data: { caseId: string, newStatus: string }) => {
            if (data.caseId === caseId) {
                setCaseData(prev => prev ? { ...prev, status: data.newStatus } : null);
            }
        });

        socket.on('task.failed', (data: { caseId: string, error: string }) => {
            if (data.caseId === caseId) {
                setCaseData(prev => prev ? { ...prev, status: 'ERROR' } : null);
            }
        });

        return () => {
            socket.off('task.progress');
            socket.off('phase.transition');
            socket.off('task.failed');
            leaveCase(caseId);
        };
    }, [caseId, socket, isConnected]);

    if (loading) {
        return (
            <div className="h-full flex flex-col p-8 space-y-8 animate-in fade-in duration-500">
                <div className="flex items-start justify-between">
                    <div className="space-y-3 w-1/2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-8 w-3/4" />
                        <div className="flex gap-4 mt-4">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    </div>
                    <Skeleton className="h-10 w-32" />
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="glass-panel p-4 space-y-3">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-6 w-1/2" />
                        </div>
                    ))}
                </div>
                <div className="flex-1 glass-panel p-6">
                    <Skeleton className="h-4 w-1/4 mb-6" />
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (error || !caseData) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-status-error text-sm mono">
                <div>{error || 'Case not found'}</div>
                <button
                    onClick={() => navigate('/cases')}
                    className="mt-4 px-4 py-2 border border-bg-border rounded-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                    Back to Cases
                </button>
            </div>
        );
    }

    const getCaseDisplayId = (c: CaseDetailsData) => c.caseNumber ?? c.id;
    const getCaseName = (c: CaseDetailsData) => c.name ?? c.title ?? 'Untitled Case';
    const getCaseInvestigator = (c: CaseDetailsData) =>
        c.investigator ?? (c.createdBy ? `${c.createdBy.firstName ?? ''} ${c.createdBy.lastName ?? ''}`.trim() : '—');
    const getCaseDate = (c: CaseDetailsData) =>
        c.date ?? (c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '—');
    const getCasePriority = (c: CaseDetailsData) => (c.priority ?? 'MEDIUM').toUpperCase();
    const getCaseStatus = (c: CaseDetailsData) => (c.status ?? 'OPEN').toUpperCase();

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-5 h-5 text-accent-cyan" />
                        <span className="text-accent-cyan mono text-base font-bold tracking-wider">
                            {getCaseDisplayId(caseData)}
                        </span>
                    </div>
                    <h1 className="text-text-primary text-2xl font-bold tracking-tight">
                        {getCaseName(caseData)}
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`tag border ${priorityColor[getCasePriority(caseData)] ?? priorityColor.MEDIUM} px-2.5 py-1 text-xs`}>
                        {getCasePriority(caseData)}
                    </span>
                    <button
                        onClick={() => setWizardOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan text-xs hover:bg-accent-cyan/20 transition-colors rounded-sm"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Data Source
                    </button>
                    <button
                        onClick={() => navigate('/cases')}
                        className="px-4 py-1.5 border border-bg-border text-text-secondary hover:text-text-primary text-sm rounded-sm transition-colors"
                    >
                        Back to Cases
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { icon: User, label: 'Investigator', value: getCaseInvestigator(caseData) },
                    { icon: Calendar, label: 'Created', value: getCaseDate(caseData) },
                    { icon: Hash, label: 'Hash (SHA-256)', value: caseData.hash ?? 'Pending Scan...' },
                    { icon: Activity, label: 'Status', value: getCaseStatus(caseData) },
                ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Icon className="w-4 h-4 text-text-muted" />
                            <span className="text-text-muted text-xs mono uppercase tracking-wider">{label}</span>
                        </div>
                        <span className="text-text-primary text-sm mono">{value}</span>
                    </div>
                ))}
            </div>

            {/* Tags and Evidence count */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Tag className="w-4 h-4 text-text-muted" />
                        <span className="text-text-muted text-xs mono uppercase tracking-wider">Tags</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(caseData.tags ?? []).length > 0 ? caseData.tags!.map(tag => (
                            <span key={tag} className="px-2 py-1 bg-bg-elevated border border-bg-border rounded-sm text-text-secondary text-xs mono">
                                {tag}
                            </span>
                        )) : (
                            <span className="text-text-muted text-xs mono">No tags assigned</span>
                        )}
                    </div>
                </div>

                <div className="glass-panel rounded-sm p-4">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-text-muted text-xs mono uppercase tracking-wider">Storage & Evidence</span>
                        <span className="text-accent-cyan mono font-bold text-sm">
                            {(caseData.evidenceCount ?? caseData.files ?? 0).toLocaleString()} Items
                        </span>
                    </div>
                    <div className="progress-bar h-2 mb-2">
                        <div style={{ width: `${Math.min(100, ((caseData.evidenceCount ?? caseData.files ?? 0) / 1000) * 100)}%` }} />
                    </div>
                    <div className="text-right text-text-muted text-[10px] mono">
                        Scanner Online
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            {/* Add Data Source Wizard */}
            {wizardOpen && (
                <NewCaseWizard onClose={() => setWizardOpen(false)} existingCaseId={caseData.id} />
            )}

            <div className="relative mt-4">

                <h2 className="text-text-primary text-sm font-semibold mb-4 uppercase tracking-widest mono">Actions & Modules</h2>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                        { id: 'filesystem', label: 'File Explorer', icon: FolderTree, desc: 'Browse the parsed file system tree and recover deleted entries.', col: 'border-accent-cyan/30 text-accent-cyan bg-accent-cyan/5' },
                        { id: 'hex', label: 'Hex Viewer', icon: Search, desc: 'Stream raw disk sectors and examine binary blobs at the byte level.', col: 'border-purple-500/30 text-purple-400 bg-purple-500/5' },
                        { id: 'recovery', label: 'File Recovery', icon: HardDrive, desc: 'Scan drives and extract deleted or damaged files using deep surface analysis.', col: 'border-accent-blue/30 text-accent-blue bg-accent-blue/5' },
                        { id: 'artifacts', label: 'Artifact Analysis', icon: Search, desc: 'Analyze browsers, USB history, registry changes, and system event logs.', col: 'border-[#1F8F6B]/30 text-[#00C896] bg-[#1F8F6B]/5' },
                        { id: 'timeline', label: 'Event Timeline', icon: Clock, desc: 'Correlate events into a unified chronological investigator timeline.', col: 'border-[#3D7EBF]/30 text-[#3D7EBF] bg-[#3D7EBF]/5' },
                        { id: 'visualization', label: 'Correlation Graph', icon: BarChart3, desc: 'Explore relationships visually between entities, IPs, and artifacts.', col: 'border-[#D97706]/30 text-[#D97706] bg-[#D97706]/5' },
                        { id: 'audit', label: 'Audit Trail', icon: Shield, desc: 'View the cryptographic chain of custody and immutable forensic audit logs.', col: 'border-status-success/30 text-status-success bg-status-success/5' },
                    ].map(({ id, label, icon: Icon, desc, col }) => (
                        <button
                            key={id}
                            onClick={() => navigate(`/cases/${caseData.id}/${id}`)}
                            className={`text-left p-4 border rounded-sm transition-all hover:-translate-y-0.5 group ${col.replace('border-', 'border-').split(' ')[0]} bg-bg-primary hover:${col.split(' ')[2]}`}
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`p-2 rounded-sm ${col.split(' ')[2]} ${col.split(' ')[1]}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <span className="font-semibold text-text-primary">{label}</span>
                            </div>
                            <p className="text-text-muted text-[11px] leading-relaxed">
                                {desc}
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
