import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, Shield, Database, Monitor, Bell, Key, Save } from 'lucide-react';

const sections = [
    { id: 'general', icon: SettingsIcon, label: 'General' },
    { id: 'security', icon: Shield, label: 'Security' },
    { id: 'storage', icon: Database, label: 'Storage' },
    { id: 'display', icon: Monitor, label: 'Display' },
    { id: 'alerts', icon: Bell, label: 'Alerts' },
    { id: 'auth', icon: Key, label: 'Authentication' },
] as const;

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
    const [on, setOn] = useState(defaultOn);
    return (
        <button
            onClick={() => setOn(v => !v)}
            className={`w-10 h-5 rounded-full relative transition-all ${on ? 'bg-accent-cyan/30 border border-accent-cyan/60' : 'bg-bg-elevated border border-bg-border'}`}
        >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${on ? 'left-5 bg-accent-cyan shadow-[0_0_6px_#00C896]' : 'left-0.5 bg-text-muted'}`} />
        </button>
    );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-bg-border/50 last:border-0">
            <div>
                <div className="text-text-primary text-xs">{label}</div>
                {sub && <div className="text-text-muted text-[10px] mono mt-0.5">{sub}</div>}
            </div>
            {children}
        </div>
    );
}

function Select({ options, defaultValue }: { options: string[]; defaultValue: string }) {
    return (
        <select defaultValue={defaultValue} className="bg-bg-elevated border border-bg-border text-text-secondary text-[11px] mono px-2 py-1 rounded-sm outline-none focus:border-accent-cyan/40 transition-colors">
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
}

export default function Settings() {
    const [saved, setSaved] = useState(false);
    const location = useLocation();

    // Determine current active section from path directly (default to general)
    const activeSection = location.pathname.split('/').pop() || 'general';

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="h-full flex overflow-hidden">
            {/* Settings Nav */}
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

            {/* Settings Content */}
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
                        <button className="px-4 py-2 text-xs border border-bg-border text-text-secondary hover:text-text-primary transition-colors rounded-sm">
                            Reset to Defaults
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function GeneralSettings() {
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">General Settings</h2>
                <p className="text-text-muted text-[10px] mono">Platform behavior and investigation defaults</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Default Case Directory" sub="Path for new case evidence storage">
                    <input defaultValue="/forensic/cases/" className="bg-bg-elevated border border-bg-border text-text-secondary text-[11px] mono px-2 py-1 rounded-sm outline-none focus:border-accent-cyan/40 w-48 transition-colors" />
                </SettingRow>
                <SettingRow label="Auto-save Interval" sub="Frequency of automatic session saves">
                    <Select options={['30 seconds', '1 minute', '5 minutes', 'Manual']} defaultValue="1 minute" />
                </SettingRow>
                <SettingRow label="Default Hash Algorithm" sub="Used for all integrity checks">
                    <Select options={['SHA-256', 'SHA-512', 'MD5 + SHA-256', 'All']} defaultValue="SHA-256" />
                </SettingRow>
                <SettingRow label="Write-Blocker Auto-Engage" sub="Enforce on every device attachment">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Evidence Timestamping" sub="Embed NTP-synced timestamps in chain of custody">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Verbose Logging" sub="Log all platform actions to audit trail">
                    <Toggle />
                </SettingRow>
            </div>
        </>
    );
}

export function SecuritySettings() {
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Security Settings</h2>
                <p className="text-text-muted text-[10px] mono">Access control, session management, and audit configuration</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Session Timeout" sub="Auto-lock after inactivity">
                    <Select options={['5 minutes', '15 minutes', '30 minutes', '1 hour', 'Never']} defaultValue="15 minutes" />
                </SettingRow>
                <SettingRow label="Two-Factor Authentication" sub="Require TOTP on login">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Audit Log Tamper Protection" sub="Cryptographic signing of audit entries">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Evidence Encryption at Rest" sub="AES-256 for all stored evidence">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Network Isolation Mode" sub="Block all internet during acquisition">
                    <Toggle />
                </SettingRow>
            </div>
        </>
    );
}

export function StorageSettings() {
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Storage Settings</h2>
                <p className="text-text-muted text-[10px] mono">Evidence store, backup, and retention policies</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Primary Evidence Store" sub="Network path or local mount">
                    <input defaultValue="//nas01/evidence" className="bg-bg-elevated border border-bg-border text-text-secondary text-[11px] mono px-2 py-1 rounded-sm outline-none w-44 focus:border-accent-cyan/40 transition-colors" />
                </SettingRow>
                <SettingRow label="Backup Evidence Store" sub="Redundant copy destination">
                    <input defaultValue="//nas02/backup" className="bg-bg-elevated border border-bg-border text-text-secondary text-[11px] mono px-2 py-1 rounded-sm outline-none w-44 focus:border-accent-cyan/40 transition-colors" />
                </SettingRow>
                <SettingRow label="Retention Period" sub="Minimum evidence retention">
                    <Select options={['1 year', '3 years', '5 years', '7 years', 'Indefinite']} defaultValue="5 years" />
                </SettingRow>
                <SettingRow label="Compression" sub="Compress disk images (LZ4)">
                    <Toggle />
                </SettingRow>
                <SettingRow label="Verify After Write" sub="Re-hash evidence after storage">
                    <Toggle defaultOn />
                </SettingRow>
            </div>
        </>
    );
}

export function DisplaySettings() {
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Display Settings</h2>
                <p className="text-text-muted text-[10px] mono">Visual preferences and interface behavior</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Theme" sub="Interface color scheme">
                    <Select options={['Dark', 'Light', 'System']} defaultValue="Dark" />
                </SettingRow>
                <SettingRow label="Table Row Density" sub="Spacing in file lists and evidence tables">
                    <Select options={['Compact', 'Normal', 'Comfortable']} defaultValue="Compact" />
                </SettingRow>
                <SettingRow label="Timestamp Format" sub="How dates appear across the platform">
                    <Select options={['UTC ISO 8601', 'Local 24h', 'Local 12h', 'Relative']} defaultValue="UTC ISO 8601" />
                </SettingRow>
                <SettingRow label="Code Font Size" sub="Mono-spaced text in hex viewer, logs, artifacts">
                    <Select options={['10px', '11px', '12px', '13px', '14px']} defaultValue="11px" />
                </SettingRow>
                <SettingRow label="Sidebar Auto-Collapse" sub="Collapse sidebar on narrow viewports">
                    <Toggle />
                </SettingRow>
                <SettingRow label="Animated Transitions" sub="Enable smooth UI animations and micro-interactions">
                    <Toggle defaultOn />
                </SettingRow>
            </div>
        </>
    );
}

export function AlertsSettings() {
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Alerts & Notifications</h2>
                <p className="text-text-muted text-[10px] mono">Configure alert triggers and notification channels</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Scan Completion Alerts" sub="Notify when imaging or forensic scan finishes">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="System Health Alerts" sub="Alert when backend services become unhealthy">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Evidence Integrity Warnings" sub="Alert on hash verification failures">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Email Reports" sub="Send case reports via email on completion">
                    <Toggle />
                </SettingRow>
                <SettingRow label="Sound Effects" sub="Play audio on critical events">
                    <Toggle />
                </SettingRow>
                <SettingRow label="Critical Case Threshold" sub="Alert severity for suspicious activity detection">
                    <Select options={['Low', 'Medium', 'High', 'Critical only']} defaultValue="Medium" />
                </SettingRow>
            </div>
        </>
    );
}

export function AuthSettings() {
    return (
        <>
            <div>
                <h2 className="text-text-primary text-sm font-semibold mb-1">Authentication Settings</h2>
                <p className="text-text-muted text-[10px] mono">Session management, password policy, and access controls</p>
            </div>
            <div className="glass-panel rounded-sm px-4">
                <SettingRow label="Session Timeout" sub="Auto-lock after inactivity">
                    <Select options={['5 minutes', '15 minutes', '30 minutes', '1 hour', 'Never']} defaultValue="15 minutes" />
                </SettingRow>
                <SettingRow label="Password Policy" sub="Minimum password complexity requirements">
                    <Select options={['Basic (8 chars)', 'Standard (12 chars + mixed)', 'Strong (16 chars + special)', 'Custom']} defaultValue="Standard (12 chars + mixed)" />
                </SettingRow>
                <SettingRow label="Enforce Two-Factor" sub="Require TOTP/U2F for all users">
                    <Toggle defaultOn />
                </SettingRow>
                <SettingRow label="Max Login Attempts" sub="Lock account after failed attempts">
                    <Select options={['3', '5', '10', 'Unlimited']} defaultValue="5" />
                </SettingRow>
                <SettingRow label="API Key Expiry" sub="Force regeneration of API keys">
                    <Select options={['30 days', '90 days', '180 days', '1 year', 'Never']} defaultValue="90 days" />
                </SettingRow>
                <SettingRow label="Remember Me" sub="Allow persistent login sessions">
                    <Toggle />
                </SettingRow>
            </div>
        </>
    );
}
