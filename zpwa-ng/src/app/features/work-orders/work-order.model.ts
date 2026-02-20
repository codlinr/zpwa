// features/work-orders/work-order.model.ts
export interface WorkOrder {
    orderNumber: number;
    branch: string;
    assetNumber: number;
    description: string;
    status: string;
    _pending?: boolean; // Flag to mark orders created offline (pending sync)
  }
  
  export interface WorkOrderPage {
    handle: string;
    pageSize: number;
    recordSize: number;
    pageNumber: number;
    records: WorkOrder[];
  }
  
  export interface WorkOrderRequest {
    branch: string;
    assetNumber: number;
    description: string;
  }
  