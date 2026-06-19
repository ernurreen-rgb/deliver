"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  pendingText?: string;
};

export function PendingSubmitButton({
  children,
  className,
  disabled = false,
  pendingText = "Выполняем",
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
