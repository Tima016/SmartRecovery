import { useState, useEffect } from 'react';
import { X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { filesystemApi } from '../../api/filesystem.api';

interface FilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    caseId: string;
    fileId: string;
    fileName: string;
    fileSize: number;
}

export default function FilePreviewModal({ isOpen, onClose, caseId, fileId, fileName, fileSize }: FilePreviewModalProps) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewType, setViewType] = useState<'text' | 'image' | 'hex'>('text');

    useEffect(() => {
        if (!isOpen) {
            setContent(null);
            setError(null);
            return;
        }

        const fetchPreview = async () => {
            setLoading(true);
            try {
                const url = filesystemApi.getPreviewUrl(caseId, fileId);
                // Note: The apiClient generally has an interceptor for tokens. 
                // Since this is a direct fetch for a blob, we must include the token.
                const token = localStorage.getItem('dfip_token');

                const response = await fetch(url, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch file preview');
                }

                // Determine file type simply by extension
                const ext = fileName.split('.').pop()?.toLowerCase() || '';
                const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

                if (imageExts.includes(ext)) {
                    setViewType('image');
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    setContent(objectUrl);
                } else {
                    setViewType('text');
                    const text = await response.text();
                    setContent(text);
                }
            } catch (err: any) {
                setError(err.message || 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchPreview();

        return () => {
            if (content && content.startsWith('blob:')) {
                URL.revokeObjectURL(content);
            }
        };
    }, [isOpen, caseId, fileId, fileName]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-primary border border-bg-border rounded-lg shadow-2xl flex flex-col w-full max-w-5xl h-[85vh] overflow-hidden animate-in fade-in zoom-in-95">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border bg-bg-elevated flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {viewType === 'image' ? (
                            <ImageIcon className="w-5 h-5 text-accent-blue" />
                        ) : (
                            <FileText className="w-5 h-5 text-accent-blue" />
                        )}
                        <div>
                            <h2 className="text-sm font-semibold text-text-primary mono truncate max-w-md">{fileName}</h2>
                            <p className="text-xs text-text-muted mono">{fileSize} bytes</p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-border rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 relative overflow-hidden flex bg-bg-primary">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-primary/80">
                            <Loader2 className="w-8 h-8 text-accent-cyan animate-spin mb-4" />
                            <span className="text-sm mono text-text-muted">Extracting buffer...</span>
                        </div>
                    )}

                    {error && (
                        <div className="m-auto text-status-error text-sm mono bg-status-error/10 p-4 rounded border border-status-error/20">
                            {error}
                        </div>
                    )}

                    {!loading && !error && content && (
                        <div className="flex-1 overflow-auto p-4 w-full h-full">
                            {viewType === 'image' ? (
                                <div className="flex items-center justify-center min-h-full">
                                    <img src={content} alt="Preview" className="max-w-full max-h-[70vh] object-contain border border-bg-border shadow-sm" />
                                </div>
                            ) : (
                                <pre className="text-[11px] mono text-text-primary leading-relaxed whitespace-pre-wrap break-all p-4 bg-bg-elevated rounded border border-bg-border">
                                    {content}
                                </pre>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
