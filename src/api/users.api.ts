import { apiClient } from './client';

export const usersApi = {
    getAll: async () => {
        return apiClient.get('/users');
    },
    getById: async (id: string) => {
        return apiClient.get(`/users/${id}`);
    },
    update: async (id: string, data: any) => {
        return apiClient.patch(`/users/${id}`, data);
    },
    deactivate: async (id: string) => {
        return apiClient.patch(`/users/${id}/deactivate`);
    },
    activate: async (id: string) => {
        return apiClient.patch(`/users/${id}/activate`);
    },
};
