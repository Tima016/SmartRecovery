import { apiClient } from './client';

export const auditApi = {
    getLogs: async (params?: { limit?: number; page?: number }) => {
        const response = await apiClient.get('/audit/logs', { params });
        return response.data;
    }
};
