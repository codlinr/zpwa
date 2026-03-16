import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgIf } from '@angular/common';

import { SystemService } from './core/services/system.service';
import { AuthService } from './core/services/auth.service';
import { OfflineQueueService } from './core/services/offline-queue.service';
import { WorkOrderService } from './features/work-orders/work-order.service';
import { NetworkStateService } from './core/services/network-state.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly system = inject(SystemService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly offlineQueue = inject(OfflineQueueService);
  private readonly workOrders = inject(WorkOrderService);
  protected readonly networkState = inject(NetworkStateService);

  protected readonly title = signal('zpwa-ng');
  protected readonly version = signal<string | null>(null);
  protected readonly backendDown = signal(false);
  protected readonly syncing = signal(false);

  // Auto-sync when coming back online
  protected readonly autoSync = effect(() => {
    if (this.networkState.isOnline() && this.offlineQueue.pendingCount() > 0 && !this.syncing()) {
      // Small delay to ensure network is stable
      setTimeout(() => {
        if (this.networkState.isOnline() && this.offlineQueue.pendingCount() > 0) {
          this.runSync();
        }
      }, 1000);
    }
  });

  ngOnInit() {
    this.system.getSystemState().subscribe({
      next: (state) => {
        this.version.set(state.version);
        this.backendDown.set(false);
        this.networkState.markBackendReachable();
      },
      error: (err) => {
        this.backendDown.set(true);
        if (err.status === 0 || err.status === undefined) {
          // Backend unreachable (stopped, connection refused, etc.)
          this.networkState.markBackendUnreachable();
        }
      },
    });
  }

  isAuthenticated() {
    return this.auth.isAuthenticated();
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  runSync() {
    if (this.offlineQueue.pendingCount() === 0) return;
    this.syncing.set(true);
    this.offlineQueue.sync(this.workOrders).subscribe({
      next: () => this.syncing.set(false),
      error: () => this.syncing.set(false),
    });
  }
}
