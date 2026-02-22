import { useEffect, useRef, useState } from 'react';
import {
    HardDrive,
    Play,
    Pause,
    ShieldCheck,
    ShieldOff,
    RefreshCw,
    Terminal,
    Cpu,
    CheckCircle2,
} from 'lucide-react';

const drives = [
    { id: '/dev/sda', model: 'Seagate Barracuda 4TB', serial: 'WX31E16H4Y2D', size: '4.0 TB', status: 'source' },
    { id: '/dev/sdb', model: 'WD Blue 1TB', serial: 'WD-WXS1E217J3P0', size: '1.0 TB', status: 'imaging' },
    { id: '/dev/sdc', model: 'Samsung 870 EVO SSD', serial: 'S4EWNX0R123456', size: '500 GB', status: 'ready' },
    { id: '/dev/sdd', model: 'Toshiba MQ 1TB', serial: '59T9T84SS', size: '1.0 TB', status: 'locked' },
];

const statusColor: Record<string, string> = {
    source: 'text-accent-cyan',
    imaging: 'text-status-warn',
    ready: 'text-status-ok',
    locked: 'text-text-muted',
};

const logLines = [
    '[01:47:22] INFO  Imaging job started for /dev/sdb → /evidence/INV-2024-0892/sdb.dd',
    '[01:47:23] INFO  Block size: 512 bytes | Mode: DD | Compression: None',
    '[01:47:24] INFO  Write-blocker status: ENGAGED on sdb',
    '[01:48:11] INFO  4,096 MB transferred / 1,024,000 MB total',
    '[01:49:03] INFO  Current SHA-256: a3f2c1d9e84b7f6a...',
    '[01:49:03] WARN  Read error at sector 1,048,576 — retrying (1/3)...',
    '[01:49:04] INFO  Retry successful',
    '[01:50:18] INFO  8,192 MB transferred / 1,024,000 MB total',
    '[01:51:44] INFO  Current SHA-256: a3f2c1d9e84b7f6a2bc930...',
    '[01:52:02] INFO  ETA: 3h 41m | Speed: 127.4 MB/s',
];

export default function Acquisition() {
    const [selectedDrive, setSelectedDrive] = useState('/dev/sdb');
    const [progress] = useState(8.3);
    const [running, setRunning] = useState(true);
    const [wbEngaged] = useState(true);
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, []);

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
                {/* Drive Selection */}
                <div className="glass-panel rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <HardDrive className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Drive Selection</span>
                    </div>
                    <div className="space-y-2">
                        {drives.map(drive => (
                            <div
                                key={drive.id}
                                onClick={() => setSelectedDrive(drive.id)}
                                className={`p-2.5 border rounded-sm cursor-pointer transition-all ${selectedDrive === drive.id
                                    ? 'border-accent-cyan/40 bg-accent-cyan/05'
                                    : 'border-bg-border hover:border-bg-border/80 bg-bg-elevated/30'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-text-primary text-[11px] mono font-medium">{drive.id}</span>
                                    <span className={`text-[9px] mono font-medium ${statusColor[drive.status]}`}>
                                        {drive.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="text-text-muted text-[10px] truncate">{drive.model}</div>
                                <div className="text-text-muted text-[10px] mono">{drive.size} · {drive.serial}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Imaging Progress */}
                <div className="col-span-2 space-y-4">
                    <div className="glass-panel rounded-sm p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <RefreshCw className={`w-3.5 h-3.5 text-accent-cyan ${running ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                                <span className="text-text-primary text-xs font-semibold">Imaging Progress — /dev/sdb</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setRunning(v => !v)}
                                    className={`flex items-center gap-1.5 px-3 py-1 text-xs border rounded-sm transition-colors ${running
                                        ? 'border-status-warn/30 text-status-warn hover:bg-status-warn/10'
                                        : 'border-status-ok/30 text-status-ok hover:bg-status-ok/10'
                                        }`}
                                >
                                    {running ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                    {running ? 'Pause' : 'Resume'}
                                </button>
                            </div>
                        </div>

                        {/* Big progress */}
                        <div className="mb-4">
                            <div className="flex justify-between mb-2">
                                <span className="text-text-muted text-[10px] mono">85.0 GB / 1,024.0 GB</span>
                                <span className="text-accent-cyan mono font-bold">{progress.toFixed(1)}%</span>
                            </div>
                            <div className="progress-bar h-3 scan-line">
                                <div style={{ width: `${progress}%` }} />
                            </div>
                            <div className="flex justify-between mt-1.5">
                                <span className="text-text-muted text-[9px] mono">Speed: 127.4 MB/s</span>
                                <span className="text-text-muted text-[9px] mono">ETA: 3h 41m 02s</span>
                            </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: 'Transferred', value: '85.0 GB' },
                                { label: 'Remaining', value: '939.0 GB' },
                                { label: 'Bad Sectors', value: '1' },
                                { label: 'Retries', value: '1' },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-bg-elevated border border-bg-border rounded-sm p-2">
                                    <div className="text-text-muted text-[9px] mono mb-0.5">{label}</div>
                                    <div className="text-text-primary text-xs mono font-semibold">{value}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hash + Write Blocker */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="glass-panel rounded-sm p-3">
                            <div className="text-text-muted text-[10px] mono mb-2">REAL-TIME SHA-256</div>
                            <div className="text-accent-cyan text-[10px] mono break-all leading-relaxed bg-bg-elevated border border-bg-border rounded-sm p-2">
                                a3f2c1d9e84b7f6a2bc930d1e874f3a8<br />
                                b9d1c4e2f705a638<span className="cursor-blink text-accent-cyan">_</span>
                            </div>
                        </div>
                        <div className="glass-panel rounded-sm p-3">
                            <div className="text-text-muted text-[10px] mono mb-2">WRITE-BLOCKER STATUS</div>
                            <div className={`flex items-center gap-3 p-2 rounded-sm border ${wbEngaged ? 'border-status-ok/30 bg-status-ok/08' : 'border-status-error/30 bg-status-error/08'
                                }`}>
                                {wbEngaged
                                    ? <ShieldCheck className="w-5 h-5 text-status-ok" />
                                    : <ShieldOff className="w-5 h-5 text-status-error" />}
                                <div>
                                    <div className={`text-xs font-semibold mono ${wbEngaged ? 'text-status-ok' : 'text-status-error'}`}>
                                        {wbEngaged ? 'ENGAGED' : 'DISENGAGED'}
                                    </div>
                                    <div className="text-text-muted text-[9px]">Port: USB3-A · Device: sdb</div>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-status-ok" />
                                <span className="text-status-ok text-[10px] mono">Write protection verified</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Log Console */}
            <div className="glass-panel rounded-sm">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-bg-border">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-accent-cyan" />
                        <span className="text-text-primary text-xs font-semibold">Acquisition Log</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Cpu className="w-3 h-3 text-text-muted" />
                        <span className="text-text-muted text-[10px] mono">127 MB/s</span>
                    </div>
                </div>
                <div
                    ref={logRef}
                    className="p-3 max-h-36 overflow-y-auto space-y-0.5"
                >
                    {logLines.map((line, i) => (
                        <div key={i} className="text-[10px] mono leading-relaxed">
                            <span className={
                                line.includes('WARN') ? 'text-status-warn' :
                                    line.includes('ERROR') ? 'text-status-error' :
                                        'text-text-secondary'
                            }>
                                {line}
                            </span>
                        </div>
                    ))}
                    <div className="text-accent-cyan text-[10px] mono flex items-center gap-1">
                        <span>›</span>
                        <span className="cursor-blink">_</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
