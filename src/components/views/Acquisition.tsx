import { useCallback, useEffect, useRef, useState } from 'react';
import {
    HardDrive, Play, Pause, ShieldCheck, ShieldOff, RefreshCw,
    Terminal, Cpu, CheckCircle2, Loader2, Upload, Trash2,
    FolderOpen, AlertCircle, X, FileImage,
} from 'lucide-react';
import { casesApi } from '../../api/cases.api';
import { evidenceApi } from '../../api/evidence.api';
import { imagingApi } from '../../api/imaging.api';
import toast from 'react-hot-toast';

interface CaseOption { id: string; title: string; status: string; }
interface EvidenceItem {
    id: string;
    originalFilename: string;
    description?: string;
    sizeBytes: string;
    sha256: string;
    status: string;
    uploadedAt: string;
    uploadedBy?: { email: string };
}
interface ImagingJob {
    id?: string;
    progress?: number;
    sourceSizeBytes?: number | string;
    transferredBytes?: number | string;
    speed?: string;
    eta?: string;
    transferred?: string;
    remaining?: string;
    badSectors?: number;
    retries?: number;
    sha256?: string;
    status?: string;
}

interface ImagingSourceDevice {
    path: string;
    label: string;
    driveType: 'fixed' | 'removable' | 'network' | 'cdrom' | 'ramdisk' | 'unknown';
    sizeBytes?: number;
    freeBytes?: number;
    isUsbLikely: boolean;
}

const ACCEPTED_EXT = ['.dd', '.img', '.raw', '.E01', '.e01'];
const STATUS_COLOR: Record<string, string> = {
    PENDING: 'text-status-warn',
    READY: 'text-status-ok',
    RUNNING: 'text-status-warn',
    COMPLETED: 'text-status-ok',
    FAILED: 'text-status-error',
    VERIFIED: 'text-status-ok',
    INTEGRITY_VIOLATION: 'text-status-error',
};

