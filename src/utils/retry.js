const RETRYABLE_HTTP_STATUS = new Set([429]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ABORT_ERR",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const RETRYABLE_LARK_CODES = new Set([
  1254290, // TooManyRequest
  1254291, // LockNotObtainedError
  1255001, // InternalError
  1255002, // RpcError
  1255003, // MarshalError
  1255004, // UmMarshalError
  1255005, // ConvError
  1255006, // Client token conflict, please generate a new client token and try again.
  1255040, // Request timed out, please try again later
]);

export class HttpError extends Error {
  constructor(message, { status, response, body, cause } = {}) {
    super(message, { cause });
    this.name = "HttpError";
    this.status = status ?? response?.status;
    this.response = response;
    this.body = body;
  }
}

export function isRetryableStatus(status) {
  const value = Number(status);
  return RETRYABLE_HTTP_STATUS.has(value) || (value >= 500 && value <= 599);
}

export function isRetryableError(error) {
  if (!error) return false;
  const status = error.status ?? error.response?.status;
  if (status != null) return isRetryableStatus(status);
  const apiCode = Number(error.apiCode ?? error.body?.code);
  if (RETRYABLE_LARK_CODES.has(apiCode)) return true;
  if (RETRYABLE_NETWORK_CODES.has(error.code) || RETRYABLE_NETWORK_CODES.has(error.cause?.code)) return true;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return /socket hang up|network error|timed?\s*out/i.test(error.message ?? "");
}

function readHeader(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? null;
}

export function getRetryAfterMs(error, now = Date.now()) {
  const rawValue = readHeader(error?.response?.headers ?? error?.headers, "retry-after");
  if (rawValue == null || rawValue === "") return null;
  const seconds = Number(rawValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(rawValue);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - now);
}

export async function withRetry(
  operation,
  {
    maxAttempts = 5,
    baseDelayMs = 1000,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    shouldRetry = isRetryableError,
    onRetry,
  } = {},
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("maxAttempts must be a positive integer");
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) throw error;
      const delayMs = getRetryAfterMs(error) ?? baseDelayMs * 2 ** (attempt - 1);
      onRetry?.({ attempt, nextAttempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export async function fetchWithRetry(
  url,
  options = {},
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 60_000,
    operation = "HTTP request",
    ...retryOptions
  } = {},
) {
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
  return withRetry(async (attempt) => {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
    const externalSignal = options.signal;
    const abortFromExternal = () => timeoutController.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

    try {
      const response = await fetchImpl(url, { ...options, signal: timeoutController.signal });
      if (!response.ok) {
        throw new HttpError(`${operation} failed with HTTP ${response.status}`, { status: response.status, response });
      }
      return response;
    } catch (error) {
      if (timeoutController.signal.aborted && !externalSignal?.aborted) {
        const timeoutError = new Error(`${operation} timed out after ${timeoutMs}ms (attempt ${attempt})`, { cause: error });
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }, retryOptions);
}
