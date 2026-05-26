import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
    type ReactNode,
} from 'react';
import { authApi } from '../api/auth.api';
import { TOKEN_KEY } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────
export type Role = 'ADMIN' | 'USER';

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    isTwoFactorEnabled: boolean;
}

const normalizeUser = (raw: any): User | null => {
    if (!raw || typeof raw !== 'object') return null;
    return {
        id: raw.id ?? '',
        email: raw.email ?? '',
        firstName: raw.firstName ?? raw.name ?? '',
        lastName: raw.lastName ?? '',
        role: (raw.role ?? 'USER') as Role,
        isTwoFactorEnabled: Boolean(raw.isTwoFactorEnabled),
    };
};

const readStoredUser = (): User | null => {
    try {
        return normalizeUser(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
    } catch {
        return null;
    }
};


interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    authLoading: boolean;
    login: (email: string, password: string, totpCode?: string) => Promise<void>;
    logout: () => Promise<void>;
    register: (
        firstName: string,
        lastName: string,
        email: string,
        password: string,
    ) => Promise<void>;
}

const REFRESH_TOKEN_KEY = 'idfr_refresh_token';
const USER_KEY = 'idfr_user';

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// ─── Provider ─────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const mountedRef = useRef(true);

    // Cleanup ref on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // ── Rehydrate session on mount ─────────────────────────────────────
    useEffect(() => {
        const rehydrate = async () => {
            const token = localStorage.getItem(TOKEN_KEY);
            if (!token) {
                setAuthLoading(false);
                return;
            }

            try {
                // Validate token by fetching current user
                const data = await authApi.me();
                if (mountedRef.current) {
                    const normalized = normalizeUser(data?.user);
                    setUser(normalized);
                    if (normalized) {
                        localStorage.setItem(USER_KEY, JSON.stringify(normalized));
                    }
                }
            } catch {
                const localUser = readStoredUser();
                if (mountedRef.current && localUser) {
                    setUser(localUser);
                } else {
                    // Token invalid or expired — clear stored credentials
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(REFRESH_TOKEN_KEY);
                    localStorage.removeItem(USER_KEY);
                }
            } finally {
                if (mountedRef.current) {
                    setAuthLoading(false);
                }
            }
        };

        rehydrate();
    }, []);

    // ── Login ──────────────────────────────────────────────────────────
    const login = useCallback(
        async (email: string, password: string, totpCode?: string) => {
            const data = await authApi.login({
                email,
                password,
                ...(totpCode ? { totpCode } : {}),
            });

            localStorage.setItem(TOKEN_KEY, data.accessToken);
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            const normalized = normalizeUser(data.user);
            localStorage.setItem(USER_KEY, JSON.stringify(normalized));

            if (mountedRef.current) {
                setUser(normalized);
            }
        },
        [],
    );

    // ── Register ───────────────────────────────────────────────────────
    const register = useCallback(
        async (
            firstName: string,
            lastName: string,
            email: string,
            password: string,
        ) => {
            const data = await authApi.register({
                firstName,
                lastName,
                email,
                password,
            });

            localStorage.setItem(TOKEN_KEY, data.accessToken);
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            const normalized = normalizeUser(data.user);
            localStorage.setItem(USER_KEY, JSON.stringify(normalized));

            if (mountedRef.current) {
                setUser(normalized);
            }
        },
        [],
    );

    // ── Logout ─────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
        try {
            await authApi.logout();
        } catch {
            // Best-effort: even if the server call fails, clear local state
        }

        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);

        if (mountedRef.current) {
            setUser(null);
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                authLoading,
                login,
                logout,
                register,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
