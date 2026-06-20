import type { Locale, UserRole } from "./domain";

export type AuthUser = {
  id: string;
  phone: string;
  name: string | null;
  locale: Locale;
  roles: UserRole[];
};

export type RequestOtpRequest = {
  phone: string;
};

export type RequestOtpResponse = {
  expiresAt: string;
  devCode?: string;
};

export type VerifyOtpRequest = {
  phone: string;
  code: string;
};

export type VerifyOtpResponse = {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
};

export type SessionResponse = {
  user: AuthUser;
};
