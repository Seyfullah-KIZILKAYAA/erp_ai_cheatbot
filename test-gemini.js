
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // Just trying to access list models via a workaround or just try connection.
        // Actually the SDK doesn't expose listModels directly on the main class in older versions, 
        // but let's check if the key works at all.

        // There isn't a direct helper in the high level SDK for listing models easily in all versions,
        // but we can try to generate a simple content with a few likely candidates.

        const candidateModels = ["gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro", "gemini-1.5-pro"];

        for (const modelName of candidateModels) {
            console.log(`Testing model: ${modelName}...`);
            try {
                const m = genAI.getGenerativeModel({ model: modelName });
                await m.generateContent("Hello");
                console.log(`SUCCESS: ${modelName} works!`);
                return;
            } catch (e) {
                console.log(`FAILED: ${modelName} - ${e.message}`);
            }
        }
    } catch (e) {
        console.error("General Error:", e);
    }
}

listModels();
