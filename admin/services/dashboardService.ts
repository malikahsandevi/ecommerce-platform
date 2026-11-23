import { apiClient } from './api';

/** A failed dashboard load, carrying the HTTP status when the server
 *  answered at all — the page must tell a permission refusal (403)
 *  apart from a genuine load failure (5xx / network), because the two
 *  get completely different screens. */
export class DashboardLoadError extends Error {
    status?: number;

    constructor(status?: number) {
        super('Dashboard request failed');
        this.name = 'DashboardLoadError';
        this.status = status;
    }
}

export const getDashboardAllData = async (_period?: string) => {
    try {
        const res = await apiClient.get('/dashboard', {
            params: _period ? { period: _period } : undefined
        });
        return res.data;
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        const status = (error as { response?: { status?: number } })?.response
            ?.status;
        throw new DashboardLoadError(status);
    }
};
