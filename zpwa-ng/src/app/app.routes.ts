import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login.component';
import { EquipmentPageComponent } from './features/equipment/equipment-page.component';
import { WorkOrdersPageComponent } from './features/work-orders/work-orders-page.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'equipment', component: EquipmentPageComponent, canActivate: [authGuard] },
  { path: 'work-orders', component: WorkOrdersPageComponent, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
