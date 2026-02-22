import { useEffect, useRef } from 'react';
import {
    HardDrive,
    FileSearch,
    AlertTriangle,
    Activity,
    Clock,
    TrendingUp,
    Layers,
    Database,
} from 'lucide-react';
import {
    AreaChart,
    Area,
    ResponsiveContainer,
    Tooltip,
    XAxis,
} from 'recharts';

const activityLog = [
    { time: '01:47:22', level: 'INFO', msg: 'Deep scan completed on /dev/sdb1 — 2.1M files indexed' },
    { time: '01:46:58', level: 'WARN', msg: 'SHA-256 mismatch detected on image backup copy' },
    { time: '01:44:10', level: 'INFO', msg: 'Write-blocker engaged on USB device #3' },
    { time: '01:41:33', level: 'INFO', msg: '14,823 deleted files recovered — INV-2024-0892' },
    { time: '01:38:07', level: 'ERROR', msg: 'Registry hive parsing error: NTUSER.DAT corrupt sector' },
    { time: '01:35:44', level: 'INFO', msg: 'Browser artifact extraction started — Chrome, Firefox' },
    { time: '01:30:12', level: 'INFO', msg: 'Timeline export completed — 4,211 events' },
    { time: '01:27:55', level: 'INFO', msg: 'Case INV-2024-0893 created by Investigator J. Park' },
];

const timelineData = Array.from({ length: 14 }, (_, i) => ({
    day: `D-${13 - i}`,
    events: Math.floor(Math.random() * 200 + 50),
    files: Math.floor(Math.random() * 400 + 100),
}));

const statCards = [
    { label: 'Drives Scanned', value: '12', sub: '3 active', icon: HardDrive, color: 'text-accent-cyan', glow: '#00C896' },
    { label: 'Files Recovered', value: '47,823', sub: '+1.2k today', icon: FileSearch, color: 'text-status-ok', glow: '#00C896' },
    { label: 'Active Cases', value: '6', sub: '2 priority', icon: Layers, color: 'text-status-warn', glow: '#D97706' },
    { label: 'Anomalies', value: '34', sub: '8 unreviewed', icon: AlertTriangle, color: 'text-status-error', glow: '#C0392B' },
    { label: 'Indexed Items', value: '2.4M', sub: 'across 6 cases', icon: Database, color: 'text-accent-blue', glow: '#1F8F6B' },
    { label: 'Avg. Entropy', value: '5.81', sub: 'bits/byte', icon: Activity, color: 'text-accent-cyan', glow: '#00C896' },
];

const levelColor: Record<string, string> = {
    INFO: 'text-status-info',
    WARN: 'text-status-warn',
    ERROR: 'text-status-error',
};

export default function Dashboard() {
    // Ref used to cycle the live log indicator — no re-render needed
    const dotRef = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const t = setInterval(() => {
            if (dotRef.current) {
                dotRef.current.style.opacity =
                    dotRef.current.style.opacity === '0.3' ? '1' : '0.3';
            }
        }, 1500);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Stat Cards */}
            <div className="grid grid-cols-6 gap-3">
                {statCards.map(({ label, value, sub, icon: Icon, color, glow }) => (
                    <div
                        key={label}
                        className="glass-panel rounded-sm p-3 hover-lift"
                        style={{ borderTop: `1px solid ${glow}30` }}
                    >
                        <div className="flex items-start justify-between mb-2">
                            <span className="text-text-muted text-[10px] mono tracking-wide uppercase">{label}</span>
                            <Icon className={`w-3.5 h-3.5 ${color} opacity-80`} />
                        </div>
                        <div className={`text-2xl font-bold ${color} mono leading-none mb-1`}
                            style={{ textShadow: `0 0 16px ${glow}40` }}>
                            {value}
                        </div>
                        <div className="text-text-muted text-[10px]">{sub}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-3 gap-4">
                {/* Timeline Chart */}
                <div className="col-span-2 glass-panel rounded-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Activity — 14 Day Trend</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] mono">
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 bg-accent-cyan rounded" /> Events</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 bg-status-ok rounded" /> Files</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={timelineData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <defs>
                                <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#00C896" stopOpacity={0.22} />
                                    <stop offset="100%" stopColor="#00C896" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#1F8F6B" stopOpacity={0.18} />
                                    <stop offset="100%" stopColor="#1F8F6B" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ background: '#1D2128', border: '1px solid #23262E', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB' }}
                                cursor={{ stroke: '#00C89630' }}
                            />
                            <Area type="monotone" dataKey="events" stroke="#00C896" strokeWidth={1.5} fill="url(#cyanGrad)" dot={false} />
                            <Area type="monotone" dataKey="files" stroke="#1F8F6B" strokeWidth={1.5} fill="url(#greenGrad)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* System Status */}
                <div className="glass-panel rounded-sm p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">System Status</span>
                    </div>
                    {[
                        { label: 'Write-Blocker', value: 'ENGAGED', ok: true },
                        { label: 'Evidence Store', value: 'MOUNTED', ok: true },
                        { label: 'Hash Daemon', value: 'RUNNING', ok: true },
                        { label: 'Log Service', value: 'RUNNING', ok: true },
                        { label: 'RAID Array', value: 'DEGRADED', ok: false },
                        { label: 'Backup Chain', value: 'SYNCED', ok: true },
                    ].map(({ label, value, ok }) => (
                        <div key={label} className="flex items-center justify-between">
                            <span className="text-text-muted text-[10px] mono">{label}</span>
                            <span className={`text-[10px] mono font-medium ${ok ? 'text-status-ok' : 'text-status-error'}`}>
                                {value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Activity Log */}
            <div className="glass-panel rounded-sm">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-bg-border">
                    <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Recent Activity Log</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span ref={dotRef} className="status-dot ok" style={{ transition: 'opacity 0.4s' }} />
                        <span className="text-[10px] text-text-muted mono">Live</span>
                    </div>
                </div>
                <div className="divide-y divide-bg-border/40">
                    {activityLog.map((entry, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-2 table-row-hover">
                            <span className="text-text-muted text-[10px] mono w-16 flex-shrink-0">{entry.time}</span>
                            <span className={`text-[10px] mono font-medium w-10 flex-shrink-0 ${levelColor[entry.level]}`}>
                                {entry.level}
                            </span>
                            <span className="text-text-secondary text-xs">{entry.msg}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
