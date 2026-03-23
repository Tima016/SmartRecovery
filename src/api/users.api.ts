import { apiClient } from './client';

export const usersApi = {
    getAll: async () => {
        const response = await apiClient.get('/users');
        return response.data;
    },
    update: async (id: string, data: any) => {
        const response = await apiClient.patch(`/users/${id}`, data);
        return response.data;
    }
};
