import { useState } from 'react';
import {
    Plus,
    Search,
    Filter,
    Tag,
    Calendar,
    User,
    Hash,
    Shield,
    MoreHorizontal,
} from 'lucide-react';

const cases = [
    { id: 'INV-2024-0892', name: 'Insider Threat — FinCorp', investigator: 'S. Roper', date: '2024-11-14', status: 'ACTIVE', priority: 'HIGH', tags: ['insider', 'financial', 'exfil'], hash: 'a3f2...9d1e', files: 47823 },
    { id: 'INV-2024-0889', name: 'Ransomware Recovery — MedSys', investigator: 'J. Park', date: '2024-11-10', status: 'ACTIVE', priority: 'CRITICAL', tags: ['ransomware', 'medical'], hash: 'b1e9...4c7a', files: 128410 },
    { id: 'INV-2024-0881', name: 'Data Breach — RetailCo', investigator: 'M. Chen', date: '2024-11-02', status: 'REVIEW', priority: 'MEDIUM', tags: ['breach', 'pii', 'retail'], hash: 'c9d1...7f3b', files: 9234 },
    { id: 'INV-2024-0874', name: 'IP Theft — TechStart', investigator: 'S. Roper', date: '2024-10-28', status: 'CLOSED', priority: 'LOW', tags: ['ip-theft', 'tech'], hash: 'd0a2...2e1c', files: 3401 },
    { id: 'INV-2024-0866', name: 'Employee Misconduct — GovAgency', investigator: 'L. Torres', date: '2024-10-19', status: 'REVIEW', priority: 'MEDIUM', tags: ['misconduct', 'government'], hash: 'e7b3...8d4f', files: 21003 },
    { id: 'INV-2024-0855', name: 'Phishing Campaign — BankX', investigator: 'J. Park', date: '2024-10-07', status: 'CLOSED', priority: 'HIGH', tags: ['phishing', 'financial'], hash: 'f4c5...1a2b', files: 5890 },
];

const priorityColor: Record<string, string> = {
    CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
    HIGH: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    MEDIUM: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    LOW: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const statusDot: Record<string, string> = {
    ACTIVE: 'ok',
    REVIEW: 'warn',
    CLOSED: 'info',
};

const statusText: Record<string, string> = {
    ACTIVE: 'text-[#00C896]',
    REVIEW: 'text-[#D97706]',
    CLOSED: 'text-[#6B7280]',
};

export default function Cases() {
    const [selected, setSelected] = useState<string>('INV-2024-0892');
    const [search, setSearch] = useState('');

    const filtered = cases.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase())
    );

    const selectedCase = cases.find(c => c.id === selected);

    return (
        <div className="h-full flex overflow-hidden">
            {/* Left: Case Table */}
            <div className="flex flex-col w-[55%] border-r border-bg-border">
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
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan text-xs hover:bg-accent-cyan/20 transition-colors rounded-sm">
                        <Plus className="w-3.5 h-3.5" />
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
                    {filtered.map(c => (
                        <div
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                            className={`grid gap-2 px-4 py-2.5 cursor-pointer transition-all items-center ${selected === c.id
                                ? 'bg-accent-cyan/[0.08] border-l-2 border-[#00C896]'
                                : 'table-row-hover border-l-2 border-transparent'
                                }`}
                            style={{ gridTemplateColumns: '1.2fr 2.2fr 1fr 0.8fr 0.7fr 32px' }}
                        >
                            <span className="text-accent-cyan text-[11px] mono font-medium truncate">{c.id}</span>
                            <span className="text-text-primary text-xs truncate">{c.name}</span>
                            <span className="text-text-secondary text-xs truncate">{c.investigator}</span>
                            <div className="flex items-center gap-1.5">
                                <span className={`status-dot ${statusDot[c.status]}`} />
                                <span className={`text-[10px] mono ${statusText[c.status]}`}>{c.status}</span>
                            </div>
                            <span className={`tag border text-[9px] self-start ${priorityColor[c.priority]}`}>{c.priority}</span>
                            <button className="text-text-muted hover:text-text-secondary">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Case Detail */}
            <div className="flex-1 overflow-y-auto p-4">
                {selectedCase ? (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Shield className="w-4 h-4 text-accent-cyan" />
                                    <span className="text-accent-cyan mono text-sm font-bold">{selectedCase.id}</span>
                                </div>
                                <h2 className="text-text-primary font-semibold text-base">{selectedCase.name}</h2>
                            </div>
                            <span className={`tag border ${priorityColor[selectedCase.priority]} px-2 py-1 text-[10px]`}>
                                {selectedCase.priority}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { icon: User, label: 'Investigator', value: selectedCase.investigator },
                                { icon: Calendar, label: 'Created', value: selectedCase.date },
                                { icon: Hash, label: 'Hash (SHA-256)', value: selectedCase.hash },
                                { icon: Shield, label: 'Status', value: selectedCase.status },
                            ].map(({ icon: Icon, label, value }) => (
                                <div key={label} className="glass-panel rounded-sm p-3">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Icon className="w-3 h-3 text-text-muted" />
                                        <span className="text-text-muted text-[10px] mono">{label}</span>
                                    </div>
                                    <span className="text-text-primary text-xs mono">{value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Tags */}
                        <div className="glass-panel rounded-sm p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Tag className="w-3 h-3 text-text-muted" />
                                <span className="text-text-muted text-[10px] mono">TAGS</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {selectedCase.tags.map(tag => (
                                    <span key={tag} className="tag bg-bg-elevated border border-bg-border text-text-secondary text-[10px]">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Files count */}
                        <div className="glass-panel rounded-sm p-3">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-text-muted text-[10px] mono">INDEXED FILES</span>
                                <span className="text-accent-cyan mono font-bold">{selectedCase.files.toLocaleString()}</span>
                            </div>
                            <div className="progress-bar h-1.5">
                                <div style={{ width: `${Math.min(100, (selectedCase.files / 130000) * 100)}%` }} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted text-sm">
                        Select a case to view details
                    </div>
                )}
            </div>
        </div>
    );
}
