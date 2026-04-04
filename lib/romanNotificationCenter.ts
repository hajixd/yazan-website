"use client";

export type RomanNotificationPermission = NotificationPermission | "unsupported";

export type RomanNotificationDeviceRecord = {
  id: string;
  platform: "web";
  enabled: boolean;
  permission: RomanNotificationPermission;
  userAgent: string;
  serviceWorkerScope: string | null;
  createdAt: number;
  updatedAt: number;
};

export type RomanNotificationEventInput = {
  id: string;
  title: string;
  body: string;
  tone: "up" | "down" | "neutral";
  link?: string;
  symbol?: string | null;
  tradeId?: string | null;
  entityType?: string | null;
  actionCode?: string | null;
  occurredAt: number;
};

type RomanNotificationEventRecord = RomanNotificationEventInput & {
  readAt: number | null;
  deliveredAt: number | null;
  createdAt: number;
  updatedAt: number;
};

const ROMAN_NOTIFICATION_DB_NAME = "roman_capital_workspace";
const ROMAN_NOTIFICATION_DB_VERSION = 1;
const ROMAN_NOTIFICATION_DEVICES_STORE = "roman_notification_devices";
const ROMAN_NOTIFICATION_EVENTS_STORE = "roman_notification_events";
const ROMAN_NOTIFICATION_DEVICE_ID_KEY = "roman_notification_device_id";
const ROMAN_NOTIFICATION_SW_PATH = "/roman-notifications-sw.js";

let romanNotificationDbPromise: Promise<IDBDatabase | null> | null = null;

const canUseBrowserStorage = () => {
  return typeof window !== "undefined" && "indexedDB" in window;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
};

const transactionDone = (transaction: IDBTransaction): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
};

const openRomanNotificationDb = async (): Promise<IDBDatabase | null> => {
  if (!canUseBrowserStorage()) {
    return null;
  }

  if (!romanNotificationDbPromise) {
    romanNotificationDbPromise = new Promise<IDBDatabase | null>((resolve) => {
      const request = window.indexedDB.open(
        ROMAN_NOTIFICATION_DB_NAME,
        ROMAN_NOTIFICATION_DB_VERSION
      );

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(ROMAN_NOTIFICATION_DEVICES_STORE)) {
          const devicesStore = database.createObjectStore(ROMAN_NOTIFICATION_DEVICES_STORE, {
            keyPath: "id"
          });
          devicesStore.createIndex("by_updated_at", "updatedAt");
          devicesStore.createIndex("by_permission", "permission");
        }

        if (!database.objectStoreNames.contains(ROMAN_NOTIFICATION_EVENTS_STORE)) {
          const eventsStore = database.createObjectStore(ROMAN_NOTIFICATION_EVENTS_STORE, {
            keyPath: "id"
          });
          eventsStore.createIndex("by_occurred_at", "occurredAt");
          eventsStore.createIndex("by_read_at", "readAt");
          eventsStore.createIndex("by_trade_id", "tradeId");
          eventsStore.createIndex("by_symbol", "symbol");
          eventsStore.createIndex("by_entity_type", "entityType");
          eventsStore.createIndex("by_action_code", "actionCode");
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  return romanNotificationDbPromise;
};

const getRomanNotificationPermission = (): RomanNotificationPermission => {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }

  return Notification.permission;
};

const getRomanNotificationDeviceId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(ROMAN_NOTIFICATION_DEVICE_ID_KEY)?.trim();
  if (stored) {
    return stored;
  }

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `roman-device-${Date.now()}`;
  window.localStorage.setItem(ROMAN_NOTIFICATION_DEVICE_ID_KEY, generated);
  return generated;
};

export const registerRomanNotificationServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(ROMAN_NOTIFICATION_SW_PATH, {
      scope: "/"
    });
  } catch {
    return null;
  }
};

