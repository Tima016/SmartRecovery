import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// ── Security middleware ────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost'],
    credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));

// ── Rate limiting ─────────────────────────────────────────────
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 min
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
}));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        time: new Date().toISOString(),
        env: process.env.NODE_ENV,
    });
});

// ── API routes (stub — expand here) ───────────────────────────
app.use('/api/v1', (_req: Request, res: Response) => {
    res.status(200).json({ message: 'IDFR Platform API v1' });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[IDFR] API listening on :${PORT} (${process.env.NODE_ENV})`);
});
