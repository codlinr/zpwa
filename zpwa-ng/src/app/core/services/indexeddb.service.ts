import { openDB, type IDBPDatabase } from 'idb';
import type { OfflineOp } from '../models/offline-queue.model';

const DB_NAME = 'zpwa-offline-db';
const DB_VERSION = 4; // Incremented for new stores / layouts
const STORE_QUEUE = 'queue';
const STORE_WORK_ORDERS_CACHE = 'workOrdersCache';
const STORE_EQUIPMENT_CACHE = 'equipmentCache';
// Row-wise stores: one object per record.
const STORE_WORK_ORDER_RECORDS = 'workOrderRecords';
const STORE_EQUIPMENT_RECORDS = 'equipmentRecords';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        // Queue store for offline operations
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        }
        // Cache stores for work orders and equipment
        if (!db.objectStoreNames.contains(STORE_WORK_ORDERS_CACHE)) {
          db.createObjectStore(STORE_WORK_ORDERS_CACHE, { keyPath: 'branch' });
        }
        if (!db.objectStoreNames.contains(STORE_EQUIPMENT_CACHE)) {
          db.createObjectStore(STORE_EQUIPMENT_CACHE, { keyPath: 'branch' });
        }
        // Row-wise stores: one object per record, keyed by (branch, id)
        if (!db.objectStoreNames.contains(STORE_WORK_ORDER_RECORDS)) {
          const store = db.createObjectStore(STORE_WORK_ORDER_RECORDS, {
            keyPath: ['branch', 'orderNumber'],
          });
          // Index to allow existence checks by orderNumber (across branches)
          store.createIndex('orderNumber', 'orderNumber');
        }
        if (!db.objectStoreNames.contains(STORE_EQUIPMENT_RECORDS)) {
          db.createObjectStore(STORE_EQUIPMENT_RECORDS, {
            keyPath: ['branch', 'assetNumber'],
          });
        }

        // Ensure index exists when upgrading from older DB versions where the store
        // existed but the index did not.
        if (oldVersion < 4 && db.objectStoreNames.contains(STORE_WORK_ORDER_RECORDS)) {
          try {
            const store = tx.objectStore(STORE_WORK_ORDER_RECORDS);
            if (!store.indexNames.contains('orderNumber')) {
              store.createIndex('orderNumber', 'orderNumber');
            }
          } catch {
            // ignore upgrade/index errors
          }
        }
      },
    });
  }
  return dbPromise;
}

// Queue operations
export async function loadFromIndexedDB(): Promise<OfflineOp[]> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const store = tx.objectStore(STORE_QUEUE);
    return await store.getAll();
  } catch {
    return [];
  }
}

export async function saveToIndexedDB(ops: OfflineOp[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_QUEUE);
    await store.clear();
    for (const op of ops) {
      await store.add(op);
    }
  } catch {
    // ignore quota or errors
  }
}

export async function addToIndexedDB(op: OfflineOp): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_QUEUE);
    await store.add(op);
  } catch {
    // ignore errors
  }
}

export async function removeFromIndexedDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_QUEUE);
    await store.delete(id);
  } catch {
    // ignore errors
  }
}

// Work orders cache
export interface WorkOrdersCache {
  branch: string;
  data: any; // WorkOrderPage data
  cachedAt: number;
}

function normalizeBranch(branch: string): string {
  return (branch ?? '').trim();
}

