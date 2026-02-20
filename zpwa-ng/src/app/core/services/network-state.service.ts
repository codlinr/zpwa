import { Injectable, signal, computed } from '@angular/core';

/**
 * Tracks backend connectivity state (not WiFi/network).
 * Marks offline when backend HTTP requests fail (status 0 = backend unreachable).
 * Marks online when backend HTTP requests succeed.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStateService {
  // Start assuming backend is online (will be updated by HTTP interceptor)
  private readonly backendReachable = signal(true);
  private readonly forceOffline = signal(false);

  readonly isOnline = computed(() => !this.forceOffline() && this.backendReachable());
  readonly isOffline = computed(() => !this.isOnline());

  /**
   * Manually toggle offline mode (for testing/debugging).
   */
  setForceOffline(value: boolean) {
    this.forceOffline.set(value);
  }

  /**
   * Called by HTTP interceptor when backend request fails (status 0 = backend unreachable).
   */
  markBackendUnreachable() {
    this.backendReachable.set(false);
  }

  /**
   * Called by HTTP interceptor when backend request succeeds.
   */
  markBackendReachable() {
    if (!this.forceOffline()) {
      this.backendReachable.set(true);
    }
  }
}
