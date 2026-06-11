import { http } from './http';
import { API_PATHS } from '../constants/api';
import type { AuthUser, LoginRequest, LoginResponse } from '../types/auth.types';

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await http.post<LoginResponse>(API_PATHS.login, data);
    return res.data;
  },

  me: async (): Promise<AuthUser> => {
    const res = await http.get<AuthUser>(API_PATHS.me);
    return res.data;
  },
};
