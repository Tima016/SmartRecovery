import { useNavigate, Link } from 'react-router-dom';
import { Shield, Lock, Search, Clock, FileText, Database, ChevronRight, Cpu, Globe, Users } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';

const features = [
    { icon: Database, key: 'acq' },
    { icon: Search, key: 'rec' },
    { icon: FileText, key: 'art' },
    { icon: Clock, key: 'time' },
    { icon: Shield, key: 'rep' },
];

const securityPoints = [
    { label: 'Write-blocker enforcement on all acquisition operations' },
    { label: 'SHA-256 / MD5 / SHA-512 cryptographic hash verification' },
    { label: 'Tamper-evident audit trail on every investigator action' },
    { label: 'Role-based access — investigators cannot modify system config' },
    { label: 'Encrypted session tokens with automatic expiry' },
    { label: 'Chain of custody enforced from acquisition to final report' },
];

export default function LandingPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="min-h-screen text-text-primary overflow-x-hidden" style={{ background: 'var(--bg-primary)' }}>
            {/* Top nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-8 border-b backdrop-blur-md" style={{ background: 'color-mix(in srgb, var(--bg-panel) 85%, transparent)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-sm bg-accent-cyan/20 border border-accent-cyan/40 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-accent-cyan" />
                    </div>
                    <span className="font-bold text-sm tracking-widest text-text-primary mono">IDFR</span>
                    <span className="text-[10px] text-text-muted mono ml-1 tracking-widest">PLATFORM</span>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        to="/login"
                        className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors mono tracking-wide"
                    >
                        {t('landing.cta_login')}
                    </Link>
                    <button
                        onClick={() => navigate('/register')}
                        className="px-4 py-2 text-xs bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/20 transition-all rounded-sm mono tracking-wide"
                    >
                        {t('landing.cta_request')}
                    </button>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative pt-36 pb-28 px-8 flex flex-col items-center text-center">
                {/* Grid overlay */}
                <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
                {/* Glow */}
                <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent-cyan/5 blur-[100px] rounded-full pointer-events-none" />

                <div className="relative z-10 max-w-4xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent-cyan/10 border border-accent-cyan/20 rounded-full mb-6">
                        <span className="status-dot ok" />
                        <span className="text-accent-cyan mono text-[10px] tracking-widest">{t('landing.hero_tag')}</span>
                    </div>

                    <h1 className="text-5xl font-bold tracking-tight leading-tight text-text-primary mb-6 whitespace-pre-line">
                        {t('landing.hero_title')}
                    </h1>

                    <p className="text-text-secondary text-lg leading-relaxed max-w-2xl mx-auto mb-10">
                        {t('landing.hero_sub')}
                    </p>

                    <div className="flex items-center gap-4 justify-center">
                        <button
                            onClick={() => navigate('/login')}
                            className="flex items-center gap-2 px-7 py-3.5 bg-accent-cyan text-[#0F1115] font-bold text-sm rounded-sm hover:bg-accent-cyan/90 transition-all mono tracking-wide shadow-[0_0_30px_rgba(0,200,150,0.25)]"
                        >
                            <Lock className="w-4 h-4" />
                            {t('landing.cta_login')}
                        </button>
                        <button
                            onClick={() => navigate('/register')}
                            className="flex items-center gap-2 px-7 py-3.5 border border-bg-border text-text-secondary text-sm rounded-sm hover:border-accent-cyan/30 hover:text-text-primary transition-all mono tracking-wide"
                        >
                            {t('landing.cta_request')}
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Metrics row */}
                    <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto">
                        {[
                            { val: '256-bit', label: 'Encryption' },
                            { val: '99.97%', label: 'Recovery Rate' },
                            { val: 'NIST', label: 'Guidelines' },
                        ].map(m => (
                            <div key={m.label} className="glass-panel rounded-sm p-4 text-center">
                                <div className="text-2xl font-bold text-accent-cyan mono mb-1">{m.val}</div>
                                <div className="text-text-muted text-[10px] tracking-widest">{m.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features section */}
            <section className="py-24 px-8 border-t border-white/5">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl font-bold text-text-primary mb-3">{t('landing.features_title')}</h2>
                        <p className="text-text-secondary">{t('landing.features_sub')}</p>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                        {features.map(({ icon: Icon, key }) => (
                            <div key={key} className="glass-panel rounded-sm p-5 group hover:border-accent-cyan/30 transition-all hover:shadow-[0_0_20px_rgba(0,200,150,0.08)]">
                                <div className="w-10 h-10 rounded-sm bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center mb-4 group-hover:bg-accent-cyan/20 transition-colors">
                                    <Icon className="w-5 h-5 text-accent-cyan" />
                                </div>
                                <h3 className="text-text-primary font-semibold text-sm mb-2">
                                    {t(`landing.feat_${key}_title`)}
                                </h3>
                                <p className="text-text-muted text-xs leading-relaxed">
                                    {t(`landing.feat_${key}_desc`)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Security & Integrity */}
            <section className="py-24 px-8 border-t border-white/5 bg-[#060810]">
                <div className="max-w-6xl mx-auto grid grid-cols-2 gap-16 items-center">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full mb-6">
                            <Lock className="w-3 h-3 text-text-muted" />
                            <span className="text-text-muted mono text-[10px] tracking-widest">INTEGRITY</span>
                        </div>
                        <h2 className="text-3xl font-bold mb-4">{t('landing.security_title')}</h2>
                        <p className="text-text-secondary mb-8 leading-relaxed">{t('landing.security_sub')}</p>
                        <div className="space-y-3">
                            {securityPoints.map(sp => (
                                <div key={sp.label} className="flex items-start gap-3">
                                    <div className="w-5 h-5 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Shield className="w-3 h-3 text-accent-cyan" />
                                    </div>
                                    <span className="text-text-secondary text-sm">{sp.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Right side: decorative terminal block */}
                    <div className="glass-panel rounded-sm p-6 font-mono text-xs space-y-2">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-bg-border">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                            <span className="text-text-muted text-[10px] ml-2">audit_log.json</span>
                        </div>
                        {[
                            { t: '2024-11-14 08:02:11', e: 'ACQUISITION_START', d: 'sdb — WB: ENGAGED' },
                            { t: '2024-11-14 08:02:12', e: 'HASH_CALC_BEGIN', d: 'SHA-256 | MD5' },
                            { t: '2024-11-14 09:41:05', e: 'ACQUISITION_COMPLETE', d: '500GB — 100%' },
                            { t: '2024-11-14 09:41:06', e: 'HASH_VERIFIED', d: 'a3f2...9d1e ✓' },
                            { t: '2024-11-14 09:45:20', e: 'DEEP_SCAN_START', d: 'Pattern: all types' },
                            { t: '2024-11-14 11:03:41', e: 'RECOVERY_COMPLETE', d: '47,823 files' },
                            { t: '2024-11-14 11:04:00', e: 'REPORT_EXPORTED', d: 'INV-2024-0892.pdf' },
                        ].map((log, i) => (
                            <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-4 items-start text-[10px]">
                                <span className="text-text-muted whitespace-nowrap">{log.t}</span>
                                <span className="text-accent-cyan">{log.e}</span>
                                <span className="text-text-secondary">{log.d}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-bg-border">
                            <span className="text-accent-cyan">›</span>
                            <span className="text-text-primary animate-pulse">_</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Target market */}
            <section className="py-24 px-8 border-t border-white/5">
                <div className="max-w-5xl mx-auto text-center">
                    <h2 className="text-3xl font-bold mb-3">{t('landing.market_title')}</h2>
                    <p className="text-text-muted mb-14 text-sm">&nbsp;</p>
                    <div className="grid grid-cols-3 gap-6">
                        {[
                            { icon: Cpu, mk: 'cyber' },
                            { icon: Search, mk: 'lab' },
                            { icon: Users, mk: 'corp' },
                        ].map(({ icon: Icon, mk }) => (
                            <div key={mk} className="glass-panel rounded-sm p-8 text-center group hover:border-accent-cyan/20 transition-all">
                                <div className="w-12 h-12 rounded-sm bg-bg-elevated border border-bg-border flex items-center justify-center mx-auto mb-5 group-hover:border-accent-cyan/20 transition-colors">
                                    <Icon className="w-6 h-6 text-text-secondary group-hover:text-accent-cyan transition-colors" />
                                </div>
                                <h3 className="font-semibold text-text-primary mb-2">{t(`landing.market_${mk}`)}</h3>
                                <p className="text-text-muted text-xs leading-relaxed">{t(`landing.market_${mk}_desc`)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/5 py-10 px-8">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-accent-cyan/60" />
                        <span className="mono text-[10px] text-text-muted tracking-widest">IDFR PLATFORM</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Globe className="w-3 h-3 text-status-error/50 animate-pulse" />
                        <span className="mono text-[10px] text-status-error/70 tracking-widest">{t('landing.footer_classified')}</span>
                    </div>
                    <span className="text-text-muted text-[10px] mono">© 2024 IDFR. {t('landing.footer_rights')}</span>
                </div>
            </footer>
        </div>
    );
}
