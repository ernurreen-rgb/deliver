import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

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

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "tengri-kitchen" },
    update: {
      status: "active",
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

  const menuCategory = await prisma.menuCategory.create({
    data: {
      restaurantId: restaurant.id,
      sortOrder: 1,
      translations: {
        create: [
          { language: "ru", name: "Горячие блюда" },
          { language: "kk", name: "Ыстық тағамдар" },
        ],
      },
    },
  });

  const beshbarmak = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      menuCategoryId: menuCategory.id,
      price: 320000,
      currency: "KZT",
      sortOrder: 1,
      translations: {
        create: [
          {
            language: "ru",
            name: "Бешбармак",
            description: "Мясо, тесто, лук и насыщенный бульон.",
          },
          {
            language: "kk",
            name: "Бешбармақ",
            description: "Ет, қамыр, пияз және сорпа.",
          },
        ],
      },
    },
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

  if (!existingOrder) {
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
