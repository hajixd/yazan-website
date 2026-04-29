export type SyncProvider = "tradovate" | "tradesyncer";
export type SyncEnvironment = "live" | "demo";
export type TradovateAccessMode = "api_key" | "api_key_password";
export type TradesyncApplication = "mt4" | "mt5";
export type TradesyncAccountType = "readonly" | "full";
export type WebhookAuthMode = "none" | "basic_auth" | "bearer_token" | "api_key";
export type BrokerConnectionState = "connected" | "pending" | "error";

export type AccountSyncDraft = {
  provider: SyncProvider;
  connectionLabel: string;
  environment: SyncEnvironment;
  accountLabel: string;
  accountNumber: string;
  username: string;
  accessMode: TradovateAccessMode;
  apiKey: string;
  apiSecret: string;
  appId: string;
  appVersion: string;
  deviceId: string;
  application: TradesyncApplication;
  accountType: TradesyncAccountType;
  brokerServerId: string;
  accountPassword: string;
  webhookUrl: string;
  webhookAuthMode: WebhookAuthMode;
  webhookUsername: string;
  webhookPassword: string;
  webhookToken: string;
  webhookHeaderKey: string;
  webhookHeaderValue: string;
};

export type SavedAccountSync = AccountSyncDraft & {
  providerConnectionId: string | null;
  providerAccountId: string | null;
  providerAccountName: string | null;
  providerAccountNumber: string | null;
  providerAccountStatus: string | null;
  providerUserName: string | null;
  providerBaseUrl: string | null;
  brokerServerName: string | null;
  webhookId: string | null;
  connectionState: BrokerConnectionState;
  connectionMessage: string | null;
  lastVerifiedAt: string | null;
  storedInBrowser: boolean;
};

export type BrokerSyncVerifyRequest = {
  draft: AccountSyncDraft;
  origin?: string | null;
};

export type TradovateTradeRow = {
  id: string;
  orderId: string | null;
  accountId: string | null;
  contractId: string | null;
  symbol: string;
  side: "Buy" | "Sell" | "Unknown";
  quantity: number;
  price: number;
  timestamp: string;
  status: string;
  active: boolean | null;
};

export type TradovateTradesRequest = {
  draft: AccountSyncDraft;
  limit?: number;
};

export type BrokerSyncVerifyResponse =
  | {
      ok: true;
      connection: SavedAccountSync;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<keyof AccountSyncDraft | "form", string>>;
    };

export type TradovateTradesResponse =
  | {
      ok: true;
      trades: TradovateTradeRow[];
      meta: {
        environment: SyncEnvironment;
        accountLabel: string;
        fetchedAt: string;
        totalFills: number;
        filteredFills: number;
      };
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<keyof AccountSyncDraft | "form", string>>;
    };

export const YAZAN_SYNC_STORAGE_KEY = "roman-yazan-sync-connection";

export const TRADOVATE_API_ACCESS_URL =
  "https://tradovate.zendesk.com/hc/en-us/articles/4403105829523-How-Do-I-Get-Access-to-the-Tradovate-API";
export const TRADOVATE_AUTH_OPTIONS_URL =
  "https://tradovate.zendesk.com/hc/en-us/articles/4403105862035-Should-I-Use-OAuth-an-API-Key-or-an-API-Key-with-a-Dedicated-Password";
export const TRADOVATE_PERMISSIONS_URL =
  "https://tradovate.zendesk.com/hc/en-us/categories/18535338266515-Web-Desktop-Trading-Platform";
export const TRADOVATE_MARKET_DATA_URL =
  "https://tradovate.zendesk.com/hc/en-us/articles/4403100181651-Do-I-Need-a-Market-Data-Subscription-Through-Tradovate-to-Perform-Trades";

export const TRADESYNC_AUTH_URL = "https://www.tradesync.com/developers/authentication/";
export const TRADESYNC_INTRO_BROKER_URL = "https://www.tradesync.com/developers/brokers-introduction/";
export const TRADESYNC_CREATE_ACCOUNT_URL = "https://www.tradesync.com/developers/create-account/";
export const TRADESYNC_WEBHOOKS_URL = "https://www.tradesync.com/developers/create-webhook/";
export const TRADESYNCER_TRADOVATE_CONNECTION_URL =
  "https://help.tradesyncer.com/en/articles/11746822-how-to-add-a-tradovate-connection";
export const TRADESYNCER_TRADOVATE_LIMITS_URL =
  "https://help.tradesyncer.com/en/articles/11110392-tradovate-api-limits";

