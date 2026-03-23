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
export type Role = 'ADMIN' | 'ANALYST' | 'INVESTIGATOR' | 'AUDITOR';

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    isTwoFactorEnabled: boolean;
}



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
                    setUser(data.user);
                }
            } catch {
                // Token invalid or expired — clear stored credentials
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(REFRESH_TOKEN_KEY);
                localStorage.removeItem(USER_KEY);
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
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));

            if (mountedRef.current) {
                setUser(data.user);
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
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));

            if (mountedRef.current) {
                setUser(data.user);
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
