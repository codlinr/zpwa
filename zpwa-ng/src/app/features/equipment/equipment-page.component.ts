import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe, NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { EquipmentService } from './equipment.service';
import { EquipmentPage } from './equipment.model';
import { AuthService } from '../../core/services/auth.service';
import { NetworkStateService } from '../../core/services/network-state.service';
import { getEquipmentCache, saveEquipmentCache } from '../../core/services/indexeddb.service';

@Component({
  selector: 'app-equipment-page',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, DecimalPipe],
  templateUrl: './equipment-page.component.html',
})
export class EquipmentPageComponent implements OnInit {
  private readonly equipmentService = inject(EquipmentService);
  private readonly auth = inject(AuthService);
  protected readonly networkState = inject(NetworkStateService);

  readonly viewPageSize = 20;

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

  private async loadPage(direction?: 'prev') {
    if (!this.auth.isAuthenticated()) {
      this.error = 'Please sign in to load equipment.';
      return;
    }

    this.loading.set(true);
    this.error = undefined;
    this.showingCachedData.set(false);

    // If offline, try to load from cache first
    if (this.networkState.isOffline()) {
      const cache = await getEquipmentCache(this.branch);
      if (cache && cache.data) {
        this.page.set(cache.data);
        this.handle = cache.data.handle;
        if (direction === 'prev') {
          const last = Math.ceil(cache.data.records.length / this.viewPageSize) - 1;
          this.viewPageIndex.set(Math.max(0, last));
        } else {
          this.viewPageIndex.set(0);
        }
        this.loading.set(false);
        this.showingCachedData.set(true);
        return;
      } else {
        this.loading.set(false);
        this.error = 'No cached data available. Please load equipment while online first.';
        return;
      }
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
          this.page.set(page);
          this.handle = page.handle;
          if (direction === 'prev') {
            const last = Math.ceil(page.records.length / this.viewPageSize) - 1;
            this.viewPageIndex.set(Math.max(0, last));
          } else {
            this.viewPageIndex.set(0);
          }
          // Cache the data for offline use
          await saveEquipmentCache(this.branch, page);
          this.loading.set(false);
          this.showingCachedData.set(false);
        },
        error: async (err) => {
          this.loading.set(false);
          if (err.status === 0 || err.status === undefined) {
            // Network error - try cache as fallback
            const cache = await getEquipmentCache(this.branch);
            if (cache && cache.data) {
              this.page.set(cache.data);
              this.handle = cache.data.handle;
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

