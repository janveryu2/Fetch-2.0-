import "server-only";

export interface RateLimitConfig {
  max: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export const RATE_LIMIT_CONFIGS = {
  generate: { max: 10, windowSeconds: 60 },
  tutor: { max: 10, windowSeconds: 600 },
  friendSearch: { max: 30, windowSeconds: 60 },
  friendRequest: { max: 15, windowSeconds: 60 },
  liveAction: { max: 40, windowSeconds: 60 },
  general: { max: 100, windowSeconds: 60 },
} as const;

export type RateLimitCategory = keyof typeof RATE_LIMIT_CONFIGS;

class MemorySlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  check(identifier: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const threshold = now - windowMs;

    const timestamps = this.hits.get(identifier) || [];
    const validTimestamps = timestamps.filter((t) => t > threshold);

    if (validTimestamps.length >= config.max) {
      const oldestValid = validTimestamps[0] || now;
      const resetSeconds = Math.max(1, Math.ceil((oldestValid + windowMs - now) / 1000));
      this.hits.set(identifier, validTimestamps);
      return {
        allowed: false,
        limit: config.max,
        remaining: 0,
        resetSeconds,
      };
    }

    validTimestamps.push(now);
    this.hits.set(identifier, validTimestamps);

    const oldest = validTimestamps[0] || now;
    const resetSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));

    return {
      allowed: true,
      limit: config.max,
      remaining: Math.max(0, config.max - validTimestamps.length),
      resetSeconds,
    };
  }

  clear() {
    this.hits.clear();
  }
}

export const rateLimiter = new MemorySlidingWindowLimiter();

export function checkRateLimit(
  identifier: string,
  category: RateLimitCategory = "general"
): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS[category];
  return rateLimiter.check(`${category}:${identifier}`, config);
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetSeconds),
  };
}

export function rateLimitedResponse(result: RateLimitResult, requestId?: string): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded. Please slow down and try again.",
      code: "RATE_LIMITED",
      ...(requestId ? { requestId } : {}),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.resetSeconds),
        ...getRateLimitHeaders(result),
      },
    }
  );
}
