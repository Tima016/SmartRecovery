import { useState } from 'react';
import {
    FileText,
    Download,
    CheckCircle2,
    Hash,
    Shield,
    AlertTriangle,
    Clock,
    User,
    ChevronRight,
} from 'lucide-react';

const evidenceItems = [
    { id: 'E-001', type: 'File', name: 'credentials.xlsx', hash: 'a3f2c1d9e84b7f6a', acquired: '2024-11-12 09:14', status: 'VERIFIED' },
    { id: 'E-002', type: 'File', name: 'private_key.pem', hash: 'b8d4f21c903e7a5b', acquired: '2024-11-12 09:12', status: 'VERIFIED' },
    { id: 'E-003', type: 'Image', name: 'sdb.dd (disk image)', hash: 'c9d1e2f3a4b5c6d7', acquired: '2024-11-12 10:00', status: 'VERIFIED' },
    { id: 'E-004', type: 'Log', name: 'Security.evtx', hash: 'd0e1f2a3b4c5d6e7', acquired: '2024-11-11 22:15', status: 'VERIFIED' },
    { id: 'E-005', type: 'Export', name: 'browser_history.json', hash: 'e1f2a3b4c5d6e7f8', acquired: '2024-11-12 09:22', status: 'PENDING' },
    { id: 'E-006', type: 'Registry', name: 'NTUSER.DAT (hive)', hash: 'f2a3b4c5d6e7f8a9', acquired: '2024-11-12 07:40', status: 'VERIFIED' },
];

