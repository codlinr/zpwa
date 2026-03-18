import { Injectable, signal, computed } from '@angular/core';
import { Observable, of, tap, catchError, map, switchMap } from 'rxjs';

import type { OfflineOp, OfflineOpCreate, SyncResult } from '../models/offline-queue.model';
import type { WorkOrder, WorkOrderRequest } from '../../features/work-orders/work-order.model';
import type { WorkOrderService } from '../../features/work-orders/work-order.service';
import {
  loadFromIndexedDB,
  saveToIndexedDB,
  addToIndexedDB,
  removeFromIndexedDB,
  workOrderExists,
} from './indexeddb.service';

function base64FromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly pending = signal<OfflineOp[]>([]);
  private initialized = false;

  readonly pendingCount = computed(() => this.pending().length);
  readonly pendingOps = computed(() => [...this.pending()]);

  constructor() {
    this.init();
  }

  private async init() {
    if (this.initialized) return;
    this.initialized = true;
    const ops = await loadFromIndexedDB();
    this.pending.set(ops);
  }

  /**
   * Pending work orders from queued create ops (for display at top of list).
   * Use temp negative orderNumber so they can be identified; filter by branch when provided.
   */
  getPendingCreates(branch?: string): WorkOrder[] {
    return this.pending()
      .filter((op: OfflineOp): op is OfflineOpCreate => op.type === 'create')
      .filter((op: OfflineOpCreate) => !branch || op.payload.branch === branch)
      .map((op: OfflineOpCreate) => ({
        // Temporary *positive* ID for display/input.
        // Internally we still store the queued ops with the negative form so sync can map it.
        orderNumber: op.createdAt % 2147483647,
        branch: op.payload.branch,
        assetNumber: op.payload.assetNumber,
        description: op.payload.description,
        status: 'PLANNED',
        _pending: true, // Flag to mark as pending (not yet synced to backend)
      }));
  }

  /**
   * Convert a positive "pending create" temp id back into the internal negative id.
   * This lets the UI accept only positive numbers while still using the negative IDs
   * for sync mapping.
   */
  private resolvePendingTempId(orderNumber: number): number {
    if (orderNumber <= 0) return orderNumber;
    const isPendingTempDisplayId = this.pending().some(
      (op): op is OfflineOpCreate =>
        op.type === 'create' && (op.createdAt % 2147483647) === orderNumber,
    );
    return isPendingTempDisplayId ? -orderNumber : orderNumber;
  }

  private async persist(ops: OfflineOp[]): Promise<void> {
    this.pending.set(ops);
    await saveToIndexedDB(ops);
  }

  async addCreate(payload: WorkOrderRequest): Promise<void> {
    await this.init();
    const op: OfflineOp = {
      id: crypto.randomUUID(),
      type: 'create',
      createdAt: Date.now(),
      payload: {
        branch: payload.branch,
        assetNumber: payload.assetNumber,
        description: payload.description,
      },
    };
    await addToIndexedDB(op);
    this.pending.update((ops) => [...ops, op]);
  }

  async addStatusUpdate(orderNumber: number, status: string): Promise<void> {
    await this.init();
    const resolvedOrderNumber = this.resolvePendingTempId(orderNumber);
    // Allow updates for pending locally-created orders (temporary negative IDs).
    if (resolvedOrderNumber > 0) {
      const exists = await workOrderExists(resolvedOrderNumber);
      if (!exists) {
        throw new Error(`Work order #${resolvedOrderNumber} not found in offline cache`);
      }
    }
    const op: OfflineOp = {
      id: crypto.randomUUID(),
      type: 'status',
      createdAt: Date.now(),
      payload: { orderNumber: resolvedOrderNumber, status },
    };
    await addToIndexedDB(op);
    this.pending.update((ops) => [...ops, op]);
  }

  async addImage(orderNumber: number, file: File): Promise<void> {
    await this.init();
    const resolvedOrderNumber = this.resolvePendingTempId(orderNumber);
    // Allow images for pending locally-created orders (temporary negative IDs).
    if (resolvedOrderNumber > 0) {
      const exists = await workOrderExists(resolvedOrderNumber);
      if (!exists) {
        throw new Error(`Work order #${resolvedOrderNumber} not found in offline cache`);
      }
    }
    const base64 = await base64FromFile(file);
    const op: OfflineOp = {
      id: crypto.randomUUID(),
      type: 'image',
      createdAt: Date.now(),
      payload: {
        orderNumber: resolvedOrderNumber,
        fileName: file.name,
        base64,
        mimeType: file.type || 'image/jpeg',
      },
    };
    await addToIndexedDB(op);
    this.pending.update((ops) => [...ops, op]);
  }

  sync(workOrderService: WorkOrderService): Observable<SyncResult> {
    const ops = [...this.pending()];
    if (ops.length === 0) {
      return of({ synced: 0, failed: 0, errors: [] });
    }

    // Sort operations: creates first, then status/image updates
    // This ensures orders exist before we try to update them
    const sortedOps = [...ops].sort((a, b) => {
      if (a.type === 'create' && b.type !== 'create') return -1;
      if (a.type !== 'create' && b.type === 'create') return 1;
      return a.createdAt - b.createdAt; // Within same type, preserve order
    });

    const result: SyncResult = { synced: 0, failed: 0, errors: [] };
    let remaining = ops;
    // Map temporary negative order numbers to real order numbers
    const tempIdToRealId = new Map<number, number>();

    const getTempId = (op: OfflineOpCreate): number => {
      return -(op.createdAt % 2147483647);
    };

    const getRealOrderNumber = (orderNumber: number): number | null => {
      // If positive, it's already a real order number
      if (orderNumber > 0) return orderNumber;
      // If negative, look up the real ID from the mapping
      return tempIdToRealId.get(orderNumber) ?? null;
    };

    const removeOp = async (op: OfflineOp) => {
      result.synced++;
      remaining = remaining.filter((x) => x.id !== op.id);
      await removeFromIndexedDB(op.id);
      await this.persist(remaining);
      this.pending.set(remaining);
    };

    const processOne = (op: OfflineOp): Observable<void> => {
      switch (op.type) {
        case 'create': {
          return workOrderService.create(op.payload).pipe(
            switchMap(async (createdOrder: WorkOrder) => {
              // Map the temporary ID to the real order number
              const tempId = getTempId(op);
              tempIdToRealId.set(tempId, createdOrder.orderNumber);
              await removeOp(op);
              return undefined;
            }),
            catchError((err) => {
              result.failed++;
              result.errors.push(`Create: ${err?.message ?? 'Failed'}`);
              return of(undefined);
            }),
          );
        }
        case 'status': {
          const realOrderNumber = getRealOrderNumber(op.payload.orderNumber);
          if (realOrderNumber === null) {
            // Order not created yet (or creation failed), skip this status update
            result.failed++;
            result.errors.push(
              `Status #${op.payload.orderNumber}: Order not found (may not be created yet)`,
            );
            // Remove it anyway since we can't process it
            removeOp(op).catch(() => {});
            return of(undefined);
          }
          return workOrderService.updateStatus(realOrderNumber, op.payload.status).pipe(
            switchMap(async () => {
              await removeOp(op);
              return undefined;
            }),
            catchError((err) => {
              result.failed++;
              result.errors.push(`Status #${realOrderNumber}: ${err?.message ?? 'Failed'}`);
              return of(undefined);
            }),
          );
        }
        case 'image': {
          const realOrderNumber = getRealOrderNumber(op.payload.orderNumber);
          if (realOrderNumber === null) {
            // Order not created yet (or creation failed), skip this image upload
            result.failed++;
            result.errors.push(
              `Image #${op.payload.orderNumber}: Order not found (may not be created yet)`,
            );
            // Remove it anyway since we can't process it
            removeOp(op).catch(() => {});
            return of(undefined);
          }
          const mime = op.payload.mimeType ?? 'image/jpeg';
          const blob = this.base64ToBlob(op.payload.base64, mime);
          const file = new File([blob], op.payload.fileName, { type: mime });
          return workOrderService.uploadImage(realOrderNumber, file).pipe(
            switchMap(async () => {
              await removeOp(op);
              return undefined;
            }),
            catchError((err) => {
              result.failed++;
              result.errors.push(`Image #${realOrderNumber}: ${err?.message ?? 'Failed'}`);
              return of(undefined);
            }),
          );
        }
        default:
          return of(undefined);
      }
    };

    return new Observable<SyncResult>((subscriber) => {
      const run = (index: number) => {
        if (index >= sortedOps.length) {
          subscriber.next(result);
          subscriber.complete();
          return;
        }
        processOne(sortedOps[index]!).subscribe({
          next: () => run(index + 1),
          error: (err) => {
            subscriber.error(err);
          },
        });
      };
      run(0);
    });
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }
}
