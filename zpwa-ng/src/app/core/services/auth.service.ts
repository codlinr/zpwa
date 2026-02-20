import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private credentials?: string;

  login(username: string, password: string) {
    this.credentials = btoa(`${username}:${password}`);
  }

  getAuthHeader() {
    return this.credentials ? `Basic ${this.credentials}` : null;
  }

  isAuthenticated() {
    return !!this.credentials;
  }

  logout() {
    this.credentials = undefined;
  }
}
