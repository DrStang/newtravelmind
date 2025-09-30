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

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ Database connection pool closed');
    }
  }
}

module.exports = { DatabaseService };
