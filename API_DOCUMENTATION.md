# 🚌 LOAUJ Local Node API Documentation

## Overview
This document provides comprehensive API documentation for the LOAUJ Local Node system - a standalone transportation management system for Monastir delegations. The system handles staff management, route management, vehicle management, queue operations, and seat booking.

## Base URL
```
http://localhost:3001/api
```

## Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 🔐 Authentication Endpoints

### POST /api/auth/login
**Purpose**: Authenticate staff members and get access token
**Access**: Public

**Request Body**:
```json
{
  "cin": "12345678",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "staff": {
    "id": "admin_1234567890_abc123",
    "cin": "12345678",
    "firstName": "Admin",
    "lastName": "User",
    "role": "ADMIN",
    "phoneNumber": "12345678"
  }
}
```

### POST /api/auth/create-admin
**Purpose**: Create initial admin account for system setup
**Access**: Public (only for initial setup)

**Request Body**:
```json
{
  "firstName": "Admin",
  "lastName": "User",
  "phoneNumber": "12345678",
  "cin": "12345678",
  "password": "admin123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Admin account created successfully",
  "data": {
    "id": "admin_1234567890_abc123",
    "cin": "12345678",
    "role": "ADMIN"
  }
}
```

---

## 👥 Staff Management (CRUD)

### GET /api/staff
**Purpose**: Get all staff members with optional filtering
**Access**: SUPERVISOR, ADMIN
**Query Parameters**:
- `role` (optional): Filter by role (ADMIN, SUPERVISOR, WORKER)
- `status` (optional): Filter by status (active, inactive)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "staff_1234567890_abc123",
      "cin": "12345678",
      "firstName": "John",
      "lastName": "Doe",
      "role": "SUPERVISOR",
      "phoneNumber": "12345678",
      "isActive": true,
      "lastLogin": "2025-01-25T10:30:00Z",
      "createdAt": "2025-01-25T09:00:00Z"
    }
  ],
  "count": 1
}
```

### POST /api/staff
**Purpose**: Create new staff member
**Access**: ADMIN (can create SUPERVISOR/WORKER), SUPERVISOR (can create WORKER only)

**Request Body**:
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "phoneNumber": "87654321",
  "cin": "87654321",
  "password": "password123",
  "role": "WORKER"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Staff member created successfully",
  "data": {
    "id": "staff_1234567890_def456",
    "cin": "87654321",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "WORKER",
    "phoneNumber": "87654321"
  }
}
```

### GET /api/staff/:id
**Purpose**: Get specific staff member by ID
**Access**: SUPERVISOR, ADMIN

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "staff_1234567890_abc123",
    "cin": "12345678",
    "firstName": "John",
    "lastName": "Doe",
    "role": "SUPERVISOR",
    "phoneNumber": "12345678",
    "isActive": true,
    "lastLogin": "2025-01-25T10:30:00Z"
  }
}
```

### PUT /api/staff/:id
**Purpose**: Update staff member information
**Access**: ADMIN (can update anyone), SUPERVISOR (can update WORKER only)

**Request Body**:
```json
{
  "firstName": "John Updated",
  "lastName": "Doe Updated",
  "phoneNumber": "11111111",
  "isActive": true
}
```

### DELETE /api/staff/:id
**Purpose**: Deactivate staff member (soft delete)
**Access**: ADMIN only

**Response**:
```json
{
  "success": true,
  "message": "Staff member deactivated successfully"
}
```

---

## 🛣️ Route Management (CRUD)

### GET /api/routes
**Purpose**: Get all routes
**Access**: Public

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "route_1234567890_abc123",
      "stationId": "station-bekalta-bekalta",
      "stationName": "BEKALTA (Bekalta)",
      "basePrice": 15.18,
      "governorate": "Monastir",
      "delegation": "Bekalta",
      "isActive": true,
      "createdAt": "2025-01-25T09:00:00Z"
    }
  ]
}
```

### POST /api/routes
**Purpose**: Create new route
**Access**: ADMIN only

