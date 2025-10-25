const mariadb = require('mariadb');

class DatabaseService {
    constructor() {
        this.pool = null; 
    }

    async initialize() {
        try {
            if(this.pool) {
                console.log('⚠️ Database pool already exists, skipping initialization');
                return;
            }
            this.pool = mariadb.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'travelmind',
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME || 'travelmind',
                connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
                //ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
                acquireTimeout: 30000,
                timeout: 30000,
                bigIntAsNumber: true, // Convert BigInt to Number automatically
                multipleStatements: false,
                resetAfterUse: true
            });
            const conn = await this.pool.getConnection();
            await conn.query('SELECT 1');
            conn.release();

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
                CREATE TABLE IF NOT EXISTS expenses (
                                                        id INT AUTO_INCREMENT PRIMARY KEY,
                                                        user_id INT NOT NULL,
                                                        trip_id INT,
                                                        title VARCHAR(255) NOT NULL,
                    description TEXT,
                    amount DECIMAL(10,2) NOT NULL,
                    currency VARCHAR(3) DEFAULT 'USD',
                    category VARCHAR(50),
                    expense_date DATE,
                    receipt_photos JSON,
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

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS bookings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    trip_id INT NOT NULL,
                    booking_type ENUM('flight', 'hotel', 'activity', 'transport', 'other') DEFAULT 'other',
                    title VARCHAR(255) NOT NULL,
                    confirmation_number VARCHAR(100),
                    provider VARCHAR(255),
                    status VARCHAR(50) DEFAULT 'confirmed',
                    booking_date DATE,
                    booking_time TIME,
                    location VARCHAR(255),
                    cost DECIMAL(10,2),
                    currency VARCHAR(3) DEFAULT 'USD',
                    details TEXT,
                    alert_message VARCHAR(255),
                    alert_time DATETIME,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                    INDEX idx_trip_id (trip_id),
                    INDEX idx_user_id (user_id),
                    INDEX idx_booking_date (booking_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
            let query = `
                SELECT t.id, t.user_id, t.title, t.destination, t.start_date, t.end_date, 
                       t.duration, t.budget, t.travel_style, t.interests, t.itinerary, 
                       t.status as old_status, t.created_at, t.updated_at,
                CASE 
                    WHEN t.start_date IS NULL THEN 'planning'
                    WHEN t.start_date > NOW() THEN 'upcoming'
                    WHEN t.start_date <= NOW() AND t.end_date >= NOW() THEN 'active'
                    ELSE 'completed'
                END as computed_status,
                COUNT(b.id) as booking_count,
                COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.cost ELSE 0 END), 0) as total_spent
                FROM trips t
                LEFT JOIN bookings b ON t.id = b.trip_id
                WHERE t.user_id = ?
                GROUP BY t.id
            `;
            let params = [userId];

            if (status) {
                query += ` HAVING computed_status = ?`;
                params.push(status);
            }

            query += ' ORDER BY t.created_at DESC LIMIT ?';
            params.push(limit);

            const trips = await this.pool.query(query, params);

            return trips.map(trip => ({
                ...trip,
                status: trip.computed_status,
                interests: JSON.parse(trip.interests || '[]'),
                itinerary: JSON.parse(trip.itinerary || '{}'),
                bookingCount: trip.booking_count,
                totalSpent: parseFloat(trip.total_spent),
                remainingBudget: (trip.budget || 0) - parseFloat(trip.total_spent)
            }));
        } catch (error) {
            console.error('Get user trips error:', error);
            throw error;
        }
    }
    async getActiveTrips(userId) {
        try {
            const trips = await this.pool.query(`
                SELECT t.id, t.user_id, t.title, t.destination, t.start_date, t.end_date, 
                       t.duration, t.budget, t.travel_style, t.interests, t.itinerary, 
                       t.status as old_status, t.created_at, t.updated_at,
                COUNT(b.id) as booking_count,
                COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.cost ELSE 0 END), 0) as total_spent
                FROM trips t
                LEFT JOIN bookings b ON t.id = b.trip_id
                WHERE t.user_id = ? 
                AND t.start_date IS NOT NULL
                AND t.start_date <= NOW() 
                AND t.end_date >= NOW()
                GROUP BY t.id
                ORDER BY t.start_date DESC
            `, [userId]);

            return trips.map(trip => ({
                ...trip,
                status: 'active',
                interests: JSON.parse(trip.interests || '[]'),
                itinerary: JSON.parse(trip.itinerary || '{}'),
                bookingCount: trip.booking_count,
                totalSpent: parseFloat(trip.total_spent),
                remainingBudget: (trip.budget || 0) - parseFloat(trip.total_spent)
            }));
        } catch (error) {
            console.error('Get active trips error:', error);
            throw error;
        }
    }

