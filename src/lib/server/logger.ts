import "server-only";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
  };
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|api_key|apikey|authorization|cookie|session|bearer|private_key)/i;

/**
 * Recursively redacts sensitive keys and strips large raw content payloads
 * from logging output to prevent leaking PII, secrets, or raw learning material.
 */
export function sanitizeLogMetadata(data: unknown, depth = 0): unknown {
  if (depth > 5 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    // Redact Bearer tokens if in a string
    if (data.startsWith("Bearer ") || data.startsWith("bearer ")) {
      return "[REDACTED_BEARER]";
    }
    // Truncate excessively long strings in log metadata
    if (data.length > 500) {
      return `${data.slice(0, 50)}... [TRUNCATED ${data.length} chars]`;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogMetadata(item, depth + 1));
  }

  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (key === "content" || key === "sourceText" || key === "rawText") {
        sanitized[key] = typeof value === "string" ? `[CONTENT_LENGTH_${value.length}]` : "[CONTENT]";
      } else {
        sanitized[key] = sanitizeLogMetadata(value, depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}

export function extractRequestId(request?: Request): string {
  if (!request) {
    return `req_${Math.random().toString(36).substring(2, 10)}`;
  }
  const headerId = request.headers.get("x-request-id") || request.headers.get("x-correlation-id");
  if (headerId && headerId.trim()) {
    return headerId.trim();
  }
  return `req_${Math.random().toString(36).substring(2, 10)}`;
}

class SafeLogger {
  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  info(event: string, meta?: { requestId?: string; userId?: string; [key: string]: unknown }) {
    const { requestId, userId, ...rest } = meta || {};
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      event,
      ...(requestId ? { requestId } : {}),
      ...(userId ? { userId } : {}),
      metadata: sanitizeLogMetadata(rest) as Record<string, unknown>,
    };
    console.info(this.formatLog(entry));
  }

  warn(event: string, meta?: { requestId?: string; userId?: string; [key: string]: unknown }) {
    const { requestId, userId, ...rest } = meta || {};
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      event,
      ...(requestId ? { requestId } : {}),
      ...(userId ? { userId } : {}),
      metadata: sanitizeLogMetadata(rest) as Record<string, unknown>,
    };
    console.warn(this.formatLog(entry));
  }

  error(
    event: string,
    err?: unknown,
    meta?: { requestId?: string; userId?: string; [key: string]: unknown }
  ) {
    const { requestId, userId, ...rest } = meta || {};
    let errorObj: LogEntry["error"];
    if (err instanceof Error) {
      errorObj = {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      };
    } else if (typeof err === "string") {
      errorObj = { message: err };
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      event,
      ...(requestId ? { requestId } : {}),
      ...(userId ? { userId } : {}),
      metadata: sanitizeLogMetadata(rest) as Record<string, unknown>,
      ...(errorObj ? { error: errorObj } : {}),
    };
    console.error(this.formatLog(entry));
  }
}

export const logger = new SafeLogger();