export async function getWorkOrdersCache(branch: string): Promise<WorkOrdersCache | null> {
  try {
    const key = normalizeBranch(branch);
    if (!key) return null;
    const db = await getDB();
    const tx = db.transaction(STORE_WORK_ORDERS_CACHE, 'readonly');
    const store = tx.objectStore(STORE_WORK_ORDERS_CACHE);
    const cached = (await store.get(key)) || null;
    if (cached) {
      return cached;
    }

    // Fallback 1: try original branch if normalized lookup failed (for backwards compatibility)
    if (key !== branch) {
      const legacyKeyHit = (await store.get(branch)) || null;
      if (legacyKeyHit) {
        return legacyKeyHit;
      }
    }

    // Fallback 2: build a page from row-wise records if available
    if (db.objectStoreNames.contains(STORE_WORK_ORDER_RECORDS)) {
      try {
        const legacyTx = db.transaction(STORE_WORK_ORDER_RECORDS, 'readonly');
        const legacyStore = legacyTx.objectStore(STORE_WORK_ORDER_RECORDS);
        const allRecords: any[] = (await legacyStore.getAll()) ?? [];
        const branchRecords = allRecords.filter((r) => r && r.branch === key);
        if (branchRecords.length > 0) {
          const pageData = {
            handle: `offline-${key}`,
            pageSize: branchRecords.length,
            recordSize: branchRecords.length,
            pageNumber: 1,
            records: branchRecords,
          };

          const wrapped: WorkOrdersCache = {
            branch: key,
            data: pageData,
            cachedAt: Date.now(),
          };

          // Persist into the cache store so future lookups are fast
          try {
            const persistTx = db.transaction(STORE_WORK_ORDERS_CACHE, 'readwrite');
            const persistStore = persistTx.objectStore(STORE_WORK_ORDERS_CACHE);
            await persistStore.put(wrapped);
          } catch {
            // ignore persist errors
          }

          return wrapped;
        }
      } catch {
        // ignore legacy-store errors
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function saveWorkOrdersCache(branch: string, data: any): Promise<void> {
  try {
    const key = normalizeBranch(branch);
    if (!key || !data) return;
    const db = await getDB();
    const tx = db.transaction(STORE_WORK_ORDERS_CACHE, 'readwrite');
    const store = tx.objectStore(STORE_WORK_ORDERS_CACHE);
    await store.put({
      branch: key,
      data,
      cachedAt: Date.now(),
    });
  } catch {
    // ignore errors
  }
}

// Persist a full set of work orders row-wise for a branch (one object per record)
export async function saveAllWorkOrderRows(branch: string, records: any[]): Promise<void> {
  try {
    const key = normalizeBranch(branch);
    if (!key || !records?.length) return;
    const db = await getDB();
    if (!db.objectStoreNames.contains(STORE_WORK_ORDER_RECORDS)) return;
    const tx = db.transaction(STORE_WORK_ORDER_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_WORK_ORDER_RECORDS);
    // For simplicity, clear and repopulate. This keeps the store aligned with backend.
    await store.clear();
    for (const rec of records) {
      await store.put({
        ...rec,
        branch: rec.branch ?? key,
      });
    }
  } catch {
    // ignore errors
  }
}

// Check if a work order exists in the local IndexedDB row-wise store.
// - If branch is provided, checks that exact (branch, orderNumber) composite key.
// - If branch is omitted, checks by orderNumber across all branches (via index when available).
export async function workOrderExists(
  orderNumber: number,
  branch?: string,
): Promise<boolean> {
  try {
    if (orderNumber == null) return false;
    const db = await getDB();
    if (!db.objectStoreNames.contains(STORE_WORK_ORDER_RECORDS)) return false;
    const tx = db.transaction(STORE_WORK_ORDER_RECORDS, 'readonly');
    const store = tx.objectStore(STORE_WORK_ORDER_RECORDS);

    const keyBranch = normalizeBranch(branch ?? '');
    if (keyBranch) {
      const key = [keyBranch, orderNumber] as IDBValidKey;
      const found = await store.get(key);
      return !!found;
    }

    // Cross-branch lookup: prefer index (fast), fall back to scan.
    try {
      if (store.indexNames.contains('orderNumber')) {
        const idx = store.index('orderNumber');
        const found = await idx.get(orderNumber as unknown as IDBValidKey);
        return !!found;
      }
    } catch {
      // ignore and fall back to scan
    }

    const all = (await store.getAll()) ?? [];
    return all.some((r: any) => r && r.orderNumber === orderNumber);
  } catch {
    return false;
  }
}

// Equipment cache
export interface EquipmentCache {
  branch: string;
  data: any; // EquipmentPage data
  cachedAt: number;
}

export async function getEquipmentCache(branch: string): Promise<EquipmentCache | null> {
  try {
    const key = normalizeBranch(branch);
    if (!key) return null;
    const db = await getDB();
    const tx = db.transaction(STORE_EQUIPMENT_CACHE, 'readonly');
    const store = tx.objectStore(STORE_EQUIPMENT_CACHE);
    const cached = (await store.get(key)) || null;
    if (cached) {
      return cached;
    }

    // Fallback 1: try original (non-normalized) branch key in the same store
    if (key !== branch) {
      const legacyKeyHit = (await store.get(branch)) || null;
      if (legacyKeyHit) {
        return legacyKeyHit;
      }
    }

    // Fallback 2: try row-wise store `equipmentRecords` if it exists.
    // That store is keyed by { branch, assetNumber }. We reconstruct a single-page
    // EquipmentPage-like payload from all records for the given branch.
    if (db.objectStoreNames.contains(STORE_EQUIPMENT_RECORDS)) {
      try {
        const legacyTx = db.transaction(STORE_EQUIPMENT_RECORDS, 'readonly');
        const legacyStore = legacyTx.objectStore(STORE_EQUIPMENT_RECORDS);
        const allRecords: any[] = (await legacyStore.getAll()) ?? [];
        const branchRecords = allRecords.filter((r) => r && r.branch === key);
        if (branchRecords.length > 0) {
          const pageData = {
            handle: `offline-${key}`,
            pageSize: branchRecords.length,
            recordSize: branchRecords.length,
            pageNumber: 1,
            records: branchRecords,
          };

          const wrapped: EquipmentCache = {
            branch: key,
            data: pageData,
            cachedAt: Date.now(),
          };

          // Persist into the cache store so future lookups are fast
          try {
            const persistTx = db.transaction(STORE_EQUIPMENT_CACHE, 'readwrite');
            const persistStore = persistTx.objectStore(STORE_EQUIPMENT_CACHE);
            await persistStore.put(wrapped);
          } catch {
            // ignore persist errors
          }

          return wrapped;
        }
      } catch {
        // ignore legacy-store errors
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function saveEquipmentCache(branch: string, data: any): Promise<void> {
  try {
    const key = normalizeBranch(branch);
    if (!key || !data) return;
    const db = await getDB();
    const tx = db.transaction(STORE_EQUIPMENT_CACHE, 'readwrite');
    const store = tx.objectStore(STORE_EQUIPMENT_CACHE);
    await store.put({
      branch: key,
      data,
      cachedAt: Date.now(),
    });
  } catch {
    // ignore errors
  }
}

// Persist a full set of equipment rows row-wise for a branch (one object per record)
export async function saveAllEquipmentRows(branch: string, records: any[]): Promise<void> {
  try {
    const key = normalizeBranch(branch);
    if (!key || !records?.length) return;
    const db = await getDB();
    if (!db.objectStoreNames.contains(STORE_EQUIPMENT_RECORDS)) return;
    const tx = db.transaction(STORE_EQUIPMENT_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_EQUIPMENT_RECORDS);
    // For simplicity, clear and repopulate. This keeps the store aligned with backend.
    await store.clear();
    for (const rec of records) {
      await store.put({
        ...rec,
        branch: rec.branch ?? key,
      });
    }
  } catch {
    // ignore errors
  }
}

// Check if an equipment asset exists in the local IndexedDB store for a given branch.
// Returns true only if the row-wise store exists and contains at least one record
// matching the provided (branch, assetNumber) key.
export async function equipmentAssetExists(branch: string, assetNumber: number): Promise<boolean> {
  try {
    const keyBranch = normalizeBranch(branch);
    if (!keyBranch || assetNumber == null) return false;
    const db = await getDB();
    if (!db.objectStoreNames.contains(STORE_EQUIPMENT_RECORDS)) return false;
    const tx = db.transaction(STORE_EQUIPMENT_RECORDS, 'readonly');
    const store = tx.objectStore(STORE_EQUIPMENT_RECORDS);
    const key = [keyBranch, assetNumber] as IDBValidKey;
    const found = await store.get(key);
    return !!found;
  } catch {
    return false;
  }
}
