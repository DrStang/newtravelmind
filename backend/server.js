// ===================================
// backend/server.js - Main Express Server 
// ===================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Import services
const { OllamaService } = require('./services/ollama');
const { GooglePlacesService } = require('./services/googlePlaces');
const { FoursquarePlacesService } = require('./services/foursquare');
const { AmadeusService } = require('./services/amadeus');
const { MemoryService } = require('./services/memory');
const { DatabaseService } = require('./services/database');
const { RedisService } = require('./services/redis');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;
app.set('trust proxy', 1);


// Initialize services
const ollama = new OllamaService();
const googlePlaces = new GooglePlacesService();
const foursquare = new FoursquarePlacesService();
const amadeus = new AmadeusService();
const database = new DatabaseService();
const redis = new RedisService();

console.log('🔍 Environment Debug:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('REDIS_URL:', process.env.REDIS_URL ? 'SET' : 'NOT SET');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
BigInt.prototype.toJSON = function() {
    const value = Number(this);
    // Warn if value is too large (loses precision)
    if (this > Number.MAX_SAFE_INTEGER) {
        console.warn('BigInt value too large for safe conversion:', this.toString());
    }
    return value;
};
// ===================================
// MIDDLEWARE SETUP
// ===================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

const allowedOrigins = [
    'http://localhost:3000',
    'https://newtravelmind.vercel.app',
    'https://travelmind.ai', // Add your custom domain if you have one
    // Add any other Vercel preview URLs you might have
];

// Enhanced CORS configuration
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Check if the origin is in the allowed list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Allow Vercel preview deployments
        if (origin && origin.includes('.vercel.app')) {
            return callback(null, true);
        }

        // Allow Railway internal URLs
        if (origin && origin.includes('.railway.app')) {
            return callback(null, true);
        }

        // Otherwise, reject
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    optionsSuccessStatus: 200 // For legacy browser support
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});


app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// AI-specific rate limiting
const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: { error: 'AI request limit exceeded. Please wait before making more AI requests.' }
});
app.use('/api/ai', aiLimiter);

// File upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await database.getUserById(decoded.id);

        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, error: 'Invalid token' });
    }
};

// ===================================
// SOCKET.IO SETUP
// ===================================

const io = new Server(httpServer, {
    cors: {
        origin: function (origin, callback) {
            // Same logic as Express CORS
            if (!origin) return callback(null, true);

            if (allowedOrigins.includes(origin) ||
                (origin && origin.includes('.vercel.app')) ||
                (origin && origin.includes('.railway.app'))) {
                return callback(null, true);
            }

            return callback(new Error('Not allowed by CORS'), false);
        },
        credentials: true,
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type", "Authorization"],
    },
    // Additional Socket.IO configuration for production
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});


io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await database.getUserById(decoded.id);

        if (!user) {
            return next(new Error('User not found'));
        }

        socket.userId = decoded.id;
        socket.user = user;
        next();
    } catch (err) {
        next(new Error('Authentication error'));
    }
});

