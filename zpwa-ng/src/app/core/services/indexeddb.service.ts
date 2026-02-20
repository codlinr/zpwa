import { openDB, type IDBPDatabase } from 'idb';
import type { OfflineOp } from '../models/offline-queue.model';

const DB_NAME = 'zpwa-offline-db';
const DB_VERSION = 2; // Incremented for new stores
const STORE_QUEUE = 'queue';
const STORE_WORK_ORDERS_CACHE = 'workOrdersCache';
const STORE_EQUIPMENT_CACHE = 'equipmentCache';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
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

export async function getWorkOrdersCache(branch: string): Promise<WorkOrdersCache | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_WORK_ORDERS_CACHE, 'readonly');
    const store = tx.objectStore(STORE_WORK_ORDERS_CACHE);
    return (await store.get(branch)) || null;
  } catch {
    return null;
  }
}

export async function saveWorkOrdersCache(branch: string, data: any): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_WORK_ORDERS_CACHE, 'readwrite');
    const store = tx.objectStore(STORE_WORK_ORDERS_CACHE);
    await store.put({
      branch,
      data,
      cachedAt: Date.now(),
    });
  } catch {
    // ignore errors
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
    const db = await getDB();
    const tx = db.transaction(STORE_EQUIPMENT_CACHE, 'readonly');
    const store = tx.objectStore(STORE_EQUIPMENT_CACHE);
    return (await store.get(branch)) || null;
  } catch {
    return null;
  }
}

export async function saveEquipmentCache(branch: string, data: any): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_EQUIPMENT_CACHE, 'readwrite');
    const store = tx.objectStore(STORE_EQUIPMENT_CACHE);
    await store.put({
      branch,
      data,
      cachedAt: Date.now(),
    });
  } catch {
    // ignore errors
  }
}
