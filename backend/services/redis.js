const redis = require('redis');

class RedisService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.isAttempting = false;
    }

    async initialize() {
        // Don't block if already attempting connection
        if (this.isAttempting) {
            console.log('Redis connection already in progress...');
            return;
        }

        this.isAttempting = true;

        try {
            console.log('🔄 Attempting Redis connection...');
            
            // Check if we have Redis configuration
            if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
                console.log('⚠️  No Redis configuration found, running without cache');
                this.client = this.createMockClient();
                this.isAttempting = false;
                return;
            }

            let redisConfig;

            // Try REDIS_URL first (Railway format)
            if (process.env.REDIS_URL) {
                console.log('Using REDIS_URL configuration');
                redisConfig = {
                    url: process.env.REDIS_URL,
                    socket: {
                        connectTimeout: 5000, // 5 second timeout
                        commandTimeout: 3000,
                        family: 4 // Force IPv4
                    }
                };
            } else {
                // Fallback to individual variables
                console.log('Using individual Redis environment variables');
                redisConfig = {
                    socket: {
                        host: process.env.REDIS_HOST,
                        port: parseInt(process.env.REDIS_PORT) || 6379,
                        connectTimeout: 5000,
                        commandTimeout: 3000,
                        family: 4
                    },
                    password: process.env.REDIS_PASSWORD
                };
            }

            this.client = redis.createClient(redisConfig);

            // Set up event handlers BEFORE connecting
            this.client.on('error', (err) => {
                console.warn('⚠️  Redis Error (non-blocking):', err.message);
                this.isConnected = false;
                // Don't throw, just log
            });

            this.client.on('connect', () => {
                console.log('✅ Redis connected successfully');
                this.isConnected = true;
            });

            this.client.on('disconnect', () => {
                console.log('📤 Redis disconnected');
                this.isConnected = false;
            });

            // Connect with timeout - NON-BLOCKING
            const connectionPromise = this.client.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
            );

            await Promise.race([connectionPromise, timeoutPromise]);
            
            console.log('✅ Redis initialization completed');

        } catch (error) {
            console.warn('⚠️  Redis connection failed, using mock client:', error.message);
            
            // Close any partial connection
            if (this.client) {
                try { await this.client.quit(); } catch {}
            }
            
            // Create mock client - app continues without Redis
            this.client = this.createMockClient();
            this.isConnected = false;
        } finally {
            this.isAttempting = false;
        }
    }

    // Mock client that mimics Redis interface but does nothing
    createMockClient() {
        console.log('🔧 Creating Redis mock client');
        return {
            ping: async () => 'PONG',
            get: async () => null,
            setEx: async () => 'OK',
            quit: async () => 'OK',
            isOpen: false,
            isReady: false
        };
    }

    async testConnection() {
        try {
            if (!this.isConnected || !this.client) return false;
            const result = await this.client.ping();
            return result === 'PONG';
        } catch (error) {
            return false;
        }
    }

    // All cache methods are now safe and non-blocking
    async setConversationCache(userId, response) {
        try {
            if (!this.isConnected) return;
            await this.client.setEx(`chat:${userId}:latest`, 300, JSON.stringify(response));
        } catch (error) {
            console.warn('Cache set failed (continuing):', error.message);
        }
    }

    async getConversationCache(userId) {
        try {
            if (!this.isConnected) return null;
            const cached = await this.client.get(`chat:${userId}:latest`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('Cache get failed (continuing):', error.message);
            return null;
        }
    }

    async setPlacesCache(location, type, places) {
        try {
            if (!this.isConnected) return;
            const key = `places:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${type}`;
            await this.client.setEx(key, 1800, JSON.stringify(places));
        } catch (error) {
            console.warn('Places cache set failed (continuing):', error.message);
        }
    }

    async getPlacesCache(location, type) {
        try {
            if (!this.isConnected) return null;
            const key = `places:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${type}`;
            const cached = await this.client.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('Places cache get failed (continuing):', error.message);
            return null;
        }
    }

    async close() {
        try {
            if (this.client && this.isConnected) {
                await this.client.quit();
            }
        } catch (error) {
            console.warn('Redis close error (ignored):', error.message);
        }
    }

    // Utility methods
    isAvailable() {
        return this.isConnected;
    }

    getStatus() {
        return {
            connected: this.isConnected,
            attempting: this.isAttempting,
            hasClient: !!this.client
        };
    }
}

module.exports = { RedisService };
