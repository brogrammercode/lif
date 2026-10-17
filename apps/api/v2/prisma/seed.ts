import { prisma } from '../src/infra/database/client.js';

const seed = async (): Promise<void> => {
  const rider = await prisma.user.upsert({
    where: { email: 'rider@lif.local' },
    update: {},
    create: { first_name: 'Lif', last_name: 'Rider', email: 'rider@lif.local' },
  });
  const driver_user = await prisma.user.upsert({
    where: { email: 'driver@lif.local' },
    update: {},
    create: {
      first_name: 'Lif',
      last_name: 'Driver',
      email: 'driver@lif.local',
      role: 'DRIVER',
    },
  });
  const driver = await prisma.driverProfile.upsert({
    where: { user_id: driver_user.id },
    update: { verification_status: 'VERIFIED', availability: 'OFFLINE' },
    create: {
      user_id: driver_user.id,
      license_number: 'LIF-DEV-001',
      verification_status: 'VERIFIED',
    },
  });
  const bike_category = await prisma.vehicleCategory.findUniqueOrThrow({
    where: { code: 'BIKE' },
  });
  const vehicle = await prisma.vehicle.upsert({
    where: { plate_number: 'LIFDEV001' },
    update: {
      status: 'ACTIVE',
      driver_id: driver.id,
      vehicle_category_id: bike_category.id,
    },
    create: {
      driver_id: driver.id,
      vehicle_category_id: bike_category.id,
      type: 'BIKE',
      status: 'ACTIVE',
      make: 'Lif',
      model: 'Demo Bike',
      plate_number: 'LIFDEV001',
      capacity: 1,
    },
  });
  await prisma.driverProfile.update({
    where: { id: driver.id },
    data: { active_vehicle_id: vehicle.id },
  });
  const home = await prisma.savedPlace.findFirst({
    where: { user_id: rider.id, label: 'Home' },
  });
  if (!home)
    await prisma.savedPlace.create({
      data: {
        user_id: rider.id,
        label: 'Home',
        address: 'Central Jakarta',
        latitude: -6.2,
        longitude: 106.816666,
        place_type: 'HOME',
      },
    });
  await prisma.notification.create({
    data: {
      user_id: rider.id,
      type: 'SYSTEM',
      channel: 'IN_APP',
      title: 'Welcome to Lif',
      body: 'Your development rider account is ready.',
    },
  });
};

seed().finally(async () => {
  await prisma.$disconnect();
});
