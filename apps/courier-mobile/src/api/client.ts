import type { ApiResult } from "@deliver/contracts";
import type {
  RequestOtpResponse,
  SessionResponse,
  VerifyOtpResponse,
} from "@deliver/contracts/auth";
import type {
  CourierDashboardResponse,
  CourierDeliveryActionRequest,
  CourierMutationResponse,
  CourierOfferActionRequest,
} from "@deliver/contracts/courier";
import { API_BASE_URL } from "./config";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly reason?: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function readResult<T>(response: Response): Promise<T> {
  let result: ApiResult<T>;

  try {
    result = (await response.json()) as ApiResult<T>;
  } catch {
    throw new ApiClientError(
      "Сервер вернул некорректный ответ.",
      response.status,
      "invalid_response",
    );
  }

  if (!response.ok || !result.ok) {
    if (result.ok) {
      throw new ApiClientError(
        "Сервер отклонил запрос.",
        response.status,
        "http_error",
      );
    }

    throw new ApiClientError(
      result.error.message,
      response.status,
      result.error.code,
      result.error.reason,
      result.error.fieldErrors,
    );
  }

  return result.data;
}

async function request<T>(
  path: string,
  input: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    token?: string | null;
    body?: unknown;
  } = {},
) {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (input.body !== undefined) headers["Content-Type"] = "application/json";
  if (input.token) headers.Authorization = `Bearer ${input.token}`;

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch {
    throw new ApiClientError(
      `Не удалось подключиться к ${API_BASE_URL}.`,
      0,
      "network_error",
    );
  }

  return readResult<T>(response);
}

export const courierApi = {
  requestOtp(phone: string) {
    return request<RequestOtpResponse>("/auth/otp/request", {
      method: "POST",
      body: { phone },
    });
  },
  verifyOtp(phone: string, code: string) {
    return request<VerifyOtpResponse>("/auth/otp/verify", {
      method: "POST",
      body: { phone, code },
    });
  },
  getSession(token: string) {
    return request<SessionResponse>("/auth/session", { token });
  },
  logout(token: string) {
    return request<{ loggedOut: boolean }>("/auth/session", {
      method: "DELETE",
      token,
    });
  },
  getDashboard(token: string) {
    return request<CourierDashboardResponse>("/courier/dashboard", { token });
  },
  setAvailability(token: string, online: boolean) {
    return request<CourierMutationResponse>("/courier/availability", {
      method: "PATCH",
      token,
      body: { online },
    });
  },
  actOnOffer(
    token: string,
    offerId: string,
    action: CourierOfferActionRequest["action"],
  ) {
    return request<CourierMutationResponse>(
      `/courier/offers/${encodeURIComponent(offerId)}`,
      { method: "POST", token, body: { action } },
    );
  },
  actOnDelivery(
    token: string,
    deliveryId: string,
    action: CourierDeliveryActionRequest,
  ) {
    return request<CourierMutationResponse>(
      `/courier/deliveries/${encodeURIComponent(deliveryId)}`,
      { method: "POST", token, body: action },
    );
  },
};
