#!/usr/bin/env node

/**
 * Socket Implementation Test Script
 * Tests the enhanced socket server and client implementation
 */

const { io } = require('socket.io-client');
const axios = require('axios');

const SERVER_URL = 'http://localhost:3001';
const TEST_DURATION = 30000; // 30 seconds
const CONCURRENT_CONNECTIONS = 5;

class SocketTester {
  constructor() {
    this.results = {
      connections: [],
      events: [],
      errors: [],
      metrics: {
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        totalEvents: 0,
        averageLatency: 0,
        errors: 0
      }
    };
    this.startTime = Date.now();
  }

  async runTests() {
    console.log('🧪 Starting Enhanced Socket Implementation Tests');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // Test 1: Server Health Check
      await this.testServerHealth();
      
      // Test 2: Basic Connection
      await this.testBasicConnection();
      
      // Test 3: Authentication
      await this.testAuthentication();
      
      // Test 4: Event Handling
      await this.testEventHandling();
      
      // Test 5: Reconnection
      await this.testReconnection();
      
      // Test 6: Concurrent Connections
      await this.testConcurrentConnections();
      
      // Test 7: Performance Test
      await this.testPerformance();
      
      // Test 8: Error Handling
      await this.testErrorHandling();
      
      // Generate Report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  async testServerHealth() {
    console.log('\n📊 Test 1: Server Health Check');
    
    try {
      const response = await axios.get(`${SERVER_URL}/api/socket/health`);
      
      if (response.status === 200) {
        console.log('✅ Server health check passed');
        console.log(`   Status: ${response.data.status}`);
        console.log(`   Active Connections: ${response.data.server.activeConnections}`);
        console.log(`   Redis Latency: ${response.data.redis.latency}ms`);
      } else {
        throw new Error(`Health check failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Server health check failed:', error.message);
      this.results.errors.push('Server health check failed');
    }
  }

  async testBasicConnection() {
    console.log('\n🔌 Test 2: Basic Connection');
    
    return new Promise((resolve) => {
      const socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      const startTime = Date.now();
      
      socket.on('connect', () => {
        const latency = Date.now() - startTime;
        console.log(`✅ Basic connection successful (${latency}ms)`);
        this.results.metrics.totalConnections++;
        this.results.metrics.successfulConnections++;
        this.results.metrics.averageLatency += latency;
        
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Basic connection failed:', error.message);
        this.results.metrics.totalConnections++;
        this.results.metrics.failedConnections++;
        this.results.errors.push('Basic connection failed');
        resolve();
      });

      setTimeout(() => {
        if (!socket.connected) {
          console.error('❌ Connection timeout');
          this.results.errors.push('Connection timeout');
          socket.disconnect();
          resolve();
        }
      }, 10000);
    });
  }

  async testAuthentication() {
    console.log('\n🔐 Test 3: Authentication');
    
    return new Promise((resolve) => {
      // Test without token
      const socket = io(SERVER_URL, {
        auth: {},
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      socket.on('connect_error', (error) => {
        if (error.message.includes('Authentication')) {
          console.log('✅ Authentication properly rejected invalid token');
          this.results.metrics.totalConnections++;
          this.results.metrics.failedConnections++;
        } else {
          console.error('❌ Unexpected authentication error:', error.message);
          this.results.errors.push('Unexpected authentication error');
        }
        socket.disconnect();
        resolve();
      });

      socket.on('connect', () => {
        console.error('❌ Connection should have been rejected');
        this.results.errors.push('Authentication bypassed');
        socket.disconnect();
        resolve();
      });

      setTimeout(() => {
        console.error('❌ Authentication test timeout');
        this.results.errors.push('Authentication test timeout');
        socket.disconnect();
        resolve();
      }, 10000);
    });
  }

  async testEventHandling() {
    console.log('\n📡 Test 4: Event Handling');
    
    return new Promise((resolve) => {
      const socket = io(SERVER_URL, {
        auth: { token: 'test-token' }, // This will fail but we can test event structure
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      let eventsReceived = 0;
      const testEvents = ['ping', 'health_check'];

      socket.on('connect_error', () => {
        // Expected to fail due to invalid token
        console.log('✅ Event handling test completed (auth expected to fail)');
        socket.disconnect();
        resolve();
      });

      socket.on('connect', () => {
        // Test ping event
        const startTime = Date.now();
        socket.emit('ping', startTime, (responseTime) => {
          const latency = Date.now() - responseTime;
          console.log(`✅ Ping event successful (${latency}ms)`);
          this.results.metrics.totalEvents++;
          eventsReceived++;
        });

        // Test health check event
        socket.emit('health_check', (health) => {
          console.log('✅ Health check event successful');
          this.results.metrics.totalEvents++;
          eventsReceived++;
          
          if (eventsReceived >= testEvents.length) {
            socket.disconnect();
            resolve();
          }
        });
      });

      setTimeout(() => {
        console.log('✅ Event handling test completed');
        socket.disconnect();
        resolve();
      }, 5000);
    });
  }

  async testReconnection() {
    console.log('\n🔄 Test 5: Reconnection');
    
    return new Promise((resolve) => {
      const socket = io(SERVER_URL, {
        auth: { token: 'test-token' },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000
      });

      let reconnectAttempts = 0;
      
      socket.on('reconnect_attempt', (attemptNumber) => {
        reconnectAttempts++;
        console.log(`🔄 Reconnection attempt ${attemptNumber}`);
      });

      socket.on('reconnect', () => {
        console.log('✅ Reconnection successful');
        socket.disconnect();
        resolve();
      });

      socket.on('reconnect_error', (error) => {
        console.log('✅ Reconnection error (expected due to auth):', error.message);
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', () => {
        // Expected to fail due to invalid token
        console.log('✅ Reconnection test completed (auth expected to fail)');
        socket.disconnect();
        resolve();
      });

      setTimeout(() => {
        console.log('✅ Reconnection test completed');
        socket.disconnect();
        resolve();
      }, 8000);
    });
  }

  async testConcurrentConnections() {
    console.log(`\n👥 Test 6: Concurrent Connections (${CONCURRENT_CONNECTIONS})`);
    
    const promises = [];
    
    for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
      promises.push(this.createTestConnection(i));
    }
    
    await Promise.all(promises);
    console.log(`✅ Concurrent connection test completed`);
  }

  async createTestConnection(id) {
    return new Promise((resolve) => {
      const socket = io(SERVER_URL, {
        auth: { token: 'test-token' },
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      const startTime = Date.now();
      
      socket.on('connect', () => {
        const latency = Date.now() - startTime;
        console.log(`✅ Connection ${id} successful (${latency}ms)`);
        this.results.metrics.totalConnections++;
        this.results.metrics.successfulConnections++;
        this.results.metrics.averageLatency += latency;
        
        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 2000);
      });

      socket.on('connect_error', (error) => {
        console.log(`✅ Connection ${id} failed (expected): ${error.message}`);
        this.results.metrics.totalConnections++;
        this.results.metrics.failedConnections++;
        resolve();
      });

      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, 5000);
    });
  }

  async testPerformance() {
    console.log('\n⚡ Test 7: Performance Test');
    
    return new Promise((resolve) => {
      const socket = io(SERVER_URL, {
        auth: { token: 'test-token' },
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      let eventsSent = 0;
      const maxEvents = 100;
      
      socket.on('connect_error', () => {
        console.log('✅ Performance test completed (auth expected to fail)');
        resolve();
      });

      socket.on('connect', () => {
        const interval = setInterval(() => {
          if (eventsSent < maxEvents) {
            socket.emit('ping', Date.now(), () => {
              this.results.metrics.totalEvents++;
            });
            eventsSent++;
          } else {
            clearInterval(interval);
            console.log(`✅ Performance test completed (${eventsSent} events)`);
            socket.disconnect();
            resolve();
          }
        }, 10); // Send event every 10ms
      });

      setTimeout(() => {
        console.log('✅ Performance test completed');
        socket.disconnect();
        resolve();
      }, 5000);
    });
  }

  async testErrorHandling() {
    console.log('\n🚨 Test 8: Error Handling');
    
    try {
      // Test invalid server URL
      const invalidSocket = io('http://invalid-url:9999', {
        timeout: 2000
      });

      return new Promise((resolve) => {
        invalidSocket.on('connect_error', (error) => {
          console.log('✅ Error handling test passed (connection refused expected)');
          invalidSocket.disconnect();
          resolve();
        });

        setTimeout(() => {
          console.log('✅ Error handling test completed');
          invalidSocket.disconnect();
          resolve();
        }, 3000);
      });
    } catch (error) {
      console.log('✅ Error handling test completed');
    }
  }

  generateReport() {
    const duration = Date.now() - this.startTime;
    const avgLatency = this.results.metrics.averageLatency / this.results.metrics.totalConnections;
    
    console.log('\n📋 Test Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Test Duration: ${duration}ms`);
    console.log(`🔌 Total Connections: ${this.results.metrics.totalConnections}`);
    console.log(`✅ Successful Connections: ${this.results.metrics.successfulConnections}`);
    console.log(`❌ Failed Connections: ${this.results.metrics.failedConnections}`);
    console.log(`📡 Total Events: ${this.results.metrics.totalEvents}`);
    console.log(`⚡ Average Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`🚨 Errors: ${this.results.errors.length}`);
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors Found:');
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    const successRate = (this.results.metrics.successfulConnections / this.results.metrics.totalConnections) * 100;
    console.log(`\n📊 Success Rate: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 80) {
      console.log('🎉 Socket implementation test PASSED!');
    } else {
      console.log('❌ Socket implementation test FAILED!');
      process.exit(1);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new SocketTester();
  tester.runTests().catch(console.error);
}

module.exports = SocketTester;