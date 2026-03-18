import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { DecimalPipe, NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { WorkOrderService } from './work-order.service';
import { WorkOrder, WorkOrderPage, WorkOrderRequest } from './work-order.model';
import { AuthService } from '../../core/services/auth.service';
import { OfflineQueueService } from '../../core/services/offline-queue.service';
import { NetworkStateService } from '../../core/services/network-state.service';
import {
  getWorkOrdersCache,
  saveWorkOrdersCache,
  saveAllWorkOrderRows,
  equipmentAssetExists,
} from '../../core/services/indexeddb.service';

@Component({
  selector: 'app-work-orders-page',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, DecimalPipe],
  templateUrl: './work-orders-page.component.html',
})
export class WorkOrdersPageComponent implements OnInit, OnDestroy {
  private readonly workOrders = inject(WorkOrderService);
  private readonly auth = inject(AuthService);
  protected readonly offlineQueue = inject(OfflineQueueService);
  protected readonly networkState = inject(NetworkStateService);

  readonly viewPageSize = 20;

  branch = 'NZ01';
  pageNumber = 1;
  handle?: string;
  page = signal<WorkOrderPage | undefined>(undefined);
  viewPageIndex = signal(0);
  loading = signal(false);
  error?: string;
  syncMessage?: string;
  showingCachedData = signal(false);

  syncing = signal(false);
  creating = signal(false);

  // Track newly created orders (created in current session, not yet in backend list)
  private readonly newlyCreatedOrders = signal<WorkOrder[]>([]);

  // create work order
  newDescription = '';
  newAssetNumber?: number;

  // offline post-create update helpers (separate UI)
  offlineUpdateOrderNumber?: number;
  offlineUpdateStatus = 'PLANNED';