    async getUpcomingTrips(userId) {
        try {
            const trips = await this.pool.query(`
                SELECT t.id, t.user_id, t.title, t.destination, t.start_date, t.end_date, 
                       t.duration, t.budget, t.travel_style, t.interests, t.itinerary, 
                       t.status as old_status, t.created_at, t.updated_at,
                COUNT(b.id) as booking_count,
                COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.cost ELSE 0 END), 0) as total_spent
                FROM trips t
                LEFT JOIN bookings b ON t.id = b.trip_id
                WHERE t.user_id = ? 
                AND t.start_date IS NOT NULL 
                AND t.start_date > NOW()
                AND t.end_date IS NOT NULL
                GROUP BY t.id
                ORDER BY t.start_date ASC
            `, [userId]);

            return trips.map(trip => ({
                ...trip,
                status: 'upcoming',
                interests: JSON.parse(trip.interests || '[]'),
                itinerary: JSON.parse(trip.itinerary || '{}'),
                bookingCount: trip.booking_count,
                totalSpent: parseFloat(trip.total_spent),
                remainingBudget: (trip.budget || 0) - parseFloat(trip.total_spent)
            }));
        } catch (error) {
            console.error('Get upcoming trips error:', error);
            throw error;
        }
    }
    async getTripById(tripId, userId) {
        try {
            const rows = await this.pool.query(`
                SELECT t.id, t.user_id, t.title, t.destination, t.start_date, t.end_date, 
                       t.duration, t.budget, t.travel_style, t.interests, t.itinerary, 
                       t.status as old_status, t.created_at, t.updated_at,
                CASE 
                    WHEN t.start_date IS NULL THEN 'planning'
                    WHEN t.start_date > NOW() THEN 'upcoming'
                    WHEN t.start_date <= NOW() AND t.end_date >= NOW() THEN 'active'
                    ELSE 'completed'
                END as computed_status,
                COUNT(b.id) as booking_count,
                COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.cost ELSE 0 END), 0) as total_spent
                FROM trips t
                LEFT JOIN bookings b ON t.id = b.trip_id
                WHERE t.id = ? AND t.user_id = ?
                GROUP BY t.id
            `, [tripId, userId]);

            const trip = rows[0];

            if (!trip) return null;

            return {
                ...trip,
                status: trip.computed_status,
                interests: JSON.parse(trip.interests || '[]'),
                itinerary: JSON.parse(trip.itinerary || '{}'),
                bookingCount: trip.booking_count,
                totalSpent: parseFloat(trip.total_spent),
                remainingBudget: (trip.budget || 0) - parseFloat(trip.total_spent)
            };
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
    async getTripBookings(tripId, userId) {
        try {
            // Verify trip belongs to user
            const trip = await this.getTripById(tripId, userId);
            if (!trip) {
                throw new Error('Trip not found');
            }

            const bookings = await this.pool.query(`
                SELECT * FROM bookings
                WHERE trip_id = ?
                ORDER BY booking_date ASC, booking_time ASC
            `, [tripId]);

            return bookings;
        } catch (error) {
            console.error('Get trip bookings error:', error);
            throw error;
        }
    }

    async createBooking(userId, tripId, bookingData) {
        try {
            // Verify trip belongs to user
            const trip = await this.getTripById(tripId, userId);
            if (!trip) {
                throw new Error('Trip not found');
            }

            const result = await this.pool.query(`
                INSERT INTO bookings (
                    user_id, trip_id, booking_type, title, confirmation_number,
                    provider, status, booking_date, booking_time, location,
                    cost, currency, details, alert_message, alert_time, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                userId,
                tripId,
                bookingData.type || 'other',
                bookingData.title,
                bookingData.confirmationNumber || null,
                bookingData.provider || null,
                bookingData.status || 'confirmed',
                bookingData.bookingDate || null,
                bookingData.bookingTime || null,
                bookingData.location || null,
                bookingData.cost || null,
                bookingData.currency || 'USD',
                bookingData.details || null,
                bookingData.alertMessage || null,
                bookingData.alertTime || null
            ]);

            return result.insertId;
        } catch (error) {
            console.error('Create booking error:', error);
            throw error;
        }
    }

    async getBookingById(bookingId, userId) {
        try {
            const rows = await this.pool.query(`
                SELECT b.* FROM bookings b
                INNER JOIN trips t ON b.trip_id = t.id
                WHERE b.id = ? AND t.user_id = ?
            `, [bookingId, userId]);

            return rows[0] || null;
        } catch (error) {
            console.error('Get booking by ID error:', error);
            throw error;
        }
    }

    async updateBooking(bookingId, userId, updates) {
        try {
            // Verify booking belongs to user's trip
            const booking = await this.getBookingById(bookingId, userId);
            if (!booking) {
                throw new Error('Booking not found');
            }

            const updateFields = [];
            const updateValues = [];

            // Map of allowed fields
            const allowedFields = [
                'booking_type', 'title', 'confirmation_number', 'provider',
                'status', 'booking_date', 'booking_time', 'location',
                'cost', 'currency', 'details', 'alert_message', 'alert_time'
            ];

            Object.keys(updates).forEach(key => {
                if (updates[key] !== undefined && allowedFields.includes(key)) {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(updates[key]);
                }
            });

            if (updateFields.length > 0) {
                updateValues.push(bookingId);
                await this.pool.query(`
                    UPDATE bookings
                    SET ${updateFields.join(', ')}, updated_at = NOW()
                    WHERE id = ?
                `, updateValues);
            }

            // Return updated booking
            return await this.getBookingById(bookingId, userId);
        } catch (error) {
            console.error('Update booking error:', error);
            throw error;
        }
    }

    async deleteBooking(bookingId, userId) {
        try {
            // Verify booking belongs to user's trip
            const booking = await this.getBookingById(bookingId, userId);
            if (!booking) {
                throw new Error('Booking not found');
            }

            await this.pool.query('DELETE FROM bookings WHERE id = ?', [bookingId]);
            return true;
        } catch (error) {
            console.error('Delete booking error:', error);
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
                    COUNT(CASE WHEN start_date IS NULL THEN 1 END) as planning_trips,
                    COUNT(CASE WHEN start_date > NOW() THEN 1 END) as upcoming_trips,
                    COUNT(CASE WHEN start_date <= NOW() AND end_date >= NOW() THEN 1 END) as active_trips,
                    COUNT(CASE WHEN end_date < NOW() THEN 1 END) as completed_trips,
                    AVG(budget) as avg_budget,
                    SUM(budget) as total_budget
                FROM trips 
                WHERE user_id = ?
            `, [userId]);

            const [bookingStats] = await this.pool.query(`
                SELECT
                    COUNT(*) as total_bookings,
                    COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as confirmed_bookings,
                    COUNT(CASE WHEN b.status = 'pending' THEN 1 END) as pending_bookings,
                    COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN cost ELSE 0 END), 0) as total_spent
                FROM bookings b
                INNER JOIN trips t ON b.trip_id = t.id
                WHERE t.user_id = ?
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
                UNION ALL
                SELECT 'booking' as type, b.title as activity, b.created_at 
                FROM bookings b
                INNER JOIN trips t ON b.trip_id = t.id
                WHERE t.user_id = ?
                ORDER BY created_at DESC 
                LIMIT 10
            `, [userId, userId, userId]);

            return {
                trips: tripStats,
                bookings: bookingStats,
                memories: memoryStats,
                recentActivity,
                generatedAt: new Date().toISOString()
            };
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



