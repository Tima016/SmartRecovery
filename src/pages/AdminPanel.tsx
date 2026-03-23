import { useState, useEffect } from 'react';
import { Shield, Users, ScrollText, ToggleLeft, ToggleRight, ChevronDown, Terminal, Loader2 } from 'lucide-react';
import { useAuth, type Role } from '../context/AuthContext';
import { useTranslation } from '../i18n/useTranslation';
import { usersApi } from '../api/users.api';
import { auditApi } from '../api/audit.api';

// ─── Types ────────────────────────────────────────────────────────────
interface AdminUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    isActive?: boolean;
    createdAt?: string;
}

interface LogEntry {
    time: string;
    event: string;
    actor: string;
    detail: string;
}

const roleColor: Record<Role, string> = {
    ADMIN: 'text-[#f59e0b] bg-amber-500/10 border-amber-500/25',
    ANALYST: 'text-accent-cyan bg-accent-cyan/10 border-accent-cyan/25',
    INVESTIGATOR: 'text-accent-cyan bg-accent-cyan/10 border-accent-cyan/25',
    AUDITOR: 'text-purple-400 bg-purple-500/10 border-purple-500/25'
};

const availableRoles: Role[] = ['ADMIN', 'ANALYST', 'INVESTIGATOR', 'AUDITOR'];