function bytesToHuman(bytes: number | string): string {
    const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(n)) return '—';
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TB`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
    return `${(n / 1e3).toFixed(1)} KB`;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

export default function Acquisition() {
    const [cases, setCases] = useState<CaseOption[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState('');

    const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
    const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
    const [loadingEvidence, setLoadingEvidence] = useState(false);

    const [dragging, setDragging] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [localPath, setLocalPath] = useState('');
    const [ingestingLocal, setIngestingLocal] = useState(false);
    const [availableSources, setAvailableSources] = useState<ImagingSourceDevice[]>([]);

    const [jobs, setJobs] = useState<ImagingJob[]>([]);
    const [running, setRunning] = useState(false);
    const [startingJob, setStartingJob] = useState(false);
    const [liveSpeedBps, setLiveSpeedBps] = useState(0);
    const [logLines, setLogLines] = useState<string[]>(['[--:--:--] INFO  Waiting for imaging job...']);
    const [wbEngaged] = useState(true);
    const logRef = useRef<HTMLDivElement>(null);
    const lastProgressSampleRef = useRef<{ ts: number; bytes: number } | null>(null);

    useEffect(() => {
        casesApi.getAll().then((res: any) => {
            const list: CaseOption[] = Array.isArray(res) ? res : (res?.data ?? []);
            setCases(list);
            if (list.length > 0) setSelectedCaseId(list[0].id);
        }).catch(() => toast.error('Failed to load cases'));
    }, []);

    useEffect(() => {
        if (!selectedCaseId) return;
        let cancelled = false;
        setLoadingEvidence(true);
        setEvidence([]);
        setSelectedEvidenceId('');

        Promise.allSettled([
            evidenceApi.getByCaseId(selectedCaseId),
            imagingApi.getAll(selectedCaseId),
        ]).then(([evRes, imgRes]) => {
            if (cancelled) return;

            if (evRes.status === 'fulfilled') {
                const list: EvidenceItem[] = Array.isArray(evRes.value) ? evRes.value : (evRes.value?.data ?? []);
                setEvidence(list);
                if (list.length > 0) setSelectedEvidenceId(list[0].id);
            }

            if (imgRes.status === 'fulfilled') {
                const jobList: ImagingJob[] = Array.isArray(imgRes.value) ? imgRes.value : (imgRes.value?.data ?? []);
                setJobs(jobList);
                setRunning(jobList.some((j: any) => j.status === 'RUNNING' || j.status === 'QUEUED'));
                const logs = jobList.flatMap((j: any) =>
                    (j.logs ?? []).map((l: any) => typeof l === 'string' ? l : `[${l.time ?? ''}] ${l.level ?? 'INFO'}  ${l.message ?? ''}`),
                );
                if (logs.length > 0) setLogLines(logs.slice(-10));
            }
        }).finally(() => {
            if (!cancelled) setLoadingEvidence(false);
        });

        return () => { cancelled = true; };
    }, [selectedCaseId]);

    useEffect(() => {
        let cancelled = false;
        imagingApi.listSources()
            .then((list: ImagingSourceDevice[]) => {
                if (!cancelled) setAvailableSources(Array.isArray(list) ? list : []);
            })
            .catch(() => {
                if (!cancelled) setAvailableSources([]);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logLines]);

    const activeJobId = jobs[0]?.id;
    const activeJobStatus = jobs[0]?.status;

    useEffect(() => {
        setRunning(['RUNNING', 'QUEUED'].includes(String(activeJobStatus ?? '')));
    }, [activeJobStatus]);

    useEffect(() => {
        if (!activeJobId) return;

        let cancelled = false;
        lastProgressSampleRef.current = null;
        setLiveSpeedBps(0);

        const tick = async () => {
            try {
                const p: any = await imagingApi.getProgress(activeJobId);
                if (cancelled) return;

                const transferredBytes = toNumber(p?.transferredBytes);
                const now = Date.now();
                const prev = lastProgressSampleRef.current;
                if (prev && now > prev.ts && transferredBytes >= prev.bytes) {
                    const deltaBytes = transferredBytes - prev.bytes;
                    const deltaSeconds = (now - prev.ts) / 1000;
                    const bps = deltaSeconds > 0 ? deltaBytes / deltaSeconds : 0;
                    setLiveSpeedBps(Number.isFinite(bps) ? bps : 0);
                }
                lastProgressSampleRef.current = { ts: now, bytes: transferredBytes };

                setJobs(prevJobs => prevJobs.map((j, idx) => {
                    if (idx !== 0 || j.id !== activeJobId) return j;
                    return {
                        ...j,
                        status: p?.status ?? j.status,
                        progress: typeof p?.progress === 'number' ? p.progress : j.progress,
                        transferredBytes: p?.transferredBytes ?? j.transferredBytes,
                        sourceSizeBytes: p?.sourceSizeBytes ?? j.sourceSizeBytes,
                        badSectors: typeof p?.badSectors === 'number' ? p.badSectors : (j.badSectors ?? 0),
                    };
                }));
            } catch {
                // keep last known progress on transient failures
            }
        };

        void tick();
        const shouldKeepPolling = ['QUEUED', 'RUNNING', 'PAUSED'].includes(String(activeJobStatus ?? ''));
        if (!shouldKeepPolling) return;

        const timer = setInterval(() => { void tick(); }, 1000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [activeJobId, activeJobStatus]);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
    }, []);

    const onDragLeave = useCallback(() => setDragging(false), []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ACCEPTED_EXT.includes(ext)) {
            toast.error(`Unsupported format. Accepted: ${ACCEPTED_EXT.join(', ')}`);
            return;
        }
        setUploadFile(file);
    }, []);

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadFile(file);
    };

    const handleUpload = async () => {
        if (!uploadFile || !selectedCaseId) return;
        setUploading(true);
        setUploadProgress(0);

        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('description', uploadFile.name);

        try {
            const result = await evidenceApi.upload(selectedCaseId, fd);
            setUploadProgress(100);
            toast.success(`Uploaded: ${result.originalFilename ?? uploadFile.name}`);
            setUploadFile(null);

            const updated = await evidenceApi.getByCaseId(selectedCaseId);
            const list: EvidenceItem[] = Array.isArray(updated) ? updated : (updated?.data ?? []);
            setEvidence(list);
            if (!selectedEvidenceId && list.length > 0) setSelectedEvidenceId(list[0].id);
            addLog(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] INFO  Evidence uploaded: ${uploadFile.name}`);
        } catch (err: any) {
            toast.error(err?.response?.data?.message ?? 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleLocalIngest = async () => {
        if (!selectedCaseId || !localPath.trim()) {
            toast.error('Case and local file path are required');
            return;
        }

        setIngestingLocal(true);
        try {
            const result = await evidenceApi.ingestLocalPath(selectedCaseId, localPath.trim());
            toast.success(`Ingested: ${result.originalFilename ?? 'local file'}`);
            setLocalPath('');

            const updated = await evidenceApi.getByCaseId(selectedCaseId);
            const list: EvidenceItem[] = Array.isArray(updated) ? updated : (updated?.data ?? []);
            setEvidence(list);
            if (!selectedEvidenceId && list.length > 0) setSelectedEvidenceId(list[0].id);

            addLog(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] INFO  Local ingest completed`);
        } catch (err: any) {
            toast.error(err?.response?.data?.message ?? 'Local ingest failed');
        } finally {
            setIngestingLocal(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await evidenceApi.deleteById(id);
            setEvidence(prev => prev.filter(e => e.id !== id));
            if (selectedEvidenceId === id) setSelectedEvidenceId('');
            toast.success('Evidence removed');
        } catch {
            toast.error('Failed to delete evidence');
        }
    };

    const handleStartImaging = async () => {
        if (!selectedCaseId || !selectedEvidenceId) {
            toast.error('Select a case and an evidence item first');
            return;
        }

        setStartingJob(true);
        try {
            const ev = evidence.find(e => e.id === selectedEvidenceId);
            const job = await imagingApi.start({
                caseId: selectedCaseId,
                sourceDrive: selectedEvidenceId,
                sourceSizeBytes: ev ? parseInt(ev.sizeBytes, 10) : 0,
                imageFormat: 'E01',
            });
            setJobs(prev => [job, ...prev]);
            setRunning(true);
            addLog(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] INFO  Imaging job queued: ${job.id ?? '(pending)'}`);
            toast.success('Imaging job started');
        } catch (err: any) {
            toast.error(err?.response?.data?.message ?? 'Failed to start imaging');
        } finally {
            setStartingJob(false);
        }
    };

    const handleToggleJob = async () => {
        const activeJob = jobs[0] as any;
        if (!activeJob?.id) {
            setRunning(v => !v);
            return;
        }

        try {
            if (running) {
                await imagingApi.pause(activeJob.id);
                setRunning(false);
                addLog(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] INFO  Job paused`);
            } else {
                await imagingApi.resume(activeJob.id);
                setRunning(true);
                addLog(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] INFO  Job resumed`);
            }
        } catch {
            toast.error('Failed to update job state');
        }
    };

    function addLog(line: string) {
        setLogLines(prev => [...prev.slice(-49), line]);
    }

    const activeJob = jobs[0] as ImagingJob | undefined;
    const selectedEvidence = evidence.find(e => e.id === selectedEvidenceId);
    const sourceBytes = toNumber(activeJob?.sourceSizeBytes) || toNumber(selectedEvidence?.sizeBytes);
    const transferredBytes = toNumber(activeJob?.transferredBytes);
    const remainingBytes = Math.max(0, sourceBytes - transferredBytes);
    const progress = sourceBytes > 0
        ? Math.min(100, Math.max(0, (transferredBytes / sourceBytes) * 100))
        : (activeJob?.progress ?? 0);
    const speedLabel = liveSpeedBps > 0 ? `${bytesToHuman(Math.round(liveSpeedBps))}/s` : '—';
    const etaSeconds = liveSpeedBps > 0 ? Math.round(remainingBytes / liveSpeedBps) : 0;
    const etaLabel = etaSeconds > 0 ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s` : '—';
    const transferredLabel = bytesToHuman(transferredBytes);
    const sourceLabel = sourceBytes > 0 ? bytesToHuman(sourceBytes) : '—';
    const remainingLabel = sourceBytes > 0 ? bytesToHuman(remainingBytes) : '—';

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
                <div className="glass-panel rounded-sm p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <FolderOpen className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Case &amp; Evidence</span>
                    </div>

                    <select
                        value={selectedCaseId}
                        onChange={e => setSelectedCaseId(e.target.value)}
                        className="w-full text-[11px] mono px-2 py-1.5 rounded-sm border outline-none focus:border-accent-cyan/50 transition-colors"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                        {cases.length === 0 && <option value="">No cases found</option>}
                        {cases.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                    </select>

                    <div className="flex-1 space-y-1.5 overflow-y-auto max-h-52">
                        {loadingEvidence ? (
                            <div className="flex items-center gap-2 py-2">
                                <Loader2 className="w-3.5 h-3.5 text-accent-cyan animate-spin" />
                                <span className="text-text-muted text-[10px] mono">Loading evidence...</span>
                            </div>
                        ) : evidence.length === 0 ? (
                            <div className="text-text-muted text-[10px] mono px-1 py-2">No evidence uploaded yet.</div>
                        ) : evidence.map(ev => (
                            <div
                                key={ev.id}
                                onClick={() => setSelectedEvidenceId(ev.id)}
                                className={`group flex items-start gap-2 p-2 rounded-sm border cursor-pointer transition-all ${selectedEvidenceId === ev.id
                                    ? 'border-accent-cyan/40 bg-accent-cyan/5'
                                    : 'border-bg-border bg-bg-elevated/30 hover:border-bg-border/60'
                                    }`}
                            >
                                <FileImage className="w-3.5 h-3.5 text-accent-cyan mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] mono font-medium text-text-primary truncate">{ev.originalFilename}</div>
                                    <div className="text-[9px] mono text-text-muted">{bytesToHuman(ev.sizeBytes)}</div>
                                    <div className={`text-[9px] mono font-bold ${STATUS_COLOR[ev.status] ?? 'text-text-muted'}`}>{ev.status}</div>
                                </div>
                                <button
                                    onClick={e => { e.stopPropagation(); handleDelete(ev.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-status-error transition-all"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={handleStartImaging}
                        disabled={startingJob || !selectedEvidenceId}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] mono font-semibold rounded-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-status-ok/30 text-status-ok hover:bg-status-ok/10"
                    >
                        {startingJob
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Starting...</>
                            : <><Play className="w-3 h-3" /> Start Scanning</>}
                    </button>
                </div>

                <div className="col-span-2 glass-panel rounded-sm p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Upload Disk Image</span>
                        <span className="text-[9px] mono text-text-muted ml-auto">.dd · .img · .raw · .E01</span>
                    </div>

                    <div
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-sm cursor-pointer transition-all min-h-[140px] ${dragging
                            ? 'border-accent-cyan bg-accent-cyan/10'
                            : uploadFile
                                ? 'border-status-ok/40 bg-status-ok/5'
                                : 'border-bg-border bg-bg-elevated/20 hover:border-accent-cyan/30 hover:bg-accent-cyan/5'
                            }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".dd,.img,.raw,.E01,.e01"
                            onChange={onFileSelect}
                        />
                        {uploadFile ? (
                            <>
                                <CheckCircle2 className="w-8 h-8 text-status-ok" />
                                <div className="text-center">
                                    <div className="text-text-primary text-xs mono font-medium">{uploadFile.name}</div>
                                    <div className="text-text-muted text-[10px]">{bytesToHuman(uploadFile.size)}</div>
                                </div>
                                <button
                                    onClick={e => { e.stopPropagation(); setUploadFile(null); }}
                                    className="flex items-center gap-1 text-[10px] text-text-muted hover:text-status-error transition-colors"
                                >
                                    <X className="w-3 h-3" /> Remove
                                </button>
                            </>
                        ) : (
                            <>
                                <HardDrive className={`w-8 h-8 ${dragging ? 'text-accent-cyan' : 'text-text-muted'}`} />
                                <div className="text-center">
                                    <div className="text-text-secondary text-xs">Drop disk image here or click to browse</div>
                                    <div className="text-text-muted text-[10px] mt-1">Supported: .dd · .img · .raw · .E01</div>
                                </div>
                            </>
                        )}
                    </div>

                    {uploadFile && (
                        <div className="flex items-center gap-3">
                            {!selectedCaseId && (
                                <div className="flex items-center gap-1.5 text-[10px] text-status-warn">
                                    <AlertCircle className="w-3 h-3" /> Select a case first
                                </div>
                            )}
                            <button
                                onClick={handleUpload}
                                disabled={uploading || !selectedCaseId}
                                className="ml-auto flex items-center gap-2 px-4 py-1.5 text-[11px] mono font-semibold rounded-sm border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {uploading
                                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading {uploadProgress}%</>
                                    : <><Upload className="w-3 h-3" /> Upload to MinIO</>}
                            </button>
                        </div>
                    )}

                    <div className="border-t border-bg-border pt-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <HardDrive className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-text-primary text-xs font-semibold">Local Path Ingest (C:/D:/E:/USB)</span>
                        </div>
                        <p className="text-[10px] text-text-muted leading-relaxed">
                            Local source tanlang yoki path kiriting: `D:\evidence\disk.img`, `E:\dump\capture.E01`, yoki USB volume yo‘li.
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                            {(availableSources.length > 0
                                ? availableSources.map((s) => s.path)
                                : ['C:\\', 'D:\\', 'E:\\', 'F:\\']
                            ).map((drive) => (
                                <button
                                    key={drive}
                                    onClick={() => setLocalPath((prev) => prev || drive)}
                                    className="text-[10px] mono px-2 py-1 rounded-sm border border-bg-border text-text-muted hover:text-text-primary hover:border-accent-cyan/30 transition-colors"
                                >
                                    {drive}
                                </button>
                            ))}
                        </div>
                        {availableSources.some((s) => s.isUsbLikely) && (
                            <div className="text-[10px] mono text-status-ok">
                                USB source detected: {availableSources.filter((s) => s.isUsbLikely).map((s) => s.path).join(', ')}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <input
                                value={localPath}
                                onChange={(e) => setLocalPath(e.target.value)}
                                placeholder="D:\\folder\\disk_image.dd"
                                className="flex-1 text-[11px] mono px-2 py-1.5 rounded-sm border outline-none focus:border-accent-cyan/40"
                                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            />
                            <button
                                onClick={handleLocalIngest}
                                disabled={ingestingLocal || !selectedCaseId || !localPath.trim()}
                                className="flex items-center gap-2 px-3 py-1.5 text-[11px] mono font-semibold rounded-sm border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {ingestingLocal
                                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Ingesting...</>
                                    : <><Upload className="w-3 h-3" /> Ingest Local Path</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-sm p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <RefreshCw className={`w-3.5 h-3.5 text-accent-cyan ${running ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                        <span className="text-text-primary text-xs font-semibold">
                            Imaging Progress — {evidence.find(e => e.id === selectedEvidenceId)?.originalFilename || selectedEvidenceId || '—'}
                        </span>
                    </div>
                    <button
                        onClick={handleToggleJob}
                        disabled={!activeJob?.id && jobs.length === 0}
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs border rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${running
                            ? 'border-status-warn/30 text-status-warn hover:bg-status-warn/10'
                            : 'border-status-ok/30 text-status-ok hover:bg-status-ok/10'
                            }`}
                    >
                        {running ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Resume</>}
                    </button>
                </div>

                <div className="mb-4">
                    <div className="flex justify-between mb-2">
                        <span className="text-text-muted text-[10px] mono">
                            {transferredLabel} / {sourceLabel}
                        </span>
                        <span className="text-accent-cyan mono font-bold">{progress.toFixed(1)}%</span>
                    </div>
                    <div className="progress-bar h-3 scan-line">
                        <div style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                        <span className="text-text-muted text-[9px] mono">Speed: {speedLabel}</span>
                        <span className="text-text-muted text-[9px] mono">ETA: {etaLabel}</span>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                    {[
                        { label: 'Transferred', value: transferredLabel },
                        { label: 'Remaining', value: remainingLabel },
                        { label: 'Bad Sectors', value: String(activeJob?.badSectors ?? 0) },
                        { label: 'Retries', value: String(activeJob?.retries ?? 0) },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-bg-elevated border border-bg-border rounded-sm p-2">
                            <div className="text-text-muted text-[9px] mono mb-0.5">{label}</div>
                            <div className="text-text-primary text-xs mono font-semibold">{value}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="glass-panel rounded-sm p-3">
                    <div className="text-text-muted text-[10px] mono mb-2">REAL-TIME SHA-256</div>
                    <div className="text-accent-cyan text-[10px] mono break-all leading-relaxed bg-bg-elevated border border-bg-border rounded-sm p-2">
                        {activeJob?.sha256 ?? evidence.find(e => e.id === selectedEvidenceId)?.sha256 ?? 'Waiting for imaging job...'}
                        <span className="cursor-blink text-accent-cyan">_</span>
                    </div>
                </div>
                <div className="glass-panel rounded-sm p-3">
                    <div className="text-text-muted text-[10px] mono mb-2">WRITE-BLOCKER STATUS</div>
                    <div className={`flex items-center gap-3 p-2 rounded-sm border ${wbEngaged ? 'border-status-ok/30 bg-status-ok/08' : 'border-status-error/30 bg-status-error/08'}`}>
                        {wbEngaged ? <ShieldCheck className="w-5 h-5 text-status-ok" /> : <ShieldOff className="w-5 h-5 text-status-error" />}
                        <div>
                            <div className={`text-xs font-semibold mono ${wbEngaged ? 'text-status-ok' : 'text-status-error'}`}>
                                {wbEngaged ? 'ENGAGED' : 'DISENGAGED'}
                            </div>
                            <div className="text-text-muted text-[9px]">
                                Port: USB3-A · Drive: {evidence.find(e => e.id === selectedEvidenceId)?.originalFilename ?? '—'}
                            </div>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-status-ok" />
                        <span className="text-status-ok text-[10px] mono">Write protection verified</span>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-sm">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-bg-border">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Acquisition Log</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Cpu className="w-3 h-3 text-text-muted" />
                        <span className="text-text-muted text-[10px] mono">{speedLabel}</span>
                    </div>
                </div>
                <div ref={logRef} className="p-3 max-h-36 overflow-y-auto space-y-0.5">
                    {logLines.map((line, i) => (
                        <div key={i} className="text-[10px] mono leading-relaxed">
                            <span className={
                                line.includes('WARN') ? 'text-status-warn' :
                                    line.includes('ERROR') ? 'text-status-error' : 'text-text-secondary'
                            }>{line}</span>
                        </div>
                    ))}
                    <div className="text-accent-cyan text-[10px] mono flex items-center gap-1">
                        <span>›</span><span className="cursor-blink">_</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

