// features/equipment/equipment.model.ts
export interface Equipment {
  assetNumber: number;
  description: string;
  branch: string;
}

export interface EquipmentPage {
  handle: string;
  pageSize: number;
  recordSize: number;
  pageNumber: number;
  records: Equipment[];
}
