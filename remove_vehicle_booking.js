const { PrismaClient } = require('@prisma/client');

// Database connection for 100.68.128.8
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://username:password@100.68.128.8:5432/database_name', // Update with actual credentials
    },
  },
});

async function removeVehicleBooking() {
  try {
    console.log('🔍 Searching for vehicle 179 TUN 4294...');
    
    // First, find the vehicle by license plate
    const vehicle = await prisma.vehicle.findUnique({
      where: {
        licensePlate: '179 TUN 4294'
      },
      include: {
        queueEntries: {
          include: {
            bookings: true
          }
        }
      }
    });

    if (!vehicle) {
      console.log('❌ Vehicle 179 TUN 4294 not found in database');
      return;
    }

    console.log(`✅ Found vehicle: ${vehicle.licensePlate} (ID: ${vehicle.id})`);
    console.log(`📊 Vehicle status: Active=${vehicle.isActive}, Available=${vehicle.isAvailable}, Banned=${vehicle.isBanned}`);

    // Check if vehicle has any queue entries
    if (vehicle.queueEntries.length === 0) {
      console.log('ℹ️  Vehicle has no queue entries (no booking place)');
      return;
    }

    console.log(`📋 Found ${vehicle.queueEntries.length} queue entries:`);
    
    let totalBookings = 0;
    for (const queueEntry of vehicle.queueEntries) {
      console.log(`  - Queue ID: ${queueEntry.id}`);
      console.log(`    Destination: ${queueEntry.destinationName}`);
      console.log(`    Status: ${queueEntry.status}`);
      console.log(`    Position: ${queueEntry.queuePosition}`);
      console.log(`    Available Seats: ${queueEntry.availableSeats}/${queueEntry.totalSeats}`);
      console.log(`    Bookings: ${queueEntry.bookings.length}`);
      
      totalBookings += queueEntry.bookings.length;
      
      if (queueEntry.bookings.length > 0) {
        console.log(`    📝 Bookings details:`);
        for (const booking of queueEntry.bookings) {
          console.log(`      - Booking ID: ${booking.id}`);
          console.log(`        Seats: ${booking.seatsBooked}`);
          console.log(`        Amount: ${booking.totalAmount}`);
          console.log(`        Verified: ${booking.isVerified}`);
          console.log(`        Created: ${booking.createdAt}`);
        }
      }
    }

    if (totalBookings === 0) {
      console.log('ℹ️  Vehicle has no bookings to remove');
    } else {
      console.log(`\n⚠️  Found ${totalBookings} bookings for this vehicle`);
      console.log('🗑️  Removing all bookings...');
      
      // Remove all bookings for this vehicle
      const deletedBookings = await prisma.booking.deleteMany({
        where: {
          queue: {
            vehicleId: vehicle.id
          }
        }
      });
      
      console.log(`✅ Deleted ${deletedBookings.count} bookings`);
    }

    // Remove vehicle from all queues (remove booking place)
    console.log('\n🗑️  Removing vehicle from all queues...');
    
    const deletedQueueEntries = await prisma.vehicleQueue.deleteMany({
      where: {
        vehicleId: vehicle.id
      }
    });
    
    console.log(`✅ Removed vehicle from ${deletedQueueEntries.count} queue entries`);
    
    // Update vehicle status to make it available again
    console.log('\n🔄 Updating vehicle status...');
    
    const updatedVehicle = await prisma.vehicle.update({
      where: {
        id: vehicle.id
      },
      data: {
        isAvailable: true,
        updatedAt: new Date()
      }
    });
    
    console.log(`✅ Vehicle status updated: Available=${updatedVehicle.isAvailable}`);
    
    console.log('\n🎉 Successfully removed booking place for vehicle 179 TUN 4294');
    
  } catch (error) {
    console.error('❌ Error removing vehicle booking:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
removeVehicleBooking();