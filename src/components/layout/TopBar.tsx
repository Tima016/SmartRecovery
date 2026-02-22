import { useEffect, useState, useRef } from 'react';
import {
    ShieldCheck,
    ShieldAlert,
    ChevronDown,
    User,
    Settings,
    LogOut,
    Sun,
    Moon,
    Globe,
    Shield,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../i18n/useTranslation';
import { useLang } from '../../context/LanguageContext';
import type { ViewId } from '../../App';

interface Props {
    activeView: ViewId;
}

const caseNames: Partial<Record<ViewId, string>> = {
    dashboard: 'SYSTEM OVERVIEW',
    cases: 'INV-2024-0892 — FinCorp Insider Threat',
    acquisition: 'INV-2024-0889 — Disk Imaging Active',
    recovery: 'INV-2024-0889 — Recovery Scan',
    artifacts: 'INV-2024-0892 — Artifact Extraction',
    timeline: 'INV-2024-0892 — Timeline',
    visualization: 'INV-2024-0892 — Data Visualization',
    reports: 'INV-2024-0892 — Report Generation',
    settings: 'SYSTEM CONFIGURATION',
};

export default function TopBar({ activeView }: Props) {
    const [progress, setProgress] = useState(0);
    const [cpu, setCpu] = useState(0);
    const [ram, setRam] = useState(0);
    const [hashOk] = useState(true);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { lang, toggleLang } = useLang();
    const { t } = useTranslation();
    const navigate = useNavigate();

    useEffect(() => {
        const id = setInterval(() => {
            setProgress(p => (p >= 100 ? 0 : p + 0.3));
            setCpu(Math.floor(Math.random() * 30 + 20));
            setRam(Math.floor(Math.random() * 20 + 55));
        }, 600);
        return () => clearInterval(id);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = () => {
        setDropdownOpen(false);
        logout();
        navigate('/', { replace: true });
    };

    const cpuColor = cpu > 80 ? 'text-status-error' : cpu > 60 ? 'text-[#f59e0b]' : 'text-status-ok';
    const ramColor = ram > 85 ? 'text-status-error' : ram > 70 ? 'text-[#f59e0b]' : 'text-status-ok';

    return (
        <header
            className="flex items-center h-12 px-4 gap-3 flex-shrink-0 border-b"
            style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        >
            {/* Breadcrumb / Active Case */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-text-muted text-[10px] mono uppercase tracking-widest flex-shrink-0">
                        {caseNames[activeView]?.includes('SYSTEM') ? '' : t('topbar.case')}
                    </span>
                    <span className="text-text-secondary text-[11px] mono truncate">{caseNames[activeView] ?? activeView.toUpperCase()}</span>
                </div>
            </div>

            {/* Case Status */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-status-ok/10 border border-status-ok/20 rounded-sm flex-shrink-0">
                <span className="status-dot ok" />
                <span className="text-status-ok text-[10px] mono">{t('topbar.status_active')}</span>
            </div>

            {/* Hash Verification */}
            <div className={`flex items-center gap-1.5 px-2 py-1 border rounded-sm flex-shrink-0 ${hashOk ? 'bg-status-ok/10 border-status-ok/20' : 'bg-status-error/10 border-status-error/20'
                }`}>
                {hashOk
                    ? <ShieldCheck className="w-3 h-3 text-status-ok" />
                    : <ShieldAlert className="w-3 h-3 text-status-error" />}
                <span className={`text-[10px] mono ${hashOk ? 'text-status-ok' : 'text-status-error'}`}>
                    {hashOk ? t('topbar.hash_verified') : t('topbar.hash_failed')}
                </span>
            </div>

            {/* Scan Progress */}
            <div className="flex items-center gap-2 max-w-[180px] w-full flex-shrink-0">
                <span className="text-text-muted text-[10px] mono flex-shrink-0">{t('topbar.scan')}</span>
                <div className="flex-1 h-1 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                        className="h-full bg-accent-cyan rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, boxShadow: '0 0 8px rgba(0,212,255,0.6)' }}
                    />
                </div>
                <span className="text-accent-cyan text-[10px] mono flex-shrink-0">{Math.floor(progress)}%</span>
            </div>

            {/* CPU / RAM */}
            <div
                className="hidden xl:flex items-center gap-3 px-3 py-1 rounded-sm flex-shrink-0 border"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
            >
                <div className="flex items-center gap-1.5">
                    <span className="text-text-muted text-[9px] mono">CPU</span>
                    <span className={`text-[10px] mono font-bold ${cpuColor}`}>{cpu}%</span>
                </div>
                <div className="w-px h-3 bg-bg-border" />
                <div className="flex items-center gap-1.5">
                    <span className="text-text-muted text-[9px] mono">RAM</span>
                    <span className={`text-[10px] mono font-bold ${ramColor}`}>{ram}%</span>
                </div>
            </div>

            {/* Language Toggle */}
            <button
                onClick={toggleLang}
                title="Toggle language"
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm hover:border-accent-cyan/30 transition-colors flex-shrink-0 border"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
            >
                <Globe className="w-3 h-3 text-text-muted" />
                <span className="text-[10px] mono text-text-secondary font-bold tracking-widest">{lang.toUpperCase()}</span>
            </button>

            {/* User Dropdown */}
            <div className="relative flex-shrink-0" ref={dropdownRef}>
                <button
                    onClick={() => setDropdownOpen(v => !v)}
                    className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-elevated rounded-sm transition-colors border border-transparent hover:border-bg-border"
                >
                    {/* Avatar */}
                    <div className="w-6 h-6 rounded-full bg-accent-cyan/20 border border-accent-cyan/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-accent-cyan text-[10px] font-bold mono">
                            {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
                        </span>
                    </div>
                    <div className="text-left hidden sm:block">
                        <div className="text-text-primary text-[11px] font-medium leading-none mb-0.5">{user?.name}</div>
                        <div className="text-text-muted text-[9px] mono uppercase tracking-wide">{user?.role}</div>
                    </div>
                    <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {dropdownOpen && (
                    <div
                        className="absolute right-0 top-full mt-1.5 w-52 rounded-sm shadow-2xl z-50 animate-fade-in overflow-hidden border"
                        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                    >
                        {/* User info header */}
                        <div className="px-3.5 py-3 border-b" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                            <div className="text-text-primary text-xs font-medium">{user?.name}</div>
                            <div className="text-text-muted text-[10px] mono mt-0.5 truncate">{user?.email}</div>
                        </div>

                        <div className="py-1">
                            {/* Profile */}
                            <button className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors">
                                <User className="w-3.5 h-3.5 text-text-muted" />
                                {t('user.profile')}
                            </button>

                            {/* Account settings */}
                            <button className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors">
                                <Settings className="w-3.5 h-3.5 text-text-muted" />
                                {t('user.account_settings')}
                            </button>

                            {/* Admin panel link (admin only) */}
                            {user?.role === 'admin' && (
                                <button
                                    onClick={() => { setDropdownOpen(false); navigate('/admin'); }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-amber-400/80 hover:text-amber-400 hover:bg-bg-elevated transition-colors"
                                >
                                    <Shield className="w-3.5 h-3.5" />
                                    {t('user.admin_panel')}
                                </button>
                            )}
                        </div>

                        <div className="border-t border-bg-border py-1">
                            {/* Theme toggle */}
                            <button
                                onClick={toggleTheme}
                                className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                            >
                                <div className="flex items-center gap-2.5">
                                    {theme === 'dark'
                                        ? <Moon className="w-3.5 h-3.5 text-text-muted" />
                                        : <Sun className="w-3.5 h-3.5 text-yellow-400" />}
                                    {theme === 'dark' ? t('user.theme_dark') : t('user.theme_light')}
                                </div>
                                {/* Toggle pill */}
                                <div className={`w-7 h-4 rounded-full border transition-colors flex items-center px-0.5 ${theme === 'dark' ? 'bg-bg-elevated border-bg-border' : 'bg-yellow-500/20 border-yellow-500/30'
                                    }`}>
                                    <div className={`w-3 h-3 rounded-full transition-all ${theme === 'dark' ? 'bg-text-muted translate-x-0' : 'bg-yellow-400 translate-x-3'
                                        }`} />
                                </div>
                            </button>

                            {/* Language toggle */}
                            <button
                                onClick={toggleLang}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                            >
                                <Globe className="w-3.5 h-3.5 text-text-muted" />
                                {t('user.language')}: <span className="mono font-bold text-accent-cyan ml-auto">{lang.toUpperCase()}</span>
                            </button>
                        </div>

                        <div className="border-t border-bg-border py-1">
                            {/* Logout */}
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-status-error/80 hover:text-status-error hover:bg-status-error/5 transition-colors"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                {t('user.logout')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
}
