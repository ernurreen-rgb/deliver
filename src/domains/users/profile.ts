"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/domains/auth/session";
import { writeAuditLog } from "@/domains/audit/log";
import {
  isSupportedProfileLanguage,
  normalizeProfileName,
} from "@/domains/users/profile-validation";
import { getPrisma } from "@/lib/db/prisma";

const profileFieldLimits = {
  name: 80,
} as const;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateCustomerProfileAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const name = normalizeProfileName(readString(formData, "name"));
  const language = readString(formData, "language");

  if (!name) {
    redirect("/account?error=name_required");
  }

  if (name.length > profileFieldLimits.name) {
    redirect("/account?error=input_too_long");
  }

  if (!isSupportedProfileLanguage(language)) {
    redirect("/account?error=invalid_language");
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { name },
    });

    await tx.userPreference.upsert({
      where: { userId: user.id },
      update: { language },
      create: {
        userId: user.id,
        language,
      },
    });

    await writeAuditLog({
      tx,
      actorUserId: user.id,
      entityType: "user",
      entityId: user.id,
      action: "customer_updated_profile_v1",
      metadata: {
        language,
        hasName: true,
      },
    });
  });

  revalidatePath("/account");
  revalidatePath("/checkout");
  revalidatePath("/orders");

  redirect("/account?saved=profile");
}
