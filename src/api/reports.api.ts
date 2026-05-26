import { apiClient } from './client';

const extractErrorMessage = async (err: any) => {
    const responseData = err?.response?.data;
    if (!responseData) return err?.message || 'PDF export failed';

    if (responseData instanceof Blob) {
        try {
            const text = await responseData.text();
            const parsed = JSON.parse(text);
            return parsed?.error || parsed?.message || err?.message || 'PDF export failed';
        } catch {
            return err?.message || 'PDF export failed';
        }
    }

    return responseData?.error || responseData?.message || err?.message || 'PDF export failed';
};

export const reportsApi = {
    exportPdf: async (caseId: string) => {
        try {
            const response = await apiClient.get(`/cases/${caseId}/export/pdf`, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `forensic-report-${caseId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Delay revocation to allow download to start
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        } catch (err: any) {
            throw new Error(await extractErrorMessage(err));
        }
    },
    exportJson: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/export/json`);
        const jsonStr = JSON.stringify(response.data, null, 2);
        const url = window.URL.createObjectURL(new Blob([jsonStr], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `forensic-report-${caseId}.json`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },
    exportCsv: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/export/csv`);
        const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `timeline-${caseId}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
};
