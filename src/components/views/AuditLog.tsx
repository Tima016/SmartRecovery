import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Clock, HardDrive, FileText, User, Loader2, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client';

interface AuditLogEntry {
    id: string;
    action: string;
    entityType: string | null;
    createdAt: string;
    ipAddress: string | null;
    user: { email: string; firstName: string; lastName: string } | null;
    details: any;
    recordHash: string;
    prevHash: string | null;
}

export default function AuditLog() {
    const { caseId } = useParams<{ caseId: string }>();
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [verifying, setVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<{ valid: boolean; tamperedAtIndex: number } | null>(null);

    const fetchLogs = async (p = page) => {
        if (!caseId) return;
        setLoading(true);
        try {
            const res = await apiClient.get(`/cases/${caseId}/audit?limit=20&page=${p}`);
            setLogs(res.data.data);
            setTotalPages(res.data.pages);
            setPage(p);
        } catch (err: any) {
            setError(err.message || 'Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    };

    const verifyChain = async () => {
        setVerifying(true);
        try {
            const res = await apiClient.get('/audit/verify-chain');
            setVerificationResult(res.data);
        } catch (err: any) {
            alert('Verification failed: ' + err.message);
        } finally {
            setVerifying(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [caseId]);

    const getIconForAction = (action: string) => {
        if (action.includes('EVIDENCE')) return <HardDrive className="w-4 h-4 text-accent-cyan" />;
        if (action.includes('REPORT')) return <FileText className="w-4 h-4 text-accent-cyan" />;
        if (action.includes('USER')) return <User className="w-4 h-4 text-text-muted" />;
        return <Shield className="w-4 h-4 text-accent-cyan" />;
    };

    if (loading && logs.length === 0) {
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
        <div className="h-full p-6 flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Shield className="w-5 h-5 text-accent-cyan" />
                        Case Audit Trail
                    </h1>
                    <p className="text-sm text-text-muted mt-1">Immutable cryptographic log of all case actions</p>
                </div>
                <button
                    onClick={verifyChain}
                    disabled={verifying}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 rounded-sm text-sm mono font-semibold transition-colors disabled:opacity-50"
                >
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Verify Integrity
                </button>
            </div>

            {verificationResult && (
                <div className={`p-4 border rounded-sm flex items-start gap-4 ${verificationResult.valid ? 'bg-status-success/10 border-status-success/30' : 'bg-status-error/10 border-status-error/30'}`}>
                    <Shield className={`w-5 h-5 mt-0.5 ${verificationResult.valid ? 'text-status-success' : 'text-status-error'}`} />
                    <div>
                        <h4 className={`text-sm font-bold mono ${verificationResult.valid ? 'text-status-success' : 'text-status-error'}`}>
                            {verificationResult.valid ? 'CHAIN VERIFIED' : 'INTEGRITY VIOLATION DETECTED'}
                        </h4>
                        <p className="text-xs text-text-muted mt-1 mono">
                            {verificationResult.valid ? 'All local cryptographic hashes match the audit chain sequence.' : ('Tampering detected at log index ' + verificationResult.tamperedAtIndex + '. Forensic integrity is compromised.')}
                        </p>
                    </div>
                </div>
            )}

            <div className="glass-panel rounded-sm flex-1 flex flex-col min-h-0">
                <div className="overflow-y-auto p-4 flex-1">
                    <div className="relative pl-6 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-bg-border before:to-transparent">
                        {logs.map((log) => (
                            <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                {/* Timeline Dot */}
                                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-bg-border bg-bg-elevated absolute left-0 md:left-1/2 -translate-x-1/2 md:translate-x-0 translate-y-2 z-10 shadow-lg group-hover:border-accent-cyan transition-colors">
                                    {getIconForAction(log.action)}
                                </div>

                                {/* Content Box */}
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2rem)] p-4 rounded-sm border border-bg-border bg-bg-elevated hover:border-accent-cyan/30 transition-colors shadow-sm ml-8 md:ml-0 md:group-odd:mr-8 md:group-even:ml-8 translate-y-2">
                                    <div className="flex items-center justify-between mb-1 text-[10px] mono text-text-muted">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="w-3 h-3" />
                                            {new Date(log.createdAt).toLocaleString()}
                                        </div>
                                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                                    </div>
                                    <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-2 flex items-center gap-2">
                                        {log.action.replace(/_/g, ' ')}
                                        {log.entityType && <span className="text-[10px] px-1.5 py-0.5 bg-bg-primary rounded-sm border border-bg-border text-text-muted">{log.entityType}</span>}
                                    </h4>

                                    <div className="text-xs text-text-secondary bg-bg-primary p-2 border border-bg-border/50 rounded-sm mb-3 mono break-all">
                                        {JSON.stringify(log.details)}
                                    </div>

                                    <div className="flex flex-col gap-1 text-[10px] mono">
                                        <div className="flex justify-between border-t border-bg-border pt-2">
                                            <span className="text-text-muted">Actor:</span>
                                            <span className="text-text-primary">{log.user ? (log.user.firstName + ' ' + log.user.lastName) : 'System'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-text-muted">Hash:</span>
                                            <span className="text-accent-cyan truncate w-32" title={log.recordHash}>{log.recordHash}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-bg-elevated border-t border-bg-border">
                        <span className="text-xs text-text-muted mono">Page {page} of {totalPages}</span>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={page === 1}
                                onClick={() => fetchLogs(page - 1)}
                                className="px-3 py-1 bg-bg-primary border border-bg-border rounded-sm text-xs mono text-text-secondary hover:text-text-primary disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                disabled={page === totalPages}
                                onClick={() => fetchLogs(page + 1)}
                                className="px-3 py-1 bg-bg-primary border border-bg-border rounded-sm text-xs mono text-text-secondary hover:text-text-primary disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
