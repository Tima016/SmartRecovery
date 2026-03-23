import { apiClient } from './client';

export interface Bookmark {
    id: string;
    entityType: string;
    entityId: string;
    note?: string;
    createdAt: string;
}

export const workspaceApi = {
    getBookmarks: async (): Promise<Bookmark[]> => {
        const { data } = await apiClient.get('/workspace/bookmarks');
        return data;
    },
    addBookmark: async (entityType: string, entityId: string, note?: string): Promise<Bookmark> => {
        const { data } = await apiClient.post('/workspace/bookmarks', { entityType, entityId, note });
        return data;
    },
    updateNote: async (id: string, note: string): Promise<Bookmark> => {
        const { data } = await apiClient.patch(`/workspace/bookmarks/${id}`, { note });
        return data;
    },
    removeBookmark: async (id: string): Promise<void> => {
        await apiClient.delete(`/workspace/bookmarks/${id}`);
    },
};
