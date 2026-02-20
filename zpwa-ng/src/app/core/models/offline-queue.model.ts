import type { WorkOrderRequest } from '../../features/work-orders/work-order.model';

export type OfflineOpType = 'create' | 'status' | 'image';

export interface OfflineOpCreate {
  id: string;
  type: 'create';
  createdAt: number;
  payload: WorkOrderRequest;
}

export interface OfflineOpStatus {
  id: string;
  type: 'status';
  createdAt: number;
  payload: { orderNumber: number; status: string };
}

export interface OfflineOpImage {
  id: string;
  type: 'image';
  createdAt: number;
  payload: { orderNumber: number; fileName: string; base64: string; mimeType?: string };
}

export type OfflineOp = OfflineOpCreate | OfflineOpStatus | OfflineOpImage;

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}
