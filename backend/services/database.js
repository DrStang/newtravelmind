const mariadb = require('mariadb');

class DatabaseService {
    constructor() {
        this.pool = null;
    }

    async initialize() {
        try {
            this.pool = mariadb.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'travelmind',
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME || 'travelmind',
                connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
                acquireTimeout: 30000,
                timeout: 30000
            });

            console.log('✅ Database connection pool initialized');
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw error;
        }
    }
    async createTables() {
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(255),
                    preferences JSON,
                    travel_style VARCHAR(50) DEFAULT 'moderate',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS trips (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    destination VARCHAR(255) NOT NULL,
                    start_date DATE,
                    end_date DATE,
                    duration INT,
                    budget DECIMAL(10,2),
                    travel_style VARCHAR(50),
                    interests JSON,
                    itinerary JSON,
                    status ENUM('planning', 'active', 'completed') DEFAULT 'planning',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS memories (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    trip_id INT,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    memory_type ENUM('experience', 'photo', 'note', 'recommendation') DEFAULT 'experience',
                    rating INT CHECK (rating >= 1 AND rating <= 5),
                    tags JSON,
                    photos JSON,
                    memory_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (trip_id) REFERENCES trips(id)
                    )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS analytics_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    event_type VARCHAR(100) NOT NULL,
                    event_data JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    )
            `);

            console.log('✅ Database tables created/verified');
        } catch (error) {
            console.error('❌ Table creation failed:', error);
            throw error;
        }
    }

    async testConnection() {
        try {
            const conn = await this.pool.getConnection();
            await conn.query('SELECT 1');
            conn.release();
            return true;
        } catch (error) {
            console.error('Database connection test failed:', error);
            return false;
        }
    }

    async getUserByEmail(email) {
        try {
            const rows = await this.pool.query('SELECT * FROM users WHERE email = ?', [email]);
            return rows[0] || null;
        } catch (error) {
            console.error('Get user by email error:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const rows = await this.pool.query('SELECT * FROM users WHERE id = ?', [id]);
            return rows[0] || null;
        } catch (error) {
            console.error('Get user by ID error:', error);
            throw error;
        }
    }

    async createUser(email, passwordHash, name) {
        try {
            const result = await this.pool.query(`
                INSERT INTO users (email, password_hash, name, preferences, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `, [email, passwordHash, name, JSON.stringify(['sightseeing', 'food', 'culture'])]);

            return result.insertId;
        } catch (error) {
            console.error('Create trip error:', error);
            throw error;
        }
    }

    async getUserTrips(userId, status = null, limit = 20) {
        try {
            let query = 'SELECT * FROM trips WHERE user_id = ?';
            let params = [userId];

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);

            const trips = await this.pool.query(query, params);

            return trips.map(trip => ({
                ...trip,
                interests: JSON.parse(trip.interests || '[]'),
                itinerary: JSON.parse(trip.itinerary || '{}')
            }));
        } catch (error) {
            console.error('Get user trips error:', error);
            throw error;
        }
    }

    async getTripById(tripId, userId) {
        try {
            const rows = await this.pool.query('SELECT * FROM trips WHERE id = ? AND user_id = ?', [tripId, userId]);
            const trip = rows[0];

            if (!trip) return null;

            return {
                ...trip,
                interests: JSON.parse(trip.interests || '[]'),
                itinerary: JSON.parse(trip.itinerary || '{}')
            };
        } catch (error) {
            console.error('Get trip by ID error:', error);
            throw error;
        }
    }
    async createTrip(userId, tripData) {
        try {
            if (!this.pool) {
                throw new Error('Database connection not initialized');
            }

            console.log('Creating trip for user:', userId);

            const result = await this.pool.query(`
      INSERT INTO trips (user_id, title, destination, start_date, end_date, duration, budget, 
                        travel_style, interests, itinerary, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', NOW())
    `, [
                userId,
                tripData.title,
                tripData.destination,
                tripData.startDate || null,
                tripData.endDate || null,
                tripData.duration || null,
                tripData.budget || null,
                tripData.travelStyle || 'moderate',
                JSON.stringify(tripData.interests || []),
                JSON.stringify(tripData.itinerary)
            ]);

            console.log('Trip created successfully:', result.insertId);
            return result.insertId;
        } catch (error) {
            console.error('Create trip error:', error);
            throw error;
        }
    }
    async updateTrip(tripId, userId, updates) {
        try {
            const updateFields = [];
            const updateValues = [];

            Object.keys(updates).forEach(key => {
                if (updates[key] !== undefined) {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]);
                }
            });

            if (updateFields.length > 0) {
                updateValues.push(tripId, userId);
                await this.pool.query(`
                    UPDATE trips
                    SET ${updateFields.join(', ')}, updated_at = NOW()
                    WHERE id = ? AND user_id = ?
                `, updateValues);
            }
        } catch (error) {
            console.error('Update trip error:', error);
            throw error;
        }
    }

    async logAnalyticsEvent(userId, eventType, eventData) {
        try {
            await this.pool.query(`
                INSERT INTO analytics_events (user_id, event_type, event_data, created_at)
                VALUES (?, ?, ?, NOW())
            `, [userId, eventType, JSON.stringify(eventData)]);
        } catch (error) {
            console.error('Log analytics event error:', error);
            throw error;
        }
    }

    async getDashboardAnalytics(userId) {
        try {
            const [tripStats] = await this.pool.query(`
                SELECT
                    COUNT(*) as total_trips,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_trips,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_trips,
                    AVG(budget) as avg_budget,
                    SUM(budget) as total_budget
                FROM trips
                WHERE user_id = ?
            `, [userId]);

            const [memoryStats] = await this.pool.query(`
                SELECT
                    COUNT(*) as total_memories,
                    AVG(rating) as avg_rating,
                    COUNT(DISTINCT DATE(memory_date)) as active_days
                FROM memories
                WHERE user_id = ? AND rating IS NOT NULL
            `, [userId]);

            const recentActivity = await this.pool.query(`
                SELECT 'memory' as type, title as activity, created_at
                FROM memories WHERE user_id = ?
                UNION ALL
                SELECT 'trip' as type, title as activity, created_at
                FROM trips WHERE user_id = ?
                ORDER BY created_at DESC
                    LIMIT 10
            `, [userId, userId]);

            return {
                trips: tripStats,
                memories: memoryStats,
                recentActivity,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Dashboard analytics error:', error);
            throw error;
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('✅ Database connection pool closed');
        }
    }
}

module.exports = { DatabaseService };

