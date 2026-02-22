import { useState } from 'react';
import { Search, Globe, Usb, BookOpen, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';

const tabs = [
    { id: 'browser', icon: Globe, label: 'Browser History' },
    { id: 'usb', icon: Usb, label: 'USB History' },
    { id: 'registry', icon: BookOpen, label: 'Registry Changes' },
    { id: 'events', icon: AlertCircle, label: 'Event Logs' },
] as const;

type TabId = typeof tabs[number]['id'];

const browserHistory = [
    { url: 'https://mega.nz/file/xKk3...', title: 'MEGA File Upload', time: '2024-11-12 09:22', browser: 'Chrome', visits: 4 },
    { url: 'https://protonmail.com/inbox', title: 'ProtonMail — Inbox', time: '2024-11-12 09:18', browser: 'Chrome', visits: 12 },
    { url: 'https://pastebin.com/raw/...', title: 'Pastebin — Raw', time: '2024-11-12 09:10', browser: 'Firefox', visits: 2 },
    { url: 'https://anonfiles.com/upload', title: 'AnonFiles Upload', time: '2024-11-11 23:44', browser: 'Firefox', visits: 1 },
    { url: 'https://github.com/tools/...', title: 'GitHub - netscan tool', time: '2024-11-11 18:02', browser: 'Chrome', visits: 6 },
    { url: 'https://vpnbook.com/freevpn', title: 'VPNBook Free VPN', time: '2024-11-10 14:30', browser: 'Chrome', visits: 3 },
];

const usbHistory = [
    { device: 'SanDisk Ultra', serial: '4C532A7D9B1E', type: 'USB Mass Storage', connected: '2024-11-12 08:58', size: '64 GB' },
    { device: 'Generic Flash', serial: '3F1A884C2D0B', type: 'USB Mass Storage', connected: '2024-11-10 13:22', size: '16 GB' },
    { device: 'iPhone 14 Pro', serial: 'F7D2C90A4E81', type: 'MTP Device', connected: '2024-11-08 09:00', size: 'N/A' },
    { device: 'WD Passport', serial: '1B7C443E90F2', type: 'USB HDD', connected: '2024-11-06 21:11', size: '2 TB' },
];

const registryChanges = [
    { hive: 'HKCU', key: 'SOFTWARE\\Microsoft\\Windows\\Run', value: 'Updater', data: 'C:\\Users\\john\\AppData\\svchost.exe', time: '2024-11-12 07:40', action: 'CREATE' },
    { hive: 'HKLM', key: 'SYSTEM\\CurrentControlSet\\Services', value: 'NetSvc', data: '"C:\\Windows\\temp\\ns.dll"', time: '2024-11-11 22:15', action: 'MODIFY' },
    { hive: 'HKCU', key: 'SOFTWARE\\Microsoft\\Edge\\Preferences', value: 'AutofillEnabled', data: '0', time: '2024-11-10 10:00', action: 'MODIFY' },
    { hive: 'HKLM', key: 'SAM\\Domains\\Account\\Users', value: 'admin2', data: '(binary)', time: '2024-11-09 04:33', action: 'CREATE' },
];

const eventLogs = [
    { id: '4625', level: 'WARN', source: 'Security', msg: 'Account logon failure — john.doe@corp.local', time: '2024-11-12 01:04' },
    { id: '4624', level: 'INFO', source: 'Security', msg: 'Successful logon — john.doe, Type 3 (Network)', time: '2024-11-12 01:12' },
    { id: '7045', level: 'ERROR', source: 'System', msg: 'New service installed: NetSvc (C:\\Windows\\temp\\ns.dll)', time: '2024-11-11 22:15' },
    { id: '4698', level: 'WARN', source: 'Security', msg: 'Scheduled task created: \\Microsoft\\Windows\\Update\\Task1', time: '2024-11-11 20:40' },
    { id: '4688', level: 'INFO', source: 'Security', msg: 'New process created: svchost.exe (parent: cmd.exe)', time: '2024-11-11 20:38' },
    { id: '1102', level: 'ERROR', source: 'Security', msg: 'Audit log cleared by john.doe', time: '2024-11-11 20:30' },
];

const levelColor: Record<string, string> = {
    INFO: 'text-status-info',
    WARN: 'text-status-warn',
    ERROR: 'text-status-error',
};

export default function ArtifactAnalysis() {
    const [activeTab, setActiveTab] = useState<TabId>('browser');
    const [search, setSearch] = useState('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    return (
        <div className="h-full flex flex-col overflow-hidden p-4 gap-4">
            {/* Tab bar */}
            <div className="flex items-center gap-1 flex-shrink-0">
                {tabs.map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => { setActiveTab(id); setSearch(''); }}
                        className={`flex items-center gap-2 px-4 py-2 text-xs border transition-colors rounded-sm ${activeTab === id
                            ? 'bg-accent-cyan/12 border-accent-cyan/40 text-accent-cyan'
                            : 'border-bg-border text-text-muted hover:text-text-secondary hover:border-bg-elevated'
                            }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
                <div className="flex items-center gap-2 ml-auto bg-bg-elevated border border-bg-border rounded-sm px-3 py-1.5">
                    <Search className="w-3.5 h-3.5 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Search artifacts..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-transparent text-text-primary text-xs outline-none placeholder-text-muted mono w-48"
                    />
                </div>
                <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs rounded-sm hover:text-text-primary">
                    {sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    Time
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden glass-panel rounded-sm flex flex-col">
                {activeTab === 'browser' && (
                    <>
                        <div className="grid grid-cols-[3fr_2fr_1.2fr_0.7fr_0.6fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>URL</span><span>Title</span><span>Timestamp</span><span>Browser</span><span>Visits</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {browserHistory.filter(r => !search || r.url.includes(search) || r.title.toLowerCase().includes(search.toLowerCase())).map((r, i) => (
                                <div key={i} className="grid grid-cols-[3fr_2fr_1.2fr_0.7fr_0.6fr] gap-3 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[11px] mono truncate">{r.url}</span>
                                    <span className="text-text-primary text-xs truncate">{r.title}</span>
                                    <span className="text-text-secondary text-[10px] mono">{r.time}</span>
                                    <span className="text-text-muted text-[10px]">{r.browser}</span>
                                    <span className="text-text-secondary text-[10px] mono text-right">{r.visits}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                {activeTab === 'usb' && (
                    <>
                        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_0.7fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>Device</span><span>Serial</span><span>Type</span><span>Connected</span><span>Size</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {usbHistory.map((r, i) => (
                                <div key={i} className="grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_0.7fr] gap-3 px-4 py-3 table-row-hover items-center">
                                    <span className="text-text-primary text-xs font-medium">{r.device}</span>
                                    <span className="text-accent-cyan text-[10px] mono">{r.serial}</span>
                                    <span className="text-text-secondary text-xs">{r.type}</span>
                                    <span className="text-text-muted text-[10px] mono">{r.connected}</span>
                                    <span className="text-text-secondary text-[10px] mono">{r.size}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                {activeTab === 'registry' && (
                    <>
                        <div className="grid grid-cols-[0.7fr_2fr_1fr_1.5fr_0.9fr_0.6fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>Hive</span><span>Key</span><span>Value</span><span>Data</span><span>Time</span><span>Action</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {registryChanges.map((r, i) => (
                                <div key={i} className="grid grid-cols-[0.7fr_2fr_1fr_1.5fr_0.9fr_0.6fr] gap-3 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[10px] mono font-medium">{r.hive}</span>
                                    <span className="text-text-muted text-[10px] mono truncate">{r.key}</span>
                                    <span className="text-text-primary text-[11px] mono">{r.value}</span>
                                    <span className="text-text-secondary text-[10px] mono truncate">{r.data}</span>
                                    <span className="text-text-muted text-[10px] mono">{r.time.split(' ')[0]}</span>
                                    <span className={`tag border text-[9px] ${r.action === 'CREATE' ? 'bg-status-warn/15 text-status-warn border-status-warn/30' : 'bg-status-info/15 text-status-info border-status-info/30'}`}>
                                        {r.action}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                {activeTab === 'events' && (
                    <>
                        <div className="grid grid-cols-[0.6fr_0.6fr_0.8fr_4fr_1.2fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>Event ID</span><span>Level</span><span>Source</span><span>Description</span><span>Time</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {eventLogs.map((r, i) => (
                                <div key={i} className="grid grid-cols-[0.6fr_0.6fr_0.8fr_4fr_1.2fr] gap-3 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[10px] mono font-bold">{r.id}</span>
                                    <span className={`text-[10px] mono font-medium ${levelColor[r.level]}`}>{r.level}</span>
                                    <span className="text-text-muted text-[10px] mono">{r.source}</span>
                                    <span className="text-text-secondary text-xs truncate">{r.msg}</span>
                                    <span className="text-text-muted text-[10px] mono">{r.time}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
