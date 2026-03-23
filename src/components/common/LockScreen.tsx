import { Lock, Loader2 } from 'lucide-react';

interface LockScreenProps {
    status: string;
    progress?: number;
    message?: string;
}

export function LockScreen({ status, progress, message }: LockScreenProps) {
    const isError = status === 'ERROR';

    return (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-md bg-bg-primary/60 rounded-sm border border-bg-border">
            <div className={`p-4 rounded-full mb-4 ${isError ? 'bg-status-error/10 text-status-error' : 'bg-accent-cyan/10 text-accent-cyan'}`}>
                {status === 'IMAGING' || status === 'HASHING' || status === 'SCANNING' || status === 'ANALYZING' ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                    <Lock className="w-8 h-8" />
                )}
            </div>

            <h3 className={`text-lg font-bold tracking-widest mono mb-2 ${isError ? 'text-status-error' : 'text-text-primary'}`}>
                {isError ? 'PROCESS ERROR' : `CASE ${status}`}
            </h3>

            <p className="text-text-secondary text-sm mb-6 max-w-sm text-center">
                {message || (isError
                    ? 'A critical error occurred during the forensic pipeline. Please check the system logs or retry.'
                    : 'The case is currently locked for processing. Investigation tools will unlock automatically once the phase is complete.')}
            </p>

            {progress !== undefined && progress > 0 && !isError && (
                <div className="w-64 max-w-full glass-panel p-3 text-center">
                    <div className="flex justify-between items-center mb-2 px-1 text-xs mono text-text-muted">
                        <span>{status} Pipeline</span>
                        <span className="text-accent-cyan">{progress}%</span>
                    </div>
                    <div className="w-full bg-bg-elevated h-2 rounded-sm overflow-hidden border border-bg-border">
                        <div
                            className="bg-accent-cyan h-full transition-all duration-300 ease-in-out shadow-[0_0_10px_rgba(0,196,255,0.5)]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
