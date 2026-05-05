import {
  type AccountSyncDraft,
  type BrokerSyncVerifyResponse,
  type SavedAccountSync,
  type TradovateTradeRow,
  type TradovateTradesResponse,
  buildPublicTradesyncWebhookUrl,
  createEmptySavedConnection,
  isPublicBrokerWebhookUrl,
  sanitizeAccountSyncDraft
} from "../brokerSync";
import { createHash } from "crypto";

type ProviderErrorOptions = {
  fieldErrors?: Partial<Record<keyof AccountSyncDraft | "form", string>>;
};

class ProviderError extends Error {
  fieldErrors?: ProviderErrorOptions["fieldErrors"];

  constructor(message: string, options: ProviderErrorOptions = {}) {
    super(message);
    this.name = "ProviderError";
    this.fieldErrors = options.fieldErrors;
  }
}

type TradovateMeResponse = {
  id?: number | string;
  name?: string;
  userName?: string;
  nickname?: string;
  email?: string;
};

type TradovateAccount = {
  id?: number | string;
  name?: string;
  nickname?: string;
  accountSpec?: {
    name?: string;
  };
  userId?: number | string;
  active?: boolean;
  status?: string;
};

type TradovateOrder = {
  id?: number | string;
  accountId?: number | string;
  contractId?: number | string;
  timestamp?: string;
  action?: string;
  ordStatus?: string;
};

type TradovateFill = {
  id?: number | string | null;
  orderId?: number | string;
  contractId?: number | string;
  timestamp?: string;
  action?: string;
  qty?: number | string;
  price?: number | string;
  active?: boolean;
};

type TradovateContract = {
  id?: number | string;
  name?: string;
};

type TradesyncEnvelope<T> = {
  result?: string;
  status?: number;
  data?: T;
  meta?: {
    count?: number;
    limit?: number;
    order?: string;
    last_id?: number | string | null;
  };
  message?: string;
  error?: string;
  errors?: string[];
};

type TradesyncAccount = {
  id?: number | string;
  account_name?: string;
  account_number?: number | string;
  application?: string;
  type?: string;
  status?: string;
  login_response?: string | null;
  broker_server_id?: number | string;
  broker?: string;
  server?: string;
  client_name?: string;
  trade_mode?: string;
  currency?: string;
  balance?: number | string;
  equity?: number | string;
};

type TradesyncBrokerServer = {
  id?: number | string;
  application?: string;
  name?: string;
};

type TradesyncWebhook = {
  id?: number | string;
  url?: string;
  authentication?: string;
};

const TRADOVATE_BASE_URLS = {
  live: process.env.TRADOVATE_LIVE_BASE_URL || "https://live.tradovateapi.com/v1",
  demo: process.env.TRADOVATE_DEMO_BASE_URL || "https://demo.tradovateapi.com/v1"
};

const TRADESYNC_BASE_URL = process.env.TRADESYNC_API_BASE_URL || "https://api.tradesync.com";
const REQUEST_TIMEOUT_MS = 15_000;
const TRADOVATE_TOKEN_REFRESH_BUFFER_MS = 15 * 60_000;
const TRADOVATE_DEFAULT_TOKEN_TTL_MS = 75 * 60_000;

type TradovateAccessTokenCacheEntry = {
  baseUrl: string;
  accessToken: string;
  expiresAt: number;
};

const tradovateAccessTokenCache = new Map<string, TradovateAccessTokenCacheEntry>();

const usesTradovateDemoPasswordLogin = (draft: AccountSyncDraft) => {
  return draft.environment === "demo" && draft.accessMode === "api_key_password";
};

const shouldSendTradovateRegisteredAppFields = (draft: AccountSyncDraft) => {
  return draft.accessMode === "api_key_password" && !usesTradovateDemoPasswordLogin(draft);
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const toErrorMessage = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === "string" && first.trim() ? first.trim() : fallback;
  }

  if (isObject(value)) {
    for (const key of ["errorText", "error", "message", "detail"]) {
      const nested = value[key];
      if (typeof nested === "string" && nested.trim()) {
        return nested.trim();
      }
    }
  }

  return fallback;
};

