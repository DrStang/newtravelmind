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
                database: process.env.DB_NAME || 'travelmind_db',
                connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
                acquireTimeout: 30000,
                timeout: 30000,
                bigIntAsNumber: true // Convert BigInt to Number automatically
            });

            console.log('✅ Database connection pool initialized');
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
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
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS ai_conversations (
                                                                id INT AUTO_INCREMENT PRIMARY KEY,
                                                                user_id INT NOT NULL,
                                                                user_message MEDIUMTEXT,
                                                                ai_response JSON,
                                                                context JSON,
                                                                model_used VARCHAR(100),
                    response_time_ms INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    )
            `);
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS user_locations (
                                                              id INT AUTO_INCREMENT PRIMARY KEY,
                                                              user_id INT NOT NULL,
                                                              latitude DECIMAL(10,8),
                    longitude DECIMAL(10,8),
                    accuracy INT,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    )
            `);

            console.log('✅ Database tables created/verified');
        } catch (error) {
            console.error('❌ Table creation failed:', error);
            throw error;
        }
    }
    // Helper: Safe JSON parsing
    safeJsonParse(jsonString, defaultValue = null) {
        if (!jsonString) return defaultValue;
        if (typeof jsonString === 'object') return jsonString;

        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('JSON parse error:', error.message);
            return defaultValue;
        }
    }

    // Helper: Convert BigInt to Number
    convertBigIntToNumber(obj) {
        if (obj === null || obj === undefined) return obj;

        if (typeof obj === 'bigint') {
            return Number(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.convertBigIntToNumber(item));
        }

        if (typeof obj === 'object') {
            const converted = {};
            for (const key in obj) {
                converted[key] = this.convertBigIntToNumber(obj[key]);
            }
            return converted;
        }

        return obj;
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

            return Number(result.insertId);
        } catch (error) {
            console.error('Create user error:', error);
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
                JSON.stringify(tripData.itinerary || {})
            ]);

            const tripId = Number(result.insertId);
            console.log('Trip created successfully:', tripId);
            return tripId;
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

            // Safe JSON parsing with error handling
            return trips.map(trip => {
                try {
                    return this.convertBigIntToNumber({
                        ...trip,
                        interests: this.safeJsonParse(trip.interests, []),
                        itinerary: this.safeJsonParse(trip.itinerary, {})
                    });
                } catch (error) {
                    console.error('Error processing trip:', trip.id, error);
                    return this.convertBigIntToNumber({
                        ...trip,
                        interests: [],
                        itinerary: {}
                    });
                }
            });
        } catch (error) {
            console.error('Get user trips error:', error);
            throw error;
        }
    }

    async getTripById(tripId, userId) {
        try {
            const rows = await this.pool.query(
                'SELECT * FROM trips WHERE id = ? AND user_id = ?',
                [tripId, userId]
            );
            const trip = rows[0];

            if (!trip) return null;

            return this.convertBigIntToNumber({
                ...trip,
                interests: this.safeJsonParse(trip.interests, []),
                itinerary: this.safeJsonParse(trip.itinerary, {})
            });
        } catch (error) {
            console.error('Get trip by ID error:', error);
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
                    updateValues.push(
                        typeof updates[key] === 'object'
                            ? JSON.stringify(updates[key])
                            : updates[key]
                    );
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
    async createTripFlight(userId, tripId, flightData) {
        try {
            // First check if trip_flights table exists, if not create it
            await this.pool.query(`
            CREATE TABLE IF NOT EXISTS trip_flights (
                id INT AUTO_INCREMENT PRIMARY KEY,
                trip_id INT NOT NULL,
                user_id INT NOT NULL,
                offer_id VARCHAR(255),
                origin VARCHAR(10),
                destination VARCHAR(10),
                departure_date DATE,
                return_date DATE,
                price DECIMAL(10,2),
                currency VARCHAR(10),
                airline VARCHAR(50),
                airline_name VARCHAR(255),
                itinerary_data JSON,
                passengers INT,
                travel_class VARCHAR(50),
                status VARCHAR(50) DEFAULT 'selected',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_trip (trip_id),
                INDEX idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

            const result = await this.pool.query(`
            INSERT INTO trip_flights (
                trip_id, user_id, offer_id, origin, destination, 
                departure_date, return_date, price, currency, airline, 
                airline_name, itinerary_data, passengers, travel_class, 
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'selected', NOW())
        `, [
                tripId,
                userId,
                flightData.offerId,
                flightData.origin,
                flightData.destination,
                flightData.departureDate,
                flightData.returnDate || null,
                flightData.price,
                flightData.currency,
                flightData.airline,
                flightData.airlineName,
                JSON.stringify(flightData.itinerary),
                flightData.passengers,
                flightData.travelClass
            ]);

            return Number(result.insertId);
        } catch (error) {
            console.error('Create trip flight error:', error);
            throw error;
        }
    }

    async getTripFlights(tripId, userId) {
        try {
            const flights = await this.pool.query(`
            SELECT * FROM trip_flights 
            WHERE trip_id = ? AND user_id = ?
            ORDER BY departure_date ASC
        `, [tripId, userId]);

            return flights.map(f => this.convertBigIntToNumber({
                ...f,
                itinerary_data: this.safeJsonParse(f.itinerary_data, {})
            }));
        } catch (error) {
            console.error('Get trip flights error:', error);
            throw error;
        }
    }

    async deleteTripFlight(flightId, userId) {
        try {
            await this.pool.query(`
            DELETE FROM trip_flights 
            WHERE id = ? AND user_id = ?
        `, [flightId, userId]);
        } catch (error) {
            console.error('Delete trip flight error:', error);
            throw error;
        }
    }

    async saveConversation(userId, userMessage, aiResponse, context, model, responseTime) {
        try {
            if (!this.pool) {
                console.warn('Database not initialized, skipping conversation save');
                return;
            }

            await this.pool.query(`
                INSERT INTO ai_conversations
                (user_id, user_message, ai_response, context, model_used, response_time_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `, [
                userId,
                userMessage,
                aiResponse,
                JSON.stringify(context || {}),
                model || 'unknown',
                responseTime || 0
            ]);

            console.log('Conversation saved for user:', userId);
        } catch (error) {
            console.error('Save conversation error (non-blocking):', error.message);
        }
    }

    async saveUserLocation(userId, latitude, longitude, accuracy) {
        try {
            await this.pool.query(`
                INSERT INTO user_locations (user_id, latitude, longitude, accuracy, recorded_at)
                VALUES (?, ?, ?, ?, NOW())
            `, [userId, latitude, longitude, accuracy]);
        } catch (error) {
            console.error('Save user location error:', error);
        }
    }
    async logAnalyticsEvent(userId, eventType, eventData) {
        try {
            // First check if analytics_events table exists
            const tableExists = await this.pool.query(`
                SELECT COUNT(*) as count
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = 'analytics_events'
            `);

            if (tableExists[0].count === 0) {
                // Create the table if it doesn't exist
                await this.pool.query(`
                    CREATE TABLE IF NOT EXISTS analytics_events (
                                                                    id INT AUTO_INCREMENT PRIMARY KEY,
                                                                    user_id INT NOT NULL,
                                                                    event_type VARCHAR(100) NOT NULL,
                        event_data JSON,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_user_event (user_id, event_type),
                        INDEX idx_created (created_at),
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log('✅ Created analytics_events table');
            }

            // Insert the analytics event
            await this.pool.query(`
                INSERT INTO analytics_events (user_id, event_type, event_data, created_at)
                VALUES (?, ?, ?, NOW())
            `, [userId, eventType, JSON.stringify(eventData)]);

        } catch (error) {
            // Log but don't throw - analytics shouldn't break the app
            console.error('⚠️ Log analytics event error:', error.message);
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

            return this.convertBigIntToNumber({
                trips: tripStats || {},
                memories: memoryStats || {},
                recentActivity: recentActivity || [],
                generatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Dashboard analytics error:', error);
            throw error;
        }
    }
    async getAnalyticsEvents(userId, filters = {}) {
        try {
            let query = `
                SELECT * FROM analytics_events
                WHERE user_id = ?
            `;
            let params = [userId];

            if (filters.eventType) {
                query += ` AND event_type = ?`;
                params.push(filters.eventType);
            }

            if (filters.dateFrom) {
                query += ` AND created_at >= ?`;
                params.push(filters.dateFrom);
            }

            if (filters.dateTo) {
                query += ` AND created_at <= ?`;
                params.push(filters.dateTo);
            }

            query += ` ORDER BY created_at DESC`;

            if (filters.limit) {
                query += ` LIMIT ?`;
                params.push(parseInt(filters.limit));
            }

            const events = await this.pool.query(query, params);

            return events.map(event => ({
                ...event,
                event_data: JSON.parse(event.event_data || '{}')
            }));
        } catch (error) {
            console.error('Get analytics events error:', error);
            return [];
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
