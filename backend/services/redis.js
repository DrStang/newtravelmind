const redis = require('redis');

class RedisService {
    constructor() {
        this.client = null;
    }

    async initialize() {
        try {
            // Debug: Log environment variables (remove in production)
            console.log('Redis Config Debug:');
            console.log('REDIS_HOST:', process.env.REDIS_HOST);
            console.log('REDIS_PORT:', process.env.REDIS_PORT);
            console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***SET***' : 'NOT SET');

            // Railway Redis configuration
            const redisConfig = {
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    // Force IPv4 to avoid IPv6 issues
                    family: 4,
                    // Increase timeout for Railway
                    connectTimeout: 60000,
                    commandTimeout: 5000,
                },
                // Add password if provided
                ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
                // Retry configuration for Railway
                retry_delay_on_failover: 100,
                retry_delay_on_cluster_down: 300,
                max_attempts: 5,
            };

            // Alternative configuration for Railway using URL
            if (process.env.REDIS_URL) {
                console.log('Using REDIS_URL configuration');
                this.client = redis.createClient({
                    url: process.env.REDIS_URL,
                    socket: {
                        family: 4,
                        connectTimeout: 60000,
                    }
                });
            } else {
                console.log('Using individual Redis environment variables');
                this.client = redis.createClient(redisConfig);
            }

            // Enhanced error handling
            this.client.on('error', (err) => {
                console.error('Redis Client Error:', err);
                // Don't throw here, just log
            });

            this.client.on('connect', () => {
                console.log('✅ Redis client connected');
            });

            this.client.on('ready', () => {
                console.log('✅ Redis client ready');
            });

            this.client.on('end', () => {
                console.log('📝 Redis client connection ended');
            });

            this.client.on('reconnecting', () => {
                console.log('🔄 Redis client reconnecting...');
            });

            // Connect with timeout
            const connectTimeout = setTimeout(() => {
                console.error('❌ Redis connection timeout after 30 seconds');
            }, 30000);

            await this.client.connect();
            clearTimeout(connectTimeout);

            console.log('✅ Redis connection initialized successfully');
        } catch (error) {
            console.error('❌ Redis initialization failed:', error);
            
            // For Railway deployment, Redis might not be immediately available
            // We'll create a mock client that gracefully handles failures
            if (process.env.NODE_ENV === 'production') {
                console.log('🔄 Creating fallback Redis client for production');
                this.client = this.createFallbackClient();
            } else {
                throw error;
            }
        }
    }

    // Fallback client that doesn't crash the app if Redis is unavailable
    createFallbackClient() {
        return {
            ping: async () => false,
            get: async () => null,
            setEx: async () => 'OK',
            quit: async () => 'OK',
            isOpen: false
        };
    }

    async testConnection() {
        try {
            if (!this.client || !this.client.isOpen) {
                console.log('Redis client not connected');
                return false;
            }
            
            const result = await this.client.ping();
            console.log('Redis ping result:', result);
            return result === 'PONG';
        } catch (error) {
            console.error('Redis connection test failed:', error);
            return false;
        }
    }

    async setConversationCache(userId, response) {
        try {
            if (!this.client || !this.client.isOpen) {
                console.log('Redis not available, skipping cache set');
                return;
            }
            
            await this.client.setEx(`chat:${userId}:latest`, 300, JSON.stringify(response));
            console.log(`Cached conversation for user ${userId}`);
        } catch (error) {
            console.error('Set conversation cache error:', error);
            // Don't throw, just log and continue
        }
    }

    async getConversationCache(userId) {
        try {
            if (!this.client || !this.client.isOpen) {
                console.log('Redis not available, skipping cache get');
                return null;
            }
            
            const cached = await this.client.get(`chat:${userId}:latest`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Get conversation cache error:', error);
            return null;
        }
    }

    async setPlacesCache(location, type, places) {
        try {
            if (!this.client || !this.client.isOpen) {
                console.log('Redis not available, skipping places cache set');
                return;
            }
            
            const key = `places:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${type}`;
            await this.client.setEx(key, 1800, JSON.stringify(places)); // 30 minutes
            console.log(`Cached places for ${key}`);
        } catch (error) {
            console.error('Set places cache error:', error);
        }
    }

    async getPlacesCache(location, type) {
        try {
            if (!this.client || !this.client.isOpen) {
                console.log('Redis not available, skipping places cache get');
                return null;
            }
            
            const key = `places:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${type}`;
            const cached = await this.client.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Get places cache error:', error);
            return null;
        }
    }

    async close() {
        try {
            if (this.client && this.client.isOpen) {
                await this.client.quit();
                console.log('✅ Redis connection closed');
            }
        } catch (error) {
            console.error('Error closing Redis connection:', error);
        }
    }

    // Utility method to check if Redis is available
    isAvailable() {
        return this.client && this.client.isOpen;
    }

    // Method to reinitialize connection if needed
    async reconnect() {
        try {
            if (this.client) {
                await this.client.quit();
            }
            await this.initialize();
        } catch (error) {
            console.error('Redis reconnection failed:', error);
        }
    }
}

module.exports = { RedisService };
