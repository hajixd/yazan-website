import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

type FirebaseServiceAccount = {
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
  projectId: string;
};

let cachedUnavailable = false;

const trim = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const normalizePrivateKey = (value: string | undefined): string | undefined => {
  const normalized = trim(value);
  return normalized ? normalized.replace(/\\n/g, "\n") : undefined;
};

const readServiceAccountFromJson = (): FirebaseServiceAccount | null => {
  const raw = trim(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<FirebaseServiceAccount> & {
      client_email?: string;
      private_key?: string;
      private_key_id?: string;
      project_id?: string;
    };
    const clientEmail = trim(parsed.clientEmail ?? parsed.client_email);
    const privateKey = normalizePrivateKey(parsed.privateKey ?? parsed.private_key);
    const privateKeyId = trim(parsed.privateKeyId ?? parsed.private_key_id);
    const projectId = trim(parsed.projectId ?? parsed.project_id);

    if (!clientEmail || !privateKey || !projectId) {
      return null;
    }

    return {
      clientEmail,
      privateKey,
      privateKeyId,
      projectId
    };
  } catch (error) {
    throw new Error(
      `Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

const readServiceAccount = (): FirebaseServiceAccount | null => {
  const fromJson = readServiceAccountFromJson();

  if (fromJson) {
    return fromJson;
  }

  const projectId = trim(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = trim(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  const privateKeyId = trim(process.env.FIREBASE_PRIVATE_KEY_ID);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    clientEmail,
    privateKey,
    privateKeyId,
    projectId
  };
};

export const firebaseProjectId = (): string | undefined => {
  return readServiceAccount()?.projectId ?? trim(process.env.FIREBASE_PROJECT_ID);
};

export const firebaseStorageBucketName = (): string | undefined => {
  return trim(process.env.FIREBASE_STORAGE_BUCKET);
};

export const firebaseStoragePrefix = (): string => {
  return (trim(process.env.FIREBASE_STORAGE_PREFIX) ?? "yazan-website").replace(
    /^\/+|\/+$/g,
    ""
  );
};

export const storageObjectPath = (relativePath: string): string => {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = firebaseStoragePrefix();
  return prefix ? `${prefix}/${normalized}` : normalized;
};

export const hasFirebaseAdmin = (): boolean => {
  if (cachedUnavailable) {
    return false;
  }

  return Boolean(readServiceAccount() || trim(process.env.GOOGLE_APPLICATION_CREDENTIALS));
};

export const firebaseAdminApp = () => {
  if (getApps().length) {
    return getApps()[0]!;
  }

  if (cachedUnavailable) {
    return null;
  }

  const serviceAccount = readServiceAccount();
  const projectId = firebaseProjectId();
  const storageBucket = firebaseStorageBucketName();

  try {
    return initializeApp({
      credential: serviceAccount
        ? cert({
            clientEmail: serviceAccount.clientEmail,
            privateKey: serviceAccount.privateKey,
            projectId: serviceAccount.projectId
          })
        : applicationDefault(),
      projectId,
      ...(storageBucket ? { storageBucket } : {})
    });
  } catch {
    cachedUnavailable = true;
    return null;
  }
};

export const firebaseDb = () => {
  const app = firebaseAdminApp();

  if (!app) {
    throw new Error("Firebase Admin is not configured");
  }

  return getFirestore(app);
};

export const firebaseBucket = () => {
  const app = firebaseAdminApp();
  const storageBucket = firebaseStorageBucketName();

  if (!app || !storageBucket) {
    throw new Error("Firebase Storage is not configured");
  }

  return getStorage(app).bucket(storageBucket);
};
