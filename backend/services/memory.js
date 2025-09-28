const { DatabaseService } = require('./database');

class MemoryService {
    static async createMemory(userId, memoryData) {
        try {
            const database = new DatabaseService();
            await database.initialize();

            const result = await database.pool.query(`
        INSERT INTO memories (user_id, trip_id, memory_type, title, description, location, 
                             photos, notes, rating, tags, memory_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
                userId,
                memoryData.tripId || null,
                memoryData.type || 'experience',
                memoryData.title,
                memoryData.description,
                JSON.stringify(memoryData.location || {}),
                JSON.stringify(memoryData.photos || []),
                memoryData.notes,
                memoryData.rating || null,
                JSON.stringify(memoryData.tags || []),
                memoryData.date || new Date()
            ]);

            await database.close();
            return result.insertId;
        } catch (error) {
            console.error('Memory creation error:', error);
            throw error;
        }
    }

    static async getUserMemories(userId, filters = {}) {
        try {
            const database = new DatabaseService();
            await database.initialize();

            let query = `
        SELECT m.*, t.title as trip_title, t.destination 
        FROM memories m 
        LEFT JOIN trips t ON m.trip_id = t.id 
        WHERE m.user_id = ?
      `;
            let params = [userId];

            if (filters.tripId) {
                query += ` AND m.trip_id = ?`;
                params.push(filters.tripId);
            }

            if (filters.type) {
                query += ` AND m.memory_type = ?`;
                params.push(filters.type);
            }

            if (filters.dateFrom) {
                query += ` AND m.memory_date >= ?`;
                params.push(filters.dateFrom);
            }

            if (filters.dateTo) {
                query += ` AND m.memory_date <= ?`;
                params.push(filters.dateTo);
            }

            query += ` ORDER BY m.memory_date DESC`;

            if (filters.limit) {
                query += ` LIMIT ?`;
                params.push(filters.limit);
            }

            const memories = await database.pool.query(query, params);
            await database.close();

            return memories.map(memory => ({
                ...memory,
                location: JSON.parse(memory.location || '{}'),
                photos: JSON.parse(memory.photos || '[]'),
                tags: JSON.parse(memory.tags || '[]')
            }));
        } catch (error) {
            console.error('Get memories error:', error);
            throw error;
        }
    }

    static async generateTravelStory(userId, tripId = null) {
        try {
            const memories = await this.getUserMemories(userId, { tripId });

            if (memories.length === 0) {
                return { story: 'No memories found to create a story.', memories: [] };
            }

            const { OllamaService } = require('./ollama');
            const ollama = new OllamaService();

            const prompt = `Create an engaging travel story based on these memories:

${memories.map(m => `
- ${m.title} at ${m.location?.name || 'Unknown location'}
- Date: ${m.memory_date}
- Rating: ${m.rating ? `${m.rating}/5` : 'Not rated'}
- Notes: ${m.notes || 'No notes'}
- Description: ${m.description || 'No description'}
`).join('\n')}

Write a compelling narrative that weaves these experiences together into a cohesive travel story. 
Make it personal and engaging, highlighting the journey's progression and emotional moments.
Length: 300-500 words.`;

            const response = await ollama.chat(prompt, { mode: 'analysis' }, 'analysis');

            return {
                story: response.message,
                memories: memories,
                generatedAt: new Date().toISOString(),
                wordCount: response.message.split(' ').length
            };
        } catch (error) {
            console.error('Travel story generation error:', error);
            throw error;
        }
    }

    static async getTravelStatistics(userId) {
        try {
            const database = new DatabaseService();
            await database.initialize();

            const [stats] = await database.pool.query(`
        SELECT 
          COUNT(*) as total_memories,
          COUNT(DISTINCT trip_id) as total_trips,
          AVG(rating) as average_rating,
          MIN(memory_date) as first_memory,
          MAX(memory_date) as latest_memory
        FROM memories 
        WHERE user_id = ? AND rating IS NOT NULL
      `, [userId]);

            const topDestinations = await database.pool.query(`
        SELECT 
          JSON_UNQUOTE(JSON_EXTRACT(location, '$.name')) as destination,
          COUNT(*) as visit_count
        FROM memories 
        WHERE user_id = ? AND JSON_EXTRACT(location, '$.name') IS NOT NULL
        GROUP BY destination
        ORDER BY visit_count DESC
        LIMIT 5
      `, [userId]);

            const activityBreakdown = await database.pool.query(`
        SELECT 
          memory_type,
          COUNT(*) as count,
          AVG(rating) as avg_rating
        FROM memories 
        WHERE user_id = ?
        GROUP BY memory_type
        ORDER BY count DESC
      `, [userId]);

            await database.close();

            return {
                overview: stats,
                topDestinations,
                activityBreakdown,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Travel statistics error:', error);
            throw error;
        }
    }
}

module.exports = { MemoryService };
} catch (error) {
    console.error('Create user error:', error);
    throw error;
}
}

async saveConversation(userId, userMessage, aiResponse, context, model, responseTime) {
    try {
        await this.pool.query(`
        INSERT INTO ai_conversations (user_id, user_message, ai_response, context, model_used, response_time_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `, [userId, userMessage, aiResponse, JSON.stringify(context), model, responseTime]);
    } catch (error) {
        console.error('Save conversation error:', error);
        throw error;
    }
}

async saveUserLocation(userId, latitude, longitude, accuracy) {
    try {
        await this.pool.query(`
        INSERT INTO user_locations (user_id, latitude, longitude, accuracy, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [userId, latitude, longitude, accuracy]);
    } catch (error) {
        console.error('Save user location error:', error);
        throw error;
    }
}

async createTrip(userId, tripData) {
    try {
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

        return result.insertId;