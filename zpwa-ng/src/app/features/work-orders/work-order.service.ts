// features/work-orders/work-order.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import {
  WorkOrder,
  WorkOrderPage,
  WorkOrderRequest,
} from './work-order.model';

@Injectable({ providedIn: 'root' })
export class WorkOrderService {
  constructor(private http: HttpClient) {}

  list(params: { branch?: string; handle?: string; page?: number }) {
    return this.http.get<WorkOrderPage>('/api/work-orders/list', {
      params: {
        ...(params.branch && { branch: params.branch }),
        ...(params.handle && { handle: params.handle }),
        page: params.page?.toString() ?? '1',
      },
    });
  }

  create(req: WorkOrderRequest) {
    return this.http.post<WorkOrder>('/api/work-orders', req);
  }

  updateStatus(orderNumber: number, status: string) {
    return this.http.patch(`/api/work-orders/status/${orderNumber}`, null, {
      params: { status },
    });
  }

  uploadImage(orderNumber: number, file: File) {
    const formData = new FormData();
    formData.append('imageFile', file);

    return this.http.post(`/api/work-orders/image/${orderNumber}`, formData);
  }
}
