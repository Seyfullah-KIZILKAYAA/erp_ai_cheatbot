
const xmlrpc = require('xmlrpc');
require('dotenv').config({ path: '.env.local' });

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

const getClient = (path) => {
    const url = new URL(ODOO_URL);
    return xmlrpc.createClient({
        host: url.hostname,
        port: parseInt(url.port) || 8069,
        path: path,
    });
};

async function test() {
    console.log("Testing Connection to:", ODOO_URL);
    const common = getClient('/xmlrpc/2/common');

    common.methodCall('authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}], (error, uid) => {
        if (error) {
            console.error("Auth Error:", error);
        } else if (!uid) {
            console.error("Auth Failed: Access Denied (Check credentials)");
        } else {
            console.log("Auth Success! UID:", uid);
            const models = getClient('/xmlrpc/2/object');
            models.methodCall('execute_kw', [
                ODOO_DB, uid, ODOO_PASSWORD,
                'res.partner', 'search_read', [[]], { fields: ['name'], limit: 1 }
            ], (err, data) => {
                if (err) console.error("Data Error:", err);
                else console.log("Data Success:", data);
            });
        }
    });
}

test();