export default function Reports() {
    const [generating, setGenerating] = useState(false);
    const [exported, setExported] = useState(false);

    const handleExport = () => {
        setGenerating(true);
        setTimeout(() => { setGenerating(false); setExported(true); }, 1800);
    };

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
                {/* Report Meta */}
                <div className="space-y-4">
                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Shield className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Case Summary</span>
                        </div>
                        <div className="space-y-2">
                            {[
                                { label: 'Case ID', value: 'INV-2024-0892' },
                                { label: 'Subject', value: 'John Doe (john.doe)' },
                                { label: 'Investigator', value: 'S. Roper' },
                                { label: 'Organization', value: 'FinCorp Ltd.' },
                                { label: 'Date Range', value: '2024-11-09 → 11-12' },
                                { label: 'Classification', value: 'CONFIDENTIAL' },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex items-start justify-between gap-2">
                                    <span className="text-text-muted text-[10px] mono flex-shrink-0">{label}</span>
                                    <span className="text-text-primary text-[10px] mono text-right">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Hash className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Hash Verification</span>
                        </div>
                        <div className="space-y-2">
                            {[
                                { algo: 'MD5', hash: '5d41402abc4b2a76', ok: true },
                                { algo: 'SHA-1', hash: 'aaf4c61ddcc5e8a2', ok: true },
                                { algo: 'SHA-256', hash: 'a3f2c1d9e84b7f6a', ok: true },
                                { algo: 'SHA-512', hash: 'cf83e1357eef8a2c', ok: false },
                            ].map(({ algo, hash, ok }) => (
                                <div key={algo} className="flex items-center gap-2">
                                    {ok
                                        ? <CheckCircle2 className="w-3 h-3 text-status-ok flex-shrink-0" />
                                        : <AlertTriangle className="w-3 h-3 text-status-warn flex-shrink-0" />}
                                    <span className="text-text-muted text-[10px] mono w-12 flex-shrink-0">{algo}</span>
                                    <span className="text-text-secondary text-[10px] mono truncate">{hash}…</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Export */}
                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Export Report</span>
                        </div>
                        <div className="space-y-2 mb-3">
                            {['Executive Summary (PDF)', 'Full Technical Report (PDF)', 'Evidence Chain of Custody', 'Timeline Export (CSV)', 'Hash Manifest (JSON)'].map(opt => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                                    <input type="checkbox" defaultChecked className="accent-[#00C896] w-3 h-3" />
                                    <span className="text-text-secondary text-[10px] group-hover:text-text-primary transition-colors">{opt}</span>
                                </label>
                            ))}
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
                                    Generating…
                                </>
                            ) : exported ? (
                                <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Report Exported
                                </>
                            ) : (
                                <>
                                    <Download className="w-3.5 h-3.5" />
                                    Export PDF Report
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Evidence Table + Preview */}
                <div className="col-span-2 space-y-4">
                    {/* Evidence */}
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
                            {evidenceItems.map((e) => (
                                <div key={e.id} className="grid grid-cols-[0.6fr_0.6fr_2fr_1.5fr_1.2fr_0.8fr] gap-2 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[10px] mono font-bold">{e.id}</span>
                                    <span className="tag bg-bg-elevated border border-bg-border text-text-muted text-[9px]">{e.type}</span>
                                    <span className="text-text-primary text-xs truncate">{e.name}</span>
                                    <span className="text-text-muted text-[10px] mono">{e.hash}…</span>
                                    <span className="text-text-secondary text-[10px] mono">{e.acquired}</span>
                                    <div className="flex items-center gap-1">
                                        {e.status === 'VERIFIED'
                                            ? <CheckCircle2 className="w-3 h-3 text-status-ok" />
                                            : <Clock className="w-3 h-3 text-status-warn" />}
                                        <span className={`text-[9px] mono ${e.status === 'VERIFIED' ? 'text-status-ok' : 'text-status-warn'}`}>{e.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Report Preview */}
                    <div className="glass-panel rounded-sm p-4 flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Report Preview</span>
                        </div>
                        <div className="bg-bg-elevated border border-bg-border rounded-sm p-4 text-text-secondary text-xs leading-relaxed space-y-3 mono max-h-72 overflow-y-auto">
                            <div className="text-accent-cyan font-bold uppercase tracking-widest text-[10px] border-b border-bg-border pb-2">
                                DIGITAL FORENSIC INVESTIGATION REPORT
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                <div><span className="text-text-muted">Case:</span> INV-2024-0892</div>
                                <div><span className="text-text-muted">Date:</span> 2024-11-12</div>
                                <div><span className="text-text-muted">Examiner:</span> S. Roper, GCFE</div>
                                <div><span className="text-text-muted">Status:</span> <span className="text-status-ok">Active</span></div>
                            </div>
                            <div className="border-t border-bg-border pt-2">
                                <div className="text-text-primary text-[10px] font-semibold mb-1 flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3 text-accent-cyan" /> Executive Summary
                                </div>
                                <p className="text-text-muted text-[10px] leading-relaxed">
                                    Digital forensic examination of workstation assigned to subject john.doe revealed substantial evidence
                                    of intentional data exfiltration. Analysis of recovered artifacts indicates unauthorized uploading of
                                    proprietary files via cloud storage services between 2024-11-09 and 2024-11-12. A total of 47,823
                                    files were indexed across 1 drive image. Write-blocker integrity confirmed throughout acquisition.
                                </p>
                            </div>
                            <div className="border-t border-bg-border pt-2">
                                <div className="text-text-primary text-[10px] font-semibold mb-1 flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3 text-accent-cyan" /> Key Findings
                                </div>
                                <div className="space-y-0.5 text-[10px] text-text-muted">
                                    {[
                                        '1. Deletion of credentials.xlsx and private_key.pem confirmed at 09:12–09:14',
                                        '2. Upload of 2.4 GB to mega.nz (IP 45.33.12.178) at 09:22',
                                        '3. Malicious service NetSvc installed at 22:15 on 2024-11-11',
                                        '4. Audit log cleared (EventID 1102) at 20:30 on 2024-11-11',
                                        '5. Unauthorized local admin account "admin2" created at 04:33',
                                    ].map((f, i) => (
                                        <div key={i} className="flex items-start gap-1">
                                            <User className="w-2.5 h-2.5 text-status-warn mt-0.5 flex-shrink-0" />
                                            {f}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
