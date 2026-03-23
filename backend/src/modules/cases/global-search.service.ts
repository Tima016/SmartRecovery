import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface SearchResult {
    entityType: string;
    entityId: string;
    title: string;
    snippet: string;
    score: number;
}

@Injectable()
export class GlobalSearchService {
    constructor(private readonly prisma: PrismaService) { }

    async search(caseId: string, q: string): Promise<SearchResult[]> {
        if (!q || q.trim().length < 2) return [];

        const query = q.trim().toLowerCase();
        const results: SearchResult[] = [];

        // ── 1. Files (FileSystemEntry) ────────────────────────────────────
        const files = await this.prisma.fileSystemEntry.findMany({
            where: {
                caseId,
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { path: { contains: query, mode: 'insensitive' } },
                ],
            },
            take: 20,
        });

        for (const f of files) {
            const nameMatch = f.name.toLowerCase().includes(query) ? 2 : 1;
            results.push({
                entityType: 'FILE',
                entityId: f.id,
                title: f.name,
                snippet: `${f.path} · ${f.isDeleted ? '🗑 Deleted · ' : ''}${f.sizeBytes} bytes`,
                score: nameMatch * 10,
            });
        }

        // ── 2. Artifacts ───────────────────────────────────────────────────
        const artifacts = await this.prisma.artifact.findMany({
            where: {
                caseId,
                OR: [
                    { source: { contains: query, mode: 'insensitive' } },
                    { type: { in: this.matchEnum(query, ['BROWSER_HISTORY', 'USB_LOG', 'REGISTRY_HIVE', 'EVENT_LOG', 'PREFETCH', 'SHELLBAG', 'NETWORK_CAPTURE']) as any[] } },
                ],
            },
            take: 10,
        });

        for (const a of artifacts) {
            results.push({
                entityType: 'ARTIFACT',
                entityId: a.id,
                title: `${a.type} — ${a.source}`,
                snippet: `${a.count} entries · Extracted at ${a.extractedAt.toISOString()}`,
                score: 8,
            });
        }

        // ── 3. Timeline Events ─────────────────────────────────────────────
        const events = await this.prisma.timelineEvent.findMany({
            where: {
                caseId,
                OR: [
                    { description: { contains: query, mode: 'insensitive' } },
                    { actor: { contains: query, mode: 'insensitive' } },
                    { targetObject: { contains: query, mode: 'insensitive' } },
                ],
            },
            take: 15,
            orderBy: { correlationScore: 'desc' },
        });

        for (const e of events) {
            const descMatch = e.description.toLowerCase().includes(query) ? 2 : 1;
            results.push({
                entityType: 'TIMELINE',
                entityId: e.id,
                title: e.description,
                snippet: `[${e.type}] ${e.timestamp.toISOString()} · Score: ${e.correlationScore}`,
                score: descMatch * 7 + e.correlationScore / 10,
            });
        }

        // ── 4. Notes ───────────────────────────────────────────────────────
        const notes = await this.prisma.note.findMany({
            where: {
                content: { contains: query, mode: 'insensitive' },
            },
            take: 10,
            include: { author: { select: { firstName: true, lastName: true } } },
        });

        for (const n of notes) {
            const idx = n.content.toLowerCase().indexOf(query);
            const snippet = n.content.slice(Math.max(0, idx - 30), idx + 60);
            results.push({
                entityType: 'NOTE',
                entityId: n.id,
                title: `Note by ${n.author.firstName} ${n.author.lastName}`,
                snippet: `...${snippet}...`,
                score: 6,
            });
        }

        // ── 5. Tags ────────────────────────────────────────────────────────
        const tags = await this.prisma.tag.findMany({
            where: {
                caseId,
                name: { contains: query, mode: 'insensitive' },
            },
            take: 10,
        });

        for (const t of tags) {
            results.push({
                entityType: 'TAG',
                entityId: t.id,
                title: t.name,
                snippet: `Tag · Color: ${t.color}`,
                score: t.name.toLowerCase() === query ? 15 : 5,
            });
        }

        // Sort by score descending
        return results.sort((a, b) => b.score - a.score);
    }

    private matchEnum(query: string, values: string[]): string[] {
        return values.filter(v => v.toLowerCase().includes(query));
    }
}