io.on('connection', (socket) => {
    console.log(`User ${socket.userId} connected via Socket.IO`);

    socket.join(`user_${socket.userId}`);

    // Real-time AI chat
    socket.on('ai_chat', async (data) => {
        try {
            const { message, context = {} } = data;
            console.log('Received ai_chat from user:', socket.userId);
            console.log('Message:', message);
            const userContext = {
                ...context,
                userId: socket.userId,
                userPreferences: socket.user.preferences || [],
                travelStyle: socket.user.travel_style
            };

            const response = await ollama.chat(message, userContext, context.mode || 'chat');

            console.log('AI response generated:', response.message.substring(0, 100));

            // Save conversation to database
            await database.saveConversation(socket.userId, message, response.message, context, response.model, response.responseTime);

            socket.emit('ai_response', {
                success: true,
                data: response,
                timestamp: new Date().toISOString()
            });

            // Cache response
            if (redis && redis.isAvailable()) {
                redis.setConversationCache(socket.userId, response).catch(err => {
                    console.warn('Cache set failed:', err.message);
                });
            }

        } catch (error) {
            console.error('AI chat error:', error);
            socket.emit('ai_response', {
                success: false,
                error: 'AI assistant temporarily unavailable',
                fallback: "I'm having trouble right now. Please try again in a moment.",
                timestamp: new Date().toISOString()
            });
        }
    });

    // Location updates
    // Location updates
    socket.on('location_update', async (data) => {
        try {
            const { lat, lng, accuracy } = data;

            await database.saveUserLocation(socket.userId, lat, lng, accuracy);

            // Get weather and nearby recommendations
            const weather = await googlePlaces.getWeatherInfo({ lat, lng });

            // ✅ FIX: Try multiple place types and combine results from both APIs
            let nearbyPlaces = [];
            const placeTypes = ['restaurant', 'tourist_attraction', 'lodging', 'cafe'];

            for (const type of placeTypes) {
                // Search both Google and Foursquare in parallel
                const [googleResults, foursquareResults] = await Promise.all([
                    googlePlaces.searchNearby({ lat, lng }, type, 500)
                        .catch(err => {
                            console.error('Google Places error in location_update:', err);
                            return [];
                        }),
                    foursquare.searchNearby({ lat, lng }, type, 500)
                        .catch(err => {
                            console.error('Foursquare error in location_update:', err);
                            return [];
                        })
                ]);

                // Combine and deduplicate
                const combined = [...googleResults, ...foursquareResults];
                const unique = [];
                const seen = new Set();

                for (const place of combined) {
                    const key = `${place.name.toLowerCase().trim()}_${Math.round(place.location.lat * 1000)},${Math.round(place.location.lng * 1000)}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        unique.push(place);
                    }
                }

                nearbyPlaces = unique;
                if (nearbyPlaces.length > 0) {
                    break; // Found results, stop searching
                }
            }

            // Sort by rating
            nearbyPlaces.sort((a, b) => {
                if (a.rating && b.rating) return b.rating - a.rating;
                if (a.rating) return -1;
                if (b.rating) return 1;
                return 0;
            });

            socket.emit('location_context', {
                weather,
                nearbyRecommendations: nearbyPlaces.slice(0, 5),
                timestamp: new Date().toISOString(),
                // ✅ Add message if no places found
                message: nearbyPlaces.length === 0 ? 'No nearby places found. Try increasing search radius.' : undefined
            });

        } catch (error) {
            console.error('Location update error:', error);
            // ✅ FIX: Send error response to client instead of crashing
            socket.emit('location_context', {
                weather: null,
                nearbyRecommendations: [],
                error: 'Failed to get location context',
                timestamp: new Date().toISOString()
            });
        }
    });

    // Trip updates
    socket.on('trip_update', async (data) => {
        try {
            const { tripId, updates } = data;

            await database.updateTrip(tripId, socket.userId, updates);

            io.to(`user_${socket.userId}`).emit('trip_updated', {
                tripId,
                updates,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Trip update error:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
    });
});

// ===================================
// API ROUTES
// ===================================

// Health check
app.get('/health', async (req, res) => {
    try {
        const dbStatus = await database.testConnection();
        const redisStatus = await redis.testConnection();
        const ollamaStatus = await ollama.healthCheck();

        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            services: {
                database: dbStatus ? 'connected' : 'disconnected',
                redis: redisStatus ? 'connected' : 'disconnected (optional)',
                googleMaps: !!process.env.GOOGLE_MAPS_API_KEY,
                amadeus: !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET)
            },
            redis_info: redis.getStatus(),
            environment: {
                node_env: process.env.NODE_ENV,
                port: PORT,
                redis_configured: !!(process.env.REDIS_URL || process.env.REDIS_HOST)
            }
        };

        // Return 200 even if Redis is down (it's optional)
        res.status(200).json(health);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: 'Email, password, and name are required'
            });
        }

        // Check if user exists
        const existingUser = await database.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'User already exists with this email'
            });
        }

        // Hash password and create user
        const passwordHash = await bcrypt.hash(password, 12);
        const userId = await database.createUser(email, passwordHash, name);

        // Generate JWT
        const token = jwt.sign(
            { id: userId, email, name },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            data: {
                user: { id: userId, email, name },
                token
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const user = await database.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    preferences: user.preferences || [],
                    travelStyle: user.travel_style
                },
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// AI Routes
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
        const { message, context = {} } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        const userContext = {
            ...context,
            userId: req.user.id,
            userPreferences: req.user.preferences || [],
            travelStyle: req.user.travel_style
        };

        const response = await ollama.chat(message, userContext, context.mode || 'chat');

        // Save conversation
        await database.saveConversation(req.user.id, message, response.message, context, response.model, response.responseTime);

        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        console.error('AI chat error:', error);
        res.status(500).json({
            success: false,
            error: 'AI service temporarily unavailable',
            fallback: 'I\'m having trouble right now. Please try again in a moment.'
        });
    }
});

app.post('/api/ai/generate-itinerary', authenticateToken, async (req, res) => {
    try {
        const tripData = req.body;

        console.log('🎯 Generating itinerary for:', tripData.destination);
        console.log('Trip data:', JSON.stringify(tripData, null, 2));

        // Validate input
        if (!tripData.destination || !tripData.duration) {
            return res.status(400).json({
                success: false,
                error: 'Destination and duration are required'
            });
        }

        const userPreferences = req.user.preferences || [];

        // Generate itinerary using Ollama
        console.log('🤖 Calling Ollama to generate itinerary...');
        let itinerary;
        try {
            itinerary = await ollama.generateDetailedItinerary(tripData, userPreferences);
            console.log('✅ Ollama generation successful');
        } catch (ollamaError) {
            console.error('❌ Ollama generation error:', ollamaError);
            // Provide fallback itinerary
            itinerary = {
                itinerary: `${tripData.duration}-Day Itinerary for ${tripData.destination}\n\n` +
                    `Budget: $${tripData.budget}\n` +
                    `Style: ${tripData.travelStyle}\n\n` +
                    `Day 1: Arrival and Orientation\n` +
                    `- Morning: Check-in and settle into accommodation\n` +
                    `- Afternoon: Explore nearby area and local markets\n` +
                    `- Evening: Welcome dinner at local restaurant\n\n` +
                    `Day 2-${tripData.duration}: Enjoy your destination!\n` +
                    `(AI generation temporarily unavailable - this is a sample itinerary)`,
                model: 'fallback',
                generatedAt: new Date().toISOString()
            };
        }

        // Save trip to database
        console.log('💾 Saving trip to database...');
        let tripId;
        try {
            tripId = await database.createTrip(req.user.id, {
                title: `${tripData.destination} Trip`,
                destination: tripData.destination,
                startDate: tripData.startDate || null,
                endDate: tripData.endDate || null,
                duration: parseInt(tripData.duration),
                budget: parseFloat(tripData.budget) || 0,
                travelStyle: tripData.travelStyle || req.user.travel_style || 'moderate',
                interests: tripData.interests || [],
                itinerary: itinerary
            });

            // Ensure tripId is a number, not BigInt
            tripId = Number(tripId);
            console.log('✅ Trip saved with ID:', tripId);

        } catch (dbError) {
            console.error('❌ Database save error:', dbError);
            // Continue even if DB save fails - use timestamp as fallback
            tripId = Date.now();
            console.log('⚠️ Using fallback ID:', tripId);
        }

        // Prepare response with safe JSON serialization
        const responseData = {
            tripId: Number(tripId), // Explicitly convert to Number
            itinerary,
            tripData: {
                id: Number(tripId), // Explicitly convert to Number
                title: `${tripData.destination} Trip`,
                destination: tripData.destination,
                duration: parseInt(tripData.duration),
                budget: parseFloat(tripData.budget) || 0,
                status: 'planning',
                startDate: tripData.startDate || null,
                endDate: tripData.endDate || null,
                interests: tripData.interests || [],
                travelStyle: tripData.travelStyle || 'moderate',
                itinerary: itinerary,
                created_at: new Date().toISOString()
            }
        };

        console.log('📤 Sending response with trip ID:', responseData.tripId);

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('❌ Itinerary generation error:', error);
        console.error('Error stack:', error.stack);

        res.status(500).json({
            success: false,
            error: 'Failed to generate itinerary',
            details: error.message
        });
    }
});
// Activate/deactivate trip
app.patch('/api/trips/:id/activate', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // First, deactivate all other trips
        await database.pool.query(
            'UPDATE trips SET status = ? WHERE user_id = ? AND status = ?',
            ['planning', req.user.id, 'active']
        );

        // Activate this trip
        await database.updateTrip(id, req.user.id, { status: 'active' });

        res.json({ success: true });
    } catch (error) {
        console.error('Activate trip error:', error);
        res.status(500).json({ success: false, error: 'Failed to activate trip' });
    }
});
app.patch('/api/trips/:id/deactivate', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Deactivate this trip
        await database.updateTrip(id, req.user.id, { status: 'planning' });

        res.json({ success: true });
    } catch (error) {
        console.error('Deactivate trip error:', error);
        res.status(500).json({ success: false, error: 'Failed to deactivate trip' });
    }
});

// Update itinerary (for editing)
app.patch('/api/trips/:id/itinerary', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { itinerary } = req.body;

        await database.updateTrip(id, req.user.id, { itinerary });

        res.json({ success: true });
    } catch (error) {
        console.error('Update itinerary error:', error);
        res.status(500).json({ success: false, error: 'Failed to update itinerary' });
    }
});

// Add manual booking
// Add these routes after the existing trip routes (around line 550)

// Bookings routes
app.post('/api/trips/:id/bookings', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const bookingData = req.body;

        // Verify trip belongs to user
        const trip = await database.getTripById(id, req.user.id);
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        const result = await database.pool.query(`
            INSERT INTO bookings (trip_id, booking_type, details, booking_date, confirmation_number, cost, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [
            tripId,
            bookingData.type,
            JSON.stringify(bookingData.details),
            bookingData.date,
            bookingData.confirmationNumber,
            bookingData.cost
        ]);

        res.json({
            success: true,
            data: {
                id: result.insertId,
                ...bookingData
            }
        });
    } catch (error) {
        console.error('Add booking error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add booking'
        });
    }
});

app.get('/api/trips/:id/bookings', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify trip belongs to user
        const trip = await database.getTripById(id, req.user.id);
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        const bookings = await database.pool.query(`
            SELECT * FROM trip_bookings
            WHERE trip_id = ?
            ORDER BY booking_date ASC
        `, [tripId]);

        res.json({
            success: true,
            data: bookings.map(booking => ({
                ...booking,
                details: JSON.parse(booking.details || '{}')
            }))
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get bookings'
        });
    }
});

app.delete('/api/trips/:id/bookings/:bookingId', authenticateToken, async (req, res) => {
    try {
        const { id, bookingId } = req.params;

        // Verify trip belongs to user
        const trip = await database.getTripById(id, req.user.id);
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        await database.pool.query(`
            DELETE FROM trip_bookings
            WHERE id = ? AND trip_id = ?
        `, [bookingId, tripId]);

        res.json({
            success: true
        });
    } catch (error) {
        console.error('Delete booking error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete booking'
        });
    }
});