  // simple status update
  statuses = [
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'ON_HOLD', label: 'On hold' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  normalizeStatusValue(status?: string): string {
    const raw = (status ?? '').toString().trim();
    if (!raw) return 'PLANNED';
    const upper = raw.toUpperCase();
    const allowed = new Set(this.statuses.map((s) => s.value));
    return allowed.has(upper) ? upper : 'PLANNED';
  }

  statusLabel(status?: string): string {
    const normalized = this.normalizeStatusValue(status);
    return this.statuses.find((s) => s.value === normalized)?.label ?? normalized;
  }

  ngOnInit() {
    if (!this.auth.isAuthenticated()) {
      this.error = 'Please sign in to work with work orders.';
    }
  }

  ngOnDestroy() {
    // Persist current page to IndexedDB when navigating away so it's available when returning offline
    const p = this.page();
    if (p && Array.isArray(p.records)) {
      saveWorkOrdersCache(this.branch, p).catch(() => {});
    }
  }

  async loadFirstPage() {
    this.handle = undefined;
    this.pageNumber = 1;
    this.viewPageIndex.set(0);
    await this.loadPage();
  }

  async nextPage() {
    const p = this.page();
    if (!p) return;
    const start = (this.viewPageIndex() + 1) * this.viewPageSize;
    if (start < p.records.length) {
      this.viewPageIndex.update((i) => i + 1);
      return;
    }
    this.pageNumber++;
    this.viewPageIndex.set(0);
    await this.loadPage();
  }

  async previousPage() {
    if (this.viewPageIndex() > 0) {
      this.viewPageIndex.update((i) => i - 1);
      return;
    }
    if (this.pageNumber === 1) return;
    this.pageNumber--;
    await this.loadPage('prev');
  }

  getDisplayedRecords(): WorkOrder[] {
    const p = this.page();
    if (!p) return [];
    const start = this.viewPageIndex() * this.viewPageSize;
    return p.records.slice(start, start + this.viewPageSize);
  }

  getPendingCreatedOrders(): WorkOrder[] {
    return this.offlineQueue.getPendingCreates(this.branch);
  }

  getDisplayedRecordsWithPending(): WorkOrder[] {
    // Show in this order: 1) Pending offline orders, 2) Newly created orders, 3) Regular paginated records
    return [
      ...this.getPendingCreatedOrders(),
      ...this.newlyCreatedOrders(),
      ...this.getDisplayedRecords(),
    ];
  }

  hasListContent(): boolean {
    return (
      !!this.page() ||
      this.getPendingCreatedOrders().length > 0 ||
      this.newlyCreatedOrders().length > 0
    );
  }

  isPendingOrder(order: WorkOrder): boolean {
    // Pending orders are marked with _pending flag (created offline, not yet synced)
    return order._pending === true;
  }

  isRegularOrder(order: WorkOrder): boolean {
    // Regular orders from backend don't have the _pending flag
    return !order._pending;
  }

  getTotalViewPages(): number {
    const p = this.page();
    return p ? Math.ceil(p.recordSize / this.viewPageSize) : 0;
  }

  getCurrentViewPage(): number {
    const p = this.page();
    if (!p) return 0;
    const pagesPerServerPage = Math.ceil(p.pageSize / this.viewPageSize);
    return (this.pageNumber - 1) * pagesPerServerPage + this.viewPageIndex() + 1;
  }

  private async prefetchAllWorkOrdersForBranch(initialPage: WorkOrderPage) {
    const branch = this.branch;
    // Start with the records we already have
    const allRecords: WorkOrder[] = [...initialPage.records];
    let handle = initialPage.handle;
    const pageSize = initialPage.pageSize;
    let currentPage = initialPage.pageNumber;
    const total = initialPage.recordSize;

    // Fetch subsequent pages until we've retrieved all records (or the API stops returning data)
    while (allRecords.length < total) {
      const nextPage = currentPage + 1;
      try {
        const next = await firstValueFrom(
          this.workOrders.list({
            branch: undefined,
            handle,
            page: nextPage,
          }),
        );
        if (!next.records.length) break;
        allRecords.push(...next.records);
        handle = next.handle;
        currentPage = next.pageNumber;
        if (next.records.length < pageSize) {
          // Last page (fewer than pageSize records)
          break;
        }
      } catch {
        // Stop prefetching on any error; we still have a partial set cached
        break;
      }
    }

    await saveAllWorkOrderRows(branch, allRecords);
  }

  private async loadPage(direction?: 'prev') {
    if (!this.auth.isAuthenticated()) {
      this.error = 'Please sign in to work with work orders.';
      return;
    }

    this.loading.set(true);
    this.error = undefined;
    this.showingCachedData.set(false);

    // If offline, try to load from cache first (or use in-memory data if cache lookup fails)
    if (this.networkState.isOffline()) {
      const cache = await getWorkOrdersCache(this.branch);
      const source = cache?.data ?? this.page();
      if (source && Array.isArray(source.records)) {
        // Apply any pending status updates to the records
        const updatedRecords = this.applyPendingStatusUpdates(source.records).map((o) => ({
          ...o,
          status: this.normalizeStatusValue(o.status),
        }));
        const cachedPage: WorkOrderPage = {
          ...source,
          records: updatedRecords,
        };
        this.page.set(cachedPage);
        this.handle = cachedPage.handle;
        if (direction === 'prev') {
          const last = Math.ceil(cachedPage.records.length / this.viewPageSize) - 1;
          this.viewPageIndex.set(Math.max(0, last));
        } else {
          this.viewPageIndex.set(0);
        }
        this.loading.set(false);
        this.showingCachedData.set(true);
        this.syncMessage = cache
          ? 'Showing cached data (offline mode).'
          : 'Showing in-memory data (offline mode). Load list while online to cache for offline.';
        return;
      }
      this.loading.set(false);
      this.error = 'No cached data available. Please load work orders while online first.';
      return;
    }

    // Online: fetch from backend and cache it
    this.workOrders
      .list({
        branch: this.handle ? undefined : this.branch,
        handle: this.handle,
        page: this.pageNumber,
      })
      .subscribe({
        next: async (page) => {
          // Save first page to cache so it's available before UI updates (avoids race when toggling offline)
          const normalizedPage: WorkOrderPage = {
            ...page,
            records: page.records.map((o) => ({ ...o, status: this.normalizeStatusValue(o.status) })),
          };
          await saveWorkOrdersCache(this.branch, normalizedPage);
          this.page.set(normalizedPage);
          this.handle = page.handle;
          if (direction === 'prev') {
            const last = Math.ceil(page.records.length / this.viewPageSize) - 1;
            this.viewPageIndex.set(Math.max(0, last));
          } else {
            this.viewPageIndex.set(0);
          }
          this.loading.set(false);
          this.showingCachedData.set(false);

          // In the background, prefetch all pages for this branch and store them row-wise in IndexedDB.
          // This ensures offline mode has the full dataset, not just the first page.
          if (!this.handle || this.pageNumber === 1) {
            this.prefetchAllWorkOrdersForBranch(normalizedPage).catch(() => {});
          }
        },
        error: (err) => {
          this.loading.set(false);
          if (err.status === 0 || err.status === undefined) {
            // Network error - try cache as fallback
            this.loadFromCacheFallback(direction);
          } else if (err.status === 400 || err.status === 404) {
            this.error = 'Unable to load work orders. Try starting again from page 1.';
          } else if (err.status === 401) {
            this.error = 'Authentication failed. Please sign in again.';
          } else {
            this.error = 'Unexpected error while loading work orders.';
          }
        },
      });
  }

  private async loadFromCacheFallback(direction?: 'prev') {
    const cache = await getWorkOrdersCache(this.branch);
    const source = cache?.data ?? this.page();
    if (source && Array.isArray(source.records)) {
      const updatedRecords = this.applyPendingStatusUpdates(source.records).map((o) => ({
        ...o,
        status: this.normalizeStatusValue(o.status),
      }));
      const cachedPage: WorkOrderPage = {
        ...source,
        records: updatedRecords,
      };
      this.page.set(cachedPage);
      this.handle = cachedPage.handle;
      if (direction === 'prev') {
        const last = Math.ceil(cachedPage.records.length / this.viewPageSize) - 1;
        this.viewPageIndex.set(Math.max(0, last));
      } else {
        this.viewPageIndex.set(0);
      }
      this.showingCachedData.set(true);
      this.syncMessage = cache
        ? 'Showing cached data (backend unreachable).'
        : 'Showing in-memory data (backend unreachable).';
    } else {
      this.error = 'Backend is unreachable and no cached data available.';
    }
  }

  private applyPendingStatusUpdates(records: WorkOrder[]): WorkOrder[] {
    // Get all pending status updates from the queue
    const pendingStatusOps = this.offlineQueue
      .pendingOps()
      .filter((op) => op.type === 'status') as Array<{
      payload: { orderNumber: number; status: string };
    }>;

    // Create a map of orderNumber -> new status
    const statusMap = new Map<number, string>();
    pendingStatusOps.forEach((op) => {
      statusMap.set(op.payload.orderNumber, op.payload.status);
    });

    // Apply status updates to records
    return records.map((order) => {
      const newStatus = statusMap.get(order.orderNumber);
      if (newStatus) {
        return { ...order, status: this.normalizeStatusValue(newStatus) };
      }
      return { ...order, status: this.normalizeStatusValue(order.status) };
    });
  }

  private async updateCacheWithStatusChange(orderNumber: number, status: string) {
    const cache = await getWorkOrdersCache(this.branch);
    if (cache && cache.data) {
      const updatedRecords = cache.data.records.map((wo: WorkOrder) =>
        wo.orderNumber === orderNumber ? { ...wo, status } : wo,
      );
      await saveWorkOrdersCache(this.branch, {
        ...cache.data,
        records: updatedRecords,
      });
    }
  }

  async createWorkOrder() {
    if (!this.branch || !this.newDescription || !this.newAssetNumber) return;

    // Validate asset number against local equipment records in IndexedDB
    const isValidAsset = await equipmentAssetExists(this.branch, this.newAssetNumber);
    if (!isValidAsset) {
      this.error =
        'Asset number is invalid. Please load equipment for this branch and use an existing asset.';
      this.syncMessage = undefined;
      return;
    }

    const req: WorkOrderRequest = {
      branch: this.branch,
      assetNumber: this.newAssetNumber,
      description: this.newDescription,
    };

    if (this.networkState.isOffline()) {
      // Backend already known to be down – queue immediately
      this.offlineQueue
        .addCreate(req)
        .then(() => {
          this.newDescription = '';
          this.newAssetNumber = undefined;
          this.syncMessage = 'Order queued for sync.';
          this.error = undefined;
        })
        .catch(() => {
          this.error = 'Backend is unreachable and order could not be queued locally.';
        });
      return;
    }

    this.creating.set(true);
    const loaderMinMs = 2000;
    const startedAt = Date.now();

    const clearLoader = () => {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, loaderMinMs - elapsed);
      setTimeout(() => this.creating.set(false), wait);
    };

    this.workOrders.create(req).subscribe({
      next: (created: WorkOrder) => {
        this.newDescription = '';
        this.newAssetNumber = undefined;

        // Add to newly created orders list (always visible at top, before pagination)
        this.newlyCreatedOrders.update((orders) => [created, ...orders]);

        // Also add to current page's records if page exists (for cache consistency)
        const currentPage = this.page();
        if (currentPage) {
          // Insert at the beginning of records (newest first for visibility)
          const updatedRecords = [created, ...currentPage.records];
          const updatedPage: WorkOrderPage = {
            ...currentPage,
            records: updatedRecords,
            recordSize: currentPage.recordSize + 1, // Increment total count
          };
          this.page.set(updatedPage);
          // Update cache with the new order
          saveWorkOrdersCache(this.branch, updatedPage).catch(() => {});
        }

        // Reset to first view page to show the new order
        this.viewPageIndex.set(0);

        this.syncMessage = `Order #${created.orderNumber} created successfully.`;
        this.error = undefined;
        clearLoader();

        // Clear success message after 5 seconds
        setTimeout(() => {
          if (this.syncMessage?.includes('created successfully')) {
            this.syncMessage = undefined;
          }
        }, 5000);
      },
      error: (err) => {
        if (err.status === 401) {
          this.error = 'Authentication failed. Please sign in again.';
          clearLoader();
          return;
        }

        // Treat any non-auth failure (500, network issues, backend stopped, etc.)
        // as an offline scenario: queue the order locally so it can be synced later.
        this.offlineQueue
          .addCreate(req)
          .then(() => {
            this.newDescription = '';
            this.newAssetNumber = undefined;
            this.syncMessage = 'Order queued for sync.';
            this.error = undefined;
          })
          .catch(() => {
            this.error = 'Backend is unreachable and order could not be queued locally.';
          })
          .finally(() => {
            clearLoader();
          });
      },
    });
  }

