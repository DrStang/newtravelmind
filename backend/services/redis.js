const redis = require('redis');

class RedisService {
    constructor() {
        this.client = null;
    }

    async initialize() {
        try {
            this.client = redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD
            });

            this.client.on('error', (err) => console.log('Redis Client Error', err));
            await this.client.connect();

            console.log('✅ Redis connection initialized');
        } catch (error) {
            console.error('❌ Redis initialization failed:', error);
            throw error;
        }
    }

    async testConnection() {
        try {
            await this.client.ping();
            return true;
        } catch (error) {
            console.error('Redis connection test failed:', error);
            return false;
        }
    }

    async setConversationCache(userId, response) {
        try {
            await this.client.setEx(`chat:${userId}:latest`, 300, JSON.stringify(response));
        } catch (error) {
            console.error('Set conversation cache error:', error);
        }
    }

    async getConversationCache(userId) {
        try {
            const cached = await this.client.get(`chat:${userId}:latest`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Get conversation cache error:', error);
            return null;
        }
    }

    async setPlacesCache(location, type, places) {
        try {
            const key = `places:${location.lat}:${location.lng}:${type}`;
            await this.client.setEx(key, 1800, JSON.stringify(places)); // 30 minutes
        } catch (error) {
            console.error('Set places cache error:', error);
        }
    }

    async getPlacesCache(location, type) {
        try {
            const key = `places:${location.lat}:${location.lng}:${type}`;
            const cached = await this.client.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Get places cache error:', error);
            return null;
        }
    }

    async close() {
        if (this.client) {
            await this.client.quit();
            console.log('✅ Redis connection closed');
        }
    }
}

module.exports = { RedisService };