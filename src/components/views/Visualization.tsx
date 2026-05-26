import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, Activity, Users, Grid, Loader2,
} from 'lucide-react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis,
    ResponsiveContainer, Tooltip,
    ScatterChart, Scatter, XAxis, YAxis, Cell,
    AreaChart, Area, CartesianGrid,
} from 'recharts';
import { useParams } from 'react-router-dom';
import { correlationApi } from '../../api/correlation.api';
import { filesystemApi } from '../../api/filesystem.api';
import { timelineApi } from '../../api/timeline.api';
import { artifactsApi } from '../../api/artifacts.api';
import { useCase } from '../../context/CaseContext';

// ── Color maps ────────────────────────────────────────────────────────────
const HEAT_COLORS: Record<string, string> = {
    deleted: '#C0392B', system: '#3D7EBF', user: '#00C896', free: '#1D2128',
};
const SCATTER_COLORS: Record<string, string> = {
    document: '#00C896', image: '#1F8F6B', archive: '#D97706', executable: '#C0392B', other: '#6B7280',
};

function classifyFileType(name: string): string {
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'ppt', 'pptx', 'rtf'].includes(ext)) return 'document';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico', 'webp', 'tiff'].includes(ext)) return 'image';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab'].includes(ext)) return 'archive';
    if (['exe', 'dll', 'sys', 'bat', 'cmd', 'ps1', 'sh', 'msi', 'com'].includes(ext)) return 'executable';
    return 'other';
}

