import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from 'react';

export type Role = 'admin' | 'investigator';

export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    joinedAt: string;
}

interface StoredUser extends User {
    passwordHash: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    register: (name: string, email: string, password: string) => Promise<void>;
    getAllUsers: () => User[];
    setUserActive: (id: string, active: boolean) => void;
    setUserRole: (id: string, role: Role) => void;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const USERS_KEY = 'idfr_users';
const SESSION_KEY = 'idfr_session';
const LOGS_KEY = 'idfr_logs';

// Simple deterministic hash (not for production — simulated only)
function simpleHash(s: string): string {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
    }
    return hash.toString(16);
}

function getStoredUsers(): StoredUser[] {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
}

function saveUsers(users: StoredUser[]) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function appendLog(event: string, actor: string, detail: string) {
    try {
        const logs = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
        logs.unshift({
            time: new Date().toISOString(),
            event,
            actor,
            detail,
        });
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 200)));
    } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);

    // Restore session on mount
    useEffect(() => {
        try {
            const session = localStorage.getItem(SESSION_KEY);
            if (session) {
                const parsed: User = JSON.parse(session);
                // Re-validate against stored users
                const stored = getStoredUsers().find(u => u.id === parsed.id);
                if (stored && stored.active) setUser({ ...stored });
            }
        } catch { /* ignore */ }
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        await new Promise(r => setTimeout(r, 600)); // simulate network delay
        const users = getStoredUsers();
        const found = users.find(
            u => u.email.toLowerCase() === email.toLowerCase() && u.passwordHash === simpleHash(password)
        );
        if (!found) throw new Error('invalid_credentials');
        if (!found.active) throw new Error('account_disabled');
        const { passwordHash: _p, ...safeUser } = found;
        setUser(safeUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
        appendLog('LOGIN', found.email, `Role: ${found.role}`);
    }, []);

    const logout = useCallback(() => {
        appendLog('LOGOUT', user?.email ?? 'unknown', 'Session terminated');
        setUser(null);
        localStorage.removeItem(SESSION_KEY);
    }, [user]);

    const register = useCallback(async (name: string, email: string, password: string) => {
        await new Promise(r => setTimeout(r, 600));
        const users = getStoredUsers();
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            throw new Error('email_taken');
        }
        // First user is always admin
        const isFirstUser = users.length === 0;
        const newUser: StoredUser = {
            id: `u_${Date.now()}`,
            name,
            email,
            role: isFirstUser ? 'admin' : 'investigator',
            active: true,
            joinedAt: new Date().toISOString().split('T')[0],
            passwordHash: simpleHash(password),
        };
        users.push(newUser);
        saveUsers(users);
        appendLog('REGISTER', email, `Role assigned: ${newUser.role}`);
    }, []);

    const getAllUsers = useCallback((): User[] => {
        return getStoredUsers().map(({ passwordHash: _p, ...u }) => u);
    }, []);

    const setUserActive = useCallback((id: string, active: boolean) => {
        const users = getStoredUsers();
        const idx = users.findIndex(u => u.id === id);
        if (idx !== -1) {
            users[idx].active = active;
            saveUsers(users);
            appendLog(active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', user?.email ?? 'admin', `Target: ${users[idx].email}`);
        }
    }, [user]);

    const setUserRole = useCallback((id: string, role: Role) => {
        const users = getStoredUsers();
        const idx = users.findIndex(u => u.id === id);
        if (idx !== -1) {
            users[idx].role = role;
            saveUsers(users);
            appendLog('CHANGE_ROLE', user?.email ?? 'admin', `${users[idx].email} → ${role}`);
        }
    }, [user]);

    return (
        <AuthContext.Provider
            value={{ user, isAuthenticated: !!user, login, logout, register, getAllUsers, setUserActive, setUserRole }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
