import { useEffect, useMemo, useState } from 'react';
import { Search, Globe, Usb, BookOpen, AlertCircle, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { artifactsApi } from '../../api/artifacts.api';
import { useCase } from '../../context/CaseContext';

const tabs = [
    { id: 'browser', icon: Globe, label: 'Browser History' },
    { id: 'usb', icon: Usb, label: 'USB History' },
    { id: 'registry', icon: BookOpen, label: 'Registry Changes' },
    { id: 'events', icon: AlertCircle, label: 'Event Logs' },
] as const;

type TabId = typeof tabs[number]['id'];

type BrowserRow = { url: string; title: string; time: string; browser: string; visits: number };
type UsbRow = { device: string; serial: string; type: string; connected: string; size: string };
type RegistryRow = { hive: string; key: string; value: string; data: string; time: string; action: string };
type EventRow = { id: string; level: string; source: string; msg: string; time: string };

const levelColor: Record<string, string> = {
    INFO: 'text-status-info',
    WARN: 'text-status-warn',
    WARNING: 'text-status-warn',
    ERROR: 'text-status-error',
    CRITICAL: 'text-status-error',
};

const toTimestamp = (value: any) => {
    const str = String(value ?? '').trim();
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d.getTime()) ? str : d.toISOString();
};

export default function ArtifactAnalysis() {
    const [activeTab, setActiveTab] = useState<TabId>('browser');
    const [search, setSearch] = useState('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const { caseId: urlCaseId } = useParams<{ caseId: string }>();
    const { selectedCaseId, setSelectedCaseId } = useCase();
    const effectiveCaseId = urlCaseId || selectedCaseId;

    const [browserHistory, setBrowserHistory] = useState<BrowserRow[]>([]);
    const [usbHistory, setUsbHistory] = useState<UsbRow[]>([]);
    const [registryChanges, setRegistryChanges] = useState<RegistryRow[]>([]);
    const [eventLogs, setEventLogs] = useState<EventRow[]>([]);

    useEffect(() => {
        if (urlCaseId && urlCaseId !== selectedCaseId) {
            setSelectedCaseId(urlCaseId);
        }
    }, [urlCaseId, selectedCaseId, setSelectedCaseId]);

    useEffect(() => {
        let cancelled = false;

        const fetchArtifacts = async () => {
            if (!effectiveCaseId) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError('');
                const data = await artifactsApi.getByCaseId(effectiveCaseId);
                if (cancelled) return;

                const list = Array.isArray(data) ? data : (data?.data ?? []);

                const browser: BrowserRow[] = [];
                const usb: UsbRow[] = [];
                const registry: RegistryRow[] = [];
                const events: EventRow[] = [];

                for (const item of list) {
                    const type = String(item.type ?? '').toUpperCase();
                    const entries = Array.isArray(item.data?.entries) ? item.data.entries : [];

                    if (type === 'BROWSER_HISTORY' || type.includes('BROWSER')) {
                        for (const entry of entries) {
                            browser.push({
                                url: entry.url ?? '—',
                                title: entry.title ?? '—',
                                time: toTimestamp(entry.visitTime ?? entry.timestamp),
                                browser: entry.browser ?? item.source ?? '—',
                                visits: Number(entry.visitCount ?? 1),
                            });
                        }
                    } else if (type === 'USB_LOG' || type.includes('USB')) {
                        for (const entry of entries) {
                            usb.push({
                                device: entry.deviceDescription ?? entry.deviceId ?? '—',
                                serial: entry.serialNumber ?? '—',
                                type: `${entry.vendorId ?? ''} ${entry.productId ?? ''}`.trim() || entry.deviceId || 'USB',
                                connected: toTimestamp(entry.firstConnected ?? entry.lastConnected ?? entry.timestamp),
                                size: '—',
                            });
                        }
                    } else if (type === 'REGISTRY_HIVE' || type.includes('REGISTRY')) {
                        const regEntries = Array.isArray(item.data?.entries) ? item.data.entries : [];
                        const apps = Array.isArray(item.data?.installedApps) ? item.data.installedApps : [];
                        const accounts = Array.isArray(item.data?.userAccounts) ? item.data.userAccounts : [];

                        for (const entry of regEntries) {
                            registry.push({
                                hive: entry.hive ?? '—',
                                key: entry.key ?? '—',
                                value: entry.valueName ?? '—',
                                data: entry.valueData ?? '—',
                                time: toTimestamp(entry.lastModified),
                                action: 'READ',
                            });
                        }
                        for (const app of apps) {
                            registry.push({
                                hive: 'SOFTWARE',
                                key: app.installPath ?? '—',
                                value: app.name ?? '—',
                                data: `v${app.version ?? '?'} ${app.publisher ? `(${app.publisher})` : ''}`.trim(),
                                time: toTimestamp(app.installDate),
                                action: 'INSTALL',
                            });
                        }
                        for (const acct of accounts) {
                            registry.push({
                                hive: 'SAM',
                                key: 'SAM\\Domains\\Account\\Users',
                                value: acct.username ?? '—',
                                data: `SID: ${acct.sid ?? '—'} | Last Login: ${acct.lastLogin ?? '—'}`,
                                time: toTimestamp(acct.lastLogin),
                                action: 'ACCOUNT',
                            });
                        }
                    } else if (type === 'EVENT_LOG' || type.includes('EVENT')) {
                        for (const entry of entries) {
                            events.push({
                                id: String(entry.eventId ?? '—'),
                                level: String(entry.level ?? 'INFO').toUpperCase(),
                                source: entry.source ?? entry.channel ?? '—',
                                msg: entry.description ?? '—',
                                time: toTimestamp(entry.timestamp),
                            });
                        }
                    } else if (type === 'PREFETCH') {
                        for (const entry of entries) {
                            events.push({
                                id: String(entry.runCount ?? '—'),
                                level: 'INFO',
                                source: 'Prefetch',
                                msg: `${entry.filename ?? '—'} (${entry.runCount ?? 0} runs)`,
                                time: toTimestamp(entry.lastRun),
                            });
                        }
                    } else if (type === 'NETWORK_CAPTURE' || type.includes('NETWORK')) {
                        for (const entry of entries) {
                            events.push({
                                id: `${entry.dstIp ?? '—'}:${entry.dstPort ?? '—'}`,
                                level: entry.suspicious ? 'WARN' : 'INFO',
                                source: 'Network',
                                msg: `${entry.protocol ?? '—'} ${entry.srcIp ?? ''}:${entry.srcPort ?? ''} -> ${entry.dstIp ?? ''}:${entry.dstPort ?? ''} (${entry.note ?? '—'})`,
                                time: toTimestamp(entry.timestamp),
                            });
                        }
                    } else {
                        events.push({
                            id: String(item.id ?? '—'),
                            level: 'INFO',
                            source: item.source ?? type,
                            msg: item.data ? JSON.stringify(item.data).slice(0, 180) : '—',
                            time: toTimestamp(item.extractedAt ?? item.createdAt),
                        });
                    }
                }

                setBrowserHistory(browser);
                setUsbHistory(usb);
                setRegistryChanges(registry);
                setEventLogs(events);
            } catch (err: unknown) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load artifacts');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchArtifacts();
        return () => { cancelled = true; };
    }, [effectiveCaseId]);

    const searchLower = search.toLowerCase();

    const filteredBrowser = useMemo(() => {
        const filtered = browserHistory.filter((r) => !search || r.url.toLowerCase().includes(searchLower) || r.title.toLowerCase().includes(searchLower));
        return filtered.sort((a, b) => sortDir === 'asc' ? a.time.localeCompare(b.time) : b.time.localeCompare(a.time));
    }, [browserHistory, search, searchLower, sortDir]);

    const filteredUsb = useMemo(() => {
        const filtered = usbHistory.filter((r) => !search || r.device.toLowerCase().includes(searchLower) || r.serial.toLowerCase().includes(searchLower));
        return filtered.sort((a, b) => sortDir === 'asc' ? a.connected.localeCompare(b.connected) : b.connected.localeCompare(a.connected));
    }, [usbHistory, search, searchLower, sortDir]);

    const filteredRegistry = useMemo(() => {
        const filtered = registryChanges.filter((r) => !search || `${r.hive} ${r.key} ${r.value} ${r.data}`.toLowerCase().includes(searchLower));
        return filtered.sort((a, b) => sortDir === 'asc' ? a.time.localeCompare(b.time) : b.time.localeCompare(a.time));
    }, [registryChanges, search, searchLower, sortDir]);

    const filteredEvents = useMemo(() => {
        const filtered = eventLogs.filter((r) => !search || `${r.id} ${r.source} ${r.msg}`.toLowerCase().includes(searchLower));
        return filtered.sort((a, b) => sortDir === 'asc' ? a.time.localeCompare(b.time) : b.time.localeCompare(a.time));
    }, [eventLogs, search, searchLower, sortDir]);

    if (!effectiveCaseId) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4 p-4 overflow-hidden relative">
                <h2 className="text-xl font-bold text-text-primary mono">No Case Selected</h2>
                <p className="text-text-muted text-sm mono">Please select a case to view artifacts</p>
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

    if (error) {
        return (
            <div className="h-full flex items-center justify-center text-status-error text-sm mono">
                {error}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden p-4 gap-4">
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
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-transparent text-text-primary text-xs outline-none placeholder-text-muted mono w-48"
                    />
                </div>
                <button
                    onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-bg-elevated border border-bg-border text-text-secondary text-xs rounded-sm hover:text-text-primary"
                >
                    {sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    Time
                </button>
            </div>

            <div className="flex-1 overflow-hidden glass-panel rounded-sm flex flex-col">
                {activeTab === 'browser' && (
                    <>
                        <div className="grid grid-cols-[3fr_2fr_1.2fr_0.7fr_0.6fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>URL</span><span>Title</span><span>Timestamp</span><span>Browser</span><span>Visits</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {filteredBrowser.length > 0 ? filteredBrowser.map((r, i) => (
                                <div key={i} className="grid grid-cols-[3fr_2fr_1.2fr_0.7fr_0.6fr] gap-3 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[11px] mono truncate">{r.url}</span>
                                    <span className="text-text-primary text-xs truncate">{r.title}</span>
                                    <span className="text-text-secondary text-[10px] mono">{r.time}</span>
                                    <span className="text-text-muted text-[10px]">{r.browser}</span>
                                    <span className="text-text-secondary text-[10px] mono text-right">{r.visits}</span>
                                </div>
                            )) : (
                                <div className="px-4 py-6 text-center text-text-muted text-xs mono">No browser history found</div>
                            )}
                        </div>
                    </>
                )}
                {activeTab === 'usb' && (
                    <>
                        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_0.7fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>Device</span><span>Serial</span><span>Type</span><span>Connected</span><span>Size</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {filteredUsb.length > 0 ? filteredUsb.map((r, i) => (
                                <div key={i} className="grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_0.7fr] gap-3 px-4 py-3 table-row-hover items-center">
                                    <span className="text-text-primary text-xs font-medium">{r.device}</span>
                                    <span className="text-accent-cyan text-[10px] mono">{r.serial}</span>
                                    <span className="text-text-secondary text-xs">{r.type}</span>
                                    <span className="text-text-muted text-[10px] mono">{r.connected}</span>
                                    <span className="text-text-secondary text-[10px] mono">{r.size}</span>
                                </div>
                            )) : (
                                <div className="px-4 py-6 text-center text-text-muted text-xs mono">No USB history found</div>
                            )}
                        </div>
                    </>
                )}
                {activeTab === 'registry' && (
                    <>
                        <div className="grid grid-cols-[0.7fr_2fr_1fr_1.5fr_0.9fr_0.6fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>Hive</span><span>Key</span><span>Value</span><span>Data</span><span>Time</span><span>Action</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {filteredRegistry.length > 0 ? filteredRegistry.map((r, i) => (
                                <div key={i} className="grid grid-cols-[0.7fr_2fr_1fr_1.5fr_0.9fr_0.6fr] gap-3 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[10px] mono font-medium">{r.hive}</span>
                                    <span className="text-text-muted text-[10px] mono truncate">{r.key}</span>
                                    <span className="text-text-primary text-[11px] mono">{r.value}</span>
                                    <span className="text-text-secondary text-[10px] mono truncate">{r.data}</span>
                                    <span className="text-text-muted text-[10px] mono">{typeof r.time === 'string' ? r.time.split('T')[0] : '—'}</span>
                                    <span className={`tag border text-[9px] ${r.action === 'INSTALL' ? 'bg-status-warn/15 text-status-warn border-status-warn/30' : 'bg-status-info/15 text-status-info border-status-info/30'}`}>
                                        {r.action}
                                    </span>
                                </div>
                            )) : (
                                <div className="px-4 py-6 text-center text-text-muted text-xs mono">No registry changes found</div>
                            )}
                        </div>
                    </>
                )}
                {activeTab === 'events' && (
                    <>
                        <div className="grid grid-cols-[0.8fr_0.6fr_0.8fr_3.8fr_1.2fr] gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                            <span>Event ID</span><span>Level</span><span>Source</span><span>Description</span><span>Time</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {filteredEvents.length > 0 ? filteredEvents.map((r, i) => (
                                <div key={i} className="grid grid-cols-[0.8fr_0.6fr_0.8fr_3.8fr_1.2fr] gap-3 px-4 py-2.5 table-row-hover items-center">
                                    <span className="text-accent-cyan text-[10px] mono font-bold truncate">{r.id}</span>
                                    <span className={`text-[10px] mono font-medium ${levelColor[r.level] ?? 'text-text-muted'}`}>{r.level}</span>
                                    <span className="text-text-muted text-[10px] mono">{r.source}</span>
                                    <span className="text-text-secondary text-xs truncate">{r.msg}</span>
                                    <span className="text-text-muted text-[10px] mono">{r.time}</span>
                                </div>
                            )) : (
                                <div className="px-4 py-6 text-center text-text-muted text-xs mono">No event logs found</div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
