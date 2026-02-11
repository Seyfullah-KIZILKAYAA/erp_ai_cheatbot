
require('dotenv').config({ path: '.env.local' });
const xmlrpc = require('xmlrpc');

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

const getClient = (path) => {
    const url = new URL(ODOO_URL);
    const createClient = url.protocol === 'https:' ? xmlrpc.createSecureClient : xmlrpc.createClient;
    return createClient({
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        path: path,
    });
};

async function checkModels() {
    const common = getClient('/xmlrpc/2/common');

    const uid = await new Promise((resolve, reject) => {
        common.methodCall('authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}], (error, value) => {
            if (error) reject(error);
            else resolve(value);
        });
    });

    console.log("Authenticated UID:", uid);

    const object = getClient('/xmlrpc/2/object');
    const models = ['product.product', 'product.template', 'stock.quant', 'sale.order', 'account.move'];

    for (const model of models) {
        try {
            const result = await new Promise((resolve, reject) => {
                object.methodCall('execute_kw', [
                    ODOO_DB, uid, ODOO_PASSWORD,
                    model, 'search', [[]], { limit: 1 }
                ], (error, value) => {
                    if (error) reject(error);
                    else resolve(value);
                });
            });
            console.log(`✅ Model ${model} exists. Count: ${result.length}`);
        } catch (e) {
            console.log(`❌ Model ${model} NOT FOUND or NO ACCESS: ${e.message}`);
        }
    }
}

checkModels();
