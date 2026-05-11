import { getPrisma } from "@/lib/db/prisma";

export async function getCustomerAccountOverview(userId: string) {
  return getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      name: true,
      preferences: {
        select: {
          language: true,
        },
      },
      roles: {
        select: {
          role: true,
        },
      },
      _count: {
        select: {
          addresses: true,
          orders: true,
        },
      },
      addresses: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          label: true,
          addressLine: true,
        },
      },
    },
  });
}

export async function getCustomerAddresses(userId: string) {
  return getPrisma().address.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      city: true,
      addressLine: true,
      apartment: true,
      entrance: true,
      floor: true,
    },
  });
}
