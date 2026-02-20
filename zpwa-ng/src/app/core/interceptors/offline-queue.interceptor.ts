import { Injectable, inject } from '@angular/core';
import {
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
  HttpErrorResponse,
  HttpEvent,
} from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

import { NetworkStateService } from '../services/network-state.service';
import { OfflineQueueService } from '../services/offline-queue.service';
import type { WorkOrderRequest } from '../../features/work-orders/work-order.model';

function isMutatingRequest(req: HttpRequest<any>): boolean {
  return (
    req.method === 'POST' ||
    req.method === 'PUT' ||
    req.method === 'PATCH' ||
    req.method === 'DELETE'
  );
}

function isWorkOrderEndpoint(req: HttpRequest<any>): boolean {
  return req.url.includes('/api/work-orders');
}

@Injectable()
export class OfflineQueueInterceptor implements HttpInterceptor {
  private readonly networkState = inject(NetworkStateService);
  private readonly offlineQueue = inject(OfflineQueueService);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!isMutatingRequest(req) || !isWorkOrderEndpoint(req)) {
      return next.handle(req).pipe(
        tap((ev) => {
          if (ev instanceof HttpResponse) {
            this.networkState.markBackendReachable();
          }
        }),
        catchError((err) => {
          if (err instanceof HttpErrorResponse && (err.status === 0 || err.status === undefined)) {
            // Status 0 = backend unreachable (connection refused, network error, etc.)
            this.networkState.markBackendUnreachable();
          }
          return throwError(() => err);
        }),
      );
    }

    // For mutating requests: Always try to send them first (don't check isOffline here)
    // This allows us to detect when backend comes back online
    // The component already checks isOffline() for UI purposes and queues directly if offline
    // But if component thinks it's online, we should try the request to verify backend is actually reachable
    return next.handle(req).pipe(
      tap((ev) => {
        if (ev instanceof HttpResponse) {
          // Success - backend is reachable
          this.networkState.markBackendReachable();
        }
      }),
      catchError((err) => {
        if (err instanceof HttpErrorResponse && (err.status === 0 || err.status === undefined)) {
          // Status 0 = backend unreachable (connection refused, network error, etc.)
          this.networkState.markBackendUnreachable();
          // Queue the request for later sync
          return this.queueRequest(req);
        }
        // For other errors (500, 400, etc.), don't queue here - let component handle it
        // Component will queue on non-401 errors if needed
        return throwError(() => err);
      }),
    );
  }

  private queueRequest(req: HttpRequest<any>): Observable<HttpEvent<any>> {
    const url = req.url;
    const method = req.method;

    if (method === 'POST' && url === '/api/work-orders') {
      const payload = req.body as WorkOrderRequest;
      // Fire-and-forget async call
      this.offlineQueue.addCreate(payload).catch(() => {
        // Silently handle errors
      });
      return of(new HttpResponse({ status: 202, body: { queued: true } }));
    }

    if (method === 'PATCH' && url.match(/^\/api\/work-orders\/status\/(\d+)$/)) {
      const match = url.match(/^\/api\/work-orders\/status\/(\d+)$/);
      const orderNumber = parseInt(match![1]!, 10);
      const status = req.params.get('status') || '';
      // Fire-and-forget async call
      this.offlineQueue.addStatusUpdate(orderNumber, status).catch(() => {
        // Silently handle errors
      });
      return of(new HttpResponse({ status: 202, body: { queued: true } }));
    }

    if (method === 'POST' && url.match(/^\/api\/work-orders\/image\/(\d+)$/)) {
      const match = url.match(/^\/api\/work-orders\/image\/(\d+)$/);
      const orderNumber = parseInt(match![1]!, 10);
      const formData = req.body as FormData;
      const file = formData.get('imageFile') as File;
      if (file) {
        // Fire-and-forget async call
        this.offlineQueue.addImage(orderNumber, file).catch(() => {
          // Silently handle errors
        });
      }
      return of(new HttpResponse({ status: 202, body: { queued: true } }));
    }

    return throwError(() => new Error('Cannot queue this request type'));
  }
}
