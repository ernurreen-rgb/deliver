import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTH_REDIRECT_PATH,
  buildLoginPath,
  sanitizeAuthRedirectPath,
} from "./redirects";

describe("auth redirects", () => {
  it("allows only local application paths", () => {
    expect(sanitizeAuthRedirectPath("/orders/A-20260618-ABC123")).toBe(
      "/orders/A-20260618-ABC123",
    );
    expect(sanitizeAuthRedirectPath("/operator?scope=active#queue")).toBe(
      "/operator?scope=active#queue",
    );
  });

  it("rejects external, protocol-relative, backslash and login paths", () => {
    expect(sanitizeAuthRedirectPath("https://example.com/orders")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    expect(sanitizeAuthRedirectPath("//example.com/orders")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    expect(sanitizeAuthRedirectPath("/\\example.com")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    expect(sanitizeAuthRedirectPath("/login?next=/operator")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
  });

  it("preserves next only when it is not the default account path", () => {
    expect(
      buildLoginPath({
        error: "bad_code",
        nextPath: "/orders/A-20260618-ABC123",
        phone: "+77000000002",
        sent: true,
      }),
    ).toBe(
      "/login?phone=%2B77000000002&sent=1&error=bad_code&next=%2Forders%2FA-20260618-ABC123",
    );

    expect(buildLoginPath({ nextPath: DEFAULT_AUTH_REDIRECT_PATH })).toBe(
      "/login",
    );
  });
});
