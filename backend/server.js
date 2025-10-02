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
const { AmadeusService } = require('./services/amadeus');
const { MemoryService } = require('./services/memory');
const { DatabaseService } = require('./services/database');
const { RedisService } = require('./services/redis');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize services
const ollama = new OllamaService();
const googlePlaces = new GooglePlacesService();
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    optionsSuccessStatus: 200 // For legacy browser support
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

            // ✅ FIX: Try multiple place types if first search returns no results
            let nearbyPlaces = [];
            const placeTypes = ['restaurant', 'tourist_attraction', 'lodging', 'cafe'];

            for (const type of placeTypes) {
                nearbyPlaces = await googlePlaces.searchNearby({ lat, lng }, type, 500);
                if (nearbyPlaces.length > 0) {
                    break; // Found results, stop searching
                }
            }

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

// Places Routes
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

        const places = await googlePlaces.searchNearby(
            { lat: parseFloat(lat), lng: parseFloat(lng) },
            type,
            parseInt(radius),
            options
        );

        // ✅ FIX: Always return success with empty array if no results
        res.json({
            success: true,
            data: places,
            count: places.length,
            message: places.length === 0 ? 'No places found matching your criteria' : undefined
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
        const trips = await database.getUserTrips(req.user.id, status, parseInt(limit));

        res.json({
            success: true,
            data: trips
        });
    } catch (error) {
        console.error('Get trips error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get trips'
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

app.get('/api/memories/story/:tripId?', authenticateToken, async (req, res) => {
    try {
        const { tripId } = req.params;
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