**Request Body**:
```json
{
  "stationId": "station-new-delegation",
  "stationName": "NEW DELEGATION",
  "basePrice": 20.50,
  "governorate": "Monastir",
  "delegation": "New Delegation"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Route created successfully",
  "data": {
    "id": "route_1234567890_def456",
    "stationId": "station-new-delegation",
    "stationName": "NEW DELEGATION",
    "basePrice": 20.50,
    "governorate": "Monastir",
    "delegation": "New Delegation",
    "isActive": true
  }
}
```

### GET /api/routes/:id
**Purpose**: Get specific route by ID
**Access**: Public

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "route_1234567890_abc123",
    "stationId": "station-bekalta-bekalta",
    "stationName": "BEKALTA (Bekalta)",
    "basePrice": 15.18,
    "governorate": "Monastir",
    "delegation": "Bekalta",
    "isActive": true
  }
}
```

### PUT /api/routes/:id
**Purpose**: Update route price
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "basePrice": 18.50
}
```

**Response**:
```json
{
  "success": true,
  "message": "Route price updated successfully",
  "data": {
    "id": "route_1234567890_abc123",
    "basePrice": 18.50
  }
}
```

### DELETE /api/routes/:id
**Purpose**: Delete route
**Access**: ADMIN only

**Response**:
```json
{
  "success": true,
  "message": "Route deleted successfully"
}
```

### GET /api/routes/station/:stationId
**Purpose**: Get routes by station ID
**Access**: Public

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "route_1234567890_abc123",
      "stationId": "station-bekalta-bekalta",
      "stationName": "BEKALTA (Bekalta)",
      "basePrice": 15.18,
      "governorate": "Monastir",
      "delegation": "Bekalta"
    }
  ]
}
```

---

## 🚗 Vehicle Management (CRUD)

### GET /api/vehicles
**Purpose**: Get all vehicles with their queue status
**Access**: Public

**Response**:
```json
{
  "success": true,
  "message": "Vehicles retrieved successfully",
  "data": [
    {
      "id": "vehicle_1234567890_abc123",
      "licensePlate": "123-TUN-456",
      "capacity": 10,
      "authorizedStations": [
        {
          "id": "station_1234567890_abc123",
          "stationId": "monastir-main-station",
          "stationName": "Monastir Main Station"
        }
      ],
      "queueEntries": [
        {
          "id": "queue_1234567890_abc123",
          "destinationId": "station-bekalta-bekalta",
          "destinationName": "BEKALTA (Bekalta)",
          "queuePosition": 1,
          "status": "WAITING",
          "availableSeats": 8,
          "totalSeats": 10
        }
      ]
    }
  ]
}
```

### POST /api/vehicles
**Purpose**: Create new vehicle
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "licensePlate": "456-TUN-789",
  "capacity": 15
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle created successfully",
  "data": {
    "id": "vehicle_1234567890_def456",
    "licensePlate": "456-TUN-789",
    "capacity": 15,
    "authorizedStations": []
  }
}
```

### GET /api/vehicles/:id
**Purpose**: Get specific vehicle by ID
**Access**: Public

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "vehicle_1234567890_abc123",
    "licensePlate": "123-TUN-456",
    "capacity": 10,
    "authorizedStations": [
      {
        "id": "station_1234567890_abc123",
        "stationId": "monastir-main-station",
        "stationName": "Monastir Main Station"
      }
    ]
  }
}
```

### PUT /api/vehicles/:id
**Purpose**: Update vehicle information
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "licensePlate": "123-TUN-456-UPDATED",
  "capacity": 12
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle updated successfully",
  "data": {
    "id": "vehicle_1234567890_abc123",
    "licensePlate": "123-TUN-456-UPDATED",
    "capacity": 12
  }
}
```

### DELETE /api/vehicles/:id
**Purpose**: Delete vehicle
**Access**: ADMIN only

**Response**:
```json
{
  "success": true,
  "message": "Vehicle deleted successfully"
}
```

### POST /api/vehicles/:id/authorize-station
**Purpose**: Authorize vehicle for a station
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "stationId": "monastir-main-station",
  "stationName": "Monastir Main Station"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle authorized for station successfully",
  "data": {
    "vehicleId": "vehicle_1234567890_abc123",
    "stationId": "monastir-main-station",
    "stationName": "Monastir Main Station"
  }
}
```

### DELETE /api/vehicles/:id/authorize-station
**Purpose**: Remove vehicle authorization for a station
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "stationId": "monastir-main-station"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle authorization removed successfully"
}
```

