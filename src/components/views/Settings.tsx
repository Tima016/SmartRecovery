import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, Shield, Database, Monitor, Bell, Key, Save } from 'lucide-react';

type SettingsState = {
    defaultCaseDirectory: string;
    autoSaveInterval: string;
    hashAlgorithm: string;
    writeBlockerAutoEngage: boolean;
    evidenceTimestamping: boolean;
    verboseLogging: boolean;
    sessionTimeout: string;
    enforce2FA: boolean;
    tamperProtection: boolean;
    encryptionAtRest: boolean;
    networkIsolation: boolean;
    primaryStore: string;
    backupStore: string;
    retentionPeriod: string;
    compression: boolean;
    verifyAfterWrite: boolean;
    theme: string;
    rowDensity: string;
    timestampFormat: string;
    codeFontSize: string;
    sidebarAutoCollapse: boolean;
    animatedTransitions: boolean;
    scanCompletionAlerts: boolean;
    systemHealthAlerts: boolean;
    integrityWarnings: boolean;
    emailReports: boolean;
    soundEffects: boolean;
    criticalThreshold: string;
    passwordPolicy: string;
    maxLoginAttempts: string;
    apiKeyExpiry: string;
    rememberMe: boolean;
};

type SettingsContextType = {
    state: SettingsState;
    set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
    reset: () => void;
};

const STORAGE_KEY = 'idfr_settings_v1';

const defaultSettings: SettingsState = {
    defaultCaseDirectory: '/forensic/cases/',
    autoSaveInterval: '1 minute',
    hashAlgorithm: 'SHA-256',
    writeBlockerAutoEngage: true,
    evidenceTimestamping: true,
    verboseLogging: false,
    sessionTimeout: '15 minutes',
    enforce2FA: true,
    tamperProtection: true,
    encryptionAtRest: true,
    networkIsolation: false,
    primaryStore: '//nas01/evidence',
    backupStore: '//nas02/backup',
    retentionPeriod: '5 years',
    compression: false,
    verifyAfterWrite: true,
    theme: 'Dark',
    rowDensity: 'Compact',
    timestampFormat: 'UTC ISO 8601',
    codeFontSize: '11px',
    sidebarAutoCollapse: false,
    animatedTransitions: true,
    scanCompletionAlerts: true,
    systemHealthAlerts: true,
    integrityWarnings: true,
    emailReports: false,
    soundEffects: false,
    criticalThreshold: 'Medium',
    passwordPolicy: 'Standard (12 chars + mixed)',
    maxLoginAttempts: '5',
    apiKeyExpiry: '90 days',
    rememberMe: false,
};

const SettingsContext = createContext<SettingsContextType | null>(null);

const sections = [
    { id: 'general', icon: SettingsIcon, label: 'General' },
    { id: 'security', icon: Shield, label: 'Security' },
    { id: 'storage', icon: Database, label: 'Storage' },
    { id: 'display', icon: Monitor, label: 'Display' },
    { id: 'alerts', icon: Bell, label: 'Alerts' },
    { id: 'auth', icon: Key, label: 'Authentication' },
] as const;