export default function AdminPanel() {
    const { user: currentUser } = useAuth();
    const { t } = useTranslation();
    const [tab, setTab] = useState<'users' | 'logs'>('users');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [roleDropdown, setRoleDropdown] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, logsRes] = await Promise.allSettled([
                usersApi.getAll(),
                auditApi.getLogs({ limit: 50 }),
            ]);

            const usersData = usersRes.status === 'fulfilled' ? usersRes.value.data : [];
            const userList = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);
            setUsers(userList.map((u: any) => ({
                id: u.id,
                email: u.email,
                firstName: u.firstName ?? '',
                lastName: u.lastName ?? '',
                role: u.role ?? 'ANALYST',
                isActive: u.isActive ?? u.active ?? true,
                createdAt: u.createdAt ?? '—',
            })));

            const logsData = logsRes.status === 'fulfilled' ? logsRes.value.data : [];
            const logList = Array.isArray(logsData) ? logsData : (logsData?.data ?? []);
            setLogs(logList.map((l: any) => ({
                time: l.createdAt ?? l.time ?? '—',
                event: l.action ?? l.event ?? '—',
                actor: l.actor ?? l.user ?? l.email ?? '—',
                detail: typeof l.details === 'string' ? l.details : (l.detail ?? JSON.stringify(l.details ?? '')),
            })));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load admin data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleToggleActive = async (u: AdminUser) => {
        if (u.id === currentUser?.id) return;
        try {
            await usersApi.update(u.id, { isActive: !u.isActive });
            await fetchData();
        } catch {
            // Silently handle — user will see no change
        }
    };

    const handleRoleChange = async (u: AdminUser, role: Role) => {
        if (u.id === currentUser?.id) return;
        try {
            await usersApi.update(u.id, { role });
            setRoleDropdown(null);
            await fetchData();
        } catch {
            // Silently handle
        }
    };

    const getUserDisplayName = (u: AdminUser) => `${u.firstName} ${u.lastName}`.trim() || u.email;
    const getUserInitial = (u: AdminUser) => (u.firstName?.charAt(0) ?? u.email?.charAt(0) ?? 'U').toUpperCase();
    const getUserDate = (u: AdminUser) => {
        if (!u.createdAt || u.createdAt === '—') return '—';
        try { return new Date(u.createdAt).toISOString().split('T')[0]; } catch { return '—'; }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center text-status-error text-sm mono">
                {error}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden p-4 gap-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <Shield className="w-5 h-5 text-amber-400" />
                    <h1 className="text-text-primary font-semibold text-base tracking-tight">{t('admin.title')}</h1>
                    <span className="tag bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px] px-2">ADMIN ONLY</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 flex-shrink-0">
                {(['users', 'logs'] as const).map(tb => (
                    <button
                        key={tb}
                        onClick={() => { setTab(tb); }}
                        className={`flex items-center gap-2 px-4 py-2 text-xs mono rounded-sm transition-all ${tab === tb
                            ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/25'
                            : 'text-text-secondary hover:text-text-primary bg-bg-elevated border border-transparent'
                            }`}
                    >
                        {tb === 'users' ? <Users className="w-3.5 h-3.5" /> : <ScrollText className="w-3.5 h-3.5" />}
                        {t(tb === 'users' ? 'admin.users' : 'admin.logs')}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden glass-panel rounded-sm flex flex-col">
                {tab === 'users' && (
                    <>
                        {/* Header row */}
                        <div className="grid gap-4 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0"
                            style={{ gridTemplateColumns: '2fr 2.5fr 1fr 0.8fr 1.2fr 1.2fr' }}>
                            <span>{t('admin.user_name')}</span>
                            <span>{t('admin.user_email')}</span>
                            <span>{t('admin.user_role')}</span>
                            <span>{t('admin.user_status')}</span>
                            <span>{t('admin.user_joined')}</span>
                            <span>{t('admin.user_actions')}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/30">
                            {users.length > 0 ? users.map(u => (
                                <div
                                    key={u.id}
                                    className="grid gap-4 px-4 py-3 items-center hover:bg-bg-elevated/40 transition-colors"
                                    style={{ gridTemplateColumns: '2fr 2.5fr 1fr 0.8fr 1.2fr 1.2fr' }}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-full bg-accent-cyan/15 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0">
                                            <span className="text-accent-cyan text-[10px] font-bold mono">{getUserInitial(u)}</span>
                                        </div>
                                        <div>
                                            <div className="text-text-primary text-xs font-medium">{getUserDisplayName(u)}</div>
                                            {u.id === currentUser?.id && (
                                                <div className="text-[9px] mono text-accent-cyan/60">(you)</div>
                                            )}
                                        </div>
                                    </div>

                                    <span className="text-text-secondary text-xs mono truncate">{u.email}</span>

                                    {/* Role dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => {
                                                if (u.id !== currentUser?.id) {
                                                    setRoleDropdown(roleDropdown === u.id ? null : u.id);
                                                }
                                            }}
                                            disabled={u.id === currentUser?.id}
                                            className={`flex items-center gap-1 tag border ${roleColor[u.role] ?? roleColor.ANALYST} text-[10px] disabled:opacity-60 disabled:cursor-default`}
                                        >
                                            {u.role}
                                            {u.id !== currentUser?.id && <ChevronDown className="w-2.5 h-2.5" />}
                                        </button>
                                        {roleDropdown === u.id && (
                                            <div className="absolute left-0 top-full mt-1 z-50 bg-bg-panel border border-bg-border rounded-sm shadow-xl min-w-[120px]">
                                                {availableRoles.map(r => (
                                                    <button
                                                        key={r}
                                                        onClick={() => handleRoleChange(u, r)}
                                                        className={`w-full text-left px-3 py-2 text-xs mono hover:bg-bg-elevated transition-colors ${u.role === r ? 'text-accent-cyan' : 'text-text-secondary'
                                                            }`}
                                                    >
                                                        {r}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Active status */}
                                    <div className="flex items-center gap-1.5">
                                        <span className={`status-dot ${u.isActive !== false ? 'ok' : 'error'}`} />
                                        <span className={`text-[10px] mono ${u.isActive !== false ? 'text-[#00c896]' : 'text-status-error'}`}>
                                            {u.isActive !== false ? 'Active' : 'Disabled'}
                                        </span>
                                    </div>

                                    <span className="text-text-muted text-xs mono">{getUserDate(u)}</span>

                                    {/* Actions */}
                                    <button
                                        onClick={() => handleToggleActive(u)}
                                        disabled={u.id === currentUser?.id}
                                        title={u.id === currentUser?.id ? 'Cannot deactivate yourself' : undefined}
                                        className={`flex items-center gap-1.5 text-[10px] mono px-2 py-1.5 rounded-sm border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${u.isActive !== false
                                            ? 'bg-status-error/10 border-status-error/20 text-status-error hover:bg-status-error/20'
                                            : 'bg-status-ok/10 border-status-ok/20 text-status-ok hover:bg-status-ok/20'
                                            }`}
                                    >
                                        {u.isActive !== false ? <ToggleLeft className="w-3.5 h-3.5" /> : <ToggleRight className="w-3.5 h-3.5" />}
                                        {u.isActive !== false ? t('admin.deactivate') : t('admin.activate')}
                                    </button>
                                </div>
                            )) : (
                                <div className="flex items-center justify-center h-24 text-text-muted text-xs mono">No users found</div>
                            )}
                        </div>
                    </>
                )}

                {tab === 'logs' && (
                    <>
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-bg-border bg-bg-elevated flex-shrink-0">
                            <Terminal className="w-3.5 h-3.5 text-accent-cyan" />
                            <span className="text-xs mono text-text-muted">AUDIT LOG — {logs.length} entries</span>
                            <span className="status-dot ok ml-auto" />
                            <span className="text-[10px] mono text-status-ok">LIVE</span>
                        </div>
                        <div className="grid gap-3 px-4 py-2 bg-bg-elevated border-b border-bg-border text-[10px] mono text-text-muted uppercase tracking-wide flex-shrink-0"
                            style={{ gridTemplateColumns: '1.8fr 1.5fr 1.5fr 2fr' }}>
                            <span>{t('admin.log_time')}</span>
                            <span>{t('admin.log_event')}</span>
                            <span>{t('admin.log_actor')}</span>
                            <span>{t('admin.log_detail')}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-bg-border/20 font-mono text-[11px]">
                            {logs.length === 0 ? (
                                <div className="flex items-center justify-center h-24 text-text-muted text-xs">No log entries yet.</div>
                            ) : logs.map((entry, i) => (
                                <div
                                    key={i}
                                    className="grid gap-3 px-4 py-2 hover:bg-bg-elevated/30 transition-colors"
                                    style={{ gridTemplateColumns: '1.8fr 1.5fr 1.5fr 2fr' }}
                                >
                                    <span className="text-text-muted text-[10px]">{entry.time.replace('T', ' ').slice(0, 19)}</span>
                                    <span className={`text-[10px] ${entry.event.includes('LOGIN') ? 'text-accent-cyan' :
                                        entry.event.includes('DEACTIVATE') || entry.event.includes('ERROR') ? 'text-status-error' :
                                            entry.event.includes('REGISTER') ? 'text-[#b794f4]' :
                                                'text-[#f59e0b]'
                                        }`}>{entry.event}</span>
                                    <span className="text-text-secondary truncate text-[10px]">{entry.actor}</span>
                                    <span className="text-text-muted truncate text-[10px]">{entry.detail}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
