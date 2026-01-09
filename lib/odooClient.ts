import xmlrpc from 'xmlrpc';

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

// Helper to determine if we need secure client (https) or not (http)
const getClient = (path: string) => {
    if (!ODOO_URL) throw new Error("ODOO_URL is not defined");
    const url = new URL(ODOO_URL);
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

        return new Promise((resolve, reject) => {
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
        });
    } catch (error) {
        console.error("Odoo Error:", error);
        throw error;
    }
};

// Just to get count
export const countOdoo = async (model: string, query: any[] = []): Promise<number> => {
    try {
        const uid = await authenticate();
        const client = getClient('/xmlrpc/2/object');

        return new Promise((resolve, reject) => {
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
        });
    } catch (error) {
        console.error("Odoo Error:", error);
        throw error;
    }
}