export const createDefaultSyncDraft = (
  provider: SyncProvider = "tradovate"
): AccountSyncDraft => {
  if (provider === "tradesyncer") {
    return {
      provider,
      connectionLabel: "Yazan Trade Sync",
      environment: "live",
      accountLabel: "Roman Copier Account",
      accountNumber: "",
      username: "",
      accessMode: "api_key_password",
      apiKey: "",
      apiSecret: "",
      appId: "",
      appVersion: "",
      deviceId: "",
      application: "mt5",
      accountType: "readonly",
      brokerServerId: "",
      accountPassword: "",
      webhookUrl: "",
      webhookAuthMode: "none",
      webhookUsername: "",
      webhookPassword: "",
      webhookToken: "",
      webhookHeaderKey: "",
      webhookHeaderValue: ""
    };
  }

  return {
    provider,
    connectionLabel: "Yazan Tradovate",
    environment: "live",
    accountLabel: "Roman Capital Primary",
    accountNumber: "",
    username: "",
    accessMode: "api_key_password",
    apiKey: "",
    apiSecret: "",
    appId: "roman-capital-terminal",
    appVersion: "1.0.0",
    deviceId: "",
    application: "mt5",
    accountType: "readonly",
    brokerServerId: "",
    accountPassword: "",
    webhookUrl: "",
    webhookAuthMode: "none",
    webhookUsername: "",
    webhookPassword: "",
    webhookToken: "",
    webhookHeaderKey: "",
    webhookHeaderValue: ""
  };
};

export const sanitizeAccountSyncDraft = (draft: AccountSyncDraft): AccountSyncDraft => {
  return {
    provider: draft.provider,
    connectionLabel: draft.connectionLabel.trim(),
    environment: draft.environment,
    accountLabel: draft.accountLabel.trim(),
    accountNumber: draft.accountNumber.trim(),
    username: draft.username.trim(),
    accessMode: draft.accessMode,
    apiKey: draft.apiKey.trim(),
    apiSecret: draft.apiSecret.trim(),
    appId: draft.appId.trim(),
    appVersion: draft.appVersion.trim(),
    deviceId: draft.deviceId.trim(),
    application: draft.application,
    accountType: draft.accountType,
    brokerServerId: draft.brokerServerId.trim(),
    accountPassword: draft.accountPassword.trim(),
    webhookUrl: draft.webhookUrl.trim(),
    webhookAuthMode: draft.webhookAuthMode,
    webhookUsername: draft.webhookUsername.trim(),
    webhookPassword: draft.webhookPassword.trim(),
    webhookToken: draft.webhookToken.trim(),
    webhookHeaderKey: draft.webhookHeaderKey.trim(),
    webhookHeaderValue: draft.webhookHeaderValue.trim()
  };
};

export const getSyncProviderLabel = (provider: SyncProvider) => {
  return provider === "tradovate" ? "Tradovate" : "Trade Sync";
};

export const buildDefaultTradesyncWebhookUrl = (origin: string) => {
  return `${origin.replace(/\/$/, "")}/api/tradesync/webhook`;
};

export const createEmptySavedConnection = (
  draft: AccountSyncDraft = createDefaultSyncDraft()
): SavedAccountSync => {
  return {
    ...draft,
    providerConnectionId: null,
    providerAccountId: null,
    providerAccountName: null,
    providerAccountNumber: null,
    providerAccountStatus: null,
    providerUserName: null,
    providerBaseUrl: null,
    brokerServerName: null,
    webhookId: null,
    connectionState: "error",
    connectionMessage: null,
    lastVerifiedAt: null,
    storedInBrowser: true
  };
};

export const normalizeSavedAccountSync = (value: unknown): SavedAccountSync | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<SavedAccountSync>;
  const base = createDefaultSyncDraft(
    raw.provider === "tradesyncer" || raw.provider === "tradovate" ? raw.provider : "tradovate"
  );

  const normalizedDraft = sanitizeAccountSyncDraft({
    ...base,
    ...raw,
    webhookAuthMode:
      raw.webhookAuthMode === "basic_auth" ||
      raw.webhookAuthMode === "bearer_token" ||
      raw.webhookAuthMode === "api_key" ||
      raw.webhookAuthMode === "none"
        ? raw.webhookAuthMode
        : base.webhookAuthMode
  });

  return {
    ...normalizedDraft,
    providerConnectionId: typeof raw.providerConnectionId === "string" ? raw.providerConnectionId : null,
    providerAccountId: typeof raw.providerAccountId === "string" ? raw.providerAccountId : null,
    providerAccountName: typeof raw.providerAccountName === "string" ? raw.providerAccountName : null,
    providerAccountNumber:
      typeof raw.providerAccountNumber === "string" ? raw.providerAccountNumber : null,
    providerAccountStatus:
      typeof raw.providerAccountStatus === "string" ? raw.providerAccountStatus : null,
    providerUserName: typeof raw.providerUserName === "string" ? raw.providerUserName : null,
    providerBaseUrl: typeof raw.providerBaseUrl === "string" ? raw.providerBaseUrl : null,
    brokerServerName: typeof raw.brokerServerName === "string" ? raw.brokerServerName : null,
    webhookId: typeof raw.webhookId === "string" ? raw.webhookId : null,
    connectionState:
      raw.connectionState === "connected" ||
      raw.connectionState === "pending" ||
      raw.connectionState === "error"
        ? raw.connectionState
        : "error",
    connectionMessage: typeof raw.connectionMessage === "string" ? raw.connectionMessage : null,
    lastVerifiedAt: typeof raw.lastVerifiedAt === "string" ? raw.lastVerifiedAt : null,
    storedInBrowser: raw.storedInBrowser !== false
  };
};
