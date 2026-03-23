import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Folder, FolderOpen, File, HardDrive, Search, SearchSlash, AlertTriangle, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { filesystemApi } from '../../api/filesystem.api';
import FilePreviewModal from '../modals/FilePreviewModal';

interface FSEntry {
    id: string;
    fileName: string;
    filePath: string;
    isDirectory: boolean;
    isDeleted: boolean;
    sizeBytes: string;
    createdDate?: string;
    modifiedDate?: string;
    permissions?: string;
    children?: FSEntry[];
    isExpanded?: boolean;
    isLoading?: boolean;
}

const FileSystemNode = ({
    node,
    caseId,
    onToggle,
    onSelect,
    depth = 0
}: {
    node: FSEntry;
    caseId: string;
    onToggle: (id: string, isOpen: boolean) => void;
    onSelect: (node: FSEntry) => void;
    depth?: number;
}) => {
    const isDir = node.isDirectory;
    const isDeleted = node.isDeleted;

    return (
        <div>
            <div
                className={`flex items-center gap-2 px-4 py-1.5 table-row-hover text-[11px] mono cursor-pointer ${isDeleted ? 'text-status-error opacity-80' : 'text-text-primary'}`}
                style={{ paddingLeft: `${depth * 16 + 16}px` }}
                onClick={() => {
                    if (isDir) onToggle(node.id, !node.isExpanded);
                    onSelect(node);
                }}
            >
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {isDir ? (
                        node.isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                    ) : (
                        <span className="w-3.5 h-3.5" />
                    )}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isDir ? (
                        node.isExpanded ? <FolderOpen className={`w-3.5 h-3.5 flex-shrink-0 ${isDeleted ? 'text-status-error' : 'text-accent-blue'}`} /> : <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${isDeleted ? 'text-status-error' : 'text-accent-blue'}`} />
                    ) : (
                        <File className={`w-3.5 h-3.5 flex-shrink-0 ${isDeleted ? 'text-status-error' : 'text-text-muted'}`} />
                    )}
                    <span className="truncate">{node.fileName}</span>
                </div>
                {node.isLoading && <Loader2 className="w-3 h-3 animate-spin text-accent-cyan flex-shrink-0" />}
                <div className="w-24 flex-shrink-0 text-right text-text-muted">
                    {node.sizeBytes !== '0' ? node.sizeBytes : (isDir ? '—' : '0')}
                </div>
                <div className="w-32 flex-shrink-0 text-text-muted truncate">
                    {typeof node.modifiedDate === 'string' ? node.modifiedDate.split('T')[0] : '—'}
                </div>
                <div className="w-16 flex-shrink-0 text-text-muted text-center">
                    {node.permissions ?? '—'}
                </div>
            </div>

            {node.isExpanded && node.children && (
                <div className="flex flex-col">
                    {node.children.length > 0 ? (
                        node.children.map(child => (
                            <FileSystemNode
                                key={child.id}
                                node={child}
                                caseId={caseId}
                                onToggle={onToggle}
                                onSelect={onSelect}
                                depth={depth + 1}
                            />
                        ))
                    ) : (
                        <div
                            className="text-text-muted text-[10px] mono py-1 italic"
                            style={{ paddingLeft: `${(depth + 1) * 16 + 48}px` }}
                        >
                            {node.isLoading ? 'Loading...' : 'Empty folder'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function FileExplorer() {
    const { caseId } = useParams<{ caseId: string }>();
    const [tree, setTree] = useState<FSEntry[]>([]);
    const [deletedFiles, setDeletedFiles] = useState<FSEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [viewMode, setViewMode] = useState<'tree' | 'deleted' | 'search'>('tree');
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<FSEntry[]>([]);
    const [searchParams, setSearchParams] = useState({ fileName: '', extension: '', sizeMin: '', sizeMax: '', tags: '' });
    const [isSearching, setIsSearching] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);

    const [selectedFile, setSelectedFile] = useState<FSEntry | null>(null);

    useEffect(() => {
        let active = true;

        const loadRoot = async () => {
            if (!caseId) { setLoading(false); return; }
            try {
                const res = await filesystemApi.getTree(caseId);
                if (!active) return;
                const data = Array.isArray(res) ? res : (res?.data ?? []);
                setTree(data);
            } catch (err: any) {
                if (active) setError(err.message || 'Failed to load filesystem');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadRoot();

        return () => { active = false; };
    }, [caseId]);

    const loadDeleted = async () => {
        if (!caseId || deletedFiles.length > 0) return;
        setLoading(true);
        try {
            const res = await filesystemApi.getDeleted(caseId);
            const data = Array.isArray(res) ? res : (res?.data ?? []);
            setDeletedFiles(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load deleted files');
        } finally {
            setLoading(false);
        }
    };

    const runAdvancedSearch = async () => {
        if (!caseId) return;
        setIsSearching(true);
        setError('');
        try {
            const res = await filesystemApi.advancedSearch(caseId, searchParams);
            setSearchResults(res.entries || []);
        } catch (err: any) {
            setError(err.message || 'Search failed');
        } finally {
            setIsSearching(false);
        }
    };

    const toggleNode = async (id: string, isOpen: boolean) => {
        if (!caseId) return;

        // Recursive function to update the tree state
        const updateTree = (nodes: FSEntry[], targetId: string, updateFn: (node: FSEntry) => FSEntry): FSEntry[] => {
            return nodes.map(node => {
                if (node.id === targetId) return updateFn(node);
                if (node.children) return { ...node, children: updateTree(node.children, targetId, updateFn) };
                return node;
            });
        };

        if (isOpen) {
            // Check if we need to load children
            let needsLoad = false;
            setTree(prev => updateTree(prev, id, node => {
                if (!node.children) needsLoad = true;
                return { ...node, isExpanded: true, isLoading: needsLoad };
            }));

            if (needsLoad) {
                try {
                    const res = await filesystemApi.getTree(caseId, id);
                    const children = Array.isArray(res) ? res : (res?.data ?? []);
                    setTree(prev => updateTree(prev, id, node => ({ ...node, children, isLoading: false })));
                } catch {
                    setTree(prev => updateTree(prev, id, node => ({ ...node, isLoading: false })));
                }
            }
        } else {
            setTree(prev => updateTree(prev, id, node => ({ ...node, isExpanded: false })));
        }
    };

    if (loading && tree.length === 0 && deletedFiles.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    if (error && tree.length === 0) {
        return <div className="h-full flex items-center justify-center text-status-error text-sm mono">{error}</div>;
    }

    // Flat filter for deleted view
    const filteredDeleted = deletedFiles.filter(f => f.fileName.toLowerCase().includes(search.toLowerCase()) || f.filePath.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="h-full flex flex-col overflow-hidden p-4 gap-4">
            {/* Top Bar */}
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-1 bg-bg-elevated p-1 rounded-sm border border-bg-border">
                    <button
                        onClick={() => setViewMode('tree')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-[2px] transition-colors ${viewMode === 'tree' ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                        <HardDrive className="w-3.5 h-3.5" />
                        Directory Tree
                    </button>
                    <button
                        onClick={() => { setViewMode('deleted'); loadDeleted(); }}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-[2px] transition-colors ${viewMode === 'deleted' ? 'bg-status-error/10 text-status-error' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Recoverable Deleted Items {deletedFiles.length > 0 && `(${deletedFiles.length})`}
                    </button>
                    <button
                        onClick={() => setViewMode('search')}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-[2px] transition-colors ${viewMode === 'search' ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                        <Search className="w-3.5 h-3.5" />
                        Advanced Search
                    </button>
                </div>

                {viewMode === 'deleted' && (
                    <div className="flex items-center gap-2 bg-bg-elevated border border-bg-border rounded-sm px-3 py-1.5">
                        <Search className="w-3.5 h-3.5 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Search deleted files..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-transparent text-text-primary text-xs outline-none placeholder-text-muted mono w-48"
                        />
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex gap-4 min-h-0">
                <div className={`${selectedFile ? 'w-2/3' : 'w-full'} transition-all duration-300 relative glass-panel rounded-sm flex flex-col`}>
                    <div className="flex items-center px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0">
                        <div className="flex-1 px-5">Name</div>
                        <div className="w-24 text-right">Size</div>
                        <div className="w-32 ml-4">Modified</div>
                        <div className="w-16 text-center">Perms</div>
                    </div>

                    <div className="flex-1 overflow-y-auto w-full relative">
                        {loading && (
                            <div className="absolute inset-0 bg-bg-primary/50 backdrop-blur-sm z-10 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-accent-cyan animate-spin" />
                            </div>
                        )}

                        {viewMode === 'tree' ? (
                            <div className="py-2">
                                {tree.length > 0 ? (
                                    tree.map(node => (
                                        <FileSystemNode
                                            key={node.id}
                                            node={node}
                                            caseId={caseId || ''}
                                            onToggle={toggleNode}
                                            onSelect={setSelectedFile}
                                        />
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-text-muted text-xs mono">No file system tree found. Run SCANNING stage.</div>
                                )}
                            </div>
                        ) : viewMode === 'deleted' ? (
                            <div className="divide-y divide-bg-border/30">
                                {filteredDeleted.length > 0 ? (
                                    filteredDeleted.map((file, i) => (
                                        <div
                                            key={i}
                                            onClick={() => setSelectedFile(file)}
                                            className="flex items-center gap-4 px-4 py-2 table-row-hover cursor-pointer text-[11px] mono text-status-error/90 opacity-80 hover:bg-bg-elevated/50"
                                        >
                                            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                                {file.isDirectory ? <Folder className="w-3.5 h-3.5 text-status-error" /> : <File className="w-3.5 h-3.5 text-status-error" />}
                                            </div>
                                            <div className="flex-1 min-w-0 flex flex-col">
                                                <span className="truncate">{file.fileName}</span>
                                                <span className="truncate text-[9px] text-text-muted">{file.filePath}</span>
                                            </div>
                                            <div className="w-24 flex-shrink-0 text-right">{file.sizeBytes !== '0' ? file.sizeBytes : '—'}</div>
                                            <div className="w-32 flex-shrink-0 truncate">{typeof file.modifiedDate === 'string' ? file.modifiedDate.split('T')[0] : '—'}</div>
                                            <div className="w-16 flex-shrink-0 text-center">{file.permissions ?? '—'}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-10 text-text-muted">
                                        <SearchSlash className="w-8 h-8 mb-2 opacity-20" />
                                        <span className="text-xs mono">No deleted files found matching your criteria</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col h-full bg-bg-primary">
                                <div className="p-4 border-b border-bg-border/50 bg-bg-elevated flex gap-4 flex-wrap text-xs mono">
                                    <input placeholder="File Name" className="bg-bg-primary border border-bg-border rounded px-2 py-1 outline-none focus:border-accent-cyan" value={searchParams.fileName} onChange={e => setSearchParams({ ...searchParams, fileName: e.target.value })} />
                                    <input placeholder="Ext (e.g. .pdf)" className="bg-bg-primary border border-bg-border rounded px-2 py-1 outline-none w-24 focus:border-accent-cyan" value={searchParams.extension} onChange={e => setSearchParams({ ...searchParams, extension: e.target.value })} />
                                    <input placeholder="Min Size (B)" type="number" className="bg-bg-primary border border-bg-border rounded px-2 py-1 outline-none w-28 focus:border-accent-cyan" value={searchParams.sizeMin} onChange={e => setSearchParams({ ...searchParams, sizeMin: e.target.value })} />
                                    <input placeholder="Max Size (B)" type="number" className="bg-bg-primary border border-bg-border rounded px-2 py-1 outline-none w-28 focus:border-accent-cyan" value={searchParams.sizeMax} onChange={e => setSearchParams({ ...searchParams, sizeMax: e.target.value })} />
                                    <input placeholder="Tags (comma seq)" className="bg-bg-primary border border-bg-border rounded px-2 py-1 outline-none focus:border-accent-cyan" value={searchParams.tags} onChange={e => setSearchParams({ ...searchParams, tags: e.target.value })} />
                                    <button onClick={runAdvancedSearch} className="bg-accent-blue hover:bg-accent-blue/80 text-white px-4 py-1.5 rounded transition-colors flex items-center gap-2">
                                        {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                        Search
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                                    {searchResults.length > 0 ? (
                                        searchResults.map((file, i) => (
                                            <div
                                                key={i}
                                                onClick={() => setSelectedFile(file)}
                                                className="flex items-center gap-4 px-4 py-2 table-row-hover cursor-pointer text-[11px] mono text-text-primary hover:bg-bg-elevated/50"
                                            >
                                                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                                    {file.isDirectory ? <Folder className="w-3.5 h-3.5 text-accent-blue" /> : <File className="w-3.5 h-3.5 text-text-muted" />}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col">
                                                    <span className="truncate">{file.fileName}</span>
                                                    <span className="truncate text-[9px] text-text-muted">{file.filePath}</span>
                                                </div>
                                                <div className="w-24 flex-shrink-0 text-right">{file.sizeBytes !== '0' ? file.sizeBytes : '—'}</div>
                                                <div className="w-32 flex-shrink-0 truncate">{typeof file.modifiedDate === 'string' ? file.modifiedDate.split('T')[0] : '—'}</div>
                                                <div className="w-16 flex-shrink-0 text-center">{file.permissions ?? '—'}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-10 text-text-muted">
                                            <SearchSlash className="w-8 h-8 mb-2 opacity-20" />
                                            <span className="text-xs mono">No results found or waiting for query</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Metadata Pane */}
                {selectedFile && (
                    <div className="w-1/3 glass-panel rounded-sm flex flex-col p-4 animate-in fade-in slide-in-from-right-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-semibold mono text-text-primary tracking-wide">File Metadata</h3>
                            <button onClick={() => setSelectedFile(null)} className="text-text-muted hover:text-text-primary">✕</button>
                        </div>

                        <div className="space-y-4 text-xs mono">
                            <div>
                                <div className="text-text-muted mb-1 opacity-70">Name</div>
                                <div className="text-text-primary font-medium break-all">{selectedFile.fileName}</div>
                            </div>
                            <div>
                                <div className="text-text-muted mb-1 opacity-70">Path</div>
                                <div className="text-text-primary break-all">{selectedFile.filePath}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-text-muted mb-1 opacity-70">Size</div>
                                    <div className="text-text-primary">{selectedFile.sizeBytes} bytes</div>
                                </div>
                                <div>
                                    <div className="text-text-muted mb-1 opacity-70">Type</div>
                                    <div className="text-text-primary">{selectedFile.isDirectory ? 'Directory' : 'File'}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-text-muted mb-1 opacity-70">Modified</div>
                                    <div className="text-text-primary truncate">{selectedFile.modifiedDate ?? 'Unknown'}</div>
                                </div>
                                <div>
                                    <div className="text-text-muted mb-1 opacity-70">Created</div>
                                    <div className="text-text-primary truncate">{selectedFile.createdDate ?? 'Unknown'}</div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-bg-border/50 flex flex-col gap-2">
                                {!selectedFile.isDirectory && (
                                    <button
                                        onClick={() => setShowPreviewModal(true)}
                                        className="w-full py-2 bg-accent-blue hover:bg-accent-blue/80 text-white font-medium flex items-center justify-center gap-2 rounded-sm transition-colors"
                                    >
                                        <Search className="w-3.5 h-3.5" />
                                        Preview File
                                    </button>
                                )}
                                <button
                                    onClick={() => alert('Hex Viewer not yet implemented (Task 3)')}
                                    className="w-full py-2 bg-bg-elevated hover:bg-bg-border border border-bg-border text-text-primary font-medium flex items-center justify-center gap-2 rounded-sm transition-colors"
                                >
                                    <Search className="w-3.5 h-3.5" />
                                    Open in Hex Viewer
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showPreviewModal && selectedFile && (
                <FilePreviewModal
                    isOpen={showPreviewModal}
                    onClose={() => setShowPreviewModal(false)}
                    caseId={caseId || ''}
                    fileId={selectedFile.id}
                    fileName={selectedFile.fileName}
                    fileSize={Number(selectedFile.sizeBytes)}
                />
            )}
        </div>
    );
}
