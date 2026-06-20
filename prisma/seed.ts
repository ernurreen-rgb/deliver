import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@deliver/database/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const adminRoles = [
  "customer",
  "restaurant_staff",
  "courier",
  "operator",
  "admin",
] as const;

async function upsertMenuCategoryByRuName(input: {
  nameKk: string;
  nameRu: string;
  restaurantId: string;
  sortOrder: number;
}) {
  const existing = await prisma.menuCategory.findFirst({
    where: {
      restaurantId: input.restaurantId,
      translations: {
        some: {
          language: "ru",
          name: input.nameRu,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const menuCategory = existing
    ? await prisma.menuCategory.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          sortOrder: input.sortOrder,
        },
      })
    : await prisma.menuCategory.create({
        data: {
          restaurantId: input.restaurantId,
          sortOrder: input.sortOrder,
          translations: {
            create: [
              { language: "ru", name: input.nameRu },
              { language: "kk", name: input.nameKk },
            ],
          },
        },
      });

  await Promise.all([
    prisma.menuCategoryTranslation.upsert({
      where: {
        menuCategoryId_language: {
          language: "ru",
          menuCategoryId: menuCategory.id,
        },
      },
      update: { name: input.nameRu },
      create: {
        language: "ru",
        menuCategoryId: menuCategory.id,
        name: input.nameRu,
      },
    }),
    prisma.menuCategoryTranslation.upsert({
      where: {
        menuCategoryId_language: {
          language: "kk",
          menuCategoryId: menuCategory.id,
        },
      },
      update: { name: input.nameKk },
      create: {
        language: "kk",
        menuCategoryId: menuCategory.id,
        name: input.nameKk,
      },
    }),
  ]);

  return menuCategory;
}

async function upsertMenuItemByRuName(input: {
  currency: string;
  descriptionKk: string;
  descriptionRu: string;
  imageUrl: string | null;
  menuCategoryId: string;
  nameKk: string;
  nameRu: string;
  price: number;
  restaurantId: string;
  sortOrder: number;
}) {
  const existing = await prisma.menuItem.findFirst({
    where: {
      restaurantId: input.restaurantId,
      translations: {
        some: {
          language: "ru",
          name: input.nameRu,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const menuItem = existing
    ? await prisma.menuItem.update({
        where: { id: existing.id },
        data: {
          currency: input.currency,
          imageUrl: input.imageUrl,
          isActive: true,
          isAvailable: true,
          menuCategoryId: input.menuCategoryId,
          price: input.price,
          sortOrder: input.sortOrder,
        },
      })
    : await prisma.menuItem.create({
        data: {
          restaurantId: input.restaurantId,
          menuCategoryId: input.menuCategoryId,
          price: input.price,
          currency: input.currency,
          imageUrl: input.imageUrl,
          sortOrder: input.sortOrder,
          translations: {
            create: [
              {
                language: "ru",
                name: input.nameRu,
                description: input.descriptionRu,
              },
              {
                language: "kk",
                name: input.nameKk,
                description: input.descriptionKk,
              },
            ],
          },
        },
      });

  await Promise.all([
    prisma.menuItemTranslation.upsert({
      where: {
        menuItemId_language: {
          language: "ru",
          menuItemId: menuItem.id,
        },
      },
      update: {
        description: input.descriptionRu,
        name: input.nameRu,
      },
      create: {
        description: input.descriptionRu,
        language: "ru",
        menuItemId: menuItem.id,
        name: input.nameRu,
      },
    }),
    prisma.menuItemTranslation.upsert({
      where: {
        menuItemId_language: {
          language: "kk",
          menuItemId: menuItem.id,
        },
      },
      update: {
        description: input.descriptionKk,
        name: input.nameKk,
      },
      create: {
        description: input.descriptionKk,
        language: "kk",
        menuItemId: menuItem.id,
        name: input.nameKk,
      },
    }),
  ]);

  return menuItem;
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { phone: "+77000000001" },
    update: { name: "Администратор" },
    create: {
      phone: "+77000000001",
      phoneVerifiedAt: new Date(),
      name: "Администратор",
      roles: {
        create: adminRoles.map((role) => ({ role })),
      },
      preferences: {
        create: { language: "ru" },
      },
    },
  });

  await Promise.all(
    adminRoles.map((role) =>
      prisma.userRoleAssignment.upsert({
        where: {
          userId_role: {
            userId: admin.id,
            role,
          },
        },
        update: {},
        create: {
          userId: admin.id,
          role,
        },
      }),
    ),
  );

  const customer = await prisma.user.upsert({
    where: { phone: "+77000000002" },
    update: { name: "Демо клиент" },
    create: {
      phone: "+77000000002",
      phoneVerifiedAt: new Date(),
      name: "Демо клиент",
      roles: {
        create: [{ role: "customer" }],
      },
      preferences: {
        create: { language: "ru" },
      },
      addresses: {
        create: {
          label: "Дом",
          city: "Алматы",
          addressLine: "проспект Абая, 10",
          street: "проспект Абая",
          house: "10",
          apartment: "25",
          entrance: "2",
          floor: "5",
          latitude: "43.238949",
          longitude: "76.889709",
        },
      },
    },
  });

  await Promise.all([
    prisma.userRoleAssignment.upsert({
      where: {
        userId_role: {
          role: "customer",
          userId: customer.id,
        },
      },
      update: {},
      create: {
        role: "customer",
        userId: customer.id,
      },
    }),
    prisma.userPreference.upsert({
      where: { userId: customer.id },
      update: { language: "ru" },
      create: {
        language: "ru",
        userId: customer.id,
      },
    }),
  ]);

  const customerAddress = await prisma.address.findFirst({
    where: {
      addressLine: "проспект Абая, 10",
      userId: customer.id,
    },
    orderBy: { createdAt: "asc" },
  });

  if (customerAddress) {
    await prisma.address.update({
      where: { id: customerAddress.id },
      data: {
        apartment: "25",
        city: "Алматы",
        entrance: "2",
        floor: "5",
        house: "10",
        label: "Дом",
        latitude: "43.238949",
        longitude: "76.889709",
        street: "проспект Абая",
      },
    });
  } else {
    await prisma.address.create({
      data: {
        addressLine: "проспект Абая, 10",
        apartment: "25",
        city: "Алматы",
        entrance: "2",
        floor: "5",
        house: "10",
        label: "Дом",
        latitude: "43.238949",
        longitude: "76.889709",
        street: "проспект Абая",
        userId: customer.id,
      },
    });
  }

  const courierUser = await prisma.user.upsert({
    where: { phone: "+77000000003" },
    update: { name: "Аян Курьер" },
    create: {
      phone: "+77000000003",
      phoneVerifiedAt: new Date(),
      name: "Аян Курьер",
      roles: {
        create: [{ role: "courier" }],
      },
    },
  });

  await Promise.all([
    prisma.userRoleAssignment.upsert({
      where: {
        userId_role: {
          role: "courier",
          userId: courierUser.id,
        },
      },
      update: {},
      create: {
        role: "courier",
        userId: courierUser.id,
      },
    }),
    prisma.userPreference.upsert({
      where: { userId: courierUser.id },
      update: { language: "ru" },
      create: {
        language: "ru",
        userId: courierUser.id,
      },
    }),
  ]);

  const courier = await prisma.courier.upsert({
    where: { userId: courierUser.id },
    update: { status: "available", type: "partner" },
    create: {
      userId: courierUser.id,
      type: "partner",
      status: "available",
      profile: {
        create: {
          fullName: "Аян Курьер",
          phone: "+77000000003",
          transportType: "scooter",
        },
      },
      availability: {
        create: {
          status: "available",
          latitude: "43.238949",
          longitude: "76.889709",
        },
      },
      balance: {
        create: {
          balance: 0,
          currency: "KZT",
        },
      },
    },
  });

  await Promise.all([
    prisma.courierProfile.upsert({
      where: { courierId: courier.id },
      update: {
        fullName: "Аян Курьер",
        phone: "+77000000003",
        transportType: "scooter",
      },
      create: {
        courierId: courier.id,
        fullName: "Аян Курьер",
        phone: "+77000000003",
        transportType: "scooter",
      },
    }),
    prisma.courierAvailability.upsert({
      where: { courierId: courier.id },
      update: {
        latitude: "43.238949",
        longitude: "76.889709",
        status: "available",
      },
      create: {
        courierId: courier.id,
        latitude: "43.238949",
        longitude: "76.889709",
        status: "available",
      },
    }),
    prisma.courierBalance.upsert({
      where: { courierId: courier.id },
      update: { currency: "KZT" },
      create: {
        balance: 0,
        courierId: courier.id,
        currency: "KZT",
      },
    }),
  ]);

  const category = await prisma.restaurantCategory.upsert({
    where: { slug: "national" },
    update: { isActive: true },
    create: {
      slug: "national",
      sortOrder: 1,
      translations: {
        create: [
          { language: "ru", name: "Национальная кухня" },
          { language: "kk", name: "Ұлттық тағамдар" },
        ],
      },
    },
  });

  await Promise.all([
    prisma.restaurantCategoryTranslation.upsert({
      where: {
        categoryId_language: {
          categoryId: category.id,
          language: "ru",
        },
      },
      update: { name: "Национальная кухня" },
      create: {
        categoryId: category.id,
        language: "ru",
        name: "Национальная кухня",
      },
    }),
    prisma.restaurantCategoryTranslation.upsert({
      where: {
        categoryId_language: {
          categoryId: category.id,
          language: "kk",
        },
      },
      update: { name: "Ұлттық тағамдар" },
      create: {
        categoryId: category.id,
        language: "kk",
        name: "Ұлттық тағамдар",
      },
    }),
  ]);

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "tengri-kitchen" },
    update: {
      addressLine: "Алматы, ул. Байтурсынова, 45",
      status: "active",
      integrationMode: "dashboard",
      latitude: "43.240190",
      longitude: "76.927322",
      minimumOrderAmount: 300000,
      phone: "+77000000010",
      deliveryRadiusMeters: 7000,
      defaultCommissionBps: 1800,
    },
    create: {
      slug: "tengri-kitchen",
      status: "active",
      integrationMode: "dashboard",
      phone: "+77000000010",
      addressLine: "Алматы, ул. Байтурсынова, 45",
      latitude: "43.240190",
      longitude: "76.927322",
      deliveryRadiusMeters: 7000,
      minimumOrderAmount: 300000,
      defaultCommissionBps: 1800,
      translations: {
        create: [
          {
            language: "ru",
            name: "Tengri Kitchen",
            description: "Демо-ресторан национальной кухни.",
          },
          {
            language: "kk",
            name: "Tengri Kitchen",
            description: "Ұлттық тағамдарға арналған демо-мейрамхана.",
          },
        ],
      },
      categoryLinks: {
        create: [{ categoryId: category.id }],
      },
      staff: {
        create: [{ userId: admin.id, role: "owner" }],
      },
      balance: {
        create: { balance: 0, currency: "KZT" },
      },
    },
  });

  await Promise.all([
    prisma.restaurantTranslation.upsert({
      where: {
        restaurantId_language: {
          language: "ru",
          restaurantId: restaurant.id,
        },
      },
      update: {
        description: "Демо-ресторан национальной кухни.",
        name: "Tengri Kitchen",
      },
      create: {
        description: "Демо-ресторан национальной кухни.",
        language: "ru",
        name: "Tengri Kitchen",
        restaurantId: restaurant.id,
      },
    }),
    prisma.restaurantTranslation.upsert({
      where: {
        restaurantId_language: {
          language: "kk",
          restaurantId: restaurant.id,
        },
      },
      update: {
        description: "Ұлттық тағамдарға арналған демо-мейрамхана.",
        name: "Tengri Kitchen",
      },
      create: {
        description: "Ұлттық тағамдарға арналған демо-мейрамхана.",
        language: "kk",
        name: "Tengri Kitchen",
        restaurantId: restaurant.id,
      },
    }),
    prisma.restaurantCategoryLink.upsert({
      where: {
        restaurantId_categoryId: {
          categoryId: category.id,
          restaurantId: restaurant.id,
        },
      },
      update: {},
      create: {
        categoryId: category.id,
        restaurantId: restaurant.id,
      },
    }),
    prisma.restaurantStaff.upsert({
      where: {
        restaurantId_userId: {
          restaurantId: restaurant.id,
          userId: admin.id,
        },
      },
      update: { role: "owner" },
      create: {
        restaurantId: restaurant.id,
        role: "owner",
        userId: admin.id,
      },
    }),
    prisma.restaurantBalance.upsert({
      where: { restaurantId: restaurant.id },
      update: { currency: "KZT" },
      create: {
        balance: 0,
        currency: "KZT",
        restaurantId: restaurant.id,
      },
    }),
  ]);

  const menuCategory = await upsertMenuCategoryByRuName({
    nameKk: "Ыстық тағамдар",
    nameRu: "Горячие блюда",
    restaurantId: restaurant.id,
    sortOrder: 1,
  });

  const beshbarmak = await upsertMenuItemByRuName({
    currency: "KZT",
    descriptionKk: "Ет, қамыр, пияз және сорпа.",
    descriptionRu: "Мясо, тесто, лук и насыщенный бульон.",
    imageUrl: "/images/demo/beshbarmak.webp",
    menuCategoryId: menuCategory.id,
    nameKk: "Бешбармақ",
    nameRu: "Бешбармак",
    price: 320000,
    restaurantId: restaurant.id,
    sortOrder: 1,
  });

  await prisma.deliveryPricingRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      name: "Алматы distance base",
      baseFee: 50000,
      perKmFee: 12000,
      minFee: 50000,
      maxFee: 250000,
      isActive: true,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Алматы distance base",
      baseFee: 50000,
      perKmFee: 12000,
      minFee: 50000,
      maxFee: 250000,
      isActive: true,
    },
  });

  await prisma.serviceFeeRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {
      name: "Default service fee",
      fixedFee: 9900,
      percentBps: 0,
      isActive: true,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Default service fee",
      fixedFee: 9900,
      percentBps: 0,
      isActive: true,
    },
  });

  await prisma.promocode.upsert({
    where: { code: "START" },
    update: {
      isActive: true,
      discountValue: 100000,
      minOrderAmount: 300000,
    },
    create: {
      code: "START",
      discountType: "fixed_amount",
      discountValue: 100000,
      minOrderAmount: 300000,
      totalUsageLimit: 1000,
      perUserUsageLimit: 1,
      isActive: true,
    },
  });

  const existingOrder = await prisma.order.findUnique({
    where: { publicNumber: "A-1001" },
  });

  if (!existingOrder && process.env.SEED_DEMO_ACTIVE_ORDER === "1") {
    const itemsSubtotal = 320000;
    const deliveryFee = 74000;
    const serviceFee = 9900;
    const discountTotal = 0;
    const customerTotal = itemsSubtotal + deliveryFee + serviceFee - discountTotal;
    const restaurantCommission = Math.round(itemsSubtotal * 0.18);
    const restaurantPayout = itemsSubtotal - restaurantCommission;
    const courierEarning = 60000;
    const platformRevenue =
      restaurantCommission + serviceFee + deliveryFee - courierEarning;

    await prisma.order.create({
      data: {
        publicNumber: "A-1001",
        customerId: customer.id,
        restaurantId: restaurant.id,
        status: "courier_assigned",
        paymentMethod: "cash_to_courier",
        paymentStatus: "pending",
        customerComment: "Позвонить перед приездом.",
        items: {
          create: [
            {
              menuItemId: beshbarmak.id,
              nameSnapshot: "Бешбармак",
              descriptionSnapshot: "Мясо, тесто, лук и насыщенный бульон.",
              unitPrice: 320000,
              quantity: 1,
              totalPrice: 320000,
              currency: "KZT",
            },
          ],
        },
        deliveryAddress: {
          create: {
            nameSnapshot: "Демо клиент",
            phoneSnapshot: "+77000000002",
            city: "Алматы",
            addressLine: "проспект Абая, 10",
            street: "проспект Абая",
            house: "10",
            apartment: "25",
            entrance: "2",
            floor: "5",
            latitude: "43.238949",
            longitude: "76.889709",
          },
        },
        financials: {
          create: {
            itemsSubtotal,
            deliveryFee,
            serviceFee,
            discountTotal,
            customerTotal,
            restaurantCommission,
            restaurantPayout,
            courierEarning,
            platformRevenue,
            currency: "KZT",
          },
        },
        deliveryFeeCalculation: {
          create: {
            restaurantLatitude: "43.240190",
            restaurantLongitude: "76.927322",
            customerLatitude: "43.238949",
            customerLongitude: "76.889709",
            distanceMeters: 2000,
            baseFee: 50000,
            perKmFee: 12000,
            minFee: 50000,
            maxFee: 250000,
            finalFee: deliveryFee,
            currency: "KZT",
            source: "seed_distance",
          },
        },
        delivery: {
          create: {
            courierId: courier.id,
            status: "assigned",
            assignedByUserId: admin.id,
            assignedAt: new Date(),
          },
        },
        payments: {
          create: [
            {
              method: "cash_to_courier",
              status: "pending",
              amount: customerTotal,
              currency: "KZT",
              provider: "dev",
            },
          ],
        },
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: "created",
              changedByUserId: customer.id,
              comment: "Заказ создан из seed.",
            },
            {
              fromStatus: "created",
              toStatus: "courier_assigned",
              changedByUserId: admin.id,
              comment: "Курьер назначен из seed.",
            },
          ],
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