  async changeStatus(order: WorkOrder, status: string) {
    if (this.isPendingOrder(order)) return;

    if (this.networkState.isOffline()) {
      try {
        await this.offlineQueue.addStatusUpdate(order.orderNumber, status);
        const current = this.page();
        if (current) {
          const updatedPage = {
            ...current,
            records: current.records.map((wo) =>
              wo.orderNumber === order.orderNumber ? { ...wo, status } : wo,
            ),
          };
          this.page.set(updatedPage);
          // Update cache with the new status
          await this.updateCacheWithStatusChange(order.orderNumber, status);
        }
        this.syncMessage = 'Status change queued for sync.';
        this.error = undefined;
      } catch {
        this.error = 'Failed to queue status change locally.';
      }
      return;
    }

    this.workOrders.updateStatus(order.orderNumber, status).subscribe({
      next: async () => {
        const current = this.page();
        if (current) {
          const updatedPage = {
            ...current,
            records: current.records.map((wo) =>
              wo.orderNumber === order.orderNumber ? { ...wo, status } : wo,
            ),
          };
          this.page.set(updatedPage);
          // Update cache with the new status
          await this.updateCacheWithStatusChange(order.orderNumber, status);
        }
      },
      error: (err) => {
        if (err.status === 401) {
          this.error = 'Authentication failed. Please sign in again.';
          return;
        }

        // On any other failure, fall back to local queue and update UI immediately
        this.offlineQueue
          .addStatusUpdate(order.orderNumber, status)
          .then(async () => {
            const current = this.page();
            if (current) {
              const updatedPage = {
                ...current,
                records: current.records.map((wo) =>
                  wo.orderNumber === order.orderNumber ? { ...wo, status } : wo,
                ),
              };
              this.page.set(updatedPage);
              // Update cache with the new status
              await this.updateCacheWithStatusChange(order.orderNumber, status);
            }
            this.syncMessage = 'Status change queued for sync.';
            this.error = undefined;
          })
          .catch(() => {
            this.error = 'Backend is unreachable and status change could not be queued locally.';
          });
      },
    });
  }

