
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

async function findWorkingModel() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log("Testing API Key with various models...");

    const modelsToTest = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-001",
        "gemini-1.5-pro",
        "gemini-1.5-pro-001",
        "gemini-1.0-pro",
        "gemini-pro",
        "gemini-pro-vision"
    ];

    for (const modelName of modelsToTest) {
        process.stdout.write(`Trying ${modelName}... `);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Test");
            const response = await result.response;
            console.log("SUCCESS! ✅");
            console.log("Response:", response.text());
            console.log(`\n>>> PLEASE UPDATE YOUR CODE TO USE MODEL: "${modelName}" <<<\n`);
            return;
        } catch (e) {
            console.log("FAILED ❌");
            // console.log(e.message); // Uncomment to see error details
        }
    }
    console.log("\nNo working model found in the standard list. Checking listModels API...");
}

findWorkingModel();
