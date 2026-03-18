import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { EquipmentService } from './equipment.service';
import { Equipment, EquipmentPage } from './equipment.model';
import { AuthService } from '../../core/services/auth.service';
import { NetworkStateService } from '../../core/services/network-state.service';
import {
  getEquipmentCache,
  saveEquipmentCache,
  saveAllEquipmentRows,
} from '../../core/services/indexeddb.service';

@Component({
  selector: 'app-equipment-page',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
  templateUrl: './equipment-page.component.html',
})
export class EquipmentPageComponent implements OnInit, OnDestroy {
  private readonly equipmentService = inject(EquipmentService);
  private readonly auth = inject(AuthService);
  protected readonly networkState = inject(NetworkStateService);

  readonly viewPageSize = 20;
  private destroyed = false;

  branch = 'NZ01';
  pageNumber = 1;
  handle?: string;
  loading = signal(false);
  error?: string;
  page = signal<EquipmentPage | undefined>(undefined);
  viewPageIndex = signal(0);
  showingCachedData = signal(false);

  ngOnInit() {
    if (!this.auth.isAuthenticated()) {
      this.error = 'Please sign in to load equipment.';
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    // Persist current page to IndexedDB when navigating away so it's available when returning offline
    const p = this.page();
    if (p && Array.isArray(p.records)) {
      saveEquipmentCache(this.branch, p).catch((err) => {
        console.error('[Equipment] Failed to persist cache on destroy:', err);
      });
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

  getDisplayedRecords(): EquipmentPage['records'] {
    const p = this.page();
    if (!p) return [];
    const start = this.viewPageIndex() * this.viewPageSize;
    return p.records.slice(start, start + this.viewPageSize);
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

  private async prefetchAllEquipmentForBranch(initialPage: EquipmentPage) {
    const branch = this.branch;
    // Start with the records we already have
    const allRecords: Equipment[] = [...initialPage.records];
    let handle = initialPage.handle;
    const pageSize = initialPage.pageSize;
    let currentPage = initialPage.pageNumber;
    const total = initialPage.recordSize;

    // Fetch subsequent pages until we've retrieved all records (or the API stops returning data)
    while (allRecords.length < total) {
      // Stop prefetching if the component was destroyed (user navigated away)
      if (this.destroyed) return;
      const nextPage = currentPage + 1;
      try {
        const next = await firstValueFrom(
          this.equipmentService.list({
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

    await saveAllEquipmentRows(branch, allRecords);
  }

  private async loadPage(direction?: 'prev') {
    if (!this.auth.isAuthenticated()) {
      this.error = 'Please sign in to load equipment.';
      return;
    }

    this.loading.set(true);
    this.error = undefined;
    this.showingCachedData.set(false);

    // If offline, try to load from cache first (or use in-memory data if cache lookup fails)
    if (this.networkState.isOffline()) {
      const cache = await getEquipmentCache(this.branch);
      const source = cache?.data ?? this.page();
      if (source && Array.isArray(source.records)) {
        this.page.set(source);
        this.handle = source.handle;
        if (direction === 'prev') {
          const last = Math.ceil(source.records.length / this.viewPageSize) - 1;
          this.viewPageIndex.set(Math.max(0, last));
        } else {
          this.viewPageIndex.set(0);
        }
        this.loading.set(false);
        this.showingCachedData.set(true);
        return;
      }
      this.loading.set(false);
      this.error = 'No cached data available. Please load equipment while online first.';
      return;
    }

    // Online: fetch from backend and cache it
    this.equipmentService
      .list({
        branch: this.handle ? undefined : this.branch,
        handle: this.handle,
        page: this.pageNumber,
      })
      .subscribe({
        next: async (page) => {
          // Save first page to cache so it's available before UI updates (avoids race when toggling offline)
          await saveEquipmentCache(this.branch, page);
          this.page.set(page);
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
            this.prefetchAllEquipmentForBranch(page).catch((err) => {
              console.error('[Equipment] Background prefetch failed:', err);
            });
          }
        },
        error: async (err) => {
          this.loading.set(false);
          if (err.status === 0 || err.status === undefined) {
            // Network error - try cache or in-memory as fallback
            const cache = await getEquipmentCache(this.branch);
            const source = cache?.data ?? this.page();
            if (source && Array.isArray(source.records)) {
              this.page.set(source);
              this.handle = source.handle;
              this.viewPageIndex.set(0);
              this.showingCachedData.set(true);
            } else {
              this.error = 'Backend is unreachable and no cached data available.';
            }
          } else if (err.status === 400 || err.status === 404) {
            this.error = 'Unable to load equipment page. Try starting again from page 1.';
          } else if (err.status === 401) {
            this.error = 'Authentication failed. Please sign in again.';
          } else {
            this.error = 'Unexpected error while loading equipment.';
          }
        },
      });
  }
}
