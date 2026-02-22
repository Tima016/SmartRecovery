import { useState } from 'react';
import {
    BarChart3,
    Activity,
    Users,
    Grid,
} from 'lucide-react';
import {
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer,
    Tooltip,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    Cell,
    AreaChart,
    Area,
    CartesianGrid,
} from 'recharts';

// Disk heatmap — 16x8 grid of blocks
const heatCells = Array.from({ length: 128 }, (_, i) => ({
    id: i,
    value: Math.random(),
    type: Math.random() > 0.85 ? 'deleted' : Math.random() > 0.7 ? 'system' : Math.random() > 0.5 ? 'user' : 'free',
}));

const heatColor = (cell: typeof heatCells[0]) => {
    if (cell.type === 'deleted') return '#C0392B';
    if (cell.type === 'system') return '#3D7EBF';
    if (cell.type === 'user') return '#00C896';
    return '#1D2128';
};

// Entropy over time
const entropyTimeline = Array.from({ length: 24 }, (_, i) => ({
    h: `${i}:00`,
    entropy: 3.5 + Math.sin(i / 3) * 1.5 + Math.random() * 0.8,
}));

// File type distribution — scatter
const fileScatter = Array.from({ length: 60 }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    z: Math.random() * 10 + 1,
    type: ['document', 'image', 'archive', 'executable', 'other'][Math.floor(Math.random() * 5)],
}));

const scatterColors: Record<string, string> = {
    document: '#00C896', image: '#1F8F6B', archive: '#D97706', executable: '#C0392B', other: '#6B7280',
};

// Radar — user activity
const activityRadar = [
    { axis: 'File Ops', value: 88 },
    { axis: 'Network', value: 72 },
    { axis: 'USB Access', value: 45 },
    { axis: 'Auth Events', value: 91 },
    { axis: 'Registry', value: 63 },
    { axis: 'Scheduler', value: 37 },
];

export default function Visualization() {
    const [selectedLegend, setSelectedLegend] = useState<string | null>(null);

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">

                {/* Disk Heatmap */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Grid className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Disk Sector Heatmap — /dev/sdb</span>
                    </div>
                    <div className="grid gap-0.5 mb-3" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
                        {heatCells.map(cell => (
                            <div
                                key={cell.id}
                                title={`Sector ${cell.id * 512} · ${cell.type}`}
                                className="aspect-square rounded-[1px] cursor-pointer hover:opacity-80 transition-opacity"
                                style={{ background: heatColor(cell), opacity: 0.7 + cell.value * 0.3 }}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        {[
                            { label: 'User Data', color: '#00C896' },
                            { label: 'System', color: '#3D7EBF' },
                            { label: 'Deleted', color: '#C0392B' },
                            { label: 'Free', color: '#1D2128', border: '#23262E' },
                        ].map(({ label, color, border }) => (
                            <div key={label} className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-[1px] border" style={{ background: color, borderColor: border || 'transparent' }} />
                                <span className="text-text-muted text-[10px] mono">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Entropy Graph */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Entropy — 24h Profile</span>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={entropyTimeline} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                            <defs>
                                <linearGradient id="entGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#00C896" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="#00C896" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#23262E" strokeDasharray="2 4" vertical={false} />
                            <XAxis dataKey="h" tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} interval={5} />
                            <YAxis tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} domain={[0, 8]} />
                            <Tooltip contentStyle={{ background: '#1D2128', border: '1px solid #23262E', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB', borderRadius: 2 }} formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)} bits/byte`, 'Entropy']} />
                            <Area type="monotone" dataKey="entropy" stroke="#00C896" strokeWidth={1.5} fill="url(#entGrad)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-between mt-1 text-[10px] mono text-text-muted">
                        <span>Avg: 4.82 bits/byte</span>
                        <span className="text-status-warn">⚠ Peak: 7.24 at 22:00</span>
                    </div>
                </div>

                {/* File Distribution Scatter */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">File Distribution Map</span>
                    </div>
                    <ResponsiveContainer width="100%" height={170}>
                        <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                            <CartesianGrid stroke="#23262E" strokeDasharray="2 4" />
                            <XAxis dataKey="x" name="Creation %" tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="y" name="Size rank" tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ strokeDasharray: '2 2', stroke: '#23262E' }} contentStyle={{ background: '#1D2128', border: '1px solid #23262E', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB', borderRadius: 2 }} />
                            <Scatter data={fileScatter} dataKey="z">
                                {fileScatter.map((d, i) => (
                                    <Cell key={i} fill={scatterColors[d.type]} fillOpacity={0.75} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-3 flex-wrap mt-1">
                        {Object.entries(scatterColors).map(([label, color]) => (
                            <div key={label} className="flex items-center gap-1.5 cursor-pointer" onClick={() => setSelectedLegend(selectedLegend === label ? null : label)}>
                                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                                <span className={`text-[10px] mono capitalize ${selectedLegend === label ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* User Activity Radar */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">User Activity Correlation — john.doe</span>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <RadarChart data={activityRadar} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
                            <PolarGrid stroke="#23262E" />
                            <PolarAngleAxis dataKey="axis" tick={{ fill: '#9CA3AF', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
                            <Radar name="Activity" dataKey="value" stroke="#00C896" fill="#00C896" fillOpacity={0.12} strokeWidth={1.5} dot={{ fill: '#00C896', r: 3 }} />
                            <Tooltip contentStyle={{ background: '#1D2128', border: '1px solid #23262E', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB', borderRadius: 2 }} />
                        </RadarChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                        {activityRadar.map(({ axis, value }) => (
                            <div key={axis} className="flex items-center justify-between bg-bg-elevated border border-bg-border rounded-sm px-2 py-1">
                                <span className="text-text-muted text-[9px] mono">{axis}</span>
                                <span className="text-accent-cyan text-[9px] mono font-bold">{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
