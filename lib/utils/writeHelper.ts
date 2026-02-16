/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Shared utility for extracting structured write data from natural language queries.
 * Used by all agents that support write operations.
 */

import { withRetry, withTimeout } from "@/lib/utils/errorHandling";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function extractWriteData(query: string, systemPrompt: string): Promise<any> {
    try {
        const response = await withRetry(
            () => withTimeout(
                () => fetch(GROQ_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${GROQ_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: query }
                        ],
                        temperature: 0.1,
                        max_tokens: 300,
                        response_format: { type: "json_object" }
                    })
                }),
                8000,
                'Write data extraction timed out'
            ),
            { maxRetries: 1, baseDelay: 500 }
        );

        if (!response.ok) return null;

        const data = await response.json();
        const raw = data.choices[0]?.message?.content || "{}";
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
