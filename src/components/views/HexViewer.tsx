import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { HardDrive, Search, Loader2, AlertTriangle } from 'lucide-react';
import { apiClient } from '../../api/client';

export default function HexViewer() {
    const { caseId } = useParams<{ caseId: string }>();
    const [evidenceItems, setEvidenceItems] = useState<any[]>([]);
    const [selectedEvidence, setSelectedEvidence] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Hex Viewer State
    const [offset, setOffset] = useState(0);
    const [sectorData, setSectorData] = useState<Uint8Array | null>(null);
    const [jumpInput, setJumpInput] = useState('0');

    const SECTOR_SIZE = 512;
    const BYTES_PER_ROW = 16;

    // Fetch Evidence list
    useEffect(() => {
        let active = true;
        const fetchFiles = async () => {
            if (!caseId) return;
            try {
                const res = await apiClient.get(`/cases/${caseId}/evidence`);
                if (active) {
                    const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
                    setEvidenceItems(list);
                    if (list.length > 0) setSelectedEvidence(list[0].id);
                }
            } catch (err: any) {
                if (active) setError(err.message || 'Failed to load evidence');
            }
        };
        fetchFiles();
        return () => { active = false; };
    }, [caseId]);

    // Load Sector Stream
    const loadSector = async (targetOffset: number) => {
        if (!selectedEvidence) return;
        setLoading(true);
        setError('');
        try {
            // Using responseType: 'arraybuffer' ensures we get raw binary data from backend
            const res = await apiClient.get(`/cases/${caseId}/evidence/${selectedEvidence}/sectors`, {
                params: { offset: targetOffset, length: SECTOR_SIZE },
                responseType: 'arraybuffer'
            });
            setSectorData(new Uint8Array(res.data));
            setOffset(targetOffset);
            setJumpInput(targetOffset.toString(16).toUpperCase());
        } catch (err: any) {
            setError(err.message || 'Error streaming disk sector');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedEvidence) loadSector(0);
    }, [selectedEvidence]);

    const handleJump = () => {
        const parsed = parseInt(jumpInput, 16);
        if (isNaN(parsed) || parsed < 0) {
            setError('Invalid hex offset');
            return;
        }
        // Round down to nearest sector boundary
        const aligned = Math.floor(parsed / SECTOR_SIZE) * SECTOR_SIZE;
        loadSector(aligned);
    };

    const formatHex = (byte: number) => byte.toString(16).padStart(2, '0').toUpperCase();
    const formatAscii = (byte: number) => (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';

    const renderGrid = () => {
        if (!sectorData) return null;
        const rows = [];

        for (let i = 0; i < sectorData.length; i += BYTES_PER_ROW) {
            const rowBytes = Array.from(sectorData.slice(i, i + BYTES_PER_ROW));
            const rowOffset = offset + i;

            rows.push(
                <div key={i} className="flex font-mono text-sm leading-6 table-row-hover px-2 py-0.5 rounded-sm">
                    {/* Offset Column */}
                    <div className="w-24 text-accent-cyan font-bold select-none pr-4">
                        {rowOffset.toString(16).padStart(8, '0').toUpperCase()}
                    </div>

                    {/* Hex Grid */}
                    <div className="flex-1 flex gap-2 w-96">
                        {rowBytes.map((b, idx) => (
                            <span
                                key={idx}
                                className={`w-6 text-center ${b === 0 ? 'text-text-muted opacity-30' : 'text-text-primary'}`}
                            >
                                {formatHex(b)}
                            </span>
                        ))}
                        {/* Padding for incomplete rows */}
                        {Array.from({ length: BYTES_PER_ROW - rowBytes.length }).map((_, idx) => (
                            <span key={`pad-${idx}`} className="w-6" />
                        ))}
                    </div>

                    {/* ASCII Grid */}
                    <div className="w-48 ml-4 text-text-secondary border-l border-bg-border pl-4 tracking-[0.2em]">
                        {rowBytes.map((b, idx) => (
                            <span key={idx}>{formatAscii(b)}</span>
                        ))}
                    </div>
                </div>
            );
        }
        return rows;
    };

    return (
        <div className="h-full flex flex-col p-4 gap-4 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-sm">
                        <Search className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-text-primary">Hex Viewer</h1>
                        <p className="text-text-muted text-xs mono mt-0.5">Stream raw byte inspection [AES-GCM Memory Decoupled Phase]</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-bg-elevated p-2 border border-bg-border rounded-sm">
                    <HardDrive className="w-4 h-4 text-text-muted" />
                    <select
                        className="bg-transparent border-none text-text-primary text-sm mono outline-none w-64"
                        value={selectedEvidence}
                        onChange={e => setSelectedEvidence(e.target.value)}
                    >
                        <option value="" disabled>Select Evidence Container</option>
                        {evidenceItems.map(ev => (
                            <option key={ev.id} value={ev.id}>{ev.originalFilename}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="glass-panel flex-1 rounded-sm flex flex-col min-h-0 relative overflow-hidden">
                {/* Header Strip */}
                <div className="bg-bg-elevated border-b border-bg-border p-3 flex justify-between items-center z-10">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted mono uppercase font-semibold">Jump to Offset (Hex)</span>
                        <input
                            type="text"
                            className="bg-bg-primary border border-bg-border px-2 py-1 text-sm mono text-text-primary w-32 outline-none focus:border-purple-500 transition-colors rounded-sm"
                            value={jumpInput}
                            onChange={(e) => setJumpInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
                            placeholder="e.g. 00000200"
                        />
                        <button
                            onClick={handleJump}
                            className="px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs mono font-bold border border-purple-500/30 rounded-sm transition-colors"
                        >
                            GO
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => loadSector(Math.max(0, offset - SECTOR_SIZE))}
                            disabled={offset === 0}
                            className="px-3 py-1 bg-bg-primary hover:bg-bg-border text-text-secondary border border-bg-border text-xs rounded-sm transition-colors disabled:opacity-50"
                        >
                            ← Prev Sector
                        </button>
                        <span className="text-xs mono text-text-muted w-32 text-center">Sector: {offset / SECTOR_SIZE}</span>
                        <button
                            onClick={() => loadSector(offset + SECTOR_SIZE)}
                            className="px-3 py-1 bg-bg-primary hover:bg-bg-border text-text-secondary border border-bg-border text-xs rounded-sm transition-colors disabled:opacity-50"
                        >
                            Next Sector →
                        </button>
                    </div>
                </div>

                {/* Hex Display Area */}
                <div className="flex-1 overflow-auto bg-[#0a0f16] p-4 relative">
                    {loading ? (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0f16]/80 backdrop-blur-sm">
                            <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-4" />
                            <span className="text-text-muted mono text-sm font-semibold tracking-widest animate-pulse">STREAMING DECIPHER...</span>
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="p-4 bg-status-error/10 border border-status-error/30 rounded-sm flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-status-error" />
                                <span className="text-status-error text-sm mono">{error}</span>
                            </div>
                        </div>
                    ) : sectorData ? (
                        <div className="h-full selection:bg-purple-500/30">
                            {renderGrid()}
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-text-muted mono opacity-50">
                            Select an evidence container to stream raw sectors
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