function classifyHeatType(entry: any): string {
    if (entry.isDeleted) return 'deleted';
    const p = (entry.path ?? entry.name ?? '').toLowerCase();
    if (p.includes('windows') || p.includes('system') || p.includes('$mft') || p.includes('pagefile') || p.includes('hiberfil')) return 'system';
    if (entry.isDirectory) return 'system';
    return 'user';
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Visualization() {
    const { caseId: urlCaseId } = useParams<{ caseId: string }>();
    const { selectedCaseId, setSelectedCaseId } = useCase();
    const effectiveCaseId = urlCaseId || selectedCaseId;

    const [loading, setLoading] = useState(false);
    const [selectedLegend, setSelectedLegend] = useState<string | null>(null);

    useEffect(() => {
        if (urlCaseId && urlCaseId !== selectedCaseId) {
            setSelectedCaseId(urlCaseId);
        }
    }, [urlCaseId]);

    // Raw API data
    const [fileEntries, setFileEntries] = useState<any[]>([]);
    const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
    const [artifacts, setArtifacts] = useState<any[]>([]);
    const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] } | null>(null);

    useEffect(() => {
        if (!effectiveCaseId) return;
        let active = true;
        setLoading(true);

        Promise.allSettled([
            filesystemApi.getTree(effectiveCaseId),
            timelineApi.getByCaseId(effectiveCaseId),
            artifactsApi.getByCaseId(effectiveCaseId),
            // Correlation is optional — compute then fetch graph, catch gracefully
            correlationApi.compute(effectiveCaseId).catch(() => null).then(() => correlationApi.getGraph(effectiveCaseId).catch(() => null)),
        ]).then(([fsRes, tlRes, artRes, graphRes]) => {
            if (!active) return;
            if (fsRes.status === 'fulfilled') {
                const data = Array.isArray(fsRes.value) ? fsRes.value : (fsRes.value?.entries ?? fsRes.value?.data ?? []);
                setFileEntries(data);
            }
            if (tlRes.status === 'fulfilled') {
                const data = Array.isArray(tlRes.value) ? tlRes.value : (tlRes.value?.events ?? tlRes.value?.data ?? []);
                setTimelineEvents(data);
            }
            if (artRes.status === 'fulfilled') {
                const data = Array.isArray(artRes.value) ? artRes.value : (artRes.value?.data ?? []);
                setArtifacts(data);
            }
            if (graphRes.status === 'fulfilled' && graphRes.value) {
                setGraph(graphRes.value);
            }
        }).finally(() => { if (active) setLoading(false); });

        return () => { active = false; };
    }, [effectiveCaseId]);

    // ── Derived datasets ──────────────────────────────────────────────────
    // 1. Disk Sector Heatmap — 128 cells from file entries
    const heatCells = useMemo(() => {
        if (fileEntries.length === 0) {
            return Array.from({ length: 128 }, (_, i) => ({ id: i, value: 0, type: 'free' }));
        }
        const cellCount = 128;
        const cells = Array.from({ length: cellCount }, (_, i) => ({ id: i, value: 0, type: 'free' }));
        fileEntries.forEach((entry, idx) => {
            const cellIdx = idx % cellCount;
            cells[cellIdx].type = classifyHeatType(entry);
            cells[cellIdx].value = Math.min(1, (entry.sizeBytes ?? 0) / 100000);
        });
        return cells;
    }, [fileEntries]);

    // 2. Entropy Timeline — events per hour over 24h
    const entropyTimeline = useMemo(() => {
        const hours = Array.from({ length: 24 }, (_, i) => ({ h: `${i}:00`, entropy: 0, count: 0 }));
        timelineEvents.forEach((ev: any) => {
            const ts = ev.timestamp ?? ev.occurredAt ?? ev.createdAt;
            if (!ts) return;
            const hour = new Date(ts).getHours();
            if (hour >= 0 && hour < 24) {
                hours[hour].count += 1;
            }
        });
        // Normalize to entropy-like scale (0-8 bits/byte)
        const maxCount = Math.max(1, ...hours.map(h => h.count));
        hours.forEach(h => { h.entropy = (h.count / maxCount) * 7.5 + (h.count > 0 ? 0.5 : 0); });
        return hours;
    }, [timelineEvents]);

    // 3. File Distribution Scatter — files by index vs size
    const fileScatter = useMemo(() => {
        return fileEntries.filter((e: any) => !e.isDirectory).slice(0, 200).map((entry: any, idx: number) => ({
            x: idx,
            y: Math.log10(Math.max(1, entry.sizeBytes ?? 1)),
            z: Math.max(1, Math.min(15, Math.log10(entry.sizeBytes ?? 1))),
            type: classifyFileType(entry.name ?? ''),
        }));
    }, [fileEntries]);

    // 4. Activity Radar — artifact type counts
    const activityRadar = useMemo(() => {
        const counts: Record<string, number> = { 'File Ops': 0, 'Network': 0, 'USB Access': 0, 'Auth Events': 0, 'Registry': 0, 'Scheduler': 0 };
        artifacts.forEach((a: any) => {
            const t = (a.artifactType ?? a.type ?? '').toUpperCase();
            if (t.includes('NETWORK') || t.includes('CONNECTION')) counts['Network']++;
            else if (t.includes('USB') || t.includes('DEVICE')) counts['USB Access']++;
            else if (t.includes('AUTH') || t.includes('LOGIN') || t.includes('EVENT_LOG')) counts['Auth Events']++;
            else if (t.includes('REGISTRY')) counts['Registry']++;
            else if (t.includes('PREFETCH') || t.includes('SCHEDULE')) counts['Scheduler']++;
            else counts['File Ops']++;
        });
        // Also count timeline events
        timelineEvents.forEach((ev: any) => {
            const t = (ev.eventType ?? '').toUpperCase();
            if (t.includes('NETWORK') || t.includes('CONNECTION')) counts['Network']++;
            else if (t.includes('USB') || t.includes('DEVICE')) counts['USB Access']++;
            else if (t.includes('AUTH') || t.includes('LOGIN') || t.includes('LOGON')) counts['Auth Events']++;
            else if (t.includes('REGISTRY')) counts['Registry']++;
            else if (t.includes('SCHEDULE') || t.includes('TASK')) counts['Scheduler']++;
            else counts['File Ops']++;
        });
        const maxVal = Math.max(1, ...Object.values(counts));
        return Object.entries(counts).map(([axis, count]) => ({ axis, value: Math.round((count / maxVal) * 100) }));
    }, [artifacts, timelineEvents]);

    // Derived stats
    const avgEntropy = useMemo(() => {
        const vals = entropyTimeline.filter(h => h.entropy > 0);
        if (vals.length === 0) return 0;
        return vals.reduce((s, h) => s + h.entropy, 0) / vals.length;
    }, [entropyTimeline]);

    const peakEntropy = useMemo(() => {
        return entropyTimeline.reduce((best, h) => h.entropy > best.entropy ? h : best, { h: '0:00', entropy: 0 });
    }, [entropyTimeline]);

    const totalNodes = graph?.nodes?.length ?? 0;
    const totalEdges = graph?.edges?.length ?? 0;

    if (!effectiveCaseId) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4 p-4 overflow-y-auto relative min-h-[400px]">
                <h2 className="text-xl font-bold text-text-primary mono">No Case Selected</h2>
                <p className="text-text-muted text-sm mono">Please select a case to view visualization data</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Files Analyzed', value: String(fileEntries.length) },
                    { label: 'Timeline Events', value: String(timelineEvents.length) },
                    { label: 'Artifacts', value: String(artifacts.length) },
                    { label: 'Correlation Graph', value: `${totalNodes} nodes · ${totalEdges} edges` },
                ].map(({ label, value }) => (
                    <div key={label} className="glass-panel rounded-sm px-3 py-2 flex items-center justify-between">
                        <span className="text-text-muted text-[10px] mono">{label}</span>
                        <span className="text-accent-cyan text-xs mono font-bold">{value}</span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Disk Heatmap */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Grid className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Disk Sector Heatmap</span>
                        <span className="text-text-muted text-[9px] mono ml-auto">{fileEntries.length} entries</span>
                    </div>
                    <div className="grid gap-0.5 mb-3" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
                        {heatCells.map(cell => (
                            <div
                                key={cell.id}
                                title={`Block ${cell.id} · ${cell.type}`}
                                className="aspect-square rounded-[1px] cursor-pointer hover:opacity-80 transition-opacity"
                                style={{ background: HEAT_COLORS[cell.type] ?? HEAT_COLORS.free, opacity: 0.7 + cell.value * 0.3 }}
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

                {/* Entropy / Activity Timeline */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Activity Density — 24h Profile</span>
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
                            <Tooltip
                                contentStyle={{ background: '#1D2128', border: '1px solid #23262E', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB', borderRadius: 2 }}
                                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)} density`, 'Activity']}
                            />
                            <Area type="monotone" dataKey="entropy" stroke="#00C896" strokeWidth={1.5} fill="url(#entGrad)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-between mt-1 text-[10px] mono text-text-muted">
                        <span>Avg: {avgEntropy.toFixed(2)} density</span>
                        {peakEntropy.entropy > 0 && (
                            <span className="text-status-warn">⚠ Peak: {peakEntropy.entropy.toFixed(2)} at {peakEntropy.h}</span>
                        )}
                    </div>
                </div>

                {/* File Distribution Scatter */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">File Distribution Map</span>
                        <span className="text-text-muted text-[9px] mono ml-auto">{fileScatter.length} files</span>
                    </div>
                    {fileScatter.length > 0 ? (
                        <ResponsiveContainer width="100%" height={170}>
                            <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                                <CartesianGrid stroke="#23262E" strokeDasharray="2 4" />
                                <XAxis dataKey="x" name="File #" tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                                <YAxis dataKey="y" name="Log₁₀ Size" tick={{ fill: '#6B7280', fontSize: 9, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ strokeDasharray: '2 2', stroke: '#23262E' }}
                                    contentStyle={{ background: '#1D2128', border: '1px solid #23262E', fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E6E8EB', borderRadius: 2 }}
                                />
                                <Scatter data={fileScatter} dataKey="z">
                                    {fileScatter.map((d, i) => (
                                        <Cell key={i} fill={SCATTER_COLORS[d.type]} fillOpacity={0.75} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[170px] text-text-muted text-[10px] mono">No file data available</div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap mt-1">
                        {Object.entries(SCATTER_COLORS).map(([label, color]) => (
                            <div key={label} className="flex items-center gap-1.5 cursor-pointer" onClick={() => setSelectedLegend(selectedLegend === label ? null : label)}>
                                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                                <span className={`text-[10px] mono capitalize ${selectedLegend === label ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activity Radar */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Artifact Category Distribution</span>
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
                                <span className="text-accent-cyan text-[9px] mono font-bold">{value}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
