import xmlrpc from 'xmlrpc';
import { withTimeout } from '@/lib/utils/errorHandling';

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

function validateOdooEnv() {
    const missing: string[] = [];
    if (!ODOO_URL) missing.push('ODOO_URL');
    if (!ODOO_DB) missing.push('ODOO_DB');
    if (!ODOO_USERNAME) missing.push('ODOO_USERNAME');
    if (!ODOO_PASSWORD) missing.push('ODOO_PASSWORD');
    if (missing.length > 0) {
        throw new Error(`Missing required Odoo env vars: ${missing.join(', ')}`);
    }
}

// Helper to determine if we need secure client (https) or not (http)
const getClient = (path: string) => {
    validateOdooEnv();
    const url = new URL(ODOO_URL!);
    const createClient = url.protocol === 'https:' ? xmlrpc.createSecureClient : xmlrpc.createClient;

    return createClient({
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        path: path,
    });
};

// Authenticate and get User ID (UID)
const authenticate = async (): Promise<number> => {
    return new Promise((resolve, reject) => {
        const client = getClient('/xmlrpc/2/common');
        client.methodCall('authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}], (error, value) => {
            if (error) {
                reject(error);
            } else if (!value) {
                reject(new Error("Authentication failed. Check credentials."));
            } else {
                resolve(value as number);
            }
        });
    });
};

// Execute search_read on a model
export const searchReadOdoo = async (model: string, query: any[] = [], fields: string[] = [], limit: number = 10, order: string = ''): Promise<any> => {
    try {
        const uid = await authenticate();
        const client = getClient('/xmlrpc/2/object');

        return withTimeout(
            () => new Promise((resolve, reject) => {
                const options: any = {
                    fields: fields.length > 0 ? fields : undefined,
                    limit: limit
                };
                if (order) options.order = order;

                client.methodCall('execute_kw', [
                    ODOO_DB,
                    uid,
                    ODOO_PASSWORD,
                    model,
                    'search_read',
                    [query],
                    options
                ], (error, value) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(value);
                    }
                });
            }),
            10000, // 10 second timeout
            'Odoo search_read operation timed out'
        );
    } catch (error) {
        console.error("Odoo Error:", error);
        throw error;
    }
};

// Create a new record in Odoo
export const createOdoo = async (model: string, values: Record<string, any>): Promise<number> => {
    try {
        const uid = await authenticate();
        const client = getClient('/xmlrpc/2/object');

        return withTimeout(
            () => new Promise<number>((resolve, reject) => {
                client.methodCall('execute_kw', [
                    ODOO_DB,
                    uid,
                    ODOO_PASSWORD,
                    model,
                    'create',
                    [values]
                ], (error, value) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(value as number);
                    }
                });
            }),
            10000,
            'Odoo create operation timed out'
        );
    } catch (error) {
        console.error("Odoo Create Error:", error);
        throw error;
    }
};

// Update existing record(s) in Odoo
export const writeOdoo = async (model: string, ids: number[], values: Record<string, any>): Promise<boolean> => {
    try {
        const uid = await authenticate();
        const client = getClient('/xmlrpc/2/object');

        return withTimeout(
            () => new Promise<boolean>((resolve, reject) => {
                client.methodCall('execute_kw', [
                    ODOO_DB,
                    uid,
                    ODOO_PASSWORD,
                    model,
                    'write',
                    [ids, values]
                ], (error, value) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(value as boolean);
                    }
                });
            }),
            10000,
            'Odoo write operation timed out'
        );
    } catch (error) {
        console.error("Odoo Write Error:", error);
        throw error;
    }
};

// Just to get count
export const countOdoo = async (model: string, query: any[] = []): Promise<number> => {
    try {
        const uid = await authenticate();
        const client = getClient('/xmlrpc/2/object');

        return withTimeout(
            () => new Promise<number>((resolve, reject) => {
                client.methodCall('execute_kw', [
                    ODOO_DB,
                    uid,
                    ODOO_PASSWORD,
                    model,
                    'search_count',
                    [query]
                ], (error, value) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(value as number);
                    }
                });
            }),
            10000, // 10 second timeout
            'Odoo search_count operation timed out'
        );
    } catch (error) {
        console.error("Odoo Error:", error);
        throw error;
    }
}
