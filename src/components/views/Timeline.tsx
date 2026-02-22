import { useState } from 'react';
import { ZoomIn, ZoomOut, Filter, Clock, AlertTriangle, Globe, HardDrive, User, Terminal } from 'lucide-react';

type EventType = 'all' | 'file' | 'network' | 'auth' | 'process' | 'usb';

const eventTypes: { id: EventType; label: string; color: string }[] = [
    { id: 'all', label: 'All Events', color: '#9CA3AF' },
    { id: 'file', label: 'File System', color: '#00C896' },
    { id: 'network', label: 'Network', color: '#1F8F6B' },
    { id: 'auth', label: 'Auth', color: '#D97706' },
    { id: 'process', label: 'Process', color: '#3D7EBF' },
    { id: 'usb', label: 'USB', color: '#C0392B' },
];

const events = [
    { id: 1, time: '2024-11-12 09:22', type: 'network', label: 'Upload to mega.nz (2.4 GB)', detail: 'IP: 45.33.12.178 · Port 443', icon: Globe },
    { id: 2, time: '2024-11-12 09:14', type: 'file', label: 'credentials.xlsx deleted', detail: '/Users/john.doe/Documents/', icon: HardDrive },
    { id: 3, time: '2024-11-12 09:12', type: 'file', label: 'private_key.pem deleted', detail: '/Users/john.doe/.ssh/', icon: HardDrive },
    { id: 4, time: '2024-11-12 08:58', type: 'usb', label: 'USB device connected', detail: 'SanDisk Ultra 64GB · Serial: 4C532A7D9B1E', icon: AlertTriangle },
    { id: 5, time: '2024-11-12 08:44', type: 'auth', label: 'Logon success (Network Type 3)', detail: 'john.doe@corp.local → FS-01', icon: User },
    { id: 6, time: '2024-11-12 07:40', type: 'process', label: 'Registry Run key created', detail: 'svchost.exe → C:\\Users\\john\\AppData\\', icon: Terminal },
    { id: 7, time: '2024-11-11 22:15', type: 'process', label: 'Malicious service installed', detail: 'NetSvc · C:\\Windows\\temp\\ns.dll', icon: Terminal },
    { id: 8, time: '2024-11-11 20:30', type: 'auth', label: 'Audit log cleared', detail: 'EventID 1102 · john.doe', icon: User },
    { id: 9, time: '2024-11-11 18:02', type: 'network', label: 'GitHub netscan tool downloaded', detail: 'HTTPS · 88.7 MB', icon: Globe },
    { id: 10, time: '2024-11-10 13:22', type: 'usb', label: 'USB device connected', detail: 'Generic 16GB · Serial: 3F1A884C2D0B', icon: AlertTriangle },
    { id: 11, time: '2024-11-10 09:00', type: 'auth', label: '3 failed logon attempts', detail: 'EventID 4625 · john.doe@corp.local', icon: User },
    { id: 12, time: '2024-11-09 04:33', type: 'auth', label: 'Local admin account created', detail: 'SAM: admin2 — off-hours', icon: User },
];

const typeStyle: Record<string, { dot: string; bg: string; border: string; text: string }> = {
    file: { dot: '#00C896', bg: 'rgba(0,200,150,0.07)', border: 'rgba(0,200,150,0.22)', text: '#00C896' },
    network: { dot: '#1F8F6B', bg: 'rgba(31,143,107,0.07)', border: 'rgba(31,143,107,0.22)', text: '#1F8F6B' },
    auth: { dot: '#D97706', bg: 'rgba(217,119,6,0.07)', border: 'rgba(217,119,6,0.22)', text: '#D97706' },
    process: { dot: '#3D7EBF', bg: 'rgba(61,126,191,0.07)', border: 'rgba(61,126,191,0.22)', text: '#3D7EBF' },
    usb: { dot: '#C0392B', bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.22)', text: '#C0392B' },
};

