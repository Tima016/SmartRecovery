import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Route guard for admin-only routes.
 *
 * Same loading-state handling as ProtectedRoute, plus a role check.
 */
export const AdminRoute = () => {
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

    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

    return <Outlet />;
};