function useSettingsStore() {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error('Settings context missing');
    return ctx;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={`w-10 h-5 rounded-full relative transition-all ${value ? 'bg-accent-cyan/30 border border-accent-cyan/60' : 'bg-bg-elevated border border-bg-border'}`}
        >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${value ? 'left-5 bg-accent-cyan shadow-[0_0_6px_#00C896]' : 'left-0.5 bg-text-muted'}`} />
        </button>
    );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-bg-border/50 last:border-0 gap-4">
            <div>
                <div className="text-text-primary text-xs">{label}</div>
                {sub && <div className="text-text-muted text-[10px] mono mt-0.5">{sub}</div>}
            </div>
            {children}
        </div>
    );
}

function Select({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-bg-elevated border border-bg-border text-text-secondary text-[11px] mono px-2 py-1 rounded-sm outline-none focus:border-accent-cyan/40 transition-colors">
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}

function TextInput({ value, onChange, width = 'w-48' }: { value: string; onChange: (v: string) => void; width?: string }) {
    return (
        <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`bg-bg-elevated border border-bg-border text-text-secondary text-[11px] mono px-2 py-1 rounded-sm outline-none focus:border-accent-cyan/40 ${width} transition-colors`}
        />
    );
}

export default function Settings() {
    const location = useLocation();
    const [saved, setSaved] = useState(false);

    const [state, setState] = useState<SettingsState>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultSettings;
            const parsed = JSON.parse(raw);
            return { ...defaultSettings, ...parsed };
        } catch {
            return defaultSettings;
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    const activeSection = location.pathname.split('/').pop() || 'general';

    const ctx = useMemo<SettingsContextType>(() => ({
        state,
        set: (key, value) => setState((prev) => ({ ...prev, [key]: value })),
        reset: () => setState(defaultSettings),
    }), [state]);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    return (
        <SettingsContext.Provider value={ctx}>
            <div className="h-full flex overflow-hidden">
                <div className="w-44 border-r border-bg-border bg-bg-panel flex-shrink-0 py-4">
                    {sections.map(({ id, icon: Icon, label }) => (
                        <NavLink
                            key={id}
                            to={`/settings/${id}`}
                            className={({ isActive }) =>
                                `w-full flex items-center gap-2.5 px-4 py-2.5 text-xs transition-all ` +
                                (isActive
                                    ? 'nav-active text-accent-cyan border-l-2 border-accent-cyan bg-bg-border/10'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-border/20 border-l-2 border-transparent')
                            }
                        >
                            <Icon className={`w-3.5 h-3.5 ${activeSection === id ? 'text-accent-cyan' : 'text-text-muted'}`} />
                            {label}
                        </NavLink>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-2xl space-y-6">
                        <Outlet />

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleSave}
                                className={`flex items-center gap-2 px-4 py-2 text-xs border rounded-sm transition-all ${saved
                                    ? 'bg-status-ok/10 border-status-ok/40 text-status-ok'
                                    : 'bg-accent-cyan/10 border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/20'
                                    }`}
                            >
                                <Save className="w-3.5 h-3.5" />
                                {saved ? 'Saved!' : 'Save Changes'}
                            </button>
                            <button onClick={ctx.reset} className="px-4 py-2 text-xs border border-bg-border text-text-secondary hover:text-text-primary transition-colors rounded-sm">
                                Reset to Defaults
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </SettingsContext.Provider>
    );
}

export function GeneralSettings() {
    const { state, set } = useSettingsStore();
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">General Settings</h2>
                <p className="text-text-muted text-[10px] mono">Platform behavior and investigation defaults</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Default Case Directory" sub="Path for new case evidence storage"><TextInput value={state.defaultCaseDirectory} onChange={(v) => set('defaultCaseDirectory', v)} /></SettingRow>
                <SettingRow label="Auto-save Interval" sub="Frequency of automatic session saves"><Select options={['30 seconds', '1 minute', '5 minutes', 'Manual']} value={state.autoSaveInterval} onChange={(v) => set('autoSaveInterval', v)} /></SettingRow>
                <SettingRow label="Default Hash Algorithm" sub="Used for all integrity checks"><Select options={['SHA-256', 'SHA-512', 'MD5 + SHA-256', 'All']} value={state.hashAlgorithm} onChange={(v) => set('hashAlgorithm', v)} /></SettingRow>
                <SettingRow label="Write-Blocker Auto-Engage" sub="Enforce on every device attachment"><Toggle value={state.writeBlockerAutoEngage} onChange={(v) => set('writeBlockerAutoEngage', v)} /></SettingRow>
                <SettingRow label="Evidence Timestamping" sub="Embed NTP-synced timestamps in chain of custody"><Toggle value={state.evidenceTimestamping} onChange={(v) => set('evidenceTimestamping', v)} /></SettingRow>
                <SettingRow label="Verbose Logging" sub="Log all platform actions to audit trail"><Toggle value={state.verboseLogging} onChange={(v) => set('verboseLogging', v)} /></SettingRow>
            </div>
        </>
    );
}

export function SecuritySettings() {
    const { state, set } = useSettingsStore();
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Security Settings</h2>
                <p className="text-text-muted text-[10px] mono">Access control, session management, and audit configuration</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Session Timeout" sub="Auto-lock after inactivity"><Select options={['5 minutes', '15 minutes', '30 minutes', '1 hour', 'Never']} value={state.sessionTimeout} onChange={(v) => set('sessionTimeout', v)} /></SettingRow>
                <SettingRow label="Two-Factor Authentication" sub="Require TOTP on login"><Toggle value={state.enforce2FA} onChange={(v) => set('enforce2FA', v)} /></SettingRow>
                <SettingRow label="Audit Log Tamper Protection" sub="Cryptographic signing of audit entries"><Toggle value={state.tamperProtection} onChange={(v) => set('tamperProtection', v)} /></SettingRow>
                <SettingRow label="Evidence Encryption at Rest" sub="AES-256 for all stored evidence"><Toggle value={state.encryptionAtRest} onChange={(v) => set('encryptionAtRest', v)} /></SettingRow>
                <SettingRow label="Network Isolation Mode" sub="Block all internet during acquisition"><Toggle value={state.networkIsolation} onChange={(v) => set('networkIsolation', v)} /></SettingRow>
            </div>
        </>
    );
}

export function StorageSettings() {
    const { state, set } = useSettingsStore();
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Storage Settings</h2>
                <p className="text-text-muted text-[10px] mono">Evidence store, backup, and retention policies</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Primary Evidence Store" sub="Network path or local mount"><TextInput value={state.primaryStore} onChange={(v) => set('primaryStore', v)} width="w-44" /></SettingRow>
                <SettingRow label="Backup Evidence Store" sub="Redundant copy destination"><TextInput value={state.backupStore} onChange={(v) => set('backupStore', v)} width="w-44" /></SettingRow>
                <SettingRow label="Retention Period" sub="Minimum evidence retention"><Select options={['1 year', '3 years', '5 years', '7 years', 'Indefinite']} value={state.retentionPeriod} onChange={(v) => set('retentionPeriod', v)} /></SettingRow>
                <SettingRow label="Compression" sub="Compress disk images (LZ4)"><Toggle value={state.compression} onChange={(v) => set('compression', v)} /></SettingRow>
                <SettingRow label="Verify After Write" sub="Re-hash evidence after storage"><Toggle value={state.verifyAfterWrite} onChange={(v) => set('verifyAfterWrite', v)} /></SettingRow>
            </div>
        </>
    );
}

export function DisplaySettings() {
    const { state, set } = useSettingsStore();
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Display Settings</h2>
                <p className="text-text-muted text-[10px] mono">Visual preferences and interface behavior</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Theme" sub="Interface color scheme"><Select options={['Dark', 'Light', 'System']} value={state.theme} onChange={(v) => set('theme', v)} /></SettingRow>
                <SettingRow label="Table Row Density" sub="Spacing in file lists and evidence tables"><Select options={['Compact', 'Normal', 'Comfortable']} value={state.rowDensity} onChange={(v) => set('rowDensity', v)} /></SettingRow>
                <SettingRow label="Timestamp Format" sub="How dates appear across the platform"><Select options={['UTC ISO 8601', 'Local 24h', 'Local 12h', 'Relative']} value={state.timestampFormat} onChange={(v) => set('timestampFormat', v)} /></SettingRow>
                <SettingRow label="Code Font Size" sub="Mono-spaced text in hex viewer, logs, artifacts"><Select options={['10px', '11px', '12px', '13px', '14px']} value={state.codeFontSize} onChange={(v) => set('codeFontSize', v)} /></SettingRow>
                <SettingRow label="Sidebar Auto-Collapse" sub="Collapse sidebar on narrow viewports"><Toggle value={state.sidebarAutoCollapse} onChange={(v) => set('sidebarAutoCollapse', v)} /></SettingRow>
                <SettingRow label="Animated Transitions" sub="Enable smooth UI animations and micro-interactions"><Toggle value={state.animatedTransitions} onChange={(v) => set('animatedTransitions', v)} /></SettingRow>
            </div>
        </>
    );
}

export function AlertsSettings() {
    const { state, set } = useSettingsStore();
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Alerts & Notifications</h2>
                <p className="text-text-muted text-[10px] mono">Configure alert triggers and notification channels</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Scan Completion Alerts" sub="Notify when imaging or forensic scan finishes"><Toggle value={state.scanCompletionAlerts} onChange={(v) => set('scanCompletionAlerts', v)} /></SettingRow>
                <SettingRow label="System Health Alerts" sub="Alert when backend services become unhealthy"><Toggle value={state.systemHealthAlerts} onChange={(v) => set('systemHealthAlerts', v)} /></SettingRow>
                <SettingRow label="Evidence Integrity Warnings" sub="Alert on hash verification failures"><Toggle value={state.integrityWarnings} onChange={(v) => set('integrityWarnings', v)} /></SettingRow>
                <SettingRow label="Email Reports" sub="Send case reports via email on completion"><Toggle value={state.emailReports} onChange={(v) => set('emailReports', v)} /></SettingRow>
                <SettingRow label="Sound Effects" sub="Play audio on critical events"><Toggle value={state.soundEffects} onChange={(v) => set('soundEffects', v)} /></SettingRow>
                <SettingRow label="Critical Case Threshold" sub="Alert severity for suspicious activity detection"><Select options={['Low', 'Medium', 'High', 'Critical only']} value={state.criticalThreshold} onChange={(v) => set('criticalThreshold', v)} /></SettingRow>
            </div>
        </>
    );
}

export function AuthSettings() {
    const { state, set } = useSettingsStore();
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Authentication Settings</h2>
                <p className="text-text-muted text-[10px] mono">Session management, password policy, and access controls</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Session Timeout" sub="Auto-lock after inactivity"><Select options={['5 minutes', '15 minutes', '30 minutes', '1 hour', 'Never']} value={state.sessionTimeout} onChange={(v) => set('sessionTimeout', v)} /></SettingRow>
                <SettingRow label="Password Policy" sub="Minimum password complexity requirements"><Select options={['Basic (8 chars)', 'Standard (12 chars + mixed)', 'Strong (16 chars + special)', 'Custom']} value={state.passwordPolicy} onChange={(v) => set('passwordPolicy', v)} /></SettingRow>
                <SettingRow label="Enforce Two-Factor" sub="Require TOTP/U2F for all users"><Toggle value={state.enforce2FA} onChange={(v) => set('enforce2FA', v)} /></SettingRow>
                <SettingRow label="Max Login Attempts" sub="Lock account after failed attempts"><Select options={['3', '5', '10', 'Unlimited']} value={state.maxLoginAttempts} onChange={(v) => set('maxLoginAttempts', v)} /></SettingRow>
                <SettingRow label="API Key Expiry" sub="Force regeneration of API keys"><Select options={['30 days', '90 days', '180 days', '1 year', 'Never']} value={state.apiKeyExpiry} onChange={(v) => set('apiKeyExpiry', v)} /></SettingRow>
                <SettingRow label="Remember Me" sub="Allow persistent login sessions"><Toggle value={state.rememberMe} onChange={(v) => set('rememberMe', v)} /></SettingRow>
            </div>
        </>
    );
}
