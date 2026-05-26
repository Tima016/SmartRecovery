import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { TOKEN_KEY } from '../api/client';

interface SocketContextData {
    socket: Socket | null;
    isConnected: boolean;
    joinCase: (caseId: string) => void;
    leaveCase: (caseId: string) => void;
}

const SocketContext = createContext<SocketContextData>({
    socket: null,
    isConnected: false,
    joinCase: () => { },
    leaveCase: () => { },
});

export function SocketProvider({ children }: { children: ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            // No auth token — don't connect WebSocket
            return;
        }

        const socketInstance = io(
            import.meta.env.VITE_API_URL?.replace('/api/v1', '') || window.location.origin,
            {
                transports: ['websocket', 'polling'],
                auth: { token }, // Send JWT for server-side authentication
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 30000,
                autoConnect: true,
            },
        );

        socketInstance.on('connect', () => {
            if (mountedRef.current) setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            if (mountedRef.current) setIsConnected(false);
        });

        socketInstance.on('auth_error', (data: { message: string }) => {
            console.warn('[WebSocket] Auth error:', data.message);
            socketInstance.disconnect();
        });

        socketInstance.on('connect_error', (err: Error) => {
            console.warn('[WebSocket] Connection error:', err.message);
        });

        if (mountedRef.current) setSocket(socketInstance);

        return () => {
            mountedRef.current = false;
            socketInstance.disconnect();
        };
    }, []);

    const joinCase = useCallback(
        (caseId: string) => {
            if (socket && isConnected) {
                socket.emit('join_case', caseId);
            }
        },
        [socket, isConnected],
    );

    const leaveCase = useCallback(
        (caseId: string) => {
            if (socket && isConnected) {
                socket.emit('leave_case', caseId);
            }
        },
        [socket, isConnected],
    );

    return (
        <SocketContext.Provider value={{ socket, isConnected, joinCase, leaveCase }}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);
