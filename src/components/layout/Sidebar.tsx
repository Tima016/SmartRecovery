import {
    LayoutDashboard,
    FolderOpen,
    HardDrive,
    Search,
    Microscope,
    Clock,
    BarChart3,
    FileText,
    Settings,
    ChevronRight,
    Shield,
    Cpu,
    Briefcase,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n/useTranslation';


const navItems: { id: string; icon: React.ElementType; labelKey: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
    { id: 'cases', icon: FolderOpen, labelKey: 'nav.cases' },
    { id: 'acquisition', icon: HardDrive, labelKey: 'nav.acquisition' },
    { id: 'recovery', icon: Search, labelKey: 'nav.recovery' },
    { id: 'artifacts', icon: Microscope, labelKey: 'nav.artifacts' },
    { id: 'timeline', icon: Clock, labelKey: 'nav.timeline' },
    { id: 'visualization', icon: BarChart3, labelKey: 'nav.visualization' },
    { id: 'workspace', icon: Briefcase, labelKey: 'nav.workspace' },
    { id: 'reports', icon: FileText, labelKey: 'nav.reports' },
    { id: 'settings', icon: Settings, labelKey: 'nav.settings' },
];

export default function Sidebar() {
    const { t } = useTranslation();
    const location = useLocation();

    return (
        <aside
            className="flex flex-col w-56 min-w-56 h-full border-r relative z-10"
            style={{
                background: 'var(--bg-panel)',
                borderColor: 'var(--border)',
            }}
        >
            {/* Logo / Product Name */}
            <div
                className="px-4 pt-5 pb-4 border-b"
                style={{ borderColor: 'var(--border)' }}
            >
                <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-6 h-6 rounded-sm bg-accent-cyan/20 border border-accent-cyan/40 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-3.5 h-3.5 text-accent-cyan" />
                    </div>
                    <span
                        className="font-bold text-sm tracking-widest mono"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        SmartRecovery
                    </span>
                </div>
                <div
                    className="text-[9px] mono tracking-widest leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                >
                    INTELLIGENT DIGITAL<br />FORENSIC PLATFORM
                </div>
                <div className="mt-2 px-1.5 py-0.5 bg-accent-cyan/5 border border-accent-cyan/10 rounded-sm inline-block">
                    <span className="text-[9px] text-accent-cyan/80 mono tracking-widest">v2.4.1</span>
                </div>
            </div>

            {/* Node/Session Info */}
            <div
                className="px-4 py-2.5 border-b"
                style={{ borderColor: 'var(--border)' }}
            >
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] mono tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        {t('topbar.node')}
                    </span>
                    <span className="text-[9px] mono" style={{ color: 'var(--text-secondary)' }}>
                        FRN-NODE-07
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[9px] mono tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        {t('topbar.session')}
                    </span>
                    <span className="text-[9px] mono text-accent-cyan/70">04:23:11</span>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 py-2 overflow-y-auto">
                {navItems.map(({ id, icon: Icon, labelKey }) => {
                    let to = `/${id}`;
                    let isActive = location.pathname.startsWith(to);

                    if (id === 'dashboard') {
                        to = '/dashboard';
                        isActive = location.pathname === '/dashboard';
                    }

                    if (id === 'cases') {
                        to = '/cases';
                    }

                    return (
                        <NavLink
                            to={to}
                            key={id}
                            className={({ isActive }) =>
                                `w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 group relative ${isActive
                                    ? 'nav-active text-accent-cyan'
                                    : 'border-l-2 border-transparent text-text-secondary'
                                }`
                            }
                            style={({ isActive }) => (!isActive ? { color: 'var(--text-secondary)' } : undefined)}
                            onMouseEnter={e => {
                                if (!isActive) {
                                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                                    (e.currentTarget as HTMLAnchorElement).style.background = 'var(--border)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isActive) {
                                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                                    (e.currentTarget as HTMLAnchorElement).style.background = '';
                                }
                            }}
                        >
                            <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-accent-cyan' : 'text-text-muted group-hover:text-text-secondary'
                                }`} />
                            <span className="font-medium tracking-tight">{t(labelKey)}</span>
                            {isActive && <ChevronRight className="w-3 h-3 ml-auto text-accent-cyan opacity-60" />}
                        </NavLink>
                    );
                })}
            </nav>

            {/* Bottom status */}
            <div
                className="px-4 py-3 border-t"
                style={{ borderColor: 'var(--border)' }}
            >
                <div className="flex items-center gap-2 mb-1.5">
                    <Cpu className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[9px] mono" style={{ color: 'var(--text-muted)' }}>SYSTEM NOMINAL</span>
                    <span className="status-dot ok ml-auto" />
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan/60 animate-pulse" />
                    <span className="text-[9px] mono" style={{ color: 'var(--text-muted)' }}>{t('topbar.forensic_mode')}: </span>
                    <span className="text-[9px] mono text-accent-cyan">ACTIVE</span>
                </div>
            </div>
        </aside>
    );
}
