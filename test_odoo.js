
require('dotenv').config({ path: '.env.local' });
const { searchReadOdoo } = require('./lib/odooClient');

async function testConnection() {
    console.log("Testing Odoo Connection...");
    console.log("URL:", process.env.ODOO_URL);
    console.log("DB:", process.env.ODOO_DB);
    console.log("User:", process.env.ODOO_USERNAME);

    try {
        const result = await searchReadOdoo('res.partner', [], ['name'], 1);
        console.log("Connection Successful!");
        console.log("Sample Data:", result);
    } catch (error) {
        console.error("Connection Failed!");
        console.error("Error Detail:", error.message || error);
    }
}

testConnection();
