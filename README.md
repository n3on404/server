# Louaj Local Node Server

A standalone station-level server for managing local transportation operations, including vehicle queue management, booking processing, and real-time communication via MQTT and Redis.

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **Docker** and **Docker Compose**
- **PostgreSQL** >= 14
- **Redis** >= 7.0
- **EMQX MQTT Broker** >= 5.6.0

### 1. Clone and Install

```bash
git clone <repository-url>
cd loauj_local_node
npm install
```

### 2. Environment Setup

Create a `.env` file in the project root:

```bash
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/louaj_node"

# Server Configuration
PORT=3001
NODE_ENV=development

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=mqtt_client
MQTT_PASSWORD=mqtt_password

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
SESSION_TIMEOUT_HOURS=8

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=./local-node.log

# Development
DEBUG=true
ENABLE_CORS=true
ENABLE_REQUEST_LOGGING=true
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# (Optional) Seed the database
npm run db:seed
```

### 4. Start Services

```bash
# Start Redis and EMQX with Docker
docker-compose up -d

# Start the local node server
npm run dev
```

## 🐳 Docker Services Configuration

### Redis Configuration

**Docker Command:**
```bash
docker run -d \
  --name transportation-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:7.2-alpine \
  redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

**Configuration Details:**
- **Port:** 6379
- **Password:** None (can be set with `--requirepass your_password`)
- **Memory Limit:** 512MB
- **Persistence:** AOF (Append Only File)
- **Eviction Policy:** allkeys-lru

**Connection String:**
```
redis://localhost:6379/0
```

### EMQX MQTT Broker Configuration

**Docker Command:**
```bash
docker run -d \
  --name transportation-mqtt-broker \
  --restart unless-stopped \
  -p 1883:1883 \
  -p 8083:8083 \
  -p 8084:8084 \
  -p 18083:18083 \
  -p 8883:8883 \
  -v emqx_data:/opt/emqx/data \
  -v emqx_log:/opt/emqx/log \
  -v ./emqx-config:/opt/emqx/etc \
  emqx/emqx:5.6.0
```

**Ports:**
- **1883:** MQTT (standard)
- **8083:** MQTT over WebSocket
- **8084:** MQTT over SSL
- **18083:** Dashboard (Web UI)
- **8883:** MQTT over SSL (secure)

**Authentication Credentials:**
- **Dashboard Username:** `admin`
- **Dashboard Password:** `transportation2024`
- **MQTT Username:** `mqtt_client`
- **MQTT Password:** `mqtt_password`

**Connection URLs:**
```
mqtt://localhost:1883
ws://localhost:8083
wss://localhost:8084
```

### Complete Docker Compose Setup

Use the provided `docker-compose.yml`:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## 🔧 Configuration Details

### Redis Configuration

**File:** `src/config/redisConfig.ts`

```typescript
export const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000
};
```

**Environment Variables:**
- `REDIS_HOST`: Redis server hostname (default: localhost)
- `REDIS_PORT`: Redis server port (default: 6379)
- `REDIS_PASSWORD`: Redis password (optional)
- `REDIS_DB`: Redis database number (default: 0)

### MQTT Configuration

**File:** `src/services/mqttService.ts`

```typescript
const config = {
  brokerUrl: env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  clientId: `transportation-server-${Date.now()}`,
  username: env.MQTT_USERNAME,
  password: env.MQTT_PASSWORD,
  keepalive: 60,
  reconnectPeriod: 5000,
  connectTimeout: 10000
};
```

**Environment Variables:**
- `MQTT_BROKER_URL`: MQTT broker URL (default: mqtt://localhost:1883)
- `MQTT_USERNAME`: MQTT username (default: mqtt_client)
- `MQTT_PASSWORD`: MQTT password (default: mqtt_password)

### EMQX Configuration

**File:** `emqx-config/emqx.conf`

```ini
# Node settings
node.name = transportation-broker@127.0.0.1
node.cookie = transportation-cookie-2024

# Network settings
listeners.tcp.default.bind = 0.0.0.0:1883
listeners.tcp.default.max_connections = 1000000
listeners.tcp.default.max_conn_rate = 10000

# WebSocket settings
listeners.ws.default.bind = 0.0.0.0:8083
listeners.ws.default.max_connections = 1000000

# Dashboard settings
dashboard.listeners.http.bind = 0.0.0.0:18083
dashboard.default_username = admin
dashboard.default_password = transportation2024

# Authentication settings
authentication = [
  {
    mechanism = password_based
    backend = built_in_database
    enable = true
  }
]

# Authorization settings
authorization.sources = [
  {
    type = built_in_database
    enable = true
  }
]
```

## 🔐 Authentication & Security

### JWT Configuration

**Environment Variables:**
- `JWT_SECRET`: Secret key for JWT signing (required)
- `JWT_EXPIRES_IN`: Token expiration time (default: 24h)
- `SESSION_TIMEOUT_HOURS`: Session timeout in hours (default: 8)

### MQTT Authentication

**Default Credentials:**
- **Username:** `mqtt_client`
- **Password:** `mqtt_password`

**To add more users:**
1. Access EMQX Dashboard: http://localhost:18083
2. Login with admin/transportation2024
3. Go to "Authentication" → "Built-in Database"
4. Add new users with appropriate permissions

### Redis Security

**No Authentication (Default):**
```bash
redis://localhost:6379/0
```

**With Password:**
```bash
redis://:your_password@localhost:6379/0
```

## 📊 Monitoring & Health Checks

### Service Health Endpoints

```bash
# Local Node Server Health
curl http://localhost:3001/api/health

# Redis Health
docker exec transportation-redis redis-cli ping

# EMQX Health
docker exec transportation-mqtt-broker /opt/emqx/bin/emqx ping
```

### Dashboard Access

- **EMQX Dashboard:** http://localhost:18083
  - Username: `admin`
  - Password: `transportation2024`

### Log Files

- **Application Logs:** `./local-node.log`
- **EMQX Logs:** Docker volume `emqx_log`
- **Redis Logs:** Docker logs `transportation-redis`

## 🚀 Development Commands

```bash
# Development with auto-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database operations
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema to database
npm run db:migrate     # Run migrations
npm run db:studio      # Open Prisma Studio
npm run db:reset       # Reset database

# Type checking
npm run type-check

# Clean build files
npm run clean
```

## 🔧 Troubleshooting

### Common Issues

**1. Redis Connection Failed**
```bash
# Check if Redis is running
docker ps | grep redis

# Check Redis logs
docker logs transportation-redis

# Test Redis connection
docker exec transportation-redis redis-cli ping
```

**2. MQTT Connection Failed**
```bash
# Check if EMQX is running
docker ps | grep emqx

# Check EMQX logs
docker logs transportation-mqtt-broker

# Test MQTT connection
docker exec transportation-mqtt-broker /opt/emqx/bin/emqx ping
```

**3. Database Connection Issues**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
psql -d louaj_node -c "SELECT 1;"

# Check Prisma connection
npm run db:studio
```

### Port Conflicts

If you encounter port conflicts, modify the ports in `docker-compose.yml`:

```yaml
services:
  redis:
    ports:
      - "6380:6379"  # Change host port
  emqx:
    ports:
      - "1884:1883"  # Change host port
      - "18084:18083" # Change dashboard port
```

## 📝 API Documentation

The API documentation is available in `API_DOCUMENTATION.md` with detailed endpoints and examples.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Need Help?** Check the logs, verify your environment variables, and ensure all services are running properly.