  uploadImage(order: WorkOrder, event: Event) {
    if (this.isPendingOrder(order)) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const queuePhoto = () =>
      this.offlineQueue
        .addImage(order.orderNumber, file)
        .then(() => {
          this.syncMessage = 'Photo queued for sync.';
          this.error = undefined;
        })
        .catch(() => {
          this.error = 'Backend is unreachable and photo could not be queued locally.';
        });

    if (this.networkState.isOffline()) {
      queuePhoto();
      input.value = '';
      return;
    }

    this.workOrders.uploadImage(order.orderNumber, file).subscribe({
      next: () => {
        // Photo uploaded successfully - clear the input
        input.value = '';
        this.syncMessage = 'Photo uploaded successfully.';
        this.error = undefined;
      },
      error: (err) => {
        if (err.status === 401) {
          this.error = 'Authentication failed. Please sign in again.';
          input.value = '';
          return;
        }

        // On any other failure, queue the photo locally
        queuePhoto();
        input.value = '';
      },
    });
  }

  async queueOfflineStatusUpdate() {
    const orderNumber = this.offlineUpdateOrderNumber;
    const status = this.offlineUpdateStatus;
    if (!orderNumber || !status) return;

    try {
      await this.offlineQueue.addStatusUpdate(orderNumber, status);
      this.syncMessage = `Status update for #${orderNumber} queued for sync.`;
      this.error = undefined;
    } catch {
      this.error = 'Failed to queue status update locally.';
    }
  }

  queueOfflineImageUpdate(event: Event) {
    const orderNumber = this.offlineUpdateOrderNumber;
    if (!orderNumber) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.offlineQueue
      .addImage(orderNumber, file)
      .then(() => {
        this.syncMessage = `Photo for #${orderNumber} queued for sync.`;
        this.error = undefined;
      })
      .catch(() => {
        this.error = 'Failed to queue photo locally.';
      });

    input.value = '';
  }

  runSync() {
    if (this.offlineQueue.pendingCount() === 0) return;
    this.syncing.set(true);
    this.syncMessage = undefined;
    this.error = undefined;
    this.offlineQueue.sync(this.workOrders).subscribe({
      next: async (res) => {
        this.syncing.set(false);
        if (res.failed > 0) {
          this.syncMessage = `Synced ${res.synced}; ${res.failed} failed.`;
          this.error = res.errors.slice(0, 3).join(' ');
        } else {
          this.syncMessage = `Synced ${res.synced} item(s).`;
        }
        // Refresh the list to get updated data from backend and update cache
        if (res.synced > 0) {
          await this.loadFirstPage();
        }
      },
      error: () => {
        this.syncing.set(false);
        this.error = 'Sync failed.';
      },
    });
  }
}
