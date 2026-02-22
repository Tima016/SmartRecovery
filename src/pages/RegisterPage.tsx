import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, UserPlus, Eye, EyeOff, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/useTranslation';

export default function RegisterPage() {
    const navigate = useNavigate();
    const { register, isAuthenticated } = useAuth();
    const { t } = useTranslation();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    if (isAuthenticated) {
        navigate('/dashboard', { replace: true });
        return null;
    }

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError(t('auth.password_weak'));
            return;
        }
        if (password !== confirm) {
            setError(t('auth.password_mismatch'));
            return;
        }

        setLoading(true);
        try {
            await register(name, email, password);
            setSuccess(true);
            setTimeout(() => navigate('/login', { replace: true }), 2000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'unknown';
            setError(msg === 'email_taken' ? t('auth.email_taken') : 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [name, email, password, confirm, register, navigate, t]);

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg-primary)' }}>
            <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-accent-secondary/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10 w-full max-w-md">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-sm bg-accent-cyan/15 border border-accent-cyan/30 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,200,150,0.12)]">
                        <Shield className="w-6 h-6 text-accent-cyan" />
                    </div>
                    <span className="mono font-bold tracking-widest text-text-primary">IDFR PLATFORM</span>
                    <span className="text-text-muted text-xs mt-1 tracking-wide">Request Access</span>
                </div>

                <div className="glass-panel rounded-sm p-8">
                    <div className="mb-6">
                        <h1 className="text-text-primary font-semibold text-lg mb-1">{t('auth.register')}</h1>
                        <p className="text-text-muted text-xs">All accounts are subject to administrator approval.</p>
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-status-error/10 border border-status-error/25 rounded-sm mb-5">
                            <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
                            <span className="text-status-error text-xs">{error}</span>
                        </div>
                    )}

                    {/* Success banner */}
                    {success && (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-status-ok/10 border border-status-ok/25 rounded-sm mb-5">
                            <CheckCircle className="w-4 h-4 text-status-ok flex-shrink-0" />
                            <span className="text-status-ok text-xs">{t('auth.register_success')}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Name */}
                        <div>
                            <label className="block text-[11px] mono text-text-muted mb-1.5 tracking-wide">{t('auth.full_name').toUpperCase()}</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                placeholder="Jane Doe"
                                className="w-full bg-bg-elevated border border-bg-border rounded-sm px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all placeholder-text-muted"
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-[11px] mono text-text-muted mb-1.5 tracking-wide">{t('auth.email').toUpperCase()}</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                placeholder="investigator@lab.gov"
                                className="w-full bg-bg-elevated border border-bg-border rounded-sm px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all placeholder-text-muted mono"
                            />
                        </div>

                        {/* Role (display only) */}
                        <div>
                            <label className="block text-[11px] mono text-text-muted mb-1.5 tracking-wide">{t('auth.role').toUpperCase()}</label>
                            <div className="w-full bg-bg-elevated border border-bg-border rounded-sm px-3.5 py-2.5 text-sm text-text-muted mono cursor-not-allowed flex items-center justify-between">
                                <span>{t('auth.role_investigator')}</span>
                                <span className="text-[10px] text-text-muted/60">(auto-assigned)</span>
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-[11px] mono text-text-muted mb-1.5 tracking-wide">{t('auth.password').toUpperCase()}</label>
                            <div className="relative">
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    placeholder="Min. 8 characters"
                                    className="w-full bg-bg-elevated border border-bg-border rounded-sm px-3.5 py-2.5 pr-10 text-sm text-text-primary outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all placeholder-text-muted mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPwd(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                                >
                                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm password */}
                        <div>
                            <label className="block text-[11px] mono text-text-muted mb-1.5 tracking-wide">{t('auth.confirm_password').toUpperCase()}</label>
                            <input
                                type={showPwd ? 'text' : 'password'}
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                required
                                placeholder="Repeat password"
                                className={`w-full bg-bg-elevated border rounded-sm px-3.5 py-2.5 text-sm text-text-primary outline-none transition-all placeholder-text-muted mono ${confirm && confirm !== password
                                    ? 'border-status-error/50 focus:ring-status-error/20'
                                    : 'border-bg-border focus:border-accent-cyan/50 focus:ring-accent-cyan/20'
                                    } focus:ring-1`}
                            />
                            {confirm && confirm !== password && (
                                <p className="text-status-error text-[10px] mt-1 mono">{t('auth.password_mismatch')}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || success}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-accent-cyan text-[#0F1115] font-bold text-sm rounded-sm hover:bg-accent-cyan/90 transition-all disabled:opacity-70 disabled:cursor-not-allowed mono tracking-wide mt-2 shadow-[0_0_20px_rgba(0,200,150,0.18)]"
                        >
                            {loading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> {t('auth.creating')}</>
                            ) : (
                                <><UserPlus className="w-4 h-4" /> {t('auth.register')}</>
                            )}
                        </button>
                    </form>

                    <div className="mt-5 pt-5 border-t border-bg-border text-center">
                        <span className="text-text-muted text-xs">{t('auth.have_account')} </span>
                        <Link to="/login" className="text-accent-cyan text-xs hover:text-accent-cyan/80 transition-colors mono">
                            {t('auth.login')}
                        </Link>
                    </div>
                </div>

                <div className="text-center mt-5">
                    <Link to="/" className="text-text-muted text-[11px] mono hover:text-text-secondary transition-colors tracking-wide">
                        ← IDFR Platform
                    </Link>
                </div>
            </div>
        </div>
    );
}