const parseJsonSafely = async (response: Response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const getTradovateTokenCacheKey = (draft: AccountSyncDraft) => {
  const sendsRegisteredAppFields = shouldSendTradovateRegisteredAppFields(draft);

  return createHash("sha256")
    .update(
      JSON.stringify([
        draft.environment,
        draft.accessMode,
        draft.username,
        (sendsRegisteredAppFields || draft.accessMode === "api_key") ? draft.apiKey : "",
        draft.apiSecret,
        sendsRegisteredAppFields ? draft.appId : "",
        sendsRegisteredAppFields ? draft.appVersion : "",
        sendsRegisteredAppFields ? draft.deviceId : ""
      ])
    )
    .digest("hex");
};

const readCachedTradovateAccessToken = (
  draft: AccountSyncDraft
): TradovateAccessTokenCacheEntry | null => {
  const cacheKey = getTradovateTokenCacheKey(draft);
  const cached = tradovateAccessTokenCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt - TRADOVATE_TOKEN_REFRESH_BUFFER_MS <= Date.now()) {
    tradovateAccessTokenCache.delete(cacheKey);
    return null;
  }

  return cached;
};

const cacheTradovateAccessToken = (
  draft: AccountSyncDraft,
  baseUrl: string,
  accessToken: string,
  expirationTime?: string | null
) => {
  const parsedExpiration = expirationTime ? Date.parse(expirationTime) : Number.NaN;
  const expiresAt = Number.isFinite(parsedExpiration)
    ? parsedExpiration
    : Date.now() + TRADOVATE_DEFAULT_TOKEN_TTL_MS;

  tradovateAccessTokenCache.set(getTradovateTokenCacheKey(draft), {
    baseUrl,
    accessToken,
    expiresAt
  });
};

const assertTradovateSuccess = async (response: Response, fallback: string) => {
  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new ProviderError(toErrorMessage(payload, fallback));
  }

  if (isObject(payload) && typeof payload.errorText === "string" && payload.errorText.trim()) {
    throw new ProviderError(payload.errorText.trim());
  }

  return payload;
};

const makeTradesyncAuthHeader = (draft: AccountSyncDraft) => {
  return `Basic ${Buffer.from(`${draft.apiKey}:${draft.apiSecret}`).toString("base64")}`;
};

const isPositiveIntegerText = (value: string) => {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
};

const isTradesyncImportMode = (draft: AccountSyncDraft) => {
  return draft.tradesyncMode !== "create_or_refresh";
};

const toTradesyncApplication = (value: unknown, fallback: AccountSyncDraft["application"]) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "mt4" || normalized === "mt5" ? normalized : fallback;
};

const toTradesyncAccountType = (value: unknown, fallback: AccountSyncDraft["accountType"]) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "readonly" || normalized === "full" ? normalized : fallback;
};

const assertTradesyncSuccess = async <T>(
  response: Response,
  fallback: string
): Promise<TradesyncEnvelope<T>> => {
  const payload = (await parseJsonSafely(response)) as TradesyncEnvelope<T> | string | null;

  if (!response.ok) {
    throw new ProviderError(toErrorMessage(payload, fallback));
  }

  if (typeof payload === "string") {
    throw new ProviderError(payload || fallback);
  }

  if (!payload || payload.result !== "success") {
    throw new ProviderError(toErrorMessage(payload, fallback));
  }

  return payload;
};

