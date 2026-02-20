import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { SystemState } from '../models/system.model';

@Injectable({ providedIn: 'root' })
export class SystemService {
  constructor(private http: HttpClient) {}

  getSystemState() {
    return this.http.get<SystemState>('/api/system/state');
  }
}