---

## 🚌 Queue Management

### POST /api/queue/enter
**Purpose**: Enter vehicle into queue for a destination
**Access**: Public

**Request Body**:
```json
{
  "licensePlate": "123-TUN-456",
  "destinationId": "station-bekalta-bekalta"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle 123-TUN-456 entered queue successfully",
  "data": {
    "id": "queue_1234567890_abc123",
    "vehicleId": "vehicle_1234567890_abc123",
    "licensePlate": "123-TUN-456",
    "destinationId": "station-bekalta-bekalta",
    "destinationName": "BEKALTA (Bekalta)",
    "queuePosition": 1,
    "status": "WAITING",
    "enteredAt": "2025-01-25T10:30:00Z",
    "availableSeats": 10,
    "totalSeats": 10,
    "basePrice": 15.18,
    "estimatedDeparture": null,
    "actualDeparture": null
  }
}
```

### POST /api/queue/exit
**Purpose**: Remove vehicle from queue
**Access**: Public

**Request Body**:
```json
{
  "licensePlate": "123-TUN-456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle 123-TUN-456 exited queue successfully"
}
```

### GET /api/queue/available
**Purpose**: Get all available destination queues with summary
**Access**: SUPERVISOR, ADMIN
**Query Parameters**:
- `governorate` (optional): Filter by governorate
- `delegation` (optional): Filter by delegation

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "destinationId": "station-bekalta-bekalta",
      "destinationName": "BEKALTA (Bekalta)",
      "governorate": "Monastir",
      "delegation": "Bekalta",
      "vehiclesInQueue": 2,
      "totalAvailableSeats": 15,
      "averagePrice": 15.18,
      "nextDeparture": "2025-01-25T11:00:00Z"
    }
  ]
}
```

### GET /api/queue/stats
**Purpose**: Get comprehensive queue statistics
**Access**: SUPERVISOR, ADMIN

**Response**:
```json
{
  "success": true,
  "data": {
    "totalVehiclesInQueue": 5,
    "totalAvailableSeats": 45,
    "destinations": 3,
    "averageOccupancy": 65.5,
    "revenueToday": 1250.75
  }
}
```

### GET /api/queue/:destinationId
**Purpose**: Get detailed queue for specific destination
**Access**: SUPERVISOR, ADMIN

**Response**:
```json
{
  "success": true,
  "data": {
    "destinationId": "station-bekalta-bekalta",
    "destinationName": "BEKALTA (Bekalta)",
    "vehicles": [
      {
        "id": "queue_1234567890_abc123",
        "vehicleId": "vehicle_1234567890_abc123",
        "licensePlate": "123-TUN-456",
        "queuePosition": 1,
        "status": "WAITING",
        "availableSeats": 8,
        "totalSeats": 10,
        "basePrice": 15.18,
        "enteredAt": "2025-01-25T10:30:00Z"
      }
    ],
    "summary": {
      "totalVehicles": 1,
      "totalSeats": 10,
      "availableSeats": 8,
      "occupiedSeats": 2,
      "occupancyRate": 20
    }
  }
}
```

### PUT /api/queue/status
**Purpose**: Update vehicle queue status
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "licensePlate": "123-TUN-456",
  "status": "LOADING"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle 123-TUN-456 status updated to LOADING"
}
```

---

## 🎫 Booking Management

### GET /api/queue-booking/destinations
**Purpose**: Get all available destinations with seat counts
**Access**: SUPERVISOR, ADMIN
**Query Parameters**:
- `governorate` (optional): Filter by governorate
- `delegation` (optional): Filter by delegation

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "destinationId": "station-bekalta-bekalta",
      "destinationName": "BEKALTA (Bekalta)",
      "governorate": "Monastir",
      "delegation": "Bekalta",
      "availableSeats": 15,
      "pricePerSeat": 15.18,
      "vehiclesInQueue": 2
    }
  ]
}
```

### POST /api/queue-booking/book
**Purpose**: Create new cash booking (no customer info required)
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "destinationId": "station-bekalta-bekalta",
  "seatsRequested": 3
}
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully booked 3 seat(s)",
  "data": {
    "bookings": [
      {
        "id": "booking_1234567890_abc123",
        "queueId": "queue_1234567890_abc123",
        "vehicleLicensePlate": "123-TUN-456",
        "destinationName": "BEKALTA (Bekalta)",
        "startStationName": "Monastir Main Station",
        "seatsBooked": 3,
        "baseAmount": 45.54,
        "serviceFeeAmount": 0.60,
        "totalAmount": 46.14,
        "verificationCode": "ABC123",
        "bookingType": "CASH",
        "createdAt": "2025-01-25T10:30:00Z",
        "queuePosition": 1,
        "estimatedDeparture": null
      }
    ],
    "totalAmount": 46.14,
    "verificationCodes": ["ABC123"],
    "summary": {
      "totalSeats": 3,
      "totalAmount": 46.14,
      "vehicleCount": 1
    }
  }
}
```