export default function Timeline() {
    const [filter, setFilter] = useState<EventType>('all');
    const [zoom, setZoom] = useState(1);
    const [hovered, setHovered] = useState<number | null>(null);

    const filtered = events.filter(e => filter === 'all' || e.type === filter);

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                    {eventTypes.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setFilter(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-sm transition-all ${filter === t.id ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                                }`}
                            style={filter === t.id
                                ? { borderColor: `${t.color}50`, background: `${t.color}12`, color: t.color }
                                : { borderColor: '#23262E', color: '#9CA3AF' }
                            }
                        >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1.5 bg-bg-elevated border border-bg-border rounded-sm hover:text-text-primary text-text-muted transition-colors">
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-text-muted text-[10px] mono w-10 text-center">{(zoom * 100).toFixed(0)}%</span>
                    <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="p-1.5 bg-bg-elevated border border-bg-border rounded-sm hover:text-text-primary text-text-muted transition-colors">
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs hover:text-text-primary rounded-sm">
                        <Filter className="w-3 h-3" /> Advanced Filter
                    </button>
                </div>
            </div>

            {/* Timeline ruler */}
            <div className="glass-panel rounded-sm p-3">
                <div className="flex items-center gap-4 mb-2">
                    <Clock className="w-3.5 h-3.5 text-accent-cyan flex-shrink-0" />
                    <span className="text-text-muted text-[10px] mono">2024-11-09</span>
                    <div className="flex-1 h-px bg-bg-border relative">
                        <div className="absolute left-0 top-0 bottom-0 flex items-center w-full">
                            {[0, 25, 50, 75, 100].map(p => (
                                <div key={p} className="absolute" style={{ left: `${p}%` }}>
                                    <div className="w-px h-2 bg-bg-border" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <span className="text-text-muted text-[10px] mono">2024-11-12</span>
                </div>
                {/* Event dots on ruler */}
                <div className="relative h-8 ml-20 mr-16">
                    <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-bg-border" />
                    {filtered.map((e) => {
                        const date = new Date(e.time).getTime();
                        const start = new Date('2024-11-09').getTime();
                        const end = new Date('2024-11-12 23:59').getTime();
                        const pct = ((date - start) / (end - start)) * 100;
                        const style = typeStyle[e.type] || typeStyle.file;
                        return (
                            <div
                                key={e.id}
                                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-150"
                                style={{ left: `${pct}%`, top: '50%' }}
                                onMouseEnter={() => setHovered(e.id)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <div className="w-2.5 h-2.5 rounded-full border" style={{ background: style.dot, borderColor: style.border, boxShadow: `0 0 6px ${style.dot}60` }} />
                                {hovered === e.id && (
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-48 p-2 rounded-sm text-[10px] border shadow-xl whitespace-nowrap"
                                        style={{ background: '#1D2128', borderColor: style.border, color: '#E6E8EB' }}>
                                        <div className="font-semibold mono mb-0.5" style={{ color: style.text }}>{e.label}</div>
                                        <div className="text-text-muted">{e.time}</div>
                                        <div className="text-text-muted mt-0.5">{e.detail}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Event list */}
            <div className="glass-panel rounded-sm overflow-hidden">
                <div className="grid grid-cols-[1.2fr_0.6fr_2.5fr_2fr] gap-4 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide">
                    <span>Timestamp</span><span>Type</span><span>Event</span><span>Detail</span>
                </div>
                <div className="divide-y divide-bg-border/30 max-h-[400px] overflow-y-auto">
                    {filtered.map((e) => {
                        const style = typeStyle[e.type] || typeStyle.file;
                        const Icon = e.icon;
                        return (
                            <div key={e.id} className="grid grid-cols-[1.2fr_0.6fr_2.5fr_2fr] gap-4 px-4 py-2.5 table-row-hover items-center">
                                <span className="text-text-secondary text-[10px] mono">{e.time}</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: style.dot, boxShadow: `0 0 4px ${style.dot}` }} />
                                    <span className="text-[10px] mono font-medium capitalize" style={{ color: style.text }}>{e.type}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: style.dot }} />
                                    <span className="text-text-primary text-xs">{e.label}</span>
                                </div>
                                <span className="text-text-muted text-[10px] mono truncate">{e.detail}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