// Reminders routes
app.post('/api/trips/:id/reminders', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, reminderDate, type, notes } = req.body;

        // Verify trip belongs to user
        const trip = await database.getTripById(id, req.user.id);
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        const result = await database.pool.query(`
            INSERT INTO trip_reminders (trip_id, title, reminder_date, type, notes, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        `, [tripId, title, reminderDate, type, notes]);

        res.json({
            success: true,
            data: {
                id: result.insertId,
                title,
                reminderDate,
                type,
                notes
            }
        });
    } catch (error) {
        console.error('Add reminder error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add reminder'
        });
    }
});

app.get('/api/trips/:id/reminders', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify trip belongs to user
        const trip = await database.getTripById(id, req.user.id);
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        const reminders = await database.pool.query(`
            SELECT * FROM trip_reminders
            WHERE trip_id = ?
            ORDER BY reminder_date ASC
        `, [tripId]);

        res.json({
            success: true,
            data: reminders
        });
    } catch (error) {
        console.error('Get reminders error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get reminders'
        });
    }
});

app.delete('/api/trips/:id/reminders/:reminderId', authenticateToken, async (req, res) => {
    try {
        const { id, reminderId } = req.params;

        // Verify trip belongs to user
        const trip = await database.getTripById(id, req.user.id);
        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        await database.pool.query(`
            DELETE FROM trip_reminders
            WHERE id = ? AND trip_id = ?
        `, [reminderId, tripId]);

        res.json({
            success: true
        });
    } catch (error) {
        console.error('Delete reminder error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete reminder'
        });
    }
});
// Add these endpoints to backend/server.js after the existing routes

// ===================================
// COMPANION MODE SPECIFIC ROUTES
// ===================================

// Get active trip with today's schedule
app.get('/api/trips/active', authenticateToken, async (req, res) => {
    try {
        const trips = await database.getUserTrips(req.user.id, 'active', 1);
        const activeTrip = trips[0] || null;

        if (activeTrip) {
            // Calculate current day
            const startDate = new Date(activeTrip.start_date);
            const today = new Date();
            const diffTime = Math.abs(today - startDate);
            const currentDay = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            activeTrip.currentDay = currentDay;
        }

        res.json({
            success: true,
            data: activeTrip
        });
    } catch (error) {
        console.error('Get active trip error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get active trip'
        });
    }
});

// Get today's schedule for active trip
app.get('/api/trips/active/schedule', authenticateToken, async (req, res) => {
    try {
        const trips = await database.getUserTrips(req.user.id, 'active', 1);
        const activeTrip = trips[0];

        if (!activeTrip) {
            return res.json({
                success: true,
                data: []
            });
        }

        // Extract today's activities from itinerary
        const itinerary = activeTrip.itinerary;
        const startDate = new Date(activeTrip.start_date);
        const today = new Date();
        const currentDay = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));

        // Parse itinerary to get today's schedule
        const todaySchedule = itinerary[`day_${currentDay}`] || [];

        res.json({
            success: true,
            data: todaySchedule
        });
    } catch (error) {
        console.error('Get schedule error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get schedule'
        });
    }
});

