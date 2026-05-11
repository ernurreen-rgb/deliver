"use client";

import { useEffect } from "react";
import { clearStoredCart } from "@/domains/cart/use-cart";

export function ClearCartEffect() {
  useEffect(() => {
    clearStoredCart();
  }, []);

  return null;
}
