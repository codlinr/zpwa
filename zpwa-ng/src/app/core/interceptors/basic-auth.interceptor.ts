// core/interceptors/basic-auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';

import { AuthService } from '../services/auth.service';

@Injectable()
export class BasicAuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const authHeader = this.auth.getAuthHeader();

    if (!authHeader) return next.handle(req);

    const authReq = req.clone({
      setHeaders: { Authorization: authHeader },
    });

    return next.handle(authReq);
  }
}