const buildTradesyncWebhookPayload = (draft: AccountSyncDraft, origin?: string | null) => {
  const builtInWebhookUrl =
    origin && origin.trim() ? buildPublicTradesyncWebhookUrl(origin.trim()) : "";
  const webhookUrl = draft.webhookUrl || builtInWebhookUrl || "";

  if (!webhookUrl) {
    return null;
  }

  if (!isPublicBrokerWebhookUrl(webhookUrl)) {
    throw new ProviderError("Trade Sync needs a public webhook URL.", {
      fieldErrors: {
        webhookUrl: "Use a deployed URL or public tunnel. Localhost cannot receive Trade Sync webhooks."
      }
    });
  }

  if (builtInWebhookUrl && webhookUrl === builtInWebhookUrl && draft.webhookAuthMode !== "none") {
    throw new ProviderError("Built-in Trade Sync webhooks only support no authentication.", {
      fieldErrors: {
        webhookAuthMode: "Use no auth for the built-in webhook, or provide your own webhook URL."
      }
    });
  }

  const payload: Record<string, string> = {
    url: webhookUrl,
    authentication: draft.webhookAuthMode
  };

  if (draft.webhookAuthMode === "basic_auth") {
    if (!draft.webhookUsername || !draft.webhookPassword) {
      throw new ProviderError("Basic-auth webhooks need both a username and password.", {
        fieldErrors: {
          webhookUsername: "Enter the webhook username.",
          webhookPassword: "Enter the webhook password."
        }
      });
    }

    payload.username = draft.webhookUsername;
    payload.password = draft.webhookPassword;
  }

  if (draft.webhookAuthMode === "bearer_token") {
    if (!draft.webhookToken) {
      throw new ProviderError("Bearer-token webhooks need a token.", {
        fieldErrors: {
          webhookToken: "Enter the webhook bearer token."
        }
      });
    }

    payload.token = draft.webhookToken;
  }

  if (draft.webhookAuthMode === "api_key") {
    if (!draft.webhookHeaderKey || !draft.webhookHeaderValue) {
      throw new ProviderError("API-key webhooks need both a header key and value.", {
        fieldErrors: {
          webhookHeaderKey: "Enter the webhook header key.",
          webhookHeaderValue: "Enter the webhook header value."
        }
      });
    }

    payload.key = draft.webhookHeaderKey;
    payload.value = draft.webhookHeaderValue;
  }

  return payload;
};

const validateDraft = (draft: AccountSyncDraft) => {
  if (!draft.connectionLabel) {
    throw new ProviderError("Add a connection label before saving.", {
      fieldErrors: {
        connectionLabel: "Add a connection label."
      }
    });
  }

  if (draft.provider === "tradovate") {
    if (draft.accessMode === "api_key" && !draft.apiKey) {
      throw new ProviderError("Tradovate needs an API key or security key.", {
        fieldErrors: {
          apiKey: "Enter the Tradovate API key."
        }
      });
    }

    if (draft.accessMode === "api_key_password") {
      const usesDemoPasswordLogin = usesTradovateDemoPasswordLogin(draft);

      if (!draft.username) {
        throw new ProviderError("Tradovate needs the account username for token requests.", {
          fieldErrors: {
            username: "Enter the Tradovate username."
          }
        });
      }

      if (!draft.apiSecret) {
        throw new ProviderError(
          usesDemoPasswordLogin
            ? "Tradovate Demo needs the account password."
            : "Dedicated-password mode needs the dedicated password.",
          {
            fieldErrors: {
              apiSecret: usesDemoPasswordLogin
                ? "Enter the Tradovate Demo password."
                : "Enter the Tradovate dedicated password."
            }
          }
        );
      }

      if (!usesDemoPasswordLogin && !draft.apiKey) {
        throw new ProviderError("Tradovate Live needs an API key or security key.", {
          fieldErrors: {
            apiKey: "Enter the Tradovate API key."
          }
        });
      }

      if (!usesDemoPasswordLogin && !draft.appId) {
        throw new ProviderError("Tradovate needs an App ID for access-token requests.", {
          fieldErrors: {
            appId: "Enter the Tradovate App ID."
          }
        });
      }
    }
  } else {
    if (!draft.apiKey) {
      throw new ProviderError("Trade Sync needs an API key.", {
        fieldErrors: {
          apiKey: "Enter the Trade Sync API key."
        }
      });
    }

    if (!draft.apiSecret) {
      throw new ProviderError("Trade Sync needs an API secret.", {
        fieldErrors: {
          apiSecret: "Enter the Trade Sync API secret."
        }
      });
    }

    if (draft.accountNumber && !isPositiveIntegerText(draft.accountNumber)) {
      throw new ProviderError("Trade Sync account number must be numeric.", {
        fieldErrors: {
          accountNumber: "Enter numbers only."
        }
      });
    }

    if (!isTradesyncImportMode(draft)) {
      if (!draft.accountNumber) {
        throw new ProviderError("Trade Sync needs the MetaTrader account number.", {
          fieldErrors: {
            accountNumber: "Enter the MetaTrader account number."
          }
        });
      }

      if (!draft.accountPassword) {
        throw new ProviderError("Trade Sync needs the MetaTrader account password.", {
          fieldErrors: {
            accountPassword: "Enter the MetaTrader account password."
          }
        });
      }

      if (!draft.brokerServerId) {
        throw new ProviderError("Trade Sync needs the broker server ID.", {
          fieldErrors: {
            brokerServerId: "Enter the broker server ID."
          }
        });
      }

      if (!isPositiveIntegerText(draft.brokerServerId)) {
        throw new ProviderError("Trade Sync broker server ID must be numeric.", {
          fieldErrors: {
            brokerServerId: "Enter the numeric broker_server_id."
          }
        });
      }
    }
  }
};

