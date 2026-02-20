import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { EquipmentPage } from './equipment.model';

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  constructor(private http: HttpClient) {}

  list(params: { branch?: string; handle?: string; page?: number }) {
    return this.http.get<EquipmentPage>('/api/equipment/list', {
      params: {
        ...(params.branch && { branch: params.branch }),
        ...(params.handle && { handle: params.handle }),
        page: params.page?.toString() ?? '1',
      },
    });
  }
}
