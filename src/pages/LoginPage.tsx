import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/useTranslation';
import { AxiosError } from 'axios';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, isAuthenticated, authLoading } = useAuth();
    const { t } = useTranslation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Redirect via useEffect — NEVER during render
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            navigate('/dashboard', { replace: true });
        }
    }, [isAuthenticated, authLoading, navigate]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            // Navigation happens via the useEffect above when isAuthenticated flips
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                const status = err.response?.status;
                const message = err.response?.data?.message ?? '';
                if (status === 401) {
                    setError(t('auth.invalid_credentials'));
                } else if (status === 403) {
                    setError(
                        typeof message === 'string' && message.includes('locked')
                            ? 'Account temporarily locked. Try again later.'
                            : 'Your account has been deactivated.',
                    );
                } else {
                    setError('Login failed. Please try again.');
                }
            } else {
                setError('Network error. Please check your connection.');
            }
        } finally {
            setLoading(false);
        }
    }, [email, password, login, t]);

    // Show nothing while checking stored auth
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    // Already authenticated — useEffect handles redirect, render nothing to avoid flash
    if (isAuthenticated) {
        return null;
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
            {/* Background grid */}
            <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
            {/* Glow */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-accent-cyan/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10 w-full max-w-md">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-sm bg-accent-cyan/15 border border-accent-cyan/30 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,200,150,0.12)]">
                        <Shield className="w-6 h-6 text-accent-cyan" />
                    </div>
                    <span className="mono font-bold tracking-widest text-text-primary">SMARTRECOVERY</span>
                    <span className="text-text-muted text-xs mt-1 tracking-wide">Forensic Investigation System</span>
                </div>

                {/* Card */}
                <div className="glass-panel rounded-sm p-8">
                    <div className="mb-6">
                        <h1 className="text-text-primary font-semibold text-lg mb-1">{t('auth.login')}</h1>
                        <p className="text-text-muted text-xs">Authenticated access only. All sessions are logged.</p>
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-status-error/10 border border-status-error/25 rounded-sm mb-5">
                            <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
                            <span className="text-status-error text-xs">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-[11px] mono text-text-muted mb-1.5 tracking-wide">{t('auth.email').toUpperCase()}</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                placeholder="investigator@lab.gov"
                                className="w-full bg-bg-elevated border border-bg-border rounded-sm px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all placeholder-text-muted mono"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-[11px] mono text-text-muted mb-1.5 tracking-wide">{t('auth.password').toUpperCase()}</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    className="w-full bg-bg-elevated border border-bg-border rounded-sm px-3.5 py-2.5 pr-10 text-sm text-text-primary outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all placeholder-text-muted mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Remember me + forgot */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div
                                    onClick={() => setRememberMe(v => !v)}
                                    className={`w-4 h-4 rounded-sm border transition-colors cursor-pointer flex items-center justify-center ${rememberMe ? 'bg-accent-cyan/20 border-accent-cyan/50' : 'border-bg-border bg-bg-elevated'
                                        }`}
                                >
                                    {rememberMe && <div className="w-2 h-2 rounded-sm bg-accent-cyan" />}
                                </div>
                                <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                                    {t('auth.remember_me')}
                                </span>
                            </label>
                            <span className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                                {t('auth.forgot_password')}
                            </span>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-accent-cyan text-[#0F1115] font-bold text-sm rounded-sm hover:bg-accent-cyan/90 transition-all disabled:opacity-70 disabled:cursor-not-allowed mono tracking-wide mt-2 shadow-[0_0_20px_rgba(0,200,150,0.18)]"
                        >
                            {loading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> {t('auth.signing_in')}</>
                            ) : (
                                <><Lock className="w-4 h-4" /> {t('auth.login')}</>
                            )}
                        </button>
                    </form>

                    {/* Register link */}
                    <div className="mt-5 pt-5 border-t border-bg-border text-center">
                        <span className="text-text-muted text-xs">{t('auth.no_account')} </span>
                        <Link to="/register" className="text-accent-cyan text-xs hover:text-accent-cyan/80 transition-colors mono">
                            {t('auth.request_access')}
                        </Link>
                    </div>
                </div>

                {/* Back to landing */}
                <div className="text-center mt-5">
                    <Link to="/" className="text-text-muted text-[11px] mono hover:text-text-secondary transition-colors tracking-wide">
                        ← SmartRecovery
                    </Link>
                </div>
            </div>
        </div>
    );
}
