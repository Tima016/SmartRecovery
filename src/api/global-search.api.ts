import { apiClient } from './client';

export interface GlobalSearchResult {
    entityType: 'FILE' | 'ARTIFACT' | 'TIMELINE' | 'NOTE' | 'TAG';
    entityId: string;
    title: string;
    snippet: string;
    score: number;
}

export const globalSearchApi = {
    search: async (caseId: string, q: string): Promise<GlobalSearchResult[]> => {
        const { data } = await apiClient.get(`/cases/${caseId}/global-search`, { params: { q } });
        return data;
    },
};
