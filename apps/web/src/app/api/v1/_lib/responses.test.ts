import { describe, expect, it } from "vitest";
import { jsonError, jsonOk, readJsonObject } from "./responses";

describe("customer API response helpers", () => {
  it("returns a no-store success envelope", async () => {
    const response = jsonOk({ value: 42 });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { value: 42 },
    });
  });

  it("returns a typed failure envelope", async () => {
    const response = jsonError({
      status: 409,
      code: "conflict",
      message: "The cash order cannot be created.",
      reason: "checkout_request_conflict",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "conflict",
        message: "The cash order cannot be created.",
        reason: "checkout_request_conflict",
      },
    });
  });

  it("accepts only a JSON object request body", async () => {
    const objectRequest = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ phone: "+77000000002" }),
      headers: { "Content-Type": "application/json" },
    });
    const arrayRequest = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(["unexpected"]),
      headers: { "Content-Type": "application/json" },
    });

    await expect(readJsonObject(objectRequest)).resolves.toEqual({
      phone: "+77000000002",
    });
    await expect(readJsonObject(arrayRequest)).resolves.toBeNull();
  });
});