const tradovateFetch = async (
  baseUrl: string,
  pathname: string,
  init: RequestInit = {}
) => {
  return fetch(`${baseUrl}${pathname}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
};

const getTradovateAccessToken = async (draft: AccountSyncDraft) => {
  const baseUrl = TRADOVATE_BASE_URLS[draft.environment];
  const cachedToken = readCachedTradovateAccessToken(draft);

  if (cachedToken) {
    return {
      baseUrl: cachedToken.baseUrl,
      accessToken: cachedToken.accessToken
    };
  }

  if (draft.accessMode === "api_key") {
    const directBearerResponse = await tradovateFetch(baseUrl, "/auth/me", {
      headers: {
        Authorization: `Bearer ${draft.apiKey}`
      }
    });

    if (directBearerResponse.ok) {
      return {
        baseUrl,
        accessToken: draft.apiKey
      };
    }

    throw new ProviderError(
      "Tradovate rejected the API key. Confirm the key permissions, or use Key + Dedicated Password for security-key token requests."
    );
  }

  const authPayload: Record<string, string | number> = {
    name: draft.username,
    password: draft.apiSecret
  };

  const sendsRegisteredAppFields = shouldSendTradovateRegisteredAppFields(draft);

  if (sendsRegisteredAppFields && draft.appId) {
    authPayload.appId = draft.appId;
  }

  if (sendsRegisteredAppFields && draft.appVersion) {
    authPayload.appVersion = draft.appVersion;
  }

  if (sendsRegisteredAppFields && draft.deviceId) {
    authPayload.deviceId = draft.deviceId;
  }

  if (sendsRegisteredAppFields && draft.apiKey) {
    authPayload.cid = 0;
    authPayload.sec = draft.apiKey;
  }

  const authResponse = await tradovateFetch(baseUrl, "/auth/accesstokenrequest", {
    method: "POST",
    body: JSON.stringify(authPayload)
  });
  const authData = (await assertTradovateSuccess(
    authResponse,
    "Tradovate rejected the connection details."
  )) as {
    accessToken?: string;
    expirationTime?: string;
  };

  if (!authData.accessToken) {
    throw new ProviderError("Tradovate did not return an access token.");
  }

  cacheTradovateAccessToken(draft, baseUrl, authData.accessToken, authData.expirationTime);

  return {
    baseUrl,
    accessToken: authData.accessToken
  };
};

const tradesyncFetch = async (
  pathname: string,
  authHeader: string,
  init: RequestInit = {}
) => {
  return fetch(`${TRADESYNC_BASE_URL}${pathname}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
};

const pickTradovateAccount = (
  accounts: TradovateAccount[],
  requestedAccountNumber: string
): TradovateAccount | null => {
  if (accounts.length === 0) {
    return null;
  }

  if (!requestedAccountNumber) {
    return accounts[0];
  }

  const normalizedRequested = requestedAccountNumber.trim().toLowerCase();

  return (
    accounts.find((account) => {
      const candidates = [
        account.id,
        account.name,
        account.nickname,
        account.accountSpec?.name
      ]
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value).trim().toLowerCase());

      return candidates.includes(normalizedRequested);
    }) ?? null
  );
};

