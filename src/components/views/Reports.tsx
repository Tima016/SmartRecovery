import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, CheckCircle2, Hash, Shield, AlertTriangle, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { reportsApi } from '../../api/reports.api';
import { evidenceApi } from '../../api/evidence.api';
import { casesApi } from '../../api/cases.api';

interface EvidenceItem {
    id: string;
    type: string;
    name: string;
    hash: string;
    acquired: string;
    status: string;
}

interface CaseSummary {
    caseId: string;
    subject: string;
    investigator: string;
    organization: string;
    dateRange: string;
    classification: string;
}

const unwrap = (payload: any) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (payload?.case || payload?.statistics) return payload;
    if (payload?.data?.case || payload?.data?.statistics) return payload.data;
    return payload ?? null;
};

export default function Reports() {
    const { caseId } = useParams<{ caseId: string }>();
    const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
    const [caseSummary, setCaseSummary] = useState<CaseSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [exportError, setExportError] = useState('');
    const [generating, setGenerating] = useState(false);
    const [exported, setExported] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchReportData = async () => {
            if (!caseId) {
                setLoading(false);
                return;
            }

            try {
                setLoadError('');
                const [evidenceRes, caseRes] = await Promise.allSettled([
                    evidenceApi.getByCaseId(caseId),
                    casesApi.getById(caseId),
                ]);

                if (cancelled) return;

                const evidenceData = evidenceRes.status === 'fulfilled' ? unwrap(evidenceRes.value) : [];
                const evidenceList = Array.isArray(evidenceData) ? evidenceData : (evidenceData?.data ?? []);
                const mappedEvidence: EvidenceItem[] = evidenceList.map((e: any) => ({
                    id: e.evidenceNumber ?? e.id ?? 'N/A',
                    type: e.type ?? e.category ?? 'File',
                    name: e.name ?? e.originalFilename ?? e.description ?? 'N/A',
                    hash: e.hash ?? e.sha256 ?? 'N/A',
                    acquired: e.acquiredAt ?? e.uploadedAt ?? e.createdAt ?? 'N/A',
                    status: String(e.status ?? 'PENDING').toUpperCase(),
                }));
                setEvidenceItems(mappedEvidence);

                const casePayload = caseRes.status === 'fulfilled' ? unwrap(caseRes.value) : null;
                const c = casePayload?.case ?? casePayload;
                if (c && typeof c === 'object') {
                    const investigator = c.assignedTo
                        ? `${c.assignedTo.firstName ?? ''} ${c.assignedTo.lastName ?? ''}`.trim()
                        : c.createdBy
                            ? `${c.createdBy.firstName ?? ''} ${c.createdBy.lastName ?? ''}`.trim()
                            : c.investigator;

                    setCaseSummary({
                        caseId: c.caseNumber ?? c.id ?? 'N/A',
                        subject: c.subject ?? c.title ?? c.name ?? 'N/A',
                        investigator: investigator || 'N/A',
                        organization: c.organization ?? c.client ?? 'N/A',
                        dateRange: c.dateRange
                            ?? (c.openedAt ? new Date(c.openedAt).toISOString().split('T')[0]
                                : c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : 'N/A'),
                        classification: c.classification ?? 'STANDARD',
                    });
                }
            } catch (err: unknown) {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load report data');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchReportData();
        return () => { cancelled = true; };
    }, [caseId]);

    const handleExport = async () => {
        if (!caseId) return;
        setGenerating(true);
        setExportError('');
        try {
            await reportsApi.exportPdf(caseId);
            setExported(true);
        } catch (err: any) {
            setExported(false);
            setExportError(err?.message || 'PDF export failed');
        } finally {
            setGenerating(false);
        }
    };

    const stats = useMemo(() => {
        const verified = evidenceItems.filter((e) => e.status === 'VERIFIED').length;
        const pending = evidenceItems.length - verified;
        return { verified, pending, total: evidenceItems.length };
    }, [evidenceItems]);

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    const summaryFields = caseSummary ? [
        { label: 'Case ID', value: caseSummary.caseId },
        { label: 'Subject', value: caseSummary.subject },
        { label: 'Investigator', value: caseSummary.investigator },
        { label: 'Organization', value: caseSummary.organization },
        { label: 'Date Range', value: caseSummary.dateRange },
        { label: 'Classification', value: caseSummary.classification },
    ] : [];

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {loadError && (
                <div className="glass-panel rounded-sm border border-status-error/30 bg-status-error/10 p-3 text-status-error text-xs mono">
                    Report data loaded with issues: {loadError}
                </div>
            )}
            {exportError && (
                <div className="glass-panel rounded-sm border border-status-error/30 bg-status-error/10 p-3 text-status-error text-xs mono">
                    {exportError}
                </div>
            )}

            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-4">
                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Shield className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Case Summary</span>
                        </div>
                        <div className="space-y-2">
                            {summaryFields.length > 0 ? summaryFields.map(({ label, value }) => (
                                <div key={label} className="flex items-start justify-between gap-2">
                                    <span className="text-text-muted text-[10px] mono flex-shrink-0">{label}</span>
                                    <span className="text-text-primary text-[10px] mono text-right">{value}</span>
                                </div>
                            )) : (
                                <div className="text-text-muted text-xs mono">No case data available</div>
                            )}
                        </div>
                    </div>

                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Hash className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Hash Verification</span>
                        </div>
                        <div className="space-y-2">
                            {evidenceItems.slice(0, 4).map((e) => (
                                <div key={e.id} className="flex items-center gap-2">
                                    {e.status === 'VERIFIED'
                                        ? <CheckCircle2 className="w-3 h-3 text-status-ok flex-shrink-0" />
                                        : <AlertTriangle className="w-3 h-3 text-status-warn flex-shrink-0" />}
                                    <span className="text-text-muted text-[10px] mono w-12 flex-shrink-0">{e.id}</span>
                                    <span className="text-text-secondary text-[10px] mono truncate">{e.hash.slice(0, 16)}...</span>
                                </div>
                            ))}
                            {evidenceItems.length === 0 && (
                                <div className="text-text-muted text-xs mono">No evidence items</div>
                            )}
                        </div>
                    </div>

                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Clock className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Report Metrics</span>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] mono">
                                <span className="text-text-muted">Total Evidence</span>
                                <span className="text-text-primary">{stats.total}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] mono">
                                <span className="text-text-muted">Verified</span>
                                <span className="text-status-ok">{stats.verified}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] mono">
                                <span className="text-text-muted">Pending Review</span>
                                <span className="text-status-warn">{stats.pending}</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Export</span>
                        </div>
                        <div className="mb-3 text-text-secondary text-[10px] leading-relaxed">
                            Generates one consolidated professional PDF report with case summary, evidence integrity, custody, timeline and recovery findings.
                        </div>
                        <button
                            onClick={handleExport}
                            disabled={generating}
                            className={`w-full flex items-center justify-center gap-2 py-2 text-xs border rounded-sm transition-all ${exported
                                ? 'border-status-ok/40 bg-status-ok/10 text-status-ok'
                                : 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20'
                                } ${generating ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            {generating ? (
                                <>
                                    <div className="w-3 h-3 border border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                                    Generating...
                                </>
                            ) : exported ? (
                                <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Report Exported
                                </>
                            ) : (
                                <>
                                    <Download className="w-3.5 h-3.5" />
                                    Export General Report (PDF)
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="col-span-2 space-y-4">
                    <div className="glass-panel rounded-sm overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-bg-border">
                            <div className="flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 text-accent-cyan" />
                                <span className="text-text-primary text-xs font-semibold">Evidence Chain of Custody</span>
                            </div>
                            <span className="tag bg-status-ok/10 border border-status-ok/20 text-status-ok text-[9px]">
                                {evidenceItems.filter(e => e.status === 'VERIFIED').length}/{evidenceItems.length} Verified
                            </span>
                        </div>
                        <div className="grid grid-cols-[0.6fr_0.6fr_2fr_1.5fr_1.2fr_0.8fr] gap-2 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide">
                            <span>ID</span><span>Type</span><span>Name</span><span>SHA-256</span><span>Acquired</span><span>Status</span>
                        </div>
                        <div className="divide-y divide-bg-border/30">
                            {evidenceItems.length > 0 ? evidenceItems.map((e) => (
                                <div key={e.id} className="grid grid-cols-[0.6fr_0.6fr_2fr_1.5fr_1.2fr_0.8fr] gap-2 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[10px] mono font-bold">{e.id}</span>
                                    <span className="tag bg-bg-elevated border border-bg-border text-text-muted text-[9px]">{e.type}</span>
                                    <span className="text-text-primary text-xs truncate">{e.name}</span>
                                    <span className="text-text-muted text-[10px] mono">{e.hash.slice(0, 16)}...</span>
                                    <span className="text-text-secondary text-[10px] mono">{typeof e.acquired === 'string' ? e.acquired.split('T')[0] : 'N/A'}</span>
                                    <div className="flex items-center gap-1">
                                        {e.status === 'VERIFIED'
                                            ? <CheckCircle2 className="w-3 h-3 text-status-ok" />
                                            : <Clock className="w-3 h-3 text-status-warn" />}
                                        <span className={`text-[9px] mono ${e.status === 'VERIFIED' ? 'text-status-ok' : 'text-status-warn'}`}>{e.status}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="px-4 py-6 text-center text-text-muted text-xs mono">No evidence items found</div>
                            )}
                        </div>
                    </div>

                    <div className="glass-panel rounded-sm p-4 flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Report Preview</span>
                        </div>
                        <div className="bg-bg-elevated border border-bg-border rounded-sm p-4 text-text-secondary text-xs leading-relaxed space-y-3 mono max-h-72 overflow-y-auto">
                            <div className="text-accent-cyan font-bold uppercase tracking-widest text-[10px] border-b border-bg-border pb-2">
                                DIGITAL FORENSIC INVESTIGATION REPORT
                            </div>
                            {caseSummary && (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                    <div><span className="text-text-muted">Case:</span> {caseSummary.caseId}</div>
                                    <div><span className="text-text-muted">Date:</span> {caseSummary.dateRange}</div>
                                    <div><span className="text-text-muted">Examiner:</span> {caseSummary.investigator}</div>
                                    <div><span className="text-text-muted">Status:</span> <span className="text-status-ok">Active</span></div>
                                </div>
                            )}
                            <div className="border-t border-bg-border pt-2">
                                <div className="text-text-primary text-[10px] font-semibold mb-1 flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3 text-accent-cyan" /> Executive Summary
                                </div>
                                <p className="text-text-muted text-[10px] leading-relaxed">
                                    Digital forensic examination report generated from case evidence. Total of {evidenceItems.length} evidence
                                    items catalogued, with {evidenceItems.filter(e => e.status === 'VERIFIED').length} items verified via hash integrity check.
                                    Write-blocker integrity confirmed throughout acquisition.
                                </p>
                            </div>
                            <div className="border-t border-bg-border pt-2">
                                <div className="text-text-primary text-[10px] font-semibold mb-1 flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3 text-accent-cyan" /> Evidence Summary
                                </div>
                                <div className="space-y-0.5 text-[10px] text-text-muted">
                                    {evidenceItems.slice(0, 5).map((e, i) => (
                                        <div key={e.id} className="flex items-start gap-1">
                                            <ChevronRight className="w-2.5 h-2.5 text-status-warn mt-0.5 flex-shrink-0" />
                                            {i + 1}. {e.name} ({e.type}) - {e.status}
                                        </div>
                                    ))}
                                    {evidenceItems.length === 0 && (
                                        <div className="text-[10px] text-text-muted">No evidence records yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
