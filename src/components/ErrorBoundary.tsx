import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Global error boundary — catches unhandled React render errors and
 * shows a recoverable fallback UI instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    private handleReload = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="min-h-screen flex items-center justify-center px-4"
                    style={{ background: 'var(--bg-primary)' }}
                >
                    <div className="glass-panel rounded-sm p-8 max-w-md w-full text-center">
                        <div className="w-12 h-12 rounded-sm bg-status-error/15 border border-status-error/30 flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-6 h-6 text-status-error" />
                        </div>
                        <h1 className="text-text-primary font-semibold text-lg mb-2">
                            Something went wrong
                        </h1>
                        <p className="text-text-muted text-xs mb-6 mono">
                            {this.state.error?.message ?? 'An unexpected error occurred.'}
                        </p>
                        <button
                            onClick={this.handleReload}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-cyan text-[#0F1115] font-bold text-sm rounded-sm hover:bg-accent-cyan/90 transition-all mono tracking-wide"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