### GET /api/queue-booking/verify/:verificationCode
**Purpose**: Get booking details by verification code
**Access**: SUPERVISOR, ADMIN

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "booking_1234567890_abc123",
    "verificationCode": "ABC123",
    "seatsBooked": 3,
    "totalAmount": 46.14,
    "vehicleLicensePlate": "123-TUN-456",
    "destinationName": "BEKALTA (Bekalta)",
    "bookingType": "CASH",
    "paymentStatus": "PAID",
    "isVerified": false,
    "createdAt": "2025-01-25T10:30:00Z"
  }
}
```

### POST /api/queue-booking/verify
**Purpose**: Verify and mark ticket as used
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "verificationCode": "ABC123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Ticket verified successfully",
  "data": {
    "id": "booking_1234567890_abc123",
    "verificationCode": "ABC123",
    "isVerified": true,
    "verifiedAt": "2025-01-25T10:35:00Z"
  }
}
```

### PUT /api/queue-booking/cancel/:bookingId
**Purpose**: Cancel specific number of seats from booking
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "seatsToCancel": 2
}
```

**Response**:
```json
{
  "success": true,
  "message": "2 seats cancelled from booking. 2 seats restored to vehicle 123-TUN-456. Refund: 30.760 TND",
  "data": {
    "cancelledCompletely": false,
    "seatsRestored": 2,
    "updatedBooking": {
      "id": "booking_1234567890_abc123",
      "seatsBooked": 1,
      "totalAmount": 15.38,
      "verificationCode": "ABC123"
    }
  }
}
```

### DELETE /api/queue-booking/cancel/:bookingId
**Purpose**: Cancel entire booking
**Access**: SUPERVISOR, ADMIN

**Response**:
```json
{
  "success": true,
  "message": "Booking cancelled completely. 3 seats restored to vehicle 123-TUN-456. Refund: 46.140 TND",
  "data": {
    "cancelledCompletely": true,
    "seatsRestored": 3
  }
}
```

### GET /api/queue-booking/stats
**Purpose**: Get booking statistics for today
**Access**: SUPERVISOR, ADMIN

**Response**:
```json
{
  "success": true,
  "data": {
    "today": {
      "totalBookings": 15,
      "totalSeats": 45,
      "totalRevenue": 1250.75,
      "pendingVerifications": 8
    },
    "byDestination": [
      {
        "destinationId": "station-bekalta-bekalta",
        "destinationName": "BEKALTA (Bekalta)",
        "bookings": 8,
        "seats": 24,
        "revenue": 650.25
      }
    ]
  }
}
```

---

## 🌙 Overnight Queue Management

### POST /api/overnight-queue/enter
**Purpose**: Add vehicle to overnight queue
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "licensePlate": "123-TUN-456",
  "destinationId": "station-bekalta-bekalta",
  "departureTime": "2025-01-26T06:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle 123-TUN-456 added to overnight queue successfully",
  "data": {
    "id": "overnight_1234567890_abc123",
    "vehicleId": "vehicle_1234567890_abc123",
    "licensePlate": "123-TUN-456",
    "destinationId": "station-bekalta-bekalta",
    "destinationName": "BEKALTA (Bekalta)",
    "departureTime": "2025-01-26T06:00:00Z",
    "status": "SCHEDULED",
    "createdAt": "2025-01-25T18:00:00Z"
  }
}
```

