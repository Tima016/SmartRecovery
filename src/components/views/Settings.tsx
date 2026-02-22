import { useState } from 'react';
import { Settings as SettingsIcon, Shield, Database, Monitor, Bell, Key, Save } from 'lucide-react';

const sections = [
    { id: 'general', icon: SettingsIcon, label: 'General' },
    { id: 'security', icon: Shield, label: 'Security' },
    { id: 'storage', icon: Database, label: 'Storage' },
    { id: 'display', icon: Monitor, label: 'Display' },
    { id: 'alerts', icon: Bell, label: 'Alerts' },
    { id: 'auth', icon: Key, label: 'Authentication' },
] as const;

type SectionId = typeof sections[number]['id'];

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
    const [activeSection, setActiveSection] = useState<SectionId>('general');
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="h-full flex overflow-hidden">
            {/* Settings Nav */}
            <div className="w-44 border-r border-bg-border bg-bg-panel flex-shrink-0 py-4">
                {sections.map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setActiveSection(id)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs transition-all ${activeSection === id
                            ? 'nav-active text-accent-cyan'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-border/20 border-l-2 border-transparent'
                            }`}
                    >
                        <Icon className={`w-3.5 h-3.5 ${activeSection === id ? 'text-accent-cyan' : 'text-text-muted'}`} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Settings Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-2xl space-y-6">
                    {activeSection === 'general' && (
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
                    )}

                    {activeSection === 'security' && (
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
                    )}

                    {activeSection === 'storage' && (
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
                    )}

                    {(activeSection === 'display' || activeSection === 'alerts' || activeSection === 'auth') && (
                        <>
                            <div>
                                <h2 className="text-text-primary text-sm font-semibold mb-1 capitalize">{activeSection} Settings</h2>
                                <p className="text-text-muted text-[10px] mono">Configure {activeSection} behavior and preferences</p>
                            </div>
                            <div className="glass-panel rounded-sm px-4">
                                <SettingRow label="Enable notifications" sub="System and case alerts"><Toggle defaultOn /></SettingRow>
                                <SettingRow label="Compact view" sub="Reduce row padding in tables"><Toggle /></SettingRow>
                                <SettingRow label="Timestamps" sub="Use UTC for all timestamps"><Toggle defaultOn /></SettingRow>
                                <SettingRow label="Sound alerts" sub="Audio on critical events"><Toggle /></SettingRow>
                            </div>
                        </>
                    )}

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