// Update schedule item status
app.patch('/api/trips/active/schedule/:itemId', authenticateToken, async (req, res) => {
    try {
        const { itemId } = req.params;
        const { status } = req.body;

        const trips = await database.getUserTrips(req.user.id, 'active', 1);
        const activeTrip = trips[0];

        if (!activeTrip) {
            return res.status(404).json({
                success: false,
                error: 'No active trip found'
            });
        }

        // Update the schedule item in itinerary
        const itinerary = activeTrip.itinerary;
        const startDate = new Date(activeTrip.start_date);
        const today = new Date();
        const currentDay = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));
        const dayKey = `day_${currentDay}`;

        if (itinerary[dayKey]) {
            itinerary[dayKey] = itinerary[dayKey].map(item =>
                item.id === parseInt(itemId) ? { ...item, status } : item
            );
        }

        await database.updateTrip(activeTrip.id, req.user.id, { itinerary });

        res.json({
            success: true,
            data: { itemId, status }
        });
    } catch (error) {
        console.error('Update schedule error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update schedule'
        });
    }
});

// Get upcoming bookings (uses existing trip_bookings table)
app.get('/api/bookings/upcoming', authenticateToken, async (req, res) => {
    try {
        // Get all active trips for the user
        const trips = await database.getUserTrips(req.user.id, 'active');
        const tripIds = trips.map(t => t.id);

        if (tripIds.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }

        // Get bookings for these trips
        const placeholders = tripIds.map(() => '?').join(',');
        const bookings = await database.pool.query(`
            SELECT tb.*, t.title as trip_title, t.destination
            FROM trip_bookings tb
                     JOIN trips t ON tb.trip_id = t.id
            WHERE tb.trip_id IN (${placeholders})
              AND tb.booking_date >= CURDATE()
            ORDER BY tb.booking_date ASC, tb.created_at ASC
                LIMIT 10
        `, tripIds);

        // Parse details JSON and format response
        const formattedBookings = bookings.map(booking => {
            const details = typeof booking.details === 'string'
                ? JSON.parse(booking.details)
                : booking.details;

            return {
                id: booking.id,
                type: booking.booking_type,
                title: details.title || `${booking.booking_type} booking`,
                time: booking.booking_date,
                confirmation: booking.confirmation_number,
                status: 'confirmed',
                alert: details.alert || null,
                tripId: booking.trip_id,
                tripTitle: booking.trip_title,
                cost: booking.cost,
                ...details
            };
        });

        res.json({
            success: true,
            data: formattedBookings
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get bookings'
        });
    }
});

// Save/update custom schedule
app.post('/api/trips/:id/schedule', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { schedule, day } = req.body;

        const trip = await database.getTripById(id, req.user.id);

        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        const itinerary = trip.itinerary;
        itinerary[`day_${day}`] = schedule;

        await database.updateTrip(id, req.user.id, { itinerary });

        res.json({
            success: true,
            data: { schedule, day }
        });
    } catch (error) {
        console.error('Save schedule error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save schedule'
        });
    }
});

// Get notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        // Query notifications from database
        const notifications = await database.pool.query(`
            SELECT * FROM notifications
            WHERE user_id = ?
              AND dismissed = FALSE
            ORDER BY priority DESC, created_at DESC
                LIMIT 10
        `, [req.user.id]);

        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        // If table doesn't exist yet, return empty array
        res.json({
            success: true,
            data: []
        });
    }
});

// Dismiss notification
app.patch('/api/notifications/:id/dismiss', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        await database.pool.query(
            'UPDATE notifications SET dismissed = TRUE WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );

        res.json({
            success: true
        });
    } catch (error) {
        console.error('Dismiss notification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to dismiss notification'
        });
    }
});

app.post('/api/ai/translate', authenticateToken, async (req, res) => {
    try {
        const { text, targetLanguage, sourceLanguage = 'auto', context = {} } = req.body;

        if (!text || !targetLanguage) {
            return res.status(400).json({
                success: false,
                error: 'Text and target language are required'
            });
        }

        const translation = await ollama.translateWithContext(text, targetLanguage, sourceLanguage, context);

        // Log translation for analytics
        await database.logAnalyticsEvent(req.user.id, 'translation', {
            sourceLanguage: translation.sourceLanguage,
            targetLanguage: translation.targetLanguage,
            textLength: text.length
        });

        res.json({
            success: true,
            data: translation
        });
    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({
            success: false,
            error: 'Translation failed'
        });
    }
});

// ===================================
// PHOTO IDENTIFICATION ENDPOINT
// Add this after the /api/ai/translate route (around line 900)
// ===================================

app.post('/api/ai/identify-photo', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        const photoFile = req.file;
        const location = req.body.location ? JSON.parse(req.body.location) : null;

        if (!photoFile) {
            return res.status(400).json({
                success: false,
                error: 'Photo file is required'
            });
        }

        console.log('📸 Photo identification request:', {
            filename: photoFile.filename,
            size: photoFile.size,
            mimetype: photoFile.mimetype,
            location: location
        });

        // Build context for AI
        const context = {
            location: location,
            photoPath: photoFile.path,
            filename: photoFile.filename
        };

        // Create prompt for photo identification
        let prompt = `You are analyzing a travel photo to identify landmarks, locations, or points of interest. 

Photo context:
${location ? `- Approximate location: ${location.lat}, ${location.lng}` : '- Location unknown'}
- Filename: ${photoFile.filename}

Please identify:
1. What landmark or location this might be
2. Key features or characteristics visible
3. Historical or cultural significance if applicable
4. Recommended visiting tips

Format your response as:
NAME: [landmark/location name]
DESCRIPTION: [detailed description]
LANDMARKS: [comma-separated list of visible landmarks]
CONFIDENCE: [0.0-1.0 confidence score]`;

        // Try to use vision model if available (llava or similar)
        let identificationResult;

        try {
            // Check if Ollama has a vision model available
            const hasVisionModel = await checkOllamaVisionModel();

            if (hasVisionModel) {
                // Use Ollama vision model (llava)
                identificationResult = await identifyPhotoWithOllama(photoFile.path, prompt, location);
            } else if (process.env.OPENAI_API_KEY) {
                // Fallback to OpenAI vision API
                identificationResult = await identifyPhotoWithOpenAI(photoFile.path, prompt, location);
            } else {
                // Fallback to location-based analysis
                identificationResult = await identifyPhotoBasic(location, photoFile);
            }

            // Log analytics
            await database.logAnalyticsEvent(req.user.id, 'photo_identification', {
                location: location,
                confidence: identificationResult.confidence,
                method: identificationResult.method
            });

            res.json({
                success: true,
                data: identificationResult
            });

        } catch (aiError) {
            console.error('AI identification error:', aiError);

            // Provide basic fallback response
            const fallbackResult = {
                name: 'Location Identified',
                description: 'Photo received successfully. For detailed identification, ensure Ollama with llava model or OpenAI API is configured.',
                landmarks: location ? ['Location data available'] : ['No location data'],
                confidence: 0.3,
                method: 'fallback',
                location: location
            };

            res.json({
                success: true,
                data: fallbackResult
            });
        }

    } catch (error) {
        console.error('Photo identification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to identify photo',
            message: error.message
        });
    }
});