const verifyTradovateConnection = async (draft: AccountSyncDraft): Promise<SavedAccountSync> => {
  const { baseUrl, accessToken } = await getTradovateAccessToken(draft);

  const meResponse = await tradovateFetch(baseUrl, "/auth/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const meData = (await assertTradovateSuccess(
    meResponse,
    "Tradovate accepted the token but failed to return the user profile."
  )) as TradovateMeResponse;

  const accountListResponse = await tradovateFetch(baseUrl, "/account/list", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const accountPayload = await assertTradovateSuccess(
    accountListResponse,
    "Tradovate did not return account access."
  );
  let accounts: TradovateAccount[] = [];

  if (Array.isArray(accountPayload)) {
    accounts = accountPayload as TradovateAccount[];
  } else if (
    isObject(accountPayload) &&
    Array.isArray((accountPayload as { accounts?: unknown[] }).accounts)
  ) {
    accounts = (accountPayload as { accounts: TradovateAccount[] }).accounts;
  } else {
    throw new ProviderError("Tradovate authenticated, but account access was not returned.");
  }

  const selectedAccount = pickTradovateAccount(accounts, draft.accountNumber);

  if (draft.accountNumber && !selectedAccount && accounts.length > 0) {
    throw new ProviderError("Tradovate authenticated, but the requested account was not found.", {
      fieldErrors: {
        accountNumber: "That account was not returned by Tradovate."
      }
    });
  }

  return {
    ...createEmptySavedConnection(draft),
    providerConnectionId: meData.id ? String(meData.id) : draft.username,
    providerAccountId: selectedAccount?.id ? String(selectedAccount.id) : null,
    providerAccountName:
      selectedAccount?.name || selectedAccount?.nickname || selectedAccount?.accountSpec?.name || null,
    providerAccountNumber:
      selectedAccount?.id !== undefined && selectedAccount?.id !== null
        ? String(selectedAccount.id)
        : draft.accountNumber || null,
    providerAccountStatus:
      selectedAccount?.status ?? (selectedAccount?.active === false ? "inactive" : "connected"),
    providerUserName: meData.name || meData.userName || meData.nickname || draft.username,
    providerBaseUrl: baseUrl,
    connectionState: "connected",
    connectionMessage:
      accounts.length > 0
        ? `Verified with Tradovate and found ${accounts.length} account${accounts.length === 1 ? "" : "s"}.`
        : "Verified with Tradovate.",
    lastVerifiedAt: new Date().toISOString(),
    storedInBrowser: true
  };
};

const toStableId = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
};

const toFiniteNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  return 0;
};

