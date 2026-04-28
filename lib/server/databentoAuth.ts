const DATABENTO_AUTH_ERROR_PATTERNS = [
  /invalid api key/i,
  /not authorized/i,
  /unauthorized/i,
  /authentication/i,
  /\b401\b/,
  /\b403\b/,
  /not entitled/i,
  /license/i,
  /permission/i,
  /subscription plan/i
];

const normaliseMessage = (message: string, maxLength = 240) => {
  const trimmed = message.replace(/\s+/g, " ").trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3)}...`;
};

export const isDatabentoApiKeyFailure = (
  message: string,
  status?: number | null
): boolean => {
  if (status === 401 || status === 403) {
    return true;
  }

  return DATABENTO_AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export const logDatabentoApiKeyFailure = (
  context: string,
  {
    symbol,
    status,
    message
  }: {
    symbol?: string;
    status?: number | null;
    message: string;
  }
): boolean => {
  if (!isDatabentoApiKeyFailure(message, status)) {
    return false;
  }

  const subject = symbol ? ` for ${symbol}` : "";
  const suffix = typeof status === "number" ? ` (HTTP ${status})` : "";

  console.error(
    `[${context}] Databento API key was rejected${subject}${suffix}. Check DATABENTO_API_KEY / DATABENTO_KEY.`
  );

  const summary = normaliseMessage(message);

  if (summary) {
    console.error(`[${context}] ${summary}`);
  }

  return true;
};
