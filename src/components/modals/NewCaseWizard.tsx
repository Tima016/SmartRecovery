import { useState, useRef, useCallback } from 'react';
import {
    X, ChevronRight, ChevronLeft, Shield, HardDrive, FolderOpen,
    FileImage, CheckCircle2, Loader2, Server, AlertCircle,
    Search, Clock, BarChart3, Cpu, Hash, Scissors,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { casesApi } from '../../api/cases.api';
import { evidenceApi } from '../../api/evidence.api';
import { useCase } from '../../context/CaseContext';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type DataSourceType = 'disk-image' | 'local-disk' | 'logical-files';

interface IngestModule {
    id: string;
    label: string;
    desc: string;
    icon: React.ElementType;
    enabled: boolean;
}

interface NewCaseWizardProps {
    onClose: () => void;
    existingCaseId?: string; // If provided, skip step 1 (Add Data Source mode)
}

const ACCEPTED_EXT = '.dd,.img,.raw,.E01,.e01,.vmdk,.vhd,.iso';

const DATA_SOURCE_TYPES: { id: DataSourceType; label: string; desc: string; icon: React.ElementType }[] = [
    {
        id: 'disk-image', label: 'Disk Image or VM File',
        desc: 'Import a forensic disk image (.img, .dd, .raw, .E01, .vmdk, .vhd)',
        icon: HardDrive,
    },
    {
        id: 'local-disk', label: 'Local Disk / Server Path',
        desc: 'Analyze a disk image from the server filesystem path',
        icon: Server,
    },
    {
        id: 'logical-files', label: 'Logical Files',
        desc: 'Upload individual files or folders for analysis',
        icon: FolderOpen,
    },
];

function bytesToHuman(bytes: number): string {
    if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
    return `${(bytes / 1e3).toFixed(1)} KB`;
}

// ─── Wizard Component ─────────────────────────────────────────────────────────
export default function NewCaseWizard({ onClose, existingCaseId }: NewCaseWizardProps) {
    const navigate = useNavigate();
    const { setSelectedCaseId } = useCase();
    const startStep = existingCaseId ? 2 : 1;
    const [step, setStep] = useState(startStep);

    // Step 1 — Case Info
    const [caseName, setCaseName] = useState('');
    const [caseDesc, setCaseDesc] = useState('');
    const [priority, setPriority] = useState('MEDIUM');

    // Step 2 — Data Source Type
    const [sourceType, setSourceType] = useState<DataSourceType>('disk-image');

    // Step 3 — Select Source
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [localPath, setLocalPath] = useState('');
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const localFileInputRef = useRef<HTMLInputElement>(null);

    // Step 4 — Ingest Modules
    const [modules, setModules] = useState<IngestModule[]>([
        { id: 'filesystem', label: 'File System Parsing', desc: 'Parse partition table, extract directory tree, detect deleted files', icon: FolderOpen, enabled: true },
        { id: 'hashing', label: 'Hash Calculation', desc: 'Compute MD5, SHA-1, SHA-256, SHA-512 for integrity verification', icon: Hash, enabled: true },
        { id: 'carving', label: 'File Carving & Recovery', desc: 'Scan for deleted files using header/footer signatures and entropy', icon: Scissors, enabled: true },
        { id: 'artifacts', label: 'Artifact Extraction', desc: 'Extract browser history, USB logs, registry hives, event logs', icon: Search, enabled: true },
        { id: 'timeline', label: 'Timeline Synthesis', desc: 'Build unified forensic timeline from all extracted artifacts', icon: Clock, enabled: true },
        { id: 'correlation', label: 'Correlation Engine', desc: 'Find relationships between entities, IPs, files, and events', icon: BarChart3, enabled: true },
    ]);

    // State
    const [submitting, setSubmitting] = useState(false);

    // Steps definition
    const steps = existingCaseId
        ? [
            { num: 2, label: 'Select Data Source Type' },
            { num: 3, label: 'Select Data Source' },
            { num: 4, label: 'Configure & Start' },
        ]
        : [
            { num: 1, label: 'Case Information' },
            { num: 2, label: 'Select Data Source Type' },
            { num: 3, label: 'Select Data Source' },
            { num: 4, label: 'Configure & Start' },
        ];


    // Drag & drop
    const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
    const onDragLeave = useCallback(() => setDragging(false), []);
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) setUploadFile(file);
    }, []);

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadFile(file);
            if (sourceType === 'local-disk') {
                setLocalPath('');
            }
        }
    };

    const toggleModule = (id: string) => {
        setModules(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
    };

    // Validation
    const canNext = (): boolean => {
        if (step === 1) return caseName.trim().length > 0;
        if (step === 2) return true;
        if (step === 3) {
            if (sourceType === 'disk-image' || sourceType === 'logical-files') return !!uploadFile;
            if (sourceType === 'local-disk') return !!uploadFile || localPath.trim().length > 0;
        }
        return true;
    };

    // Submit
    const handleFinish = async () => {
        setSubmitting(true);
        try {
            // 1. Create case (or use existing)
            let caseId = existingCaseId;
            if (!caseId) {
                const caseRes = await casesApi.create({
                    title: caseName.trim(),
                    description: caseDesc.trim() || undefined,
                    priority,
                });
                caseId = caseRes?.id ?? caseRes?.data?.id;
                if (!caseId) throw new Error('Failed to create case');
                toast.success('Case created successfully');
            }

            // 2. Upload or ingest evidence
            if (sourceType === 'local-disk' && localPath.trim()) {
                const ingestPath = localPath.trim();
                try {
                    await evidenceApi.ingestLocalPath(caseId, ingestPath);
                    toast.success(`Local path ingested: ${ingestPath}`);
                } catch (err: any) {
                    const msg = err?.response?.data?.message || 'Local path ingestion failed';
                    toast.error(typeof msg === 'string' ? msg : msg[0] || 'Ingestion error');
                    throw err;
                }
            } else if (uploadFile) {
                // File selected (works for disk-image, logical-files, AND local-disk with Browse)
                const fd = new FormData();
                fd.append('file', uploadFile);
                fd.append('description', uploadFile.name);
                await evidenceApi.upload(caseId, fd);
                toast.success(`Evidence uploaded: ${uploadFile.name}`);
            }

            // 3. Navigate to case — sync CaseContext for sidebar
            setSelectedCaseId(caseId);
            navigate(`/cases/${caseId}`);
            onClose();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || err?.message || 'Failed to create case');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
            <div
                className="w-full max-w-3xl rounded-sm border overflow-hidden shadow-2xl animate-fade-in"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', maxHeight: '90vh' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-sm" style={{ background: 'rgba(0,200,150,0.1)' }}>
                            <Shield className="w-5 h-5 text-accent-cyan" />
                        </div>
                        <div>
                            <h2 className="text-text-primary text-base font-bold">
                                {existingCaseId ? 'Add Data Source' : 'New Forensic Case'}
                            </h2>
                            <p className="text-text-muted text-[10px] mono">DFIP — Digital Forensic Investigation Platform</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex" style={{ minHeight: '460px' }}>
                    {/* Steps sidebar */}
                    <div className="w-56 border-r p-4 flex flex-col gap-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                        <span className="text-text-muted text-[9px] mono uppercase tracking-widest mb-3">Steps</span>
                        {steps.map((s, i) => {
                            const isActive = s.num === step;
                            const isDone = step > s.num;
                            return (
                                <div
                                    key={s.num}
                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-sm text-xs transition-all ${isActive ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20' : isDone ? 'text-status-ok' : 'text-text-muted'}`}
                                    style={!isActive ? { border: '1px solid transparent' } : undefined}
                                >
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] mono font-bold flex-shrink-0 ${isActive ? 'bg-accent-cyan text-bg-primary' : isDone ? 'bg-status-ok/20 text-status-ok' : 'bg-bg-primary border border-bg-border text-text-muted'}`}>
                                        {isDone ? '✓' : i + 1}
                                    </span>
                                    <span className="font-medium">{s.label}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Content area */}
                    <div className="flex-1 p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                        {/* STEP 1 — Case Information */}
                        {step === 1 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-text-primary text-sm font-semibold mb-1">Case Information</h3>
                                    <p className="text-text-muted text-[11px]">Provide basic details for the forensic investigation case.</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-text-secondary text-[10px] mono uppercase tracking-widest mb-1.5 block">Case Name *</label>
                                        <input
                                            type="text"
                                            value={caseName}
                                            onChange={e => setCaseName(e.target.value)}
                                            placeholder="e.g., Incident Response — Server Breach 2026"
                                            className="w-full px-3 py-2 text-sm rounded-sm border outline-none focus:border-accent-cyan/50 transition-colors mono"
                                            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                                            autoFocus
                                        />
                                    </div>

                                    <div>
                                        <label className="text-text-secondary text-[10px] mono uppercase tracking-widest mb-1.5 block">Description</label>
                                        <textarea
                                            value={caseDesc}
                                            onChange={e => setCaseDesc(e.target.value)}
                                            placeholder="Brief description of the investigation scope..."
                                            rows={3}
                                            className="w-full px-3 py-2 text-sm rounded-sm border outline-none focus:border-accent-cyan/50 transition-colors resize-none"
                                            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                                        />
                                    </div>

                                    <div>
                                        <label className="text-text-secondary text-[10px] mono uppercase tracking-widest mb-1.5 block">Priority</label>
                                        <div className="flex gap-2">
                                            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setPriority(p)}
                                                    className={`px-3 py-1.5 text-[10px] mono font-semibold rounded-sm border transition-all ${priority === p
                                                        ? p === 'CRITICAL' ? 'bg-red-500/15 text-red-400 border-red-500/40'
                                                            : p === 'HIGH' ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                                                                : p === 'MEDIUM' ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30'
                                                                    : 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                                                        : 'bg-bg-elevated text-text-muted border-bg-border hover:border-bg-border/80'
                                                        }`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2 — Select Data Source Type */}
                        {step === 2 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-text-primary text-sm font-semibold mb-1">Select Data Source Type</h3>
                                    <p className="text-text-muted text-[11px]">Choose the type of evidence to add to the investigation.</p>
                                </div>

                                <div className="space-y-2">
                                    {DATA_SOURCE_TYPES.map(({ id, label, desc, icon: Icon }) => (
                                        <button
                                            key={id}
                                            onClick={() => setSourceType(id)}
                                            className={`w-full flex items-center gap-4 p-4 rounded-sm border text-left transition-all ${sourceType === id
                                                ? 'border-accent-cyan/40 bg-accent-cyan/5'
                                                : 'border-bg-border bg-bg-elevated/30 hover:border-accent-cyan/20 hover:bg-accent-cyan/3'
                                                }`}
                                        >
                                            <div className={`p-3 rounded-sm flex-shrink-0 ${sourceType === id ? 'bg-accent-cyan/15 text-accent-cyan' : 'bg-bg-elevated text-text-muted'}`}>
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className={`text-sm font-semibold ${sourceType === id ? 'text-accent-cyan' : 'text-text-primary'}`}>{label}</div>
                                                <div className="text-text-muted text-[11px] mt-0.5">{desc}</div>
                                            </div>
                                            {sourceType === id && (
                                                <div className="ml-auto flex-shrink-0">
                                                    <CheckCircle2 className="w-5 h-5 text-accent-cyan" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* STEP 3 — Select Data Source */}
                        {step === 3 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-text-primary text-sm font-semibold mb-1">
                                        {sourceType === 'local-disk' ? 'Enter Server Path' : 'Select Data Source'}
                                    </h3>
                                    <p className="text-text-muted text-[11px]">
                                        {sourceType === 'local-disk'
                                            ? 'Enter the path to the disk image or drive on the server filesystem.'
                                            : 'Upload the evidence file for forensic analysis.'}
                                    </p>
                                </div>

                                {sourceType === 'local-disk' ? (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-text-secondary text-[10px] mono uppercase tracking-widest mb-1.5 block">Server File Path</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={localPath}
                                                    onChange={e => { setLocalPath(e.target.value); setUploadFile(null); }}
                                                    placeholder="e.g., D:\evidence\disk.img  or  /mnt/evidence/image.dd"
                                                    className="flex-1 px-3 py-2.5 text-sm rounded-sm border outline-none focus:border-accent-cyan/50 transition-colors mono"
                                                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                                                    autoFocus
                                                    disabled={!!uploadFile}
                                                />
                                                <button
                                                    onClick={() => localFileInputRef.current?.click()}
                                                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-sm border transition-all bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20 flex-shrink-0"
                                                >
                                                    <FolderOpen className="w-4 h-4" />
                                                    Browse
                                                </button>
                                                <input
                                                    ref={localFileInputRef}
                                                    type="file"
                                                    className="hidden"
                                                    accept={ACCEPTED_EXT}
                                                    onChange={onFileSelect}
                                                />
                                            </div>
                                        </div>

                                        {/* Show selected file */}
                                        {uploadFile && (
                                            <div className="flex items-center gap-3 p-3 rounded-sm border border-status-ok/30 bg-status-ok/5">
                                                <CheckCircle2 className="w-5 h-5 text-status-ok flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-text-primary text-xs mono font-semibold truncate">{uploadFile.name}</div>
                                                    <div className="text-text-muted text-[10px]">{bytesToHuman(uploadFile.size)}</div>
                                                </div>
                                                <button
                                                    onClick={() => { setUploadFile(null); setLocalPath(''); }}
                                                    className="text-text-muted hover:text-status-error transition-colors p-1"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}

                                        <div className="flex items-start gap-2 p-3 rounded-sm border" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                                            <AlertCircle className="w-4 h-4 text-status-warn flex-shrink-0 mt-0.5" />
                                            <div className="text-[11px] text-text-muted">
                                                <strong className="text-text-secondary">Option 1:</strong> Type a server-side path accessible by the backend.<br />
                                                <strong className="text-text-secondary">Option 2:</strong> Click <strong>Browse</strong> to select a disk image from your computer.<br />
                                                Supported: <span className="text-text-secondary mono">.img .dd .raw .E01 .vmdk .vhd</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Upload zone for disk-image and logical-files */
                                    <div>
                                        <div
                                            onDragOver={onDragOver}
                                            onDragLeave={onDragLeave}
                                            onDrop={onDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed rounded-sm cursor-pointer transition-all min-h-[200px] ${dragging
                                                ? 'border-accent-cyan bg-accent-cyan/10'
                                                : uploadFile
                                                    ? 'border-status-ok/40 bg-status-ok/5'
                                                    : 'border-bg-border hover:border-accent-cyan/30 hover:bg-accent-cyan/3'
                                                }`}
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                className="hidden"
                                                accept={sourceType === 'logical-files' ? '*' : ACCEPTED_EXT}
                                                onChange={onFileSelect}
                                            />
                                            {uploadFile ? (
                                                <>
                                                    <CheckCircle2 className="w-10 h-10 text-status-ok" />
                                                    <div className="text-center">
                                                        <div className="text-text-primary text-sm mono font-semibold">{uploadFile.name}</div>
                                                        <div className="text-text-muted text-[11px] mt-1">{bytesToHuman(uploadFile.size)}</div>
                                                    </div>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setUploadFile(null); }}
                                                        className="text-[11px] text-text-muted hover:text-status-error transition-colors flex items-center gap-1"
                                                    >
                                                        <X className="w-3.5 h-3.5" /> Remove file
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className={`p-4 rounded-full ${dragging ? 'bg-accent-cyan/15' : 'bg-bg-elevated'}`}>
                                                        {sourceType === 'logical-files'
                                                            ? <FolderOpen className={`w-10 h-10 ${dragging ? 'text-accent-cyan' : 'text-text-muted'}`} />
                                                            : <FileImage className={`w-10 h-10 ${dragging ? 'text-accent-cyan' : 'text-text-muted'}`} />
                                                        }
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-text-secondary text-sm font-medium">
                                                            Drop {sourceType === 'logical-files' ? 'files' : 'disk image'} here or click to browse
                                                        </div>
                                                        <div className="text-text-muted text-[10px] mt-1.5 mono">
                                                            {sourceType === 'logical-files'
                                                                ? 'Any file type accepted'
                                                                : 'Supported: .img · .dd · .raw · .E01 · .vmdk · .vhd'}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 4 — Configure Ingest & Start */}
                        {step === 4 && (
                            <div className="space-y-5 animate-fade-in">
                                <div>
                                    <h3 className="text-text-primary text-sm font-semibold mb-1">Configure Ingest Modules</h3>
                                    <p className="text-text-muted text-[11px]">Select which analysis modules to run on the evidence.</p>
                                </div>

                                <div className="space-y-2">
                                    {modules.map(mod => (
                                        <button
                                            key={mod.id}
                                            onClick={() => toggleModule(mod.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-sm border text-left transition-all ${mod.enabled
                                                ? 'border-accent-cyan/30 bg-accent-cyan/5'
                                                : 'border-bg-border bg-bg-elevated/20 opacity-60'
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-all ${mod.enabled
                                                ? 'bg-accent-cyan border-accent-cyan text-bg-primary'
                                                : 'bg-bg-elevated border-bg-border'
                                                }`}>
                                                {mod.enabled && <span className="text-[10px] font-bold">✓</span>}
                                            </div>
                                            <mod.icon className={`w-4 h-4 flex-shrink-0 ${mod.enabled ? 'text-accent-cyan' : 'text-text-muted'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-xs font-semibold ${mod.enabled ? 'text-text-primary' : 'text-text-muted'}`}>{mod.label}</div>
                                                <div className="text-text-muted text-[10px] truncate">{mod.desc}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Summary */}
                                <div className="p-3 rounded-sm border" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                                    <span className="text-text-muted text-[9px] mono uppercase tracking-widest">Summary</span>
                                    <div className="mt-2 space-y-1.5 text-[11px]">
                                        {!existingCaseId && (
                                            <div className="flex justify-between">
                                                <span className="text-text-muted">Case:</span>
                                                <span className="text-text-primary mono font-medium">{caseName || '—'}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-text-muted">Source Type:</span>
                                            <span className="text-text-primary mono font-medium">
                                                {DATA_SOURCE_TYPES.find(d => d.id === sourceType)?.label}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-text-muted">Source:</span>
                                            <span className="text-accent-cyan mono font-medium truncate ml-4">
                                                {sourceType === 'local-disk' ? localPath : uploadFile?.name ?? '—'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-text-muted">Modules:</span>
                                            <span className="text-text-primary mono font-medium">
                                                {modules.filter(m => m.enabled).length}/{modules.length} enabled
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer — Navigation Buttons */}
                <div className="flex items-center justify-between px-6 py-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors rounded-sm border border-bg-border"
                    >
                        Cancel
                    </button>
                    <div className="flex items-center gap-2">
                        {step > startStep && (
                            <button
                                onClick={() => setStep(s => s - 1)}
                                disabled={submitting}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors rounded-sm border border-bg-border"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Back
                            </button>
                        )}
                        {step < 4 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                disabled={!canNext()}
                                className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-semibold rounded-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20"
                            >
                                Next <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleFinish}
                                disabled={submitting}
                                className="flex items-center gap-2 px-6 py-1.5 text-xs font-bold rounded-sm transition-all disabled:opacity-70 bg-accent-cyan text-bg-primary hover:bg-accent-cyan/90"
                            >
                                {submitting ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</>
                                ) : (
                                    <><Cpu className="w-3.5 h-3.5" /> Finish & Start Analysis</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
