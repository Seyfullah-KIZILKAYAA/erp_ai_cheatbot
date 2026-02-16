/**
 * Simple in-memory rate limiter
 * Limits requests per IP/session within a time window
 */

interface RateLimitEntry {
    count: number
    resetAt: number
}

const store = new Map<string, RateLimitEntry>()

const MAX_ENTRIES = 10000

function cleanup() {
    if (store.size > MAX_ENTRIES) {
        const now = Date.now()
        for (const [key, entry] of store.entries()) {
            if (entry.resetAt <= now) store.delete(key)
        }
    }
}

export function checkRateLimit(
    key: string,
    maxRequests: number = 20,
    windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetIn: number } {
    cleanup()
    const now = Date.now()
    const entry = store.get(key)

    if (!entry || entry.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs }
    }

    entry.count++
    const remaining = Math.max(0, maxRequests - entry.count)
    const resetIn = entry.resetAt - now

    if (entry.count > maxRequests) {
        return { allowed: false, remaining: 0, resetIn }
    }

    return { allowed: true, remaining, resetIn }
}
