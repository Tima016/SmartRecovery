import { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Filter, Clock, Globe, HardDrive, User, Terminal, Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { timelineApi } from '../../api/timeline.api';
import { useCase } from '../../context/CaseContext';
import type { LucideIcon } from 'lucide-react';

type EventType = 'all' | 'file' | 'network' | 'auth' | 'process' | 'usb';

const eventTypes: { id: EventType; label: string; color: string }[] = [
    { id: 'all', label: 'All Events', color: '#9CA3AF' },
    { id: 'file', label: 'File System', color: '#00C896' },
    { id: 'network', label: 'Network', color: '#1F8F6B' },
    { id: 'auth', label: 'Auth', color: '#D97706' },
    { id: 'process', label: 'Process', color: '#3D7EBF' },
    { id: 'usb', label: 'USB', color: '#C0392B' },
];

const typeStyle: Record<string, { dot: string; bg: string; border: string; text: string }> = {
    file: { dot: '#00C896', bg: 'rgba(0,200,150,0.07)', border: 'rgba(0,200,150,0.22)', text: '#00C896' },
    network: { dot: '#1F8F6B', bg: 'rgba(31,143,107,0.07)', border: 'rgba(31,143,107,0.22)', text: '#1F8F6B' },
    auth: { dot: '#D97706', bg: 'rgba(217,119,6,0.07)', border: 'rgba(217,119,6,0.22)', text: '#D97706' },
    process: { dot: '#3D7EBF', bg: 'rgba(61,126,191,0.07)', border: 'rgba(61,126,191,0.22)', text: '#3D7EBF' },
    usb: { dot: '#C0392B', bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.22)', text: '#C0392B' },
};

const typeIcons: Record<string, LucideIcon> = {
    file: HardDrive,
    network: Globe,
    auth: User,
    process: Terminal,
    usb: HardDrive,
};

interface TimelineEvent {
    id: string | number;
    time: string;
    type: string;
    label: string;
    detail: string;
    notes?: string;
}

const normalizeTimelineType = (value: string): EventType => {
    const t = (value || '').toLowerCase();
    if (t === 'file' || t.includes('file')) return 'file';
    if (t === 'network' || t.includes('network')) return 'network';
    if (t === 'process' || t.includes('process')) return 'process';
    if (t === 'usb' || t.includes('usb')) return 'usb';
    if (t === 'authentication' || t === 'auth' || t.includes('login') || t.includes('auth')) return 'auth';
    if (t === 'registry' || t.includes('registry')) return 'file';
    if (t === 'system' || t.includes('system')) return 'process';
    return 'file';
};

export default function Timeline() {
    const { caseId: urlCaseId } = useParams<{ caseId: string }>();
    const { selectedCaseId, setSelectedCaseId } = useCase();
    const effectiveCaseId = urlCaseId || selectedCaseId;

    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<EventType>('all');
    const [zoom, setZoom] = useState(1);
    const [hovered, setHovered] = useState<string | null>(null);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState<string>('');

    // Sync URL caseId to context (for sidebar/topbar awareness)
    useEffect(() => {
        if (urlCaseId && urlCaseId !== selectedCaseId) {
            setSelectedCaseId(urlCaseId);
        }
    }, [urlCaseId]);

    useEffect(() => {
        let cancelled = false;

        const fetchTimeline = async () => {
            if (!effectiveCaseId) {
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                setError('');
                const data = await timelineApi.getByCaseId(effectiveCaseId);
                if (cancelled) return;
                const list = Array.isArray(data) ? data : (data?.events ?? data?.data ?? []);
                const mapped: TimelineEvent[] = list.map((e: any, i: number) => ({
                    id: e.id ?? i + 1,
                    time: e.timestamp ?? e.time ?? e.createdAt ?? '—',
                    type: normalizeTimelineType(e.type ?? e.category ?? 'file'),
                    label: e.label ?? e.title ?? e.description ?? e.action ?? '—',
                    detail: e.detail ?? e.targetObject ?? e.source ?? e.metadata ?? e.details ?? '—',
                    notes: e.notes || undefined,
                }));
                setEvents(mapped);
            } catch (err: any) {
                if (cancelled) return;
                // 404 means no data yet — not an error
                if (err?.response?.status === 404) {
                    setEvents([]);
                } else {
                    setError(err instanceof Error ? err.message : 'Failed to load timeline');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchTimeline();
        return () => { cancelled = true; };
    }, [effectiveCaseId]);

    const filtered = events.filter(e => filter === 'all' || e.type === filter);

    // Calculate date range for ruler
    const timestamps = filtered.map(e => new Date(e.time).getTime()).filter(t => !isNaN(t));
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : Date.now() - 86400000 * 3;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
    const rangeMs = maxTime - minTime || 1;

    // Clustering logic: events within 60 seconds are clustered
    const clusteredEvents: (TimelineEvent & { clusterCount?: number })[] = [];
    let currentCluster: any = null;

    filtered.forEach((e) => {
        const timeMs = new Date(e.time).getTime();
        if (currentCluster && !isNaN(timeMs) && Math.abs(timeMs - currentCluster.timeMs) <= 60000) {
            currentCluster.clusterCount = (currentCluster.clusterCount || 1) + 1;
        } else {
            const newEv = { ...e, timeMs };
            clusteredEvents.push(newEv);
            currentCluster = newEv;
        }
    });

    if (!effectiveCaseId) {
        return (
            <div className="h-full flex flex-col overflow-hidden p-4 space-y-4 relative">
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    <h2 className="text-xl font-bold text-text-primary mono">No Case Selected</h2>
                    <p className="text-text-muted text-sm mono">Please select a case to view timeline data</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 text-accent-cyan animate-spin" />
                <span className="text-text-muted mono text-sm font-semibold tracking-widest animate-pulse">SYNTHESIZING TIMELINE...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="p-4 bg-status-error/10 border border-status-error/30 rounded-sm flex items-center gap-3">
                    <span className="text-status-error text-sm mono">{error}</span>
                </div>
            </div>
        );
    }

    const handleSaveNote = async () => {
        if (!effectiveCaseId || !selectedEventId) return;
        try {
            await timelineApi.updateNote(effectiveCaseId, selectedEventId, editingNote);
            setEvents(prev => prev.map(ev => String(ev.id) === selectedEventId ? { ...ev, notes: editingNote } : ev));
            setSelectedEventId(null);
            setEditingNote('');
        } catch (err: any) {
            alert('Failed to save note: ' + err.message);
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden p-4 space-y-4 relative">
            {/* Modal */}
            {selectedEventId && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-bg-elevated border border-bg-border rounded-sm p-4 w-96 shadow-xl">
                        <h3 className="text-text-primary mb-3 font-semibold mono">Investigator Note</h3>
                        <textarea
                            className="w-full h-32 bg-bg-primary border border-bg-border p-2 text-sm text-text-primary mono rounded-sm outline-none focus:border-accent-cyan"
                            placeholder="Add your note..."
                            value={editingNote}
                            onChange={(e) => setEditingNote(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setSelectedEventId(null)} className="px-3 py-1.5 text-text-muted hover:text-text-primary text-xs mono">Cancel</button>
                            <button onClick={handleSaveNote} className="px-3 py-1.5 bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 rounded-sm text-xs mono font-bold transition-colors">Save Note</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="flex shrink-0 items-center gap-3 flex-wrap">
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
            <div className="glass-panel shrink-0 rounded-sm p-3">
                <div className="flex items-center gap-4 mb-2">
                    <Clock className="w-3.5 h-3.5 text-accent-cyan flex-shrink-0" />
                    <span className="text-text-muted text-[10px] mono">{new Date(minTime).toISOString().split('T')[0]}</span>
                    <div className="flex-1 h-px bg-bg-border relative">
                        <div className="absolute left-0 top-0 bottom-0 flex items-center w-full">
                            {[0, 25, 50, 75, 100].map(p => (
                                <div key={p} className="absolute" style={{ left: `${p}%` }}>
                                    <div className="w-px h-2 bg-bg-border" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <span className="text-text-muted text-[10px] mono">{new Date(maxTime).toISOString().split('T')[0]}</span>
                </div>
                {/* Event dots on ruler */}
                <div className="relative h-8 ml-20 mr-16 overflow-hidden">
                    <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-bg-border" />
                    <div style={{ transform: `scaleX(${zoom})`, transformOrigin: 'left center', width: '100%', height: '100%' }}>
                        {filtered.map((e) => {
                            const date = new Date(e.time).getTime();
                            const pct = isNaN(date) ? 50 : ((date - minTime) / rangeMs) * 100;
                            const style = typeStyle[e.type] || typeStyle.file;
                            return (
                                <div
                                    key={e.id}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-150"
                                    style={{ left: `${Math.max(0, Math.min(100, pct))}%`, top: '50%' }}
                                    onMouseEnter={() => setHovered(String(e.id))}
                                    onMouseLeave={() => setHovered(null)}
                                >
                                    <div className="w-2.5 h-2.5 rounded-full border" style={{ background: style.dot, borderColor: style.border, boxShadow: `0 0 6px ${style.dot}60` }} />
                                    {hovered === String(e.id) && (
                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-48 p-2 rounded-sm text-[10px] border shadow-xl whitespace-normal"
                                            style={{ background: '#1D2128', borderColor: style.border, color: '#E6E8EB', transform: `scaleX(${1 / zoom})` }}>
                                            <div className="font-semibold mono mb-0.5" style={{ color: style.text }}>{e.label}</div>
                                            <div className="text-text-muted">{e.time}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Event list */}
            <div className="glass-panel flex-1 min-h-0 rounded-sm overflow-hidden flex flex-col">
                <div className="grid grid-cols-[1.4fr_0.6fr_2fr_2.5fr_1fr] gap-4 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide shrink-0">
                    <span>Timestamp</span><span>Type</span><span>Event</span><span>Detail</span><span>Notes</span>
                </div>
                <div className="divide-y divide-bg-border/30 overflow-y-auto flex-1 pb-4">
                    {clusteredEvents.length > 0 ? clusteredEvents.map((e) => {
                        const style = typeStyle[e.type] || typeStyle.file;
                        const Icon = typeIcons[e.type] || HardDrive;
                        return (
                            <div key={e.id} className="grid grid-cols-[1.4fr_0.6fr_2fr_2.5fr_1fr] gap-4 px-4 py-2.5 table-row-hover items-center">
                                <span className="text-text-secondary text-[10px] mono flex items-center gap-2">
                                    {e.time}
                                    {e.clusterCount && e.clusterCount > 1 && (
                                        <span className="bg-status-warning/10 text-status-warning border border-status-warning/20 px-1 py-0.5 rounded text-[8px]">
                                            +{e.clusterCount - 1} closely related
                                        </span>
                                    )}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: style.dot, boxShadow: `0 0 4px ${style.dot}` }} />
                                    <span className="text-[10px] mono font-medium capitalize" style={{ color: style.text }}>{e.type}</span>
                                </div>
                                <div className="flex items-center gap-2 truncate">
                                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: style.dot }} />
                                    <span className="text-text-primary text-xs truncate" title={e.label}>{e.label}</span>
                                </div>
                                <span className="text-text-muted text-[10px] mono truncate" title={String(e.detail)}>
                                    {typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}
                                </span>
                                <div className="flex items-center gap-2 text-[10px] mono">
                                    <button
                                        onClick={() => {
                                            setSelectedEventId(String(e.id));
                                            setEditingNote(e.notes || '');
                                        }}
                                        className="text-accent-cyan hover:underline truncate max-w-[120px]"
                                    >
                                        {e.notes ? e.notes : '+ Add Note'}
                                    </button>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="px-4 py-6 text-center text-text-muted text-xs mono">No timeline events found</div>
                    )}
                </div>
            </div>
        </div>
    );
}
