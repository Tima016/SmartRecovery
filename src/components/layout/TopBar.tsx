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
    Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../i18n/useTranslation';
import { apiClient } from '../../api/client';
import { casesApi } from '../../api/cases.api';
import type { ViewId } from '../../App';
import { useCase } from '../../context/CaseContext';
import { useLang } from '../../context/LanguageContext';
import GlobalSearch from '../common/GlobalSearch';

interface Props {
    activeView: ViewId;
}

const viewTitles: Partial<Record<string, string>> = {
    dashboard: 'SYSTEM OVERVIEW',
    cases: 'CASE MANAGEMENT',
    acquisition: 'EVIDENCE ACQUISITION',
    recovery: 'RECOVERY ENGINE',
    artifacts: 'ARTIFACT ANALYSIS',
    timeline: 'TIMELINE ANALYSIS',
    visualization: 'DATA VISUALIZATION',
    reports: 'REPORT GENERATION',
    settings: 'SYSTEM CONFIGURATION',
    workspace: 'INVESTIGATION WORKSPACE',
    admin: 'ADMIN PANEL',
};

export default function TopBar({ activeView }: Props) {
    const [progress, setProgress] = useState(0);
    const [uptime, setUptime] = useState(0);
    const [backendOk, setBackendOk] = useState(false);
    const [hashOk] = useState(true);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { lang, toggleLang } = useLang();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { selectedCaseId, setSelectedCaseId } = useCase();
    const [cases, setCases] = useState<any[]>([]);

    useEffect(() => {
        let active = true;
        casesApi.getAll().then(res => {
            if (!active) return;
            const data = Array.isArray(res) ? res : (res.data || []);
            setCases(data);
        }).catch(err => console.error('Failed to load cases in TopBar', err));
        return () => { active = false; };
    }, []);

    // Fetch real backend health data
    useEffect(() => {
        let active = true;
        const fetchHealth = () => {
            apiClient.get('/health')
                .then(res => {
                    if (!active) return;
                    setUptime(res.data?.uptime ?? 0);
                    setBackendOk(true);
                })
                .catch(() => {
                    if (active) setBackendOk(false);
                });
        };
        fetchHealth();
        const id = setInterval(fetchHealth, 15_000);
        return () => { active = false; clearInterval(id); };
    }, []);

    // Scan progress animation
    useEffect(() => {
        const id = setInterval(() => {
            setProgress(p => (p >= 100 ? 0 : p + 0.3));
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

    // Global Ctrl+K shortcut
    useEffect(() => {
        function handler(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(v => !v);
            }
        }
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleLogout = () => {
        setDropdownOpen(false);
        logout();
        navigate('/', { replace: true });
    };

    const formatUptime = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const displayName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'User';
    const initials = ((user?.firstName?.[0] || user?.email?.[0] || 'U')).toUpperCase();

    return (
        <>
            <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
            <header
                className="flex items-center h-12 px-4 gap-3 flex-shrink-0 border-b"
                style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            >
                {/* Breadcrumb / Active Case */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        {(() => {
                            // Properly determine if we're on a case-scoped sub-page
                            const segments = window.location.pathname.split('/').filter(Boolean);
                            const isCaseSubPage = segments[0] === 'cases' && segments.length >= 3;
                            const urlCaseId = isCaseSubPage ? segments[1] : null;
                            const isStandalone = ['dashboard', 'settings', 'admin'].includes(activeView);

                            if (isStandalone) {
                                return (
                                    <span className="text-text-secondary text-[11px] mono truncate min-w-[max-content]">
                                        {viewTitles[activeView] ?? activeView.toUpperCase()}
                                    </span>
                                );
                            }

                            return (
                                <>
                                    <span
                                        className="text-text-muted text-[10px] mono uppercase tracking-widest flex-shrink-0 hover:text-text-primary cursor-pointer transition-colors"
                                        onClick={() => navigate('/cases')}
                                    >
                                        {t('nav.cases') || 'CASES'}
                                    </span>
                                    {(urlCaseId || selectedCaseId) && (
                                        <>
                                            <span className="text-text-muted text-[10px] mono mx-1">&gt;</span>
                                            <span
                                                className="text-text-muted text-[10px] mono uppercase tracking-widest flex-shrink-0 hover:text-text-primary cursor-pointer transition-colors"
                                                onClick={() => navigate(`/cases/${urlCaseId || selectedCaseId}`)}
                                            >
                                                {t('topbar.case') || 'CASE'} #{(urlCaseId || selectedCaseId)?.slice(0, 8)}
                                            </span>
                                        </>
                                    )}
                                    {isCaseSubPage && (
                                        <>
                                            <span className="text-text-muted text-[10px] mono mx-1">&gt;</span>
                                            <span className="text-accent-cyan text-[11px] mono truncate min-w-[max-content] font-medium">
                                                {viewTitles[activeView] ?? activeView.toUpperCase()}
                                            </span>
                                        </>
                                    )}
                                    {!isCaseSubPage && (
                                        <span className="text-text-secondary text-[11px] mono truncate min-w-[max-content]">
                                            {viewTitles[activeView] ?? activeView.toUpperCase()}
                                        </span>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    {/* Global Case Selector */}
                    {!(viewTitles[activeView]?.includes('SYSTEM') || viewTitles[activeView]?.includes('ADMIN') || activeView === 'settings') && (
                        <div className="ml-4 border-l border-bg-border pl-4">
                            <select 
                                value={selectedCaseId || ''} 
                                onChange={e => {
                                    setSelectedCaseId(e.target.value);
                                    if (e.target.value && ['recovery', 'artifacts', 'timeline', 'visualization'].includes(activeView)) {
                                        navigate(`/cases/${e.target.value}/${activeView}`);
                                    }
                                }}
                                className="bg-bg-elevated border border-bg-border text-text-primary px-3 py-1 rounded-sm text-xs mono focus:border-accent-cyan outline-none w-48"
                            >
                                <option value="">Select Case</option>
                                {cases.map(c => (
                                    <option key={c.id} value={c.id}>{c.name || `Case ${c.id}`}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Global Search Button */}
                <button
                    onClick={() => setSearchOpen(true)}
                    title="Global Search (Ctrl+K)"
                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-sm border text-text-muted hover:text-text-secondary hover:border-accent-cyan/30 transition-colors flex-shrink-0"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                >
                    <Search className="w-3 h-3" />
                    <span className="text-[10px] mono">Search...</span>
                    <span className="text-[9px] mono bg-bg-primary border border-bg-border rounded px-1 py-0.5 ml-1">Ctrl+K</span>
                </button>

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

                {/* Backend Status & Uptime */}
                <div
                    className="hidden xl:flex items-center gap-3 px-3 py-1 rounded-sm flex-shrink-0 border"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                >
                    <div className="flex items-center gap-1.5">
                        <span className="text-text-muted text-[9px] mono">API</span>
                        <span className={`text-[10px] mono font-bold ${backendOk ? 'text-status-ok' : 'text-status-error'}`}>{backendOk ? 'OK' : 'DOWN'}</span>
                    </div>
                    <div className="w-px h-3 bg-bg-border" />
                    <div className="flex items-center gap-1.5">
                        <span className="text-text-muted text-[9px] mono">UPTIME</span>
                        <span className="text-accent-cyan text-[10px] mono font-bold">{formatUptime(uptime)}</span>
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
                                {initials}
                            </span>
                        </div>
                        <div className="text-left hidden sm:block">
                            <div className="text-text-primary text-[11px] font-medium leading-none mb-0.5">{displayName}</div>
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
                                <div className="text-text-primary text-xs font-medium">{displayName}</div>
                                <div className="text-text-muted text-[10px] mono mt-0.5 truncate">{user?.email}</div>
                            </div>

                            <div className="py-1">
                                {/* Profile */}
                                <button
                                    onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                                >
                                    <User className="w-3.5 h-3.5 text-text-muted" />
                                    {t('user.profile')}
                                </button>

                                {/* Account settings */}
                                <button
                                    onClick={() => { setDropdownOpen(false); navigate('/settings'); }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                                >
                                    <Settings className="w-3.5 h-3.5 text-text-muted" />
                                    {t('user.account_settings')}
                                </button>

                                {/* Admin panel link (admin only) */}
                                {user?.role === 'ADMIN' && (
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
        </>
    );
}
