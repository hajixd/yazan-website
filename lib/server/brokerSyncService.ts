import {
  type AccountSyncDraft,
  type BrokerSyncVerifyResponse,
  type SavedAccountSync,
  buildDefaultTradesyncWebhookUrl,
  createEmptySavedConnection,
  sanitizeAccountSyncDraft
} from "../brokerSync";

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
    origin && origin.trim() ? buildDefaultTradesyncWebhookUrl(origin.trim()) : null;
  const webhookUrl = draft.webhookUrl || builtInWebhookUrl || "";

  if (!webhookUrl) {
    return null;
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
    if (!draft.apiKey) {
      throw new ProviderError("Tradovate needs an API key or security key.", {
        fieldErrors: {
          apiKey: "Enter the Tradovate API key."
        }
      });
    }

    if (!draft.username) {
      throw new ProviderError("Tradovate needs the account username for validation.", {
        fieldErrors: {
          username: "Enter the Tradovate username."
        }
      });
    }

    if (draft.accessMode === "api_key_password" && !draft.apiSecret) {
      throw new ProviderError("Dedicated-password mode needs the dedicated password.", {
        fieldErrors: {
          apiSecret: "Enter the Tradovate dedicated password."
        }
      });
    }

    if (!draft.appId) {
      throw new ProviderError("Tradovate needs an App ID for access-token requests.", {
        fieldErrors: {
          appId: "Enter the Tradovate App ID."
        }
      });
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
  const baseUrl = TRADOVATE_BASE_URLS[draft.environment];
  let accessToken = "";

  const directBearerResponse = await tradovateFetch(baseUrl, "/auth/me", {
    headers: {
      Authorization: `Bearer ${draft.apiKey}`
    }
  });

  if (directBearerResponse.ok) {
    accessToken = draft.apiKey;
  } else {
    const authPayload: Record<string, string | number> = {
      name: draft.username,
      password: draft.apiSecret,
      appId: draft.appId || "roman-capital-terminal",
      appVersion: draft.appVersion || "1.0.0",
      cid: 0,
      sec: draft.apiKey
    };

    if (draft.deviceId) {
      authPayload.deviceId = draft.deviceId;
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

    accessToken = authData.accessToken;
  }

  const meResponse = await tradovateFetch(baseUrl, "/auth/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const meData = (await assertTradovateSuccess(
    meResponse,
    "Tradovate accepted the token but failed to return the user profile."
  )) as TradovateMeResponse;

  let accounts: TradovateAccount[] = [];
  const accountListResponse = await tradovateFetch(baseUrl, "/account/list", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (accountListResponse.ok) {
    const accountPayload = await assertTradovateSuccess(
      accountListResponse,
      "Tradovate did not return account access."
    );

    if (Array.isArray(accountPayload)) {
      accounts = accountPayload as TradovateAccount[];
    } else if (
      isObject(accountPayload) &&
      Array.isArray((accountPayload as { accounts?: unknown[] }).accounts)
    ) {
      accounts = (accountPayload as { accounts: TradovateAccount[] }).accounts;
    }
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

  const listResponse = await tradesyncFetch("/accounts/", authHeader);
  const accountListData = await assertTradesyncSuccess<TradesyncAccount[]>(
    listResponse,
    "Trade Sync rejected the API credentials."
  );
  const existingAccount = Array.isArray(accountListData.data)
    ? pickTradesyncAccount(accountListData.data, draft)
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
  const connectionState =
    syncedAccount.status === "connection_ok" || syncedAccount.status === "login_success"
      ? "connected"
      : syncedAccount.status === "attempt_failed" || syncedAccount.login_response === "invalid_account"
        ? "error"
        : "pending";
  const connectionMessage =
    syncedAccount.login_response && syncedAccount.login_response !== "login_success"
      ? syncedAccount.login_response.replace(/_/g, " ")
      : syncedAccount.status
        ? syncedAccount.status.replace(/_/g, " ")
        : "Trade Sync accepted the account.";

  return {
    ...createEmptySavedConnection({
      ...draft,
      webhookUrl:
        draft.webhookUrl || (origin && origin.trim() ? buildDefaultTradesyncWebhookUrl(origin.trim()) : "")
    }),
    providerConnectionId: syncedAccount.id ? String(syncedAccount.id) : null,
    providerAccountId: syncedAccount.id ? String(syncedAccount.id) : null,
    providerAccountName: syncedAccount.account_name ?? draft.accountLabel ?? null,
    providerAccountNumber:
      syncedAccount.account_number !== undefined && syncedAccount.account_number !== null
        ? String(syncedAccount.account_number)
        : draft.accountNumber,
    providerAccountStatus: syncedAccount.status ?? null,
    providerUserName: syncedAccount.client_name ?? null,
    providerBaseUrl: TRADESYNC_BASE_URL,
    brokerServerName: syncedAccount.server ?? brokerServerData.data?.name ?? null,
    webhookId: webhook?.id ? String(webhook.id) : null,
    connectionState,
    connectionMessage:
      webhook?.id && connectionMessage
        ? `${connectionMessage}. Webhook ${webhook.id} is configured.`
        : connectionMessage,
    lastVerifiedAt: new Date().toISOString(),
    storedInBrowser: true
  };
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