### POST /api/overnight-queue/exit
**Purpose**: Remove vehicle from overnight queue
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "licensePlate": "123-TUN-456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle 123-TUN-456 removed from overnight queue successfully"
}
```

### GET /api/overnight-queue
**Purpose**: Get all overnight queue entries
**Access**: SUPERVISOR, ADMIN

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "overnight_1234567890_abc123",
      "vehicleId": "vehicle_1234567890_abc123",
      "licensePlate": "123-TUN-456",
      "destinationId": "station-bekalta-bekalta",
      "destinationName": "BEKALTA (Bekalta)",
      "departureTime": "2025-01-26T06:00:00Z",
      "status": "SCHEDULED",
      "createdAt": "2025-01-25T18:00:00Z"
    }
  ]
}
```

### POST /api/overnight-queue/transfer
**Purpose**: Transfer vehicle from overnight queue to regular queue
**Access**: SUPERVISOR, ADMIN

**Request Body**:
```json
{
  "licensePlate": "123-TUN-456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vehicle 123-TUN-456 transferred to regular queue successfully",
  "data": {
    "queueId": "queue_1234567890_def456",
    "queuePosition": 1,
    "status": "WAITING"
  }
}
```

---

## 📊 Public Endpoints

### GET /api/public/queue/:destinationId
**Purpose**: Get public queue information for a destination
**Access**: Public

**Response**:
```json
{
  "success": true,
  "data": {
    "destinationId": "station-bekalta-bekalta",
    "destinationName": "BEKALTA (Bekalta)",
    "vehicles": [
      {
        "licensePlate": "123-TUN-456",
        "availableSeats": 8,
        "totalSeats": 10,
        "occupiedSeats": 2,
        "occupancyRate": 20,
        "pricePerSeat": 15.18,
        "queuePosition": 1,
        "estimatedDeparture": "2025-01-25T11:00:00Z"
      }
    ],
    "summary": {
      "totalVehicles": 1,
      "totalSeats": 10,
      "availableSeats": 8,
      "averagePrice": 15.18
    }
  }
}
```

### GET /api/public/destinations
**Purpose**: Get all available destinations
**Access**: Public

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "destinationId": "station-bekalta-bekalta",
      "destinationName": "BEKALTA (Bekalta)",
      "governorate": "Monastir",
      "delegation": "Bekalta",
      "basePrice": 15.18,
      "isActive": true
    }
  ]
}
```

---

## 🔧 Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error message",
  "code": "VALIDATION_ERROR"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Access denied. No token provided.",
  "code": "NO_TOKEN"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions.",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found",
  "code": "NOT_FOUND"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

---

## 🎯 Key Features

### Role-Based Access Control (RBAC)
- **ADMIN**: Full access to all operations
- **SUPERVISOR**: Can manage workers, vehicles, routes, and bookings
- **WORKER**: Limited access to basic operations

### Simplified Booking System
- **No Customer Info Required**: Only destination and seats needed
- **Cash-Only Payments**: All bookings are cash-based
- **Automatic Pricing**: Base price fetched from route table
- **Real-time Seat Management**: Automatic seat availability updates

### Queue Management
- **Intelligent Seat Allocation**: Automatic seat distribution across vehicles
- **Status Management**: WAITING → LOADING → READY → DEPARTED
- **Overnight Queue**: Separate queue for next-day departures
- **Real-time Updates**: Live seat availability and queue positions

### Monastir Delegation Focus
- **Pre-configured Routes**: All Monastir delegations available
- **Consistent Pricing**: Base prices from route table
- **Localized Operations**: Optimized for Monastir transportation needs

---

## 🚀 Getting Started

1. **Start the server**: `npm run dev`
2. **Create admin account**: `POST /api/auth/create-admin`
3. **Login**: `POST /api/auth/login`
4. **Create staff**: `POST /api/staff` (as admin)
5. **Add vehicles**: `POST /api/vehicles`
6. **Enter queue**: `POST /api/queue/enter`
7. **Book seats**: `POST /api/queue-booking/book`

---

## 📝 Notes

- All timestamps are in ISO 8601 format (UTC)
- All monetary amounts are in TND (Tunisian Dinar)
- The system is designed for Monastir delegations only
- Customer information is not required for bookings
- All payments are cash-based
- Seat availability is managed in real-time
- The system automatically handles vehicle status updates based on seat occupancy