export const syncRomanNotificationDevice = async (
  enabled: boolean
): Promise<RomanNotificationDeviceRecord | null> => {
  const database = await openRomanNotificationDb();
  const deviceId = getRomanNotificationDeviceId();

  if (!database || !deviceId) {
    return null;
  }

  const registration = await registerRomanNotificationServiceWorker();
  const now = Date.now();
  const permission = getRomanNotificationPermission();
  const transaction = database.transaction(ROMAN_NOTIFICATION_DEVICES_STORE, "readwrite");
  const store = transaction.objectStore(ROMAN_NOTIFICATION_DEVICES_STORE);
  const existing = (await requestToPromise(
    store.get(deviceId)
  )) as RomanNotificationDeviceRecord | undefined;

  const nextRecord: RomanNotificationDeviceRecord = {
    id: deviceId,
    platform: "web",
    enabled,
    permission,
    userAgent:
      typeof navigator === "undefined" ? "" : String(navigator.userAgent ?? "").slice(0, 400),
    serviceWorkerScope: registration?.scope ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  store.put(nextRecord);
  await transactionDone(transaction);
  return nextRecord;
};

export const listRomanSeenNotificationIds = async (): Promise<string[]> => {
  const database = await openRomanNotificationDb();

  if (!database) {
    return [];
  }

  const transaction = database.transaction(ROMAN_NOTIFICATION_EVENTS_STORE, "readonly");
  const store = transaction.objectStore(ROMAN_NOTIFICATION_EVENTS_STORE);
  const all = (await requestToPromise(store.getAll())) as RomanNotificationEventRecord[];

  return all.filter((event) => event.readAt != null).map((event) => event.id);
};

export const upsertRomanNotificationEvents = async (
  events: RomanNotificationEventInput[]
): Promise<string[]> => {
  if (events.length === 0) {
    return [];
  }

  const database = await openRomanNotificationDb();

  if (!database) {
    return [];
  }

  const insertedIds: string[] = [];
  const transaction = database.transaction(ROMAN_NOTIFICATION_EVENTS_STORE, "readwrite");
  const store = transaction.objectStore(ROMAN_NOTIFICATION_EVENTS_STORE);

  for (const event of events) {
    const existing = (await requestToPromise(
      store.get(event.id)
    )) as RomanNotificationEventRecord | undefined;
    const now = Date.now();

    if (!existing) {
      insertedIds.push(event.id);
    }

    const nextRecord: RomanNotificationEventRecord = {
      id: event.id,
      title: event.title,
      body: event.body,
      tone: event.tone,
      link: event.link ?? "/",
      symbol: event.symbol ?? null,
      tradeId: event.tradeId ?? null,
      entityType: event.entityType ?? null,
      actionCode: event.actionCode ?? null,
      occurredAt: event.occurredAt,
      readAt: existing?.readAt ?? null,
      deliveredAt: existing?.deliveredAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    store.put(nextRecord);
  }

  await transactionDone(transaction);
  return insertedIds;
};

export const markRomanNotificationEventsSeen = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) {
    return;
  }

  const database = await openRomanNotificationDb();

  if (!database) {
    return;
  }

  const now = Date.now();
  const transaction = database.transaction(ROMAN_NOTIFICATION_EVENTS_STORE, "readwrite");
  const store = transaction.objectStore(ROMAN_NOTIFICATION_EVENTS_STORE);

  for (const id of ids) {
    const existing = (await requestToPromise(
      store.get(id)
    )) as RomanNotificationEventRecord | undefined;

    if (!existing || existing.readAt != null) {
      continue;
    }

    store.put({
      ...existing,
      readAt: now,
      updatedAt: now
    });
  }

  await transactionDone(transaction);
};

export const markRomanNotificationEventsDelivered = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) {
    return;
  }

  const database = await openRomanNotificationDb();

  if (!database) {
    return;
  }

  const now = Date.now();
  const transaction = database.transaction(ROMAN_NOTIFICATION_EVENTS_STORE, "readwrite");
  const store = transaction.objectStore(ROMAN_NOTIFICATION_EVENTS_STORE);

  for (const id of ids) {
    const existing = (await requestToPromise(
      store.get(id)
    )) as RomanNotificationEventRecord | undefined;

    if (!existing) {
      continue;
    }

    store.put({
      ...existing,
      deliveredAt: now,
      updatedAt: now
    });
  }

  await transactionDone(transaction);
};

export const showRomanNotification = async (
  event: RomanNotificationEventInput
): Promise<boolean> => {
  const permission = getRomanNotificationPermission();

  if (permission !== "granted") {
    return false;
  }

  const registration = await registerRomanNotificationServiceWorker();
  const link = event.link ?? "/";

  try {
    if (registration) {
      await registration.showNotification(event.title, {
        body: event.body,
        tag: `roman-${event.id}`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: {
          link
        }
      });
      return true;
    }

    if (typeof Notification !== "undefined") {
      const notification = new Notification(event.title, {
        body: event.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `roman-${event.id}`
      });
      notification.onclick = () => {
        window.focus();
        window.location.assign(link);
      };
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

export const requestRomanNotificationPermission = async (): Promise<RomanNotificationPermission> => {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
};
