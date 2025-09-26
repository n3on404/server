import { config } from 'dotenv';
import { configService } from './supervisorConfig';

// Load environment variables from .env file
config();

interface EnvironmentConfig {
  // Database
  DATABASE_URL: string;
  
  // Server Configuration
  PORT: number;
  NODE_ENV: string;
  
  // Station Configuration
  STATION_ID: string;
  STATION_NAME: string;
  GOVERNORATE: string;
  DELEGATION: string;
  
  // Redis Configuration
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string | undefined;
  REDIS_DB: number;
  
  // Authentication
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  SESSION_TIMEOUT_HOURS: number;
  
  // MQTT Configuration
  MQTT_BROKER_URL: string;
  MQTT_USERNAME?: string | undefined;
  MQTT_PASSWORD?: string | undefined;
  
  // Logging
  LOG_LEVEL: string;
  LOG_TO_FILE: boolean;
  LOG_FILE_PATH: string;
  
  // Development
  DEBUG: boolean;
  ENABLE_CORS: boolean;
  ENABLE_REQUEST_LOGGING: boolean;
}

export const env: EnvironmentConfig = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/local.db',
  
  // Server Configuration
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Station Configuration - Now using config service (no env fallback for station info)
  STATION_ID: configService.getStationId(),
  STATION_NAME: configService.getStationName(),
  GOVERNORATE: configService.getGovernorate(),
  DELEGATION: configService.getDelegation(),
  
  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),
  
  // Authentication
  JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key-for-local-sessions',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  SESSION_TIMEOUT_HOURS: parseInt(process.env.SESSION_TIMEOUT_HOURS || '8', 10),
  
  // MQTT Configuration
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  MQTT_USERNAME: process.env.MQTT_USERNAME || 'mqtt_client',
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || 'mqtt_password',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs/local-node.log',
  
  // Development
  DEBUG: process.env.DEBUG === 'true',
  ENABLE_CORS: process.env.ENABLE_CORS !== 'false',
  ENABLE_REQUEST_LOGGING: process.env.ENABLE_REQUEST_LOGGING !== 'false',
};

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !env[varName as keyof EnvironmentConfig]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

export default env; 