// ===================================
// HELPER FUNCTIONS FOR PHOTO IDENTIFICATION
// ===================================

async function checkOllamaVisionModel() {
    try {
        const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const response = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return false;

        const data = await response.json();
        const models = data.models || [];

        // Check for vision models (llava, bakllava, etc.)
        return models.some(model =>
            model.name.includes('llava') ||
            model.name.includes('bakllava') ||
            model.name.includes('vision')
        );
    } catch (error) {
        console.error('Ollama vision check error:', error);
        return false;
    }
}

async function identifyPhotoWithOllama(photoPath, prompt, location) {
    const fs = require('fs');
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    // Read image as base64
    const imageBuffer = await fs.promises.readFile(photoPath);
    const imageBase64 = imageBuffer.toString('base64');

    const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llava',
            prompt: prompt,
            images: [imageBase64],
            stream: false,
            options: {
                temperature: 0.3,
                top_p: 0.9
            }
        }),
        signal: AbortSignal.timeout(60000) // 60 second timeout for vision
    });

    if (!response.ok) {
        throw new Error(`Ollama vision API error: ${response.status}`);
    }

    const data = await response.json();
    return parseIdentificationResponse(data.response, 'ollama-vision', location);
}

async function identifyPhotoWithOpenAI(photoPath, prompt, location) {
    const fs = require('fs');
    const imageBuffer = await fs.promises.readFile(photoPath);
    const imageBase64 = imageBuffer.toString('base64');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 500
        }),
        signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI Vision API error: ${errorData.error?.message}`);
    }

    const data = await response.json();
    return parseIdentificationResponse(
        data.choices[0].message.content,
        'openai-vision',
        location
    );
}

async function identifyPhotoBasic(location, photoFile) {
    // Basic identification using location data and Google Places if available
    let description = 'Photo uploaded successfully. ';
    let landmarks = [];

    if (location) {
        description += `Photo taken near coordinates: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}. `;

        // If Google Places is available, try to find nearby landmarks
        try {
            const places = await googlePlaces.searchNearby(
                location,
                'tourist_attraction',
                500
            );

            if (places && places.length > 0) {
                landmarks = places.slice(0, 3).map(p => p.name);
                description += `Nearby landmarks include: ${landmarks.join(', ')}. `;
            }
        } catch (error) {
            console.error('Places lookup error:', error);
        }
    }

    return {
        name: 'Photo Location',
        description: description + 'For detailed landmark identification, configure Ollama with llava model or OpenAI Vision API.',
        landmarks: landmarks,
        confidence: 0.5,
        method: 'basic',
        location: location,
        photoSize: photoFile.size,
        photoType: photoFile.mimetype
    };
}

function parseIdentificationResponse(aiResponse, method, location) {
    // Parse structured response from AI
    const lines = aiResponse.split('\n');
    let name = 'Unknown Location';
    let description = '';
    let landmarks = [];
    let confidence = 0.7;

    for (const line of lines) {
        if (line.startsWith('NAME:')) {
            name = line.replace('NAME:', '').trim();
        } else if (line.startsWith('DESCRIPTION:')) {
            description = line.replace('DESCRIPTION:', '').trim();
        } else if (line.startsWith('LANDMARKS:')) {
            const landmarkStr = line.replace('LANDMARKS:', '').trim();
            landmarks = landmarkStr.split(',').map(l => l.trim()).filter(Boolean);
        } else if (line.startsWith('CONFIDENCE:')) {
            const confStr = line.replace('CONFIDENCE:', '').trim();
            confidence = parseFloat(confStr) || 0.7;
        } else if (line.trim() && !description) {
            // If no explicit description found, use the text
            description += line.trim() + ' ';
        }
    }

    // If parsing failed, use the raw response
    if (!description) {
        description = aiResponse;
    }

    return {
        name,
        description: description.trim(),
        landmarks,
        confidence,
        method,
        location
    };
}
// Places Routes
app.get('/api/places/nearby', async (req, res) => {
    try {
        const { lat, lng, type = 'tourist_attraction', radius = 1000, keyword, minprice, maxprice, opennow } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required'
            });
        }

        const options = {};
        if (keyword) options.keyword = keyword;
        if (minprice) options.minprice = parseInt(minprice);
        if (maxprice) options.maxprice = parseInt(maxprice);
        if (opennow === 'true') options.opennow = true;

        const location = { lat: parseFloat(lat), lng: parseFloat(lng) };
        const searchRadius = parseInt(radius);

        // Search both Google Places and Foursquare in parallel
        const [googleResults, foursquareResults] = await Promise.all([
            googlePlaces.searchNearby(location, type, searchRadius, options)
                .catch(err => {
                    console.error('Google Places error:', err);
                    return [];
                }),
            foursquare.searchNearby(location, type, searchRadius, options)
                .catch(err => {
                    console.error('Foursquare error:', err);
                    return [];
                })
        ]);

        // Combine results from both sources
        const combinedPlaces = [...googleResults, ...foursquareResults];

        // Remove duplicates based on name and approximate location (within 50 meters)
        const uniquePlaces = [];
        const seenPlaces = new Set();

        for (const place of combinedPlaces) {
            // Create a unique key based on name and location
            const locationKey = `${Math.round(place.location.lat * 1000)},${Math.round(place.location.lng * 1000)}`;
            const placeKey = `${place.name.toLowerCase().trim()}_${locationKey}`;

            if (!seenPlaces.has(placeKey)) {
                seenPlaces.add(placeKey);
                uniquePlaces.push(place);
            }
        }

        // Sort by rating (descending), with unrated places at the end
        uniquePlaces.sort((a, b) => {
            if (a.rating && b.rating) return b.rating - a.rating;
            if (a.rating) return -1;
            if (b.rating) return 1;
            return 0;
        });

        console.log(`📍 Places found: ${googleResults.length} from Google, ${foursquareResults.length} from Foursquare, ${uniquePlaces.length} unique`);

        res.json({
            success: true,
            data: uniquePlaces,
            count: uniquePlaces.length,
            sources: {
                google: googleResults.length,
                foursquare: foursquareResults.length,
                unique: uniquePlaces.length
            },
            message: uniquePlaces.length === 0 ? 'No places found matching your criteria' : undefined
        });
    } catch (error) {
        console.error('Places search error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search places',
            details: error.message
        });
    }
});
// Add this route in your backend
app.put('/api/trips/:id/days/:dayNumber', authenticateToken, async (req, res) => {
    try {
        const { id, dayNumber } = req.params;
        const { activities, title } = req.body;

        // Get current trip
        const trip = await database.getTripById(id, req.user.id);

        if (!trip) {
            return res.status(404).json({ success: false, error: 'Trip not found' });
        }

        // Parse current itinerary
        const itineraryText = trip.itinerary?.itinerary || trip.itinerary;
        const lines = itineraryText.split('\n');
        const updatedLines = [];
        let inTargetDay = false;
        let dayUpdated = false;

        for (let line of lines) {
            const dayMatch = line.match(/Day\s+(\d+)/i);

            if (dayMatch) {
                const lineDay = parseInt(dayMatch[1]);

                if (lineDay === parseInt(dayNumber)) {
                    // Start of target day
                    inTargetDay = true;
                    updatedLines.push(`**Day ${dayNumber}: ${title}**`);
                    activities.forEach(activity => {
                        updatedLines.push(`* ${activity}`);
                    });
                    dayUpdated = true;
                    continue;
                } else if (inTargetDay) {
                    // End of target day
                    inTargetDay = false;
                }
            }

            if (!inTargetDay) {
                updatedLines.push(line);
            }
        }

        const newItinerary = updatedLines.join('\n');

        // Update trip in database
        await database.updateTrip(tripId, req.user.id, {
            itinerary: JSON.stringify({ itinerary: newItinerary })
        });

        res.json({
            success: true,
            data: { itinerary: newItinerary }
        });
    } catch (error) {
        console.error('Update day error:', error);
        res.status(500).json({ success: false, error: 'Failed to update day' });
    }
});

app.get('/api/places/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params;
        const { fields } = req.query;

        const fieldsList = fields ? fields.split(',') : undefined;
        const details = await googlePlaces.getPlaceDetails(placeId, fieldsList);

        res.json({
            success: true,
            data: details
        });
    } catch (error) {
        console.error('Place details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get place details'
        });
    }
});

// Weather Route
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required'
            });
        }

        const weather = await googlePlaces.getWeatherInfo({
            lat: parseFloat(lat),
            lng: parseFloat(lng)
        });

        if (!weather) {
            return res.status(503).json({
                success: false,
                error: 'Weather service unavailable'
            });
        }

        res.json({
            success: true,
            data: weather
        });
    } catch (error) {
        console.error('Weather error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get weather data'
        });
    }
});

// Flight and Hotel Routes
// backend/server.js - Update the flight search route
app.get('/api/flights/search', authenticateToken, async (req, res) => {
    try {
        const {
            origin,
            destination,
            departureDate,
            returnDate,
            adults,
            children,
            infants,
            travelClass,
            nonStop,
            currencyCode,
            max
        } = req.query;

        // Validate required parameters
        if (!origin || !destination || !departureDate) {
            return res.status(400).json({
                success: false,
                error: 'Origin, destination, and departure date are required',
                details: {
                    origin: !origin ? 'Missing origin airport code (e.g., JFK)' : undefined,
                    destination: !destination ? 'Missing destination airport code (e.g., LAX)' : undefined,
                    departureDate: !departureDate ? 'Missing departure date (YYYY-MM-DD format)' : undefined
                }
            });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(departureDate)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid date format. Use YYYY-MM-DD (e.g., 2025-12-25)'
            });
        }

        if (returnDate && !dateRegex.test(returnDate)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid return date format. Use YYYY-MM-DD'
            });
        }

        const searchParams = {
            origin: origin.toUpperCase(),
            destination: destination.toUpperCase(),
            departureDate,
            returnDate,
            adults: adults ? parseInt(adults) : 1,
            children: children ? parseInt(children) : 0,
            infants: infants ? parseInt(infants) : 0,
            travelClass: travelClass || 'ECONOMY',
            nonStop: nonStop === 'true',
            currencyCode: currencyCode || 'USD',
            max: max ? parseInt(max) : 10
        };

        console.log('🔍 Flight search params:', searchParams);

        const flights = await amadeus.searchFlights(searchParams);

        // Log analytics - but don't let it break the response
        try {
            await database.logAnalyticsEvent(req.user.id, 'flight_search', {
                ...searchParams,
                resultsCount: flights.offers.length
            });
        } catch (analyticsError) {
            console.error('⚠️ Analytics logging failed (non-critical):', analyticsError.message);
        }

        res.json({
            success: true,
            data: flights,
            searchParams: searchParams
        });
    } catch (error) {
        console.error('❌ Flight search endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search flights',
            message: error.message,
            hint: 'Make sure Amadeus API credentials are configured correctly'
        });
    }
});

// Update hotel search route with same pattern
app.get('/api/hotels/search', authenticateToken, async (req, res) => {
    try {
        const {
            cityCode,
            latitude,
            longitude,
            checkInDate,
            checkOutDate,
            adults,
            roomQuantity,
            radius,
            currency,
            ratings,
            amenities
        } = req.query;

        if ((!cityCode && (!latitude || !longitude)) || !checkInDate || !checkOutDate) {
            return res.status(400).json({
                success: false,
                error: 'City code (or lat/lng), check-in date, and check-out date are required'
            });
        }

        const searchParams = {
            cityCode: cityCode?.toUpperCase(),
            latitude: latitude ? parseFloat(latitude) : undefined,
            longitude: longitude ? parseFloat(longitude) : undefined,
            checkInDate,
            checkOutDate,
            adults: adults ? parseInt(adults) : 1,
            roomQuantity: roomQuantity ? parseInt(roomQuantity) : 1,
            radius: radius ? parseInt(radius) : 5,
            currency: currency || 'USD',
            ratings: ratings ? ratings.split(',').map(Number) : undefined,
            amenities: amenities ? amenities.split(',') : undefined
        };

        console.log('🏨 Hotel search params:', searchParams);

        const hotels = await amadeus.searchHotels(searchParams);

        // Log analytics - non-blocking
        try {
            await database.logAnalyticsEvent(req.user.id, 'hotel_search', {
                ...searchParams,
                resultsCount: hotels.hotels.length
            });
        } catch (analyticsError) {
            console.error('⚠️ Analytics logging failed (non-critical):', analyticsError.message);
        }

        res.json({
            success: true,
            data: hotels,
            searchParams: searchParams
        });
    } catch (error) {
        console.error('❌ Hotel search endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search hotels',
            message: error.message
        });
    }
});
app.post('/api/places/coordinates', authenticateToken, async (req, res) => {
    try {
        const { locations, destination } = req.body;

        if (!locations || locations.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Locations array is required'
            });
        }

        const results = [];

        // Search for each location to get coordinates
        for (const locationName of locations.slice(0, 5)) { // Limit to 5
            try {
                const searchQuery = `${locationName}, ${destination}`;
                const response = await fetch(
                    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
                );
                const data = await response.json();

                if (data.status === 'OK' && data.results.length > 0) {
                    const place = data.results[0];
                    results.push({
                        name: locationName,
                        lat: place.geometry.location.lat,
                        lng: place.geometry.location.lng,
                        formatted_address: place.formatted_address
                    });
                }
            } catch (error) {
                console.error(`Error geocoding ${locationName}:`, error);
            }
        }

        res.json({
            success: true,
            data: {
                locations: results,
                count: results.length
            }
        });
    } catch (error) {
        console.error('Coordinates fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch coordinates'
        });
    }
});

// Add a new endpoint to get user analytics
app.get('/api/analytics/events', authenticateToken, async (req, res) => {
    try {
        const { eventType, dateFrom, dateTo, limit } = req.query;

        const events = await database.getAnalyticsEvents(req.user.id, {
            eventType,
            dateFrom,
            dateTo,
            limit: limit || 50
        });

        res.json({
            success: true,
            data: events
        });
    } catch (error) {
        console.error('Analytics events error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get analytics events'
        });
    }
});
// Trip Routes
app.get('/api/trips', authenticateToken, async (req, res) => {
    try {
        const { status, limit = 20 } = req.query;
        console.log('📊 Getting trips for user:', req.user.id);
        console.log('📊 With filters:', { status, limit });

        const trips = await database.getUserTrips(req.user.id, status, parseInt(limit));
        console.log('✅ getUserTrips returned:', trips ? trips.length : 0, 'trips');
        // Even if empty, return success
        res.json({
            success: true,
            data: trips || [],
            count: trips ? trips.length : 0
        });
    } catch (error) {
        console.error('❌ Get trips endpoint error:', error);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to get trips',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/api/trips/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const trip = await database.getTripById(id, req.user.id);

        if (!trip) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        res.json({
            success: true,
            data: trip
        });
    } catch (error) {
        console.error('Get trip error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get trip'
        });
    }
});
// Add this route after the existing /api/trips route
app.get('/api/trips/debug', authenticateToken, async (req, res) => {
    try {
        const rows = await database.pool.query(
            'SELECT id, title, destination, duration, status, created_at FROM trips WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );

        console.log('📊 Debug - Found trips:', rows.length);
        console.log('📊 Trip data:', JSON.stringify(rows, null, 2));

        res.json({
            success: true,
            count: rows.length,
            trips: rows
        });
    } catch (error) {
        console.error('Debug trips error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Memory Routes
app.post('/api/memories', authenticateToken, upload.array('photos', 10), async (req, res) => {
    try {
        const memoryData = req.body;

        // Process uploaded photos
        const photos = req.files ? req.files.map(file => ({
            filename: file.filename,
            originalName: file.originalname,
            url: `/uploads/${file.filename}`,
            size: file.size
        })) : [];

        memoryData.photos = photos;

        const memoryId = await MemoryService.createMemory(req.user.id, memoryData);

        res.json({
            success: true,
            data: {
                id: memoryId,
                ...memoryData
            }
        });
    } catch (error) {
        console.error('Create memory error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create memory'
        });
    }
});

app.get('/api/memories', authenticateToken, async (req, res) => {
    try {
        const { tripId, type, dateFrom, dateTo, limit } = req.query;

        const filters = {};
        if (tripId) filters.tripId = parseInt(tripId);
        if (type) filters.type = type;
        if (dateFrom) filters.dateFrom = dateFrom;
        if (dateTo) filters.dateTo = dateTo;
        if (limit) filters.limit = parseInt(limit);

        const memories = await MemoryService.getUserMemories(req.user.id, filters);

        res.json({
            success: true,
            data: memories
        });
    } catch (error) {
        console.error('Get memories error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get memories'
        });
    }
});

app.get('/api/memories/story/:id?', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const story = await MemoryService.generateTravelStory(req.user.id, tripId ? parseInt(tripId) : null);

        res.json({
            success: true,
            data: story
        });
    } catch (error) {
        console.error('Generate story error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate travel story'
        });
    }
});

app.get('/api/memories/statistics', authenticateToken, async (req, res) => {
    try {
        const stats = await MemoryService.getTravelStatistics(req.user.id);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get travel statistics'
        });
    }
});

// Analytics Route
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
    try {
        console.log('📊 Loading dashboard for user:', req.user.id);

        let dashboardData;
        try {
            dashboardData = await database.getDashboardAnalytics(req.user.id);
            console.log('✅ Dashboard data loaded');
        } catch (dbError) {
            console.error('❌ Dashboard DB error:', dbError);
            // Return safe fallback
            dashboardData = {
                trips: {
                    total_trips: 0,
                    completed_trips: 0,
                    active_trips: 0,
                    avg_budget: 0,
                    total_budget: 0
                },
                memories: {
                    total_memories: 0,
                    avg_rating: 0,
                    active_days: 0
                },
                recentActivity: [],
                generatedAt: new Date().toISOString()
            };
        }

        // Ensure all BigInt values are converted
        const safeData = JSON.parse(JSON.stringify(dashboardData, (key, value) =>
            typeof value === 'bigint' ? Number(value) : value
        ));

        res.json({
            success: true,
            data: safeData
        });
    } catch (error) {
        console.error('❌ Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard',
            details: error.message
        });
    }
});
app.post('/api/flights/save-selection', authenticateToken, async (req, res) => {
    try {
        const { tripId, flightData } = req.body;

        if (!tripId || !flightData) {
            return res.status(400).json({
                success: false,
                error: 'Trip ID and flight data are required'
            });
        }

        // All the database logic is now handled by DatabaseService
        const flightId = await database.createTripFlight(req.user.id, tripId, flightData);

        res.json({
            success: true,
            data: {
                id: flightId,
                message: 'Flight selection saved successfully'
            }
        });
    } catch (error) {
        console.error('Save flight selection error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save flight selection'
        });
    }
});

app.get('/api/trips/:id/flights', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const flights = await database.getTripFlights(id, req.user.id);

        res.json({
            success: true,
            data: flights
        });
    } catch (error) {
        console.error('Get trip flights error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get trip flights'
        });
    }
});

app.delete('/api/trips/:id/flights/:flightId', authenticateToken, async (req, res) => {
    try {
        const { id, flightId } = req.params;

        await database.deleteTripFlight(flightId, req.user.id);

        res.json({
            success: true,
            message: 'Flight removed from trip'
        });
    } catch (error) {
        console.error('Delete trip flight error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete flight'
        });
    }
});
app.get('/api/airports/search', authenticateToken, async (req, res) => {
    try {
        const { keyword } = req.query;

        if (!keyword || keyword.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search keyword must be at least 2 characters'
            });
        }

        const result = await amadeus.searchAirports(keyword);

        res.json({
            success: true,
            data: result.airports,
            meta: result.meta
        });
    } catch (error) {
        console.error('Airport search endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search airports',
            message: error.message
        });
    }
});
app.get('/api/activities/search', async (req, res) => {
    try {
        const { latitude, longitude, radius = 1 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required'
            });
        }

        const activities = await amadeus.searchActivities({
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            radius: parseInt(radius)
        });

        res.json({
            success: true,
            data: activities
        });
    } catch (error) {
        console.error('Activities search error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search activities'
        });
    }
});
// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// API info
app.get('/api', (req, res) => {
    res.json({
        name: 'TravelMind.ai API',
        version: '2.0.0',
        description: 'Complete AI-powered travel companion with multi-model AI, real-time features, and comprehensive integrations',
        features: [
            'Multi-model AI (Chat, Planning, Translation, Analysis)',
            'Google Places & Maps integration',
            'Amadeus flight & hotel search',
            'Real-time location tracking',
            'Memory management with photo uploads',
            'Travel analytics and insights',
            'Socket.IO real-time communication',
            'Redis caching',
            'MariaDB database'
        ],
        endpoints: {
            auth: ['POST /api/auth/register', 'POST /api/auth/login'],
            ai: ['POST /api/ai/chat', 'POST /api/ai/generate-itinerary', 'POST /api/ai/translate'],
            places: ['GET /api/places/nearby', 'GET /api/places/:placeId'],
            travel: ['GET /api/flights/search', 'GET /api/hotels/search', 'GET /api/weather'],
            trips: ['GET /api/trips', 'GET /api/trips/:id'],
            memories: ['POST /api/memories', 'GET /api/memories', 'GET /api/memories/story/:tripId?'],
            analytics: ['GET /api/analytics/dashboard']
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body
    });
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB.'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files. Maximum is 10 files.'
            });
        }
    }

    if (err.message && err.message.includes('BigInt')) {
        return res.status(500).json({
            success: false,
            error: 'Data serialization error',
            details: 'BigInt conversion issue - check backend logs'
        });
    }

    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// ===================================
// SERVER STARTUP
// ===================================

async function startServer() {
    try {
        console.log('🚀 Starting TravelMind.ai Server...');

        // Create uploads directory
        await fs.mkdir('uploads', { recursive: true });

        // Initialize database connection
        await database.initialize();

        await database.createTables();

        // Initialize Redis connection
        console.log('🔄 Initializing Redis cache...');
        redis.initialize().catch(err => {
            console.warn('⚠️  Redis initialization failed (non-blocking):', err.message);
        });

        // Start server
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 TravelMind.ai API Server running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`📚 API documentation: http://localhost:${PORT}/api`);
            console.log(`🔌 Socket.IO enabled for real-time features`);

            // Log Redis status after startup
            setTimeout(() => {
                const redisStatus = redis.getStatus();
                console.log(`🔧 Redis Status: ${redisStatus.connected ? 'Connected' : 'Not Connected'}`);
            }, 2000);

            console.log('\n🎯 Available Features:');
            console.log('  ✅ Multi-model AI (Chat, Planning, Translation, Analysis)');
            console.log('  ✅ Google Places & Maps integration');
            console.log('  ✅ Amadeus flight & hotel search');
            console.log('  ✅ Real-time location tracking');
            console.log('  ✅ Memory management with photo uploads');
            console.log('  ✅ Travel analytics and insights');
            console.log('  ✅ Socket.IO real-time communication');
            console.log('  ✅ Redis caching');
            console.log('  ✅ MariaDB database with full schema');
            console.log(`  ${redis.isAvailable() ? '✅' : '⚠️ '} Redis caching ${redis.isAvailable() ? '' : '(disabled)'}`);

        });
    } catch (error) {
        console.error('❌ Server startup failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');

    try {
        await database.close();
        await redis.close();
        httpServer.close(() => {
            console.log('✅ Server shut down successfully');
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

// Start the server
startServer();

module.exports = app;


