const readTradovateList = async <T>(
  baseUrl: string,
  accessToken: string,
  pathname: string,
  fallback: string
): Promise<T[]> => {
  const response = await tradovateFetch(baseUrl, pathname, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await assertTradovateSuccess(response, fallback);

  if (Array.isArray(payload)) {
    return payload as T[];
  }

  throw new ProviderError(fallback);
};

const readTradovateContracts = async (
  baseUrl: string,
  accessToken: string,
  contractIds: string[]
) => {
  const uniqueIds = Array.from(new Set(contractIds)).slice(0, 80);
  const contractsById = new Map<string, string>();

  if (uniqueIds.length === 0) {
    return contractsById;
  }

  const params = new URLSearchParams();
  params.set("ids", `[${uniqueIds.join(",")}]`);

  const response = await tradovateFetch(baseUrl, `/contract/items?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await assertTradovateSuccess(
    response,
    "Tradovate returned fills, but contract names could not be loaded."
  );

  if (!Array.isArray(payload)) {
    return contractsById;
  }

  for (const contract of payload as TradovateContract[]) {
    const id = toStableId(contract.id);

    if (id && contract.name) {
      contractsById.set(id, contract.name);
    }
  }

  return contractsById;
};

const getRequestedTradovateAccountId = (
  rawDraft: AccountSyncDraft,
  draft: AccountSyncDraft
) => {
  const savedFields = rawDraft as Partial<SavedAccountSync>;
  const candidates = [
    savedFields.providerAccountId,
    savedFields.providerAccountNumber,
    draft.accountNumber
  ];

  for (const candidate of candidates) {
    const value = toStableId(candidate);

    if (value) {
      return value;
    }
  }

  return null;
};

export const fetchTradovateTrades = async (
  rawDraft: AccountSyncDraft,
  limit = 80
): Promise<TradovateTradesResponse> => {
  const draft = sanitizeAccountSyncDraft(rawDraft);
  const requestedAccountId = getRequestedTradovateAccountId(rawDraft, draft);
  const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 80;
  const safeLimit = Math.max(1, Math.min(200, parsedLimit));

  try {
    if (draft.provider !== "tradovate") {
      throw new ProviderError("Add Tradovate details before loading Tradovate trades.");
    }

    validateDraft(draft);

    const { baseUrl, accessToken } = await getTradovateAccessToken(draft);
    const fills = await readTradovateList<TradovateFill>(
      baseUrl,
      accessToken,
      "/fill/list",
      "Tradovate did not return fill history."
    );
    let orders: TradovateOrder[] = [];

    try {
      orders = await readTradovateList<TradovateOrder>(
        baseUrl,
        accessToken,
        "/order/list",
        "Tradovate did not return order history."
      );
    } catch {
      orders = [];
    }

    const ordersById = new Map<string, TradovateOrder>();

    for (const order of orders) {
      const id = toStableId(order.id);

      if (id) {
        ordersById.set(id, order);
      }
    }

    const filteredFills = fills.filter((fill) => {
      if (!requestedAccountId || orders.length === 0) {
        return true;
      }

      const orderId = toStableId(fill.orderId);
      const order = orderId ? ordersById.get(orderId) : null;
      const orderAccountId = toStableId(order?.accountId);

      return !orderAccountId || orderAccountId === requestedAccountId;
    });
    const contractIds = filteredFills
      .map((fill) => toStableId(fill.contractId ?? ordersById.get(toStableId(fill.orderId) ?? "")?.contractId))
      .filter((value): value is string => Boolean(value));
    let contractsById = new Map<string, string>();

    try {
      contractsById = await readTradovateContracts(baseUrl, accessToken, contractIds);
    } catch {
      contractsById = new Map();
    }

    const trades: TradovateTradeRow[] = filteredFills
      .map((fill) => {
        const orderId = toStableId(fill.orderId);
        const order = orderId ? ordersById.get(orderId) : null;
        const contractId = toStableId(fill.contractId ?? order?.contractId);
        const action = typeof fill.action === "string" ? fill.action : order?.action;
        const side: TradovateTradeRow["side"] =
          action === "Buy" || action === "Sell" ? action : "Unknown";
        const timestamp = typeof fill.timestamp === "string" ? fill.timestamp : order?.timestamp ?? "";

        return {
          id: toStableId(fill.id) ?? `${orderId ?? "fill"}-${timestamp}-${contractId ?? "contract"}`,
          orderId,
          accountId: toStableId(order?.accountId),
          contractId,
          symbol: (contractId ? contractsById.get(contractId) : null) ?? (contractId ? `Contract ${contractId}` : "Unknown"),
          side,
          quantity: toFiniteNumber(fill.qty),
          price: toFiniteNumber(fill.price),
          timestamp,
          status: order?.ordStatus ?? (fill.active === false ? "Closed" : "Filled"),
          active: typeof fill.active === "boolean" ? fill.active : null
        };
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.timestamp);
        const bTime = Date.parse(b.timestamp);

        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
      .slice(0, safeLimit);

    return {
      ok: true,
      trades,
      meta: {
        environment: draft.environment,
        accountLabel: draft.accountLabel || draft.connectionLabel || draft.username,
        fetchedAt: new Date().toISOString(),
        totalFills: fills.length,
        filteredFills: filteredFills.length
      }
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.fieldErrors
      };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Tradovate trades could not be loaded."
    };
  }
};

const pickTradesyncAccount = (accounts: TradesyncAccount[], draft: AccountSyncDraft) => {
  const normalizedNumber = draft.accountNumber.trim();

  return (
    accounts.find((account) => {
      return (
        String(account.account_number ?? "").trim() === normalizedNumber &&
        String(account.application ?? "").toLowerCase() === draft.application
      );
    }) ?? null
  );
};

const pickImportedTradesyncAccount = (
  accounts: TradesyncAccount[],
  draft: AccountSyncDraft
) => {
  const normalizedNumber = draft.accountNumber.trim();

  if (normalizedNumber) {
    return (
      accounts.find((account) => {
        return String(account.account_number ?? "").trim() === normalizedNumber;
      }) ?? null
    );
  }

  return accounts[0] ?? null;
};

const getTradesyncConnectionState = (account: TradesyncAccount): SavedAccountSync["connectionState"] => {
  return account.status === "connection_ok" || account.status === "login_success"
    ? "connected"
    : account.status === "attempt_failed" || account.login_response === "invalid_account"
      ? "error"
      : "pending";
};

const getTradesyncConnectionMessage = (
  account: TradesyncAccount,
  imported: boolean,
  webhook?: TradesyncWebhook | null
) => {
  const accountMessage =
    account.login_response && account.login_response !== "login_success"
      ? account.login_response.replace(/_/g, " ")
      : account.status
        ? account.status.replace(/_/g, " ")
        : imported
          ? "Imported from Trade Sync."
          : "Trade Sync accepted the account.";
  const message = imported && accountMessage !== "Imported from Trade Sync."
    ? `Imported from Trade Sync: ${accountMessage}`
    : accountMessage;

  return webhook?.id && message ? `${message}. Webhook ${webhook.id} is configured.` : message;
};

const buildSavedTradesyncConnection = (
  draft: AccountSyncDraft,
  account: TradesyncAccount,
  brokerServer: TradesyncBrokerServer | null,
  webhook: TradesyncWebhook | null,
  origin: string | null | undefined,
  imported: boolean
): SavedAccountSync => {
  const accountNumber =
    account.account_number !== undefined && account.account_number !== null
      ? String(account.account_number)
      : draft.accountNumber;
  const accountName = account.account_name ?? draft.accountLabel ?? draft.connectionLabel;
  const brokerServerId =
    account.broker_server_id !== undefined && account.broker_server_id !== null
      ? String(account.broker_server_id)
      : draft.brokerServerId;

  return {
    ...createEmptySavedConnection({
      ...draft,
      accountLabel: accountName,
      accountNumber,
      tradesyncMode: draft.tradesyncMode,
      application: toTradesyncApplication(account.application, draft.application),
      accountType: toTradesyncAccountType(account.type, draft.accountType),
      brokerServerId,
      webhookUrl:
        draft.webhookUrl || (origin && origin.trim() ? buildPublicTradesyncWebhookUrl(origin.trim()) : "")
    }),
    providerConnectionId: account.id ? String(account.id) : null,
    providerAccountId: account.id ? String(account.id) : null,
    providerAccountName: accountName,
    providerAccountNumber: accountNumber || null,
    providerAccountStatus: account.status ?? null,
    providerUserName: account.client_name ?? null,
    providerBaseUrl: TRADESYNC_BASE_URL,
    brokerServerName: account.server ?? brokerServer?.name ?? account.broker ?? null,
    webhookId: webhook?.id ? String(webhook.id) : null,
    connectionState: getTradesyncConnectionState(account),
    connectionMessage: getTradesyncConnectionMessage(account, imported, webhook),
    lastVerifiedAt: new Date().toISOString(),
    storedInBrowser: true
  };
};

const upsertTradesyncWebhook = async (
  draft: AccountSyncDraft,
  authHeader: string,
  origin?: string | null
) => {
  const payload = buildTradesyncWebhookPayload(draft, origin);

  if (!payload) {
    return null;
  }

  const listResponse = await tradesyncFetch("/webhooks/", authHeader);
  const listData = await assertTradesyncSuccess<TradesyncWebhook[]>(
    listResponse,
    "Trade Sync did not return the webhook list."
  );
  const existingWebhook = Array.isArray(listData.data)
    ? listData.data.find((webhook) => webhook.url === payload.url) ?? null
    : null;

  if (!existingWebhook?.id) {
    const createResponse = await tradesyncFetch("/webhooks/", authHeader, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const created = await assertTradesyncSuccess<TradesyncWebhook>(
      createResponse,
      "Trade Sync could not create the webhook."
    );
    return created.data ?? null;
  }

  const updateResponse = await tradesyncFetch(`/webhooks/${existingWebhook.id}`, authHeader, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  const updated = await assertTradesyncSuccess<TradesyncWebhook>(
    updateResponse,
    "Trade Sync could not update the webhook."
  );
  return updated.data ?? null;
};

const verifyTradesyncConnection = async (
  draft: AccountSyncDraft,
  origin?: string | null
): Promise<SavedAccountSync> => {
  const authHeader = makeTradesyncAuthHeader(draft);
  const listResponse = await tradesyncFetch("/accounts/", authHeader);
  const accountListData = await assertTradesyncSuccess<TradesyncAccount[]>(
    listResponse,
    "Trade Sync rejected the API credentials."
  );
  const accounts = Array.isArray(accountListData.data) ? accountListData.data : [];

  if (isTradesyncImportMode(draft)) {
    const importedAccount = pickImportedTradesyncAccount(accounts, draft);

    if (!importedAccount) {
      throw new ProviderError(
        draft.accountNumber
          ? "Trade Sync authenticated, but that account was not found."
          : "Trade Sync authenticated, but no accounts were returned.",
        draft.accountNumber
          ? {
              fieldErrors: {
                accountNumber: "That account was not returned by Trade Sync."
              }
            }
          : undefined
      );
    }

    const webhook = await upsertTradesyncWebhook(draft, authHeader, origin);

    return buildSavedTradesyncConnection(
      draft,
      importedAccount,
      null,
      webhook,
      origin,
      true
    );
  }

  const brokerServerResponse = await tradesyncFetch(
    `/broker-servers/${draft.brokerServerId}`,
    authHeader
  );
  const brokerServerData = await assertTradesyncSuccess<TradesyncBrokerServer>(
    brokerServerResponse,
    "Trade Sync rejected the broker server ID."
  );

  if (
    brokerServerData.data?.application &&
    brokerServerData.data.application.toLowerCase() !== draft.application
  ) {
    throw new ProviderError("The Trade Sync broker server does not match the selected MT4/MT5 app.", {
      fieldErrors: {
        brokerServerId: "That broker server belongs to a different MetaTrader app."
      }
    });
  }

  const existingAccount = accounts.length > 0
    ? pickTradesyncAccount(accounts, draft)
    : null;

  let syncedAccount: TradesyncAccount | null = null;

  if (existingAccount?.id) {
    const updateConnectionResponse = await tradesyncFetch(
      `/accounts/${existingAccount.id}/connection`,
      authHeader,
      {
        method: "PATCH",
        body: JSON.stringify({
          broker_server_id: Number(draft.brokerServerId),
          password: draft.accountPassword
        })
      }
    );
    const updateConnectionData = await assertTradesyncSuccess<TradesyncAccount>(
      updateConnectionResponse,
      "Trade Sync could not refresh the account connection."
    );
    syncedAccount = updateConnectionData.data ?? null;
  } else {
    const createAccountResponse = await tradesyncFetch("/accounts/", authHeader, {
      method: "POST",
      body: JSON.stringify({
        account_name: draft.accountLabel || draft.connectionLabel,
        account_number: Number(draft.accountNumber),
        password: draft.accountPassword,
        application: draft.application,
        broker_server_id: Number(draft.brokerServerId),
        type: draft.accountType
      })
    });
    const createAccountData = await assertTradesyncSuccess<TradesyncAccount>(
      createAccountResponse,
      "Trade Sync could not create the MetaTrader account."
    );
    syncedAccount = createAccountData.data ?? null;
  }

  if (!syncedAccount?.id) {
    throw new ProviderError("Trade Sync did not return the synced account.");
  }

  const webhook = await upsertTradesyncWebhook(draft, authHeader, origin);

  return buildSavedTradesyncConnection(
    draft,
    syncedAccount,
    brokerServerData.data ?? null,
    webhook,
    origin,
    false
  );
};

export const verifyBrokerSyncConnection = async (
  rawDraft: AccountSyncDraft,
  origin?: string | null
): Promise<BrokerSyncVerifyResponse> => {
  const draft = sanitizeAccountSyncDraft(rawDraft);

  try {
    validateDraft(draft);
    const connection =
      draft.provider === "tradovate"
        ? await verifyTradovateConnection(draft)
        : await verifyTradesyncConnection(draft, origin);

    return {
      ok: true,
      connection
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.fieldErrors
      };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "The broker sync could not be verified."
    };
  }
};
