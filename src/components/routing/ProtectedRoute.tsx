import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Route guard for authenticated users.
 *
 * Waits for auth state to rehydrate before deciding.
 * While loading → shows a spinner (prevents blank-screen / premature redirect).
 * Not authenticated → redirects to /login.
 * Authenticated → renders child routes via <Outlet />.
 */
export const ProtectedRoute = () => {
    const { user, authLoading } = useAuth();

    if (authLoading) {
        return (
            <div
                className="min-h-screen flex items-center justify-center"
                style={{ background: 'var(--bg-primary)' }}
            >
                <Loader2 className="w-6 h-6 text-accent-cyan animate-spin" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};
