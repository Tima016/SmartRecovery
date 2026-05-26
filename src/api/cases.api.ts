import { apiClient } from './client';

export const casesApi = {
    getAll: async () => {
        const response = await apiClient.get('/cases');
        return response.data;
    },
    getById: async (id: string) => {
        const response = await apiClient.get(`/cases/${id}`);
        return response.data;
    },
    create: async (data: any) => {
        const response = await apiClient.post('/cases', data);
        return response.data;
    },
    getSummary: async (id: string) => {
        const response = await apiClient.get(`/cases/${id}/summary`);
        return response.data;
    },
    getDashboardStats: async () => {
        const response = await apiClient.get('/cases/dashboard/stats');
        return response.data;
    }
};
