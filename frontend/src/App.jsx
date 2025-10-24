// ===================================
// frontend/src/App.jsx - Part 1: Main App and Authentication
// ===================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    MessageCircle, MapPin, Plane, Calendar, Star, Camera,
    Navigation, Cloud, Sun, CloudRain, Settings, User,
    TrendingUp, Clock, Heart, Globe, Zap, Book, X, Check, Bell, Phone, AlertTriangle,
    ChevronRight, DollarSign, Utensils, Hotel, CheckCircle, Search, ScanLine,
    Languages, Map, Shield, Info, RefreshCw, Edit, Plus, Upload, AlertCircle
} from 'lucide-react';
import io from 'socket.io-client';
import TripManager from './TripManager';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';
const formatItinerary = (text) => {
    if (!text) return '';

    return text
        // Convert **bold** to <strong>
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>')
        // Convert * list items to bullet points
        .replace(/^\* (.+)$/gm, '<li class="ml-4 mb-2">$1</li>')
        // Convert + list items to bullet points
        .replace(/^\+ (.+)$/gm, '<li class="ml-4 mb-2">$1</li>')
        // Convert - list items to bullet points
        .replace(/^- (.+)$/gm, '<li class="ml-4 mb-2">$1</li>')
        // Add spacing between sections
        .replace(/\n\n/g, '<br/><br/>');
};

// Better itinerary display component
const FormattedItinerary = ({ text }) => {
    if (!text) return null;

    // Split by day sections
    const sections = text.split(/(?=\*\*Day \d+)/g);

    return (
        <div className="space-y-6">
            {sections.map((section, index) => {
                if (!section.trim()) return null;

                // Check if it's a day section
                const isDaySection = section.match(/\*\*Day (\d+)/);

                if (isDaySection) {
                    const dayNumber = isDaySection[1];
                    const dayContent = section.replace(/\*\*Day \d+:?\s*(.*?)\*\*/g, '').trim();
                    const dayTitle = section.match(/\*\*Day \d+:?\s*(.*?)\*\*/)?.[1] || `Day ${dayNumber}`;

                    return (
                        <div key={index} className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-xl font-bold text-blue-600 mb-4 flex items-center">
                <span className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center mr-3">
                  {dayNumber}
                </span>
                                {dayTitle}
                            </h3>
                            <div
                                className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: formatItinerary(dayContent) }}
                            />
                        </div>
                    );
                }

                // Header section or other content
                return (
                    <div
                        key={index}
                        className="prose prose-lg max-w-none"
                        dangerouslySetInnerHTML={{ __html: formatItinerary(section) }}
                    />
                );
            })}
        </div>
    );
};

// ===================================
// AUTHENTICATION HOOK
// ===================================
const useAuth = () => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            // ✅ Decode the JWT to get user info
            try {
                const tokenParts = token.split('.');
                if (tokenParts.length === 3) {
                    const payload = JSON.parse(atob(tokenParts[1]));

                    // Set user from JWT payload
                    setUser({
                        id: payload.id,
                        name: payload.name,
                        email: payload.email,
                        preferences: payload.preferences || ['culture', 'food', 'sightseeing'],
                        travelStyle: payload.travelStyle || 'moderate'
                    });
                } else {
                    // Invalid token format, clear it
                    localStorage.removeItem('token');
                    setToken(null);
                }
            } catch (error) {
                console.error('Token decode error:', error);
                localStorage.removeItem('token');
                setToken(null);
            }
        }
        setLoading(false);
    }, [token]);

    const login = async (email, password) => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                setToken(data.data.token);
                setUser(data.data.user);
                localStorage.setItem('token', data.data.token);
                return { success: true };
            } else {
                return { success: false, error: data.error };
            }
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    };

    const register = async (email, password, name) => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name })
            });

            const data = await response.json();

            if (data.success) {
                setToken(data.data.token);
                setUser(data.data.user);
                localStorage.setItem('token', data.data.token);
                return { success: true };
            } else {
                return { success: false, error: data.error };
            }
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
    };

    return { user, token, loading, login, register, logout };
};

// ===================================
// LOCATION HOOK
// ===================================
const useLocation = () => {
    const [location, setLocation] = useState(null);
    const [weather, setWeather] = useState(null);
    const [error, setError] = useState(null);

    const updateLocation = useCallback(async () => {
        if (!navigator.geolocation) {
            setError('Geolocation not supported');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const coords = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };

                setLocation(coords);

                // Get weather data
                try {
                    const response = await fetch(`${API_BASE_URL}/weather?lat=${coords.lat}&lng=${coords.lng}`);
                    const data = await response.json();
                    if (data.success) {
                        setWeather(data.data);
                    }
                } catch (err) {
                    console.error('Weather fetch error:', err);
                }
            },
            (error) => {
                setError(error.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        );
    }, []);

    useEffect(() => {
        updateLocation();
    }, [updateLocation]);

    return { location, weather, error, updateLocation };
};

// ===================================
// SOCKET.IO HOOK
// ===================================
const useSocket = (token, setChatMessages, setNearbyPlaces) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const handlersAttached = useRef(false);

    useEffect(() => {
        if (token && !socket) {
            const WS_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api').replace('/api', '');

            const newSocket = io(WS_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                withCredentials: true
            });

            newSocket.on('connect', () => {
                setConnected(true);
                console.log('✅ Socket connected');
            });

            newSocket.on('disconnect', () => {
                setConnected(false);
                console.log('❌ Socket disconnected');
            });

            // Only attach message handlers once
            if (!handlersAttached.current) {
                newSocket.on('ai_response', (data) => {
                    if (setChatMessages) {
                        setChatMessages(prev => [...prev, {
                            type: 'ai',
                            content: data.success ? data.data.message : data.fallback,
                            timestamp: new Date(),
                            model: data.data?.model
                        }]);
                    }
                });

                newSocket.on('location_context', (data) => {
                    if (setNearbyPlaces) {
                        setNearbyPlaces(data.nearbyRecommendations || []);
                    }
                });

                handlersAttached.current = true;
            }

            setSocket(newSocket);

            return () => {
                handlersAttached.current = false;
                newSocket.close();
            };
        }
    }, [token]);

    return { socket, connected };
};
// ===================================
// MAIN APP COMPONENT
// ===================================
const App = () => {
    const { user, token, loading, login, register, logout } = useAuth();
    const { location, weather, updateLocation } = useLocation();

    const [currentMode, setCurrentMode] = useState('planning');
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [trips, setTrips] = useState([]);
    const [memories, setMemories] = useState([]);
    const [nearbyPlaces, setNearbyPlaces] = useState([]);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [dashboardData, setDashboardData] = useState(null);
    const [planningView, setPlanningView] = useState('create');
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [selectedTripId, setSelectedTripId] = useState(() => {
        const saved = localStorage.getItem('selectedTripId');
        return saved ? parseInt(saved) : null;
    });
    const [view, setView] = useState('create');
    const activeTrip = trips.find(t => t.status === 'active');
    const { socket, connected } = useSocket(token, setChatMessages, setNearbyPlaces);


    // Load initial data when user logs in
    useEffect(() => {
        if (user && token) {
            loadDashboardData();
            loadTrips();
            loadMemories();
        }
    }, [user, token]);

    // Socket event listeners
    useEffect(() => {
        if (socket) {
            socket.on('ai_response', (data) => {
                setChatMessages(prev => [...prev, {
                    type: 'ai',
                    content: data.success ? data.data.message : data.fallback,
                    timestamp: new Date(),
                    model: data.data?.model
                }]);
            });

            socket.on('location_context', (data) => {
                setNearbyPlaces(data.nearbyRecommendations || []);
            });

            socket.on('trip_updated', (data) => {
                setTrips(prev => prev.map(trip =>
                    trip.id === data.tripId
                        ? { ...trip, ...data.updates }
                        : trip
                ));
            });

            return () => {
                socket.off('ai_response');
                socket.off('location_context');
                socket.off('trip_updated');
            };
        }
    }, [socket]);

    // Update location via socket when location changes
    useEffect(() => {
        if (socket && location) {
            socket.emit('location_update', location);
        }
    }, [socket, location]);
    useEffect(() => {
        if (selectedTripId) {
            localStorage.setItem('selectedTripId', selectedTripId.toString());
        } else {
            localStorage.removeItem('selectedTripId');
        }
    }, [selectedTripId]);

    useEffect(() => {
        localStorage.setItem('planningView', view);
    }, [view]);

    useEffect(() => {
        if (trips.length > 0 && selectedTripId && !selectedTrip) {
            const trip = trips.find(t => t.id === selectedTripId);
            if (trip) {
                setSelectedTrip(trip);
            }
        }
    }, [trips, selectedTripId, selectedTrip]);

    const loadDashboardData = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/analytics/dashboard`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setDashboardData(data.data);
            }
        } catch (error) {
            console.error('Dashboard load error:', error);
        }
    };

    const loadTrips = async () => {
        try {
            console.log('🔄 Loading trips...');
            const response = await fetch(`${API_BASE_URL}/trips?limit=10`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('📡 Response status:', response.status);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            console.log('✅ Trips response:', data);
            console.log('📊 Number of trips:', data.data?.length || 0);


            if (data.success) {
                const processedTrips = (data.data || []).map(trip => ({
                    ...trip,
                    id: Number(trip.id),
                    user_id: Number(trip.user_id)
                }));

                console.log('📊 Setting trips:', processedTrips);
                setTrips(processedTrips);

                // Set active trip as current
                const activeTrip = processedTrips.find(trip => trip.status === 'active');
                if (activeTrip) {
                    console.log('✅ Found active trip:', activeTrip.title);
                    setCurrentTrip(activeTrip);
                } else {
                    console.log('⚠️ No active trip found');
                }
            } else {
                console.error('❌ API returned success: false');
            }
        } catch (error) {
            console.error('❌ Trips load error:', error);
            console.error('❌ Error details:', error.message);
            // Mock data for demo
            setTrips([
                {
                    id: 1,
                    title: 'Barcelona Adventure',
                    destination: 'Barcelona, Spain',
                    duration: 7,
                    budget: 1500,
                    status: 'active',
                    startDate: '2024-03-15',
                    endDate: '2024-03-22'
                }
            ]);
            setCurrentTrip({
                id: 1,
                title: 'Barcelona Adventure',
                destination: 'Barcelona, Spain',
                duration: 7,
                budget: 1500,
                status: 'active'
            });
        }
    };

    const loadMemories = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/memories?limit=20`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setMemories(data.data);
            }
        } catch (error) {
            console.error('Memories load error:', error);
            // Mock data for demo
            setMemories([
                {
                    id: 1,
                    title: 'Sagrada Familia Visit',
                    description: 'Amazing architecture and spiritual experience',
                    rating: 5,
                    memory_type: 'experience',
                    memory_date: '2024-03-16',
                    tags: ['architecture', 'culture']
                }
            ]);
        }
    };
    const handleViewActiveTrip = () => {
        if (activeTrip) {
            // Navigate to planning mode and show active trip
            setCurrentMode('planning');
            setSelectedTrip(activeTrip);
            setSelectedTripId(activeTrip.id);
            setView('manage');
        }
    };
    const sendChatMessage = (message) => {
        const userMessage = {
            type: 'user',
            content: message,
            timestamp: new Date()
        };

        setChatMessages(prev => [...prev, userMessage]);
        console.log('Sending message:', message);
        console.log('Socket connected:', connected);
        console.log('Socket exists:', !!socket);

        if (socket && connected) {
            socket.emit('ai_chat', {
                message,
                context: {
                    mode: currentMode,
                    location: location,
                    weather: weather,
                    currentTrip: currentTrip,
                    userPreferences: Array.isArray(user?.preferences) ? user.preferences : (user?.preferences ? [user.preferences] : [])  // ✅ ENSURE IT'S AN ARRAY
                }
            });
            console.log('Message sent via socket');
        } else {
            console.warn('Socket not connected, cannot send message');
            // Add error message to chat
            setTimeout(async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message,
                            context: {
                                mode: currentMode,
                                location: location,
                                weather: weather,
                                currentTrip: currentTrip,
                                userPreferences: user?.preferences
                            }
                        })
                    });
                    const data = await response.json();
                    console.log('HTTP API response:', data);

                    if (data.success) {
                        setChatMessages(prev => [...prev, {
                            type: 'ai',
                            content: data.data.message,
                            timestamp: new Date(),
                            model: data.data.model
                        }]);
                    } else {
                        setChatMessages(prev => [...prev, {
                            type: 'ai',
                            content: 'Sorry, I encountered an error. Please try again.',
                            timestamp: new Date(),
                            error: true
                        }]);
                    }
                } catch (error) {
                    console.error('HTTP fallback error:', error);
                    setChatMessages(prev => [...prev, {
                        type: 'ai',
                        content: 'Connection error. Please check your internet connection.',
                        timestamp: new Date(),
                        error: true
                    }]);
                }
            }, 500);
        }
    };
    // Show loading screen
    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading TravelMind.ai...</p>
                </div>
            </div>
        );
    }

    // Show auth screen if not logged in
    if (!user) {
        return <AuthScreen login={login} register={register} />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <Header
                user={user}
                logout={logout}
                currentMode={currentMode}
                setCurrentMode={setCurrentMode}
                connected={connected}
                location={location}
                weather={weather}
                activeTrip={activeTrip}
                onViewActiveTrip={handleViewActiveTrip}
            />

            <main className="pb-20">
                {currentMode === 'planning' && (
                    <PlanningMode
                        user={user}
                        token={token}
                        trips={trips}
                        setTrips={setTrips}
                        setCurrentTrip={setCurrentTrip}
                        sendChatMessage={sendChatMessage}
                        setChatOpen={setChatOpen}
                        location={location}
                        view={view}
                        setView={setView}
                        selectedTrip={selectedTrip}
                        setSelectedTrip={setSelectedTrip}
                        selectedTripId={selectedTripId}
                        setSelectedTripId={setSelectedTripId}
                    />
                )}

                {currentMode === 'companion' && (
                    <CompanionMode
                        user={user}
                        token={token}
                        location={location}
                        weather={weather}
                        setChatOpen={setChatOpen}
                        nearbyPlaces={nearbyPlaces}
                        currentTrip={currentTrip}
                        sendChatMessage={sendChatMessage}
                    />
                )}

                {currentMode === 'memory' && (
                    <MemoryMode
                        user={user}
                        token={token}
                        memories={memories}
                        setMemories={setMemories}
                        trips={trips}
                        dashboardData={dashboardData}
                        sendChatMessage={sendChatMessage}
                    />
                )}
            </main>

            <AIChat
                isOpen={chatOpen}
                onClose={() => setChatOpen(false)}
                messages={chatMessages}
                onSendMessage={sendChatMessage}
                currentMode={currentMode}
                connected={connected}
            />

            <FloatingChatButton onClick={() => setChatOpen(true)} />
        </div>
    );
};

// ===================================
// AUTHENTICATION SCREEN
// ===================================
const AuthScreen = ({ login, register }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ email: '', password: '', name: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            let result;
            if (isLogin) {
                result = await login(formData.email, formData.password);
            } else {
                result = await register(formData.email, formData.password, formData.name);
            }

            if (!result.success) {
                setError(result.error);
            }
        } catch (err) {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Demo login function
    const handleDemoLogin = () => {
        localStorage.setItem('token', 'demo-token');
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Plane className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">TravelMind.ai</h1>
                    <p className="text-gray-600">Your AI Travel Companion</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Full Name
                            </label>
                            <input
                                type="text"
                                required={!isLogin}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Enter your full name"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                        </label>
                        <input
                            type="email"
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="Enter your email"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={formData.password}
                            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                            placeholder="Enter your password"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="text-red-700 text-sm">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <div className="mt-6 space-y-4">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="w-full text-blue-600 hover:text-blue-700 text-sm"
                    >
                        {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                    </button>

                    {/* Demo Access */}
                    <div className="border-t pt-4">
                        <button
                            onClick={handleDemoLogin}
                            className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                        >
                            Try Demo (No signup required)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
// ===================================
// HEADER COMPONENT
// ===================================
const Header = ({ user, logout, currentMode, setCurrentMode, connected, location, weather, activeTrip, onViewActiveTrip }) => {
    const [showUserMenu, setShowUserMenu] = useState(false);

    const getWeatherIcon = () => {
        if (!weather) return <Cloud className="w-4 h-4" />;

        switch (weather.condition?.toLowerCase()) {
            case 'clear': return <Sun className="w-4 h-4 text-yellow-500" />;
            case 'rain': return <CloudRain className="w-4 h-4 text-blue-500" />;
            default: return <Cloud className="w-4 h-4 text-gray-500" />;
        }
    };

    return (
        <header className="bg-white shadow-lg border-b sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                            <Plane className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">TravelMind.ai</h1>
                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <span>{connected ? 'Connected' : 'Demo Mode'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        {[
                            { id: 'planning', icon: Calendar, label: 'Planning' },
                            { id: 'companion', icon: Navigation, label: 'Companion' },
                            { id: 'memory', icon: Camera, label: 'Memory' }
                        ].map(({ id, icon: Icon, label }) => (
                            <button
                                key={id}
                                onClick={() => setCurrentMode(id)}
                                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                                    currentMode === id
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Status & User Menu */}
                    <div className="flex items-center space-x-4">
                        {/* Active Trip Quick Access */}
                        {activeTrip && currentMode === 'planning' && (
                            <button
                                onClick={onViewActiveTrip}
                                className="hidden md:flex items-center space-x-2 bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200 transition-colors text-sm"
                            >
                                <Check className="w-4 h-4" />
                                <span>Active: {activeTrip.destination}</span>
                            </button>
                        )}
                        {/* Location & Weather */}
                        {location && (
                            <div className="hidden md:flex items-center space-x-3 text-sm text-gray-600">
                                <div className="flex items-center space-x-1">
                                    <MapPin className="w-4 h-4" />
                                    <span>{location.lat.toFixed(2)}, {location.lng.toFixed(2)}</span>
                                </div>
                                {weather && (
                                    <div className="flex items-center space-x-1">
                                        {getWeatherIcon()}
                                        <span>{Math.round(weather.temperature)}°C</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* User Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="flex items-center space-x-2 text-gray-700 hover:text-gray-900"
                            >
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                                <span className="hidden sm:inline">{user.name}</span>
                            </button>

                            {showUserMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1 z-50">
                                    <div className="px-4 py-2 border-b">
                                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                                        <p className="text-xs text-gray-500">{user.email}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            logout();
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};// ===================================
// FLIGHT SEARCH COMPONENT - CORRECTED
// ===================================
const FlightSearch = ({trip, token, onFlightSelected}) => {
    const [searchParams, setSearchParams] = useState({
        origin: '',
        destination: trip?.destination?.split(',')[0] || '',
        departureDate: trip?.startDate || '',
        returnDate: trip?.endDate || '',
        adults: 1,
        travelClass: 'ECONOMY'
    });
    const [flights, setFlights] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [expandedFlight, setExpandedFlight] = useState(null);
    const [showAirportLookup, setShowAirportLookup] = useState(false);
    const [lookupField, setLookupField] = useState('');

    const getAirlineName = (code) => {
        const airlines = {
            'AA': 'American Airlines',
            'UA': 'United Airlines',
            'DL': 'Delta Air Lines',
            'CM': 'Copa Airlines',
            'BA': 'British Airways',
            'LH': 'Lufthansa',
            'AF': 'Air France',
            'KL': 'KLM',
            'IB': 'Iberia',
            'AC': 'Air Canada',
            'AV': 'Avianca',
            'LA': 'LATAM Airlines',
            'NK': 'Spirit Airlines',
            'F9': 'Frontier Airlines',
            'B6': 'JetBlue',
            'WN': 'Southwest Airlines',
            'AS': 'Alaska Airlines',
            'SY': 'Sun Country Airlines',
            'G4': 'Allegiant Air'
        };
        return airlines[code] || code;
    };

    const AirportLookupModal = ({ isOpen, onClose, onSelect, fieldName }) => {
        const [searchTerm, setSearchTerm] = useState('');
        const [airports, setAirports] = useState([]);
        const [searching, setSearching] = useState(false);
        const [searchError, setSearchError] = useState('');

        useEffect(() => {
            if (searchTerm.length >= 2) {
                const timer = setTimeout(() => {
                    searchAirports();
                }, 500);
                return () => clearTimeout(timer);
            } else {
                setAirports([]);
            }
        }, [searchTerm]);

        const searchAirports = async () => {
            setSearching(true);
            setSearchError('');

            try {
                const response = await fetch(
                    `${API_BASE_URL}/airports/search?keyword=${encodeURIComponent(searchTerm)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const data = await response.json();

                if (data.success) {
                    setAirports(data.data);
                    if (data.data.length === 0) {
                        setSearchError('No airports found');
                    }
                } else {
                    setSearchError(data.error);
                }
            } catch (err) {
                setSearchError('Search failed');
            } finally {
                setSearching(false);
            }
        };

        const handleSelect = (airport) => {
            onSelect(airport.iataCode, fieldName);
            setSearchTerm('');
            setAirports([]);
            onClose();
        };

        if (!isOpen) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Find Airport Code</h2>
                            <button onClick={onClose} className="text-white/80 hover:text-white">✕</button>
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search city or airport name..."
                                className="w-full px-4 py-3 rounded-lg text-gray-900"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[60vh]">
                        {searching && <div className="text-center py-8">Searching...</div>}
                        {searchError && <div className="text-red-600">{searchError}</div>}
                        {!searching && airports.length > 0 && (
                            <div className="space-y-2">
                                {airports.map((airport) => (
                                    <button
                                        key={airport.id}
                                        onClick={() => handleSelect(airport)}
                                        className="w-full text-left p-4 border rounded-lg hover:bg-blue-50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-bold text-blue-600 text-lg">{airport.iataCode}</div>
                                                <div className="font-semibold">{airport.name}</div>
                                                <div className="text-sm text-gray-600">
                                                    {airport.address?.cityName}, {airport.address?.countryName}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const searchFlights = async () => {
        if (!searchParams.origin || !searchParams.destination || !searchParams.departureDate) {
            setError('Please fill in origin, destination, and departure date');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const queryParams = new URLSearchParams({
                origin: searchParams.origin,
                destination: searchParams.destination,
                departureDate: searchParams.departureDate,
                adults: searchParams.adults,
                travelClass: searchParams.travelClass
            });

            if (searchParams.returnDate) {
                queryParams.append('returnDate', searchParams.returnDate);
            }

            const response = await fetch(`${API_BASE_URL}/flights/search?${queryParams}`, {
                headers: {Authorization: `Bearer ${token}`}
            });

            const data = await response.json();

            if (data.success) {
                setFlights(data.data);
                if (data.data.offers.length === 0) {
                    setError('No flights found for this route and date. Try different criteria.');
                }
            } else {
                setError(data.error || 'Failed to search flights');
            }
        } catch (err) {
            console.error('Flight search error:', err);
            setError('Failed to search flights. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const formatDuration = (duration) => {
        if (!duration) return 'N/A';
        const match = duration.match(/PT(\d+H)?(\d+M)?/);
        if (!match) return duration;
        const hours = match[1] ? parseInt(match[1]) : 0;
        const minutes = match[2] ? parseInt(match[2]) : 0;
        return `${hours}h ${minutes}m`;
    };

    const formatTime = (dateTimeString) => {
        const date = new Date(dateTimeString);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatDate = (dateTimeString) => {
        const date = new Date(dateTimeString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    const handleSelectFlight = async (offer) => {
        try {
            const airlineName = getAirlineName(offer.validatingAirlineCodes[0]);

            const response = await fetch(`${API_BASE_URL}/flights/save-selection`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tripId: trip?.id,
                    flightData: {
                        offerId: offer.id,
                        origin: searchParams.origin,
                        destination: searchParams.destination,
                        departureDate: searchParams.departureDate,
                        returnDate: searchParams.returnDate,
                        price: offer.price.total,
                        currency: offer.price.currency,
                        airline: offer.validatingAirlineCodes[0],
                        airlineName: airlineName,
                        itinerary: offer.itineraries,
                        passengers: searchParams.adults,
                        travelClass: searchParams.travelClass
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                alert(`Flight added to your trip!\n\n${airlineName}\n$${offer.price.total}\n\nReturning to itinerary...`);
                if (onFlightSelected) {
                    onFlightSelected(data.data);
                }
            }
        } catch (error) {
            alert('Error saving flight. Please try again.');
        }
    };

    return (
        <div className="space-y-6">
            {/* Search Form */}
            <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Search Flights</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                placeholder="e.g., JFK, LAX, IAD"
                                maxLength={3}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
                                value={searchParams.origin}
                                onChange={(e) => setSearchParams(prev => ({ ...prev, origin: e.target.value.toUpperCase() }))}
                            />
                            <button
                                onClick={() => {
                                    setLookupField('origin');
                                    setShowAirportLookup(true);
                                }}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                🔍
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                placeholder="e.g., CDG, LHR, SJO"
                                maxLength={3}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
                                value={searchParams.destination}
                                onChange={(e) => setSearchParams(prev => ({ ...prev, destination: e.target.value.toUpperCase() }))}
                            />
                            <button
                                onClick={() => {
                                    setLookupField('destination');
                                    setShowAirportLookup(true);
                                }}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                🔍
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Departure Date</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.departureDate}
                            onChange={(e) => setSearchParams(prev => ({...prev, departureDate: e.target.value}))}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Return Date (Optional)</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.returnDate}
                            onChange={(e) => setSearchParams(prev => ({...prev, returnDate: e.target.value}))}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Passengers</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.adults}
                            onChange={(e) => setSearchParams(prev => ({...prev, adults: parseInt(e.target.value)}))}
                        >
                            {[1, 2, 3, 4, 5, 6].map(num => (
                                <option key={num} value={num}>{num} Adult{num > 1 ? 's' : ''}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.travelClass}
                            onChange={(e) => setSearchParams(prev => ({...prev, travelClass: e.target.value}))}
                        >
                            <option value="ECONOMY">Economy</option>
                            <option value="PREMIUM_ECONOMY">Premium Economy</option>
                            <option value="BUSINESS">Business</option>
                            <option value="FIRST">First Class</option>
                        </select>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-red-700 text-sm">{error}</p>
                    </div>
                )}

                <button
                    onClick={searchFlights}
                    disabled={loading}
                    className="mt-4 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                    {loading ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                            Searching Flights...
                        </>
                    ) : (
                        <>
                            <Plane className="w-5 h-5 mr-2"/>
                            Search Flights
                        </>
                    )}
                </button>
            </div>

            <AirportLookupModal
                isOpen={showAirportLookup}
                onClose={() => setShowAirportLookup(false)}
                onSelect={(code, field) => setSearchParams(prev => ({ ...prev, [field]: code }))}
                fieldName={lookupField}
            />

            {/* Results */}
            {flights && flights.offers && flights.offers.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-gray-900">
                            Available Flights ({flights.offers.length})
                        </h3>
                        <div className="text-sm text-gray-600">
                            Showing results for {searchParams.origin} → {searchParams.destination}
                        </div>
                    </div>

                    {flights.offers.map((offer, index) => {
                        const outbound = offer.itineraries[0];
                        const returnFlight = offer.itineraries[1];
                        const isExpanded = expandedFlight === index;
                        const airlineName = getAirlineName(offer.validatingAirlineCodes?.[0]);

                        return (
                            <div key={offer.id || index}
                                 className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">

                                {/* Outbound Flight */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center space-x-3">
                                            <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                                                {airlineName}
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                Outbound • {formatDate(outbound.segments[0].departure.at)}
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                {outbound.segments.length === 1 ? 'Direct' : `${outbound.segments.length - 1} stop(s)`}
                                            </div>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {formatDuration(outbound.duration)}
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-4">
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-gray-900">
                                                {formatTime(outbound.segments[0].departure.at)}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {outbound.segments[0].departure.iataCode}
                                            </div>
                                        </div>

                                        <div className="flex-1 mx-4">
                                            <div className="flex items-center justify-center">
                                                <div className="flex-1 border-t-2 border-gray-300"></div>
                                                <Plane className="w-5 h-5 text-blue-600 mx-2"/>
                                                <div className="flex-1 border-t-2 border-gray-300"></div>
                                            </div>
                                            <div className="text-center text-xs text-gray-500 mt-1">
                                                {outbound.segments.map(s => `${s.carrierCode}${s.number}`).join(', ')}
                                            </div>
                                        </div>

                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-gray-900">
                                                {formatTime(outbound.segments[outbound.segments.length - 1].arrival.at)}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {outbound.segments[outbound.segments.length - 1].arrival.iataCode}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Return Flight */}
                                {returnFlight && (
                                    <div className="mb-4 pt-4 border-t">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center space-x-3">
                                                <div className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                                                    Return
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {formatDate(returnFlight.segments[0].departure.at)}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {returnFlight.segments.length === 1 ? 'Direct' : `${returnFlight.segments.length - 1} stop(s)`}
                                                </div>
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {formatDuration(returnFlight.duration)}
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-4">
                                            <div className="text-center">
                                                <div className="text-2xl font-bold text-gray-900">
                                                    {formatTime(returnFlight.segments[0].departure.at)}
                                                </div>
                                                <div className="text-sm text-gray-600">
                                                    {returnFlight.segments[0].departure.iataCode}
                                                </div>
                                            </div>

                                            <div className="flex-1 mx-4">
                                                <div className="flex items-center justify-center">
                                                    <div className="flex-1 border-t-2 border-gray-300"></div>
                                                    <Plane className="w-5 h-5 text-purple-600 mx-2 transform rotate-180"/>
                                                    <div className="flex-1 border-t-2 border-gray-300"></div>
                                                </div>
                                                <div className="text-center text-xs text-gray-500 mt-1">
                                                    {returnFlight.segments.map(s => `${s.carrierCode}${s.number}`).join(', ')}
                                                </div>
                                            </div>

                                            <div className="text-center">
                                                <div className="text-2xl font-bold text-gray-900">
                                                    {formatTime(returnFlight.segments[returnFlight.segments.length - 1].arrival.at)}
                                                </div>
                                                <div className="text-sm text-gray-600">
                                                    {returnFlight.segments[returnFlight.segments.length - 1].arrival.iataCode}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Price and Actions */}
                                <div className="flex items-center justify-between pt-4 border-t">
                                    <div>
                                        <div className="text-3xl font-bold text-blue-600">
                                            ${offer.price?.total || 'N/A'}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {offer.price?.currency || 'USD'} total • {searchParams.adults} passenger{searchParams.adults > 1 ? 's' : ''}
                                        </div>
                                    </div>

                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => setExpandedFlight(isExpanded ? null : index)}
                                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                                        >
                                            {isExpanded ? 'Hide Details' : 'View Details'}
                                        </button>
                                        <button
                                            onClick={() => handleSelectFlight(offer)}
                                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                                            Select Flight
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="mt-4 pt-4 border-t bg-gray-50 rounded-lg p-4 space-y-4">
                                        <div>
                                            <h4 className="font-semibold mb-3">Complete Itinerary</h4>

                                            <div className="mb-4">
                                                <div className="text-sm font-medium text-gray-700 mb-2">Outbound Journey</div>
                                                {outbound.segments.map((segment, idx) => (
                                                    <div key={idx} className="mb-3 pb-3 border-b last:border-b-0">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <div className="font-medium">
                                                                    {segment.departure.iataCode} → {segment.arrival.iataCode}
                                                                </div>
                                                                <div className="text-sm text-gray-600">
                                                                    {segment.carrierCode} {segment.number} • {formatDuration(segment.duration)}
                                                                </div>
                                                            </div>
                                                            <div className="text-right text-sm">
                                                                <div>{formatTime(segment.departure.at)}</div>
                                                                <div className="text-gray-500">to</div>
                                                                <div>{formatTime(segment.arrival.at)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {returnFlight && (
                                                <div>
                                                    <div className="text-sm font-medium text-gray-700 mb-2">Return Journey</div>
                                                    {returnFlight.segments.map((segment, idx) => (
                                                        <div key={idx} className="mb-3 pb-3 border-b last:border-b-0">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <div className="font-medium">
                                                                        {segment.departure.iataCode} → {segment.arrival.iataCode}
                                                                    </div>
                                                                    <div className="text-sm text-gray-600">
                                                                        {segment.carrierCode} {segment.number} • {formatDuration(segment.duration)}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right text-sm">
                                                                    <div>{formatTime(segment.departure.at)}</div>
                                                                    <div className="text-gray-500">to</div>
                                                                    <div>{formatTime(segment.arrival.at)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h4 className="font-semibold mb-2">Price Breakdown</h4>
                                            <div className="bg-white rounded p-3 space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span>Base Fare:</span>
                                                    <span>${offer.price.base}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Taxes & Fees:</span>
                                                    <span>${(parseFloat(offer.price.total) - parseFloat(offer.price.base)).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between font-semibold pt-2 border-t">
                                                    <span>Total:</span>
                                                    <span>${offer.price.total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {flights && flights.offers && flights.offers.length === 0 && (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                    <Plane className="w-16 h-16 text-gray-300 mx-auto mb-4"/>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No flights found</h3>
                    <p className="text-gray-500">Try adjusting your search criteria or different dates</p>
                </div>
            )}
        </div>
    );
};

// ===================================
// HOTEL SEARCH COMPONENT
// ===================================
const HotelSearch = ({trip, token}) => {
    const [searchParams, setSearchParams] = useState({
        cityCode: '',
        checkInDate: trip?.startDate || '',
        checkOutDate: trip?.endDate || '',
        adults: 1,
        rooms: 1
    });
    const [hotels, setHotels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const searchHotels = async () => {
        if (!searchParams.cityCode || !searchParams.checkInDate || !searchParams.checkOutDate) {
            setError('Please fill in all required fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const queryParams = new URLSearchParams({
                cityCode: searchParams.cityCode,
                checkInDate: searchParams.checkInDate,
                checkOutDate: searchParams.checkOutDate,
                adults: searchParams.adults,
                rooms: searchParams.rooms
            });

            const response = await fetch(`${API_BASE_URL}/hotels/search?${queryParams}`, {
                headers: {Authorization: `Bearer ${token}`}
            });

            const data = await response.json();

            if (data.success) {
                // ✅ Fix: Access the hotels array correctly
                setHotels(data.data.hotels || []);

                if (!data.data.hotels || data.data.hotels.length === 0) {
                    setError('No hotels found for this location and dates');
                }
            } else {
                setError(data.error || 'Failed to search hotels');
            }
        } catch (err) {
            console.error('Hotel search error:', err);
            setError('Failed to search hotels. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Search Form */}
            <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Search Hotels</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            City Code
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., NYC, LON, PAR"
                            maxLength={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
                            value={searchParams.cityCode}
                            onChange={(e) => setSearchParams(prev => ({
                                ...prev,
                                cityCode: e.target.value.toUpperCase()
                            }))}
                        />
                        <p className="text-xs text-gray-500 mt-1">3-letter IATA city code</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Check-in Date
                        </label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.checkInDate}
                            onChange={(e) => setSearchParams(prev => ({...prev, checkInDate: e.target.value}))}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Check-out Date
                        </label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.checkOutDate}
                            onChange={(e) => setSearchParams(prev => ({...prev, checkOutDate: e.target.value}))}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Adults
                        </label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.adults}
                            onChange={(e) => setSearchParams(prev => ({...prev, adults: parseInt(e.target.value)}))}
                        >
                            {[1, 2, 3, 4].map(num => (
                                <option key={num} value={num}>{num} Adult{num > 1 ? 's' : ''}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Rooms
                        </label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={searchParams.rooms}
                            onChange={(e) => setSearchParams(prev => ({...prev, rooms: parseInt(e.target.value)}))}
                        >
                            {[1, 2, 3, 4].map(num => (
                                <option key={num} value={num}>{num} Room{num > 1 ? 's' : ''}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-red-700 text-sm">{error}</p>
                    </div>
                )}

                <button
                    onClick={searchHotels}
                    disabled={loading}
                    className="mt-4 w-full bg-gradient-to-r from-green-600 to-teal-600 text-white py-3 rounded-lg hover:from-green-700 hover:to-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                    {loading ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                            Searching Hotels...
                        </>
                    ) : (
                        <>
                            <Star className="w-5 h-5 mr-2"/>
                            Search Hotels
                        </>
                    )}
                </button>
            </div>

            {/* Results */}
            {hotels.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-gray-900">
                            Available Hotels ({hotels.length})
                        </h3>
                        <div className="flex items-center space-x-2">
                            <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                <option>Recommended</option>
                                <option>Price: Low to High</option>
                                <option>Price: High to Low</option>
                                <option>Star Rating</option>
                            </select>
                        </div>
                    </div>

                    {hotels.map((hotel, index) => (
                        <div key={hotel.hotelId || index}
                             className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                            <div className="flex">
                                {/* Hotel Image Placeholder */}
                                <div
                                    className="w-64 h-48 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                                    <Star className="w-16 h-16 text-gray-400"/>
                                </div>

                                {/* Hotel Details */}
                                <div className="flex-1 p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h4 className="text-xl font-semibold text-gray-900 mb-2">{hotel.name}</h4>
                                            <p className="text-gray-600 text-sm mb-3">{hotel.address?.cityName}</p>

                                            {/* Rating Stars */}
                                            <div className="flex items-center space-x-2 mb-3">
                                                <div className="flex">
                                                    {[...Array(5)].map((_, i) => (
                                                        <Star
                                                            key={i}
                                                            className={`w-4 h-4 ${
                                                                i < (hotel.rating || 0) ? 'text-yellow-400 fill-current' : 'text-gray-300'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                                {hotel.rating && (
                                                    <span
                                                        className="text-sm text-gray-600">({hotel.rating} stars)</span>
                                                )}
                                            </div>

                                            {/* Amenities */}
                                            {hotel.amenities && (
                                                <div className="flex flex-wrap gap-2">
                                                    {hotel.amenities.slice(0, 4).map((amenity, i) => (
                                                        <span key={i}
                                                              className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              {amenity}
                            </span>
                                                    ))}
                                                    {hotel.amenities.length > 4 && (
                                                        <span className="text-xs text-gray-500">
                              +{hotel.amenities.length - 4} more
                            </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="ml-6 text-right">
                                            <div className="text-sm text-gray-500 mb-1">From</div>
                                            <div className="text-3xl font-bold text-gray-900 mb-2">
                                                ${hotel.price || '150'}
                                            </div>
                                            <div className="text-sm text-gray-500 mb-4">per night</div>
                                            <button
                                                className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
                                                Book Now
                                            </button>
                                            <button
                                                className="w-full mt-2 bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                                                View Details
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && hotels.length === 0 && searchParams.cityCode && (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                    <Star className="w-16 h-16 text-gray-300 mx-auto mb-4"/>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hotels found</h3>
                    <p className="text-gray-500">Try adjusting your search criteria</p>
                </div>
            )}
        </div>
    );
};
// Add this component after HotelSearch and before PlanningMode

// ===================================
// ACTIVITIES SEARCH COMPONENT
// ===================================
const ActivitiesSearch = ({ trip, token, location, sendChatMessage }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searchRadius, setSearchRadius] = useState(1);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [aiInsightLoading, setAiInsightLoading] = useState(false);
    const [aiInsights, setAiInsights] = useState({});

    const searchActivities = async () => {
        if (!location || !location.lat || !location.lng) {
            setError('Location is required to search activities. Please enable location services.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // ✅ Use actual location only - no defaults
            const lat = location.lat;
            const lng = location.lng;

            const response = await fetch(
                `${API_BASE_URL}/activities/search?latitude=${lat}&longitude=${lng}&radius=${searchRadius}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const data = await response.json();

            if (data.success) {
                setActivities(data.data.activities || []);
                if (data.data.activities?.length === 0) {
                    setError('No activities found in this area. Try increasing the search radius.');
                }
            } else {
                setError(data.error || 'Failed to search activities');
            }
        } catch (err) {
            console.error('Activities search error:', err);
            setError('Failed to search activities. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const getAIInsight = async (activity) => {
        setAiInsightLoading(true);
        setSelectedActivity(activity);

        try {
            const response = await fetch(`${API_BASE_URL}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Analyze this activity and give me practical insights: ${activity.name}. Description: ${activity.shortDescription || 'N/A'}. Price: ${activity.price?.amount} ${activity.price?.currencyCode}. What makes this special? Any tips for booking or visiting? Keep it concise and helpful.`,
                    context: {
                        mode: 'analysis',
                        activity: activity
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                setAiInsights(prev => ({
                    ...prev,
                    [activity.id]: data.data.message
                }));
            }
        } catch (error) {
            console.error('AI insight error:', error);
        } finally {
            setAiInsightLoading(false);
        }
    };

    useEffect(() => {
        if (location && location.lat && location.lng) {
            searchActivities();
        }
    }, [location, searchRadius]);

    return (
        <div className="space-y-6">
            {/* Search Controls */}
            <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Search Activities & Tours</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Search Radius
                        </label>
                        <select
                            value={searchRadius}
                            onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value={1}>1 km</option>
                            <option value={5}>5 km</option>
                            <option value={10}>10 km</option>
                            <option value={20}>20 km</option>
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={searchActivities}
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white py-3 rounded-lg hover:from-orange-700 hover:to-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <MapPin className="w-5 h-5 mr-2" />
                                    Search Activities
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-red-700 text-sm">{error}</p>
                    </div>
                )}
            </div>

            {/* Results */}
            {activities.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-gray-900">
                            Available Activities ({activities.length})
                        </h3>
                    </div>

                    {activities.map((activity) => (
                        <div key={activity.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                            <div className="flex flex-col md:flex-row">
                                {/* Activity Image */}
                                {activity.pictures && activity.pictures.length > 0 ? (
                                    <div className="md:w-64 h-48 bg-gray-200">
                                        <img
                                            src={activity.pictures[0]}
                                            alt={activity.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="md:w-64 h-48 bg-gradient-to-br from-orange-200 to-red-300 flex items-center justify-center">
                                        <Star className="w-16 h-16 text-white" />
                                    </div>
                                )}

                                {/* Activity Details */}
                                <div className="flex-1 p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h4 className="text-xl font-semibold text-gray-900 mb-2">{activity.name}</h4>
                                            <p className="text-gray-600 text-sm mb-3">{activity.shortDescription}</p>

                                            {/* Rating */}
                                            {activity.rating && (
                                                <div className="flex items-center space-x-2 mb-3">
                                                    <div className="flex">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`w-4 h-4 ${
                                                                    i < Math.floor(activity.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className="text-sm text-gray-600">({activity.rating})</span>
                                                </div>
                                            )}

                                            {/* Location */}
                                            {activity.geoCode && (
                                                <p className="text-sm text-gray-500 mb-2">
                                                    📍 {activity.geoCode.latitude.toFixed(4)}, {activity.geoCode.longitude.toFixed(4)}
                                                </p>
                                            )}
                                        </div>

                                        <div className="ml-6 text-right">
                                            {activity.price && (
                                                <>
                                                    <div className="text-sm text-gray-500 mb-1">From</div>
                                                    <div className="text-3xl font-bold text-gray-900 mb-2">
                                                        {activity.price.currencyCode} {activity.price.amount}
                                                    </div>
                                                </>
                                            )}
                                            <a
                                                href={activity.bookingLink || '#'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block w-full bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition-colors text-center whitespace-nowrap mb-2"
                                            >
                                                Book Now
                                            </a>
                                            <button
                                                onClick={() => getAIInsight(activity)}
                                                disabled={aiInsightLoading && selectedActivity?.id === activity.id}
                                                className="w-full bg-purple-100 text-purple-700 px-6 py-2 rounded-lg hover:bg-purple-200 transition-colors text-sm flex items-center justify-center space-x-2"
                                            >
                                                {aiInsightLoading && selectedActivity?.id === activity.id ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-700"></div>
                                                        <span>Getting AI Insight...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Zap className="w-4 h-4" />
                                                        <span>AI Insight</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* AI Insights */}
                                    {aiInsights[activity.id] && (
                                        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
                                            <div className="flex items-start space-x-2">
                                                <Zap className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <h5 className="font-semibold text-purple-900 mb-2">AI Insight</h5>
                                                    <p className="text-sm text-purple-800 leading-relaxed whitespace-pre-wrap">
                                                        {aiInsights[activity.id]}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && activities.length === 0 && !error && (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                    <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Search for activities</h3>
                    <p className="text-gray-500">Click "Search Activities" to find tours and experiences nearby</p>
                </div>
            )}
        </div>
    );
};
// Map Modal Component
const MapModal = ({ isOpen, onClose, dayTitle, locations, destination, token }) => {
    const [coordinates, setCoordinates] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && locations.length > 0) {
            fetchCoordinates();
        }
    }, [isOpen, locations]);

    const fetchCoordinates = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/places/coordinates`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ locations, destination })
            });

            const data = await response.json();
            if (data.success) {
                setCoordinates(data.data.locations);
            }
        } catch (error) {
            console.error('Failed to fetch coordinates:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Calculate center point of all coordinates
    const getCenterCoords = () => {
        if (coordinates.length === 0) return { lat: 0, lng: 0 };

        const avgLat = coordinates.reduce((sum, loc) => sum + loc.lat, 0) / coordinates.length;
        const avgLng = coordinates.reduce((sum, loc) => sum + loc.lng, 0) / coordinates.length;

        return { lat: avgLat, lng: avgLng };
    };

    const center = getCenterCoords();
    const markers = coordinates.map(loc => `markers=color:red%7Clabel:${encodeURIComponent(loc.name.charAt(0))}%7C${loc.lat},${loc.lng}`).join('&');

    // Static Maps API URL (no API key exposure issue with proper backend setup)
    const mapUrl = coordinates.length > 0
        ? `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=13&size=800x600&${markers}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_KEY'}`
        : null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto shadow-2xl">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold">{dayTitle}</h2>
                            <p className="text-blue-100 text-sm mt-1">{destination}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white/80 hover:text-white transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-96">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            <span className="ml-3 text-gray-600">Loading map...</span>
                        </div>
                    ) : coordinates.length > 0 ? (
                        <div>
                            <img
                                src={mapUrl}
                                alt="Location map"
                                className="w-full rounded-lg shadow-lg"
                            />

                            <div className="mt-6 space-y-2">
                                <h3 className="font-semibold text-gray-900 flex items-center">
                                    <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                                    Locations on this map:
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {coordinates.map((loc, idx) => (
                                        <div key={idx} className="bg-gray-50 rounded-lg p-3">
                                            <div className="font-medium text-gray-900">{loc.name}</div>
                                            <div className="text-sm text-gray-600">{loc.formatted_address}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p>No locations found for this day</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// Add this new component before PlanningMode
const DayEditor = ({ day, tripId, destination, onSave, onCancel, token }) => {
    const [activities, setActivities] = useState([...day.activities]);
    const [newActivity, setNewActivity] = useState('');
    const [saving, setSaving] = useState(false);

    const addActivity = () => {
        if (newActivity.trim()) {
            setActivities([...activities, newActivity.trim()]);
            setNewActivity('');
        }
    };

    const removeActivity = (index) => {
        setActivities(activities.filter((_, i) => i !== index));
    };

    const updateActivity = (index, value) => {
        const updated = [...activities];
        updated[index] = value;
        setActivities(updated);
    };

    const moveActivity = (index, direction) => {
        if (
            (direction === 'up' && index === 0) ||
            (direction === 'down' && index === activities.length - 1)
        ) {
            return;
        }

        const updated = [...activities];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
        setActivities(updated);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`${API_BASE_URL}/trips/${tripId}/days/${day.number}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    activities: activities,
                    title: day.title
                })
            });

            const data = await response.json();

            if (data.success) {
                onSave({ ...day, activities });
            } else {
                alert('Failed to save changes');
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold">Edit Day {day.number}</h2>
                            <p className="text-blue-100 text-sm mt-1">{day.title} - {destination}</p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="text-white/80 hover:text-white transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    {/* Current Activities */}
                    <div className="space-y-3 mb-6">
                        <h3 className="font-semibold text-gray-900 mb-3">Activities</h3>
                        {activities.map((activity, index) => (
                            <div key={index} className="flex items-start space-x-2 bg-gray-50 p-3 rounded-lg group">
                                <div className="flex flex-col space-y-1">
                                    <button
                                        onClick={() => moveActivity(index, 'up')}
                                        disabled={index === 0}
                                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                        title="Move up"
                                    >
                                        ▲
                                    </button>
                                    <button
                                        onClick={() => moveActivity(index, 'down')}
                                        disabled={index === activities.length - 1}
                                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                        title="Move down"
                                    >
                                        ▼
                                    </button>
                                </div>
                                <textarea
                                    value={activity}
                                    onChange={(e) => updateActivity(index, e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                                    rows={2}
                                />
                                <button
                                    onClick={() => removeActivity(index)}
                                    className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove activity"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add New Activity */}
                    <div className="border-t pt-4">
                        <h4 className="font-semibold text-gray-900 mb-3">Add New Activity</h4>
                        <div className="flex space-x-2">
                            <textarea
                                value={newActivity}
                                onChange={(e) => setNewActivity(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                        addActivity();
                                    }
                                }}
                                placeholder="Enter new activity (Ctrl+Enter to add)"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={2}
                            />
                            <button
                                onClick={addActivity}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t p-4 flex justify-end space-x-3 bg-gray-50">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                        {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                        <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
// ===================================
// ENHANCED PLANNING MODE COMPONENT
// ===================================

const PlanningMode = ({ user, token, trips, setTrips, setCurrentTrip, sendChatMessage, setChatOpen, location, view, setView,
                          selectedTrip,
                          setSelectedTrip,
                          selectedTripId,
                          setSelectedTripId,
                      }) => {
    console.log('PlanningMode setChatOpen:', typeof setChatOpen);
    //const [view, setView] = useState('create'); // 'create', 'trips', 'itinerary', 'flights', 'hotels', 'activities'
    //const [selectedTrip, setSelectedTrip] = useState(null);
    //const [selectedTripId, setSelectedTripId] = useState(null);
    const [mapModalOpen, setMapModalOpen] = useState(false);
    const [selectedDayForMap, setSelectedDayForMap] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [editingDay, setEditingDay] = useState(null);
    const [formData, setFormData] = useState({
        destination: '',
        duration: '',
        budget: '',
        startDate: '',
        endDate: '',
        travelStyle: user?.travelStyle || 'moderate',
        interests: []
    });
    const [loading, setLoading] = useState(false);
    const [savedFlights, setSavedFlights] = useState([]);
    const [loadingFlights, setLoadingFlights] = useState(false);
    const activeTrip = trips.find(t => t.status === 'active');

    const interestOptions = [
        'Adventure', 'Culture', 'Food', 'History', 'Nature', 'Nightlife',
        'Photography', 'Relaxation', 'Shopping', 'Sports'
    ];

    const handleTripUpdate = (updatedTrip) => {
        setTrips(prev => prev.map(trip =>
            trip.id === updatedTrip.id ? updatedTrip : trip
        ));
        if (selectedTrip?.id === updatedTrip.id) {
            setSelectedTrip(updatedTrip);
        }
    };
    const handleDaySave = (updatedDay) => {
        // Update the trip's itinerary
        const updatedItinerary = selectedTrip.itinerary?.itinerary || selectedTrip.itinerary;
        // This would need to reconstruct the itinerary text with the updated day
        // For now, we'll just refresh the trip
        setEditingDay(null);
        // Reload trip data
        loadTrips();
    };

    // Schedule trip by setting start and end dates
    // Status is automatically calculated based on dates
    const handleTripSchedule = async (tripId, startDate, endDate) => {
        try {
            const response = await fetch(`${API_BASE_URL}/trips/${tripId}/schedule`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ startDate, endDate })
            });

            if (!response.ok) {
                const errorData = await response.json();
                return { success: false, error: errorData.error || 'Failed to schedule trip' };
            }

            const data = await response.json();

            if (data.success) {
                // Reload trips to get updated auto-calculated status
                await loadTrips();

                // Update selected trip if it's the one we just scheduled
                if (selectedTrip?.id === tripId) {
                    setSelectedTrip(data.data);
                }

                return { success: true, trip: data.data };
            }

            return { success: false, error: 'Unknown error' };
        } catch (error) {
            console.error('Schedule trip error:', error);
            return { success: false, error: error.message };
        }
    };
    const handleCreateTrip = async (e) => {
        e.preventDefault();
        if (!formData.destination || !formData.duration) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/ai/generate-itinerary`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                const newTrip = {
                    ...data.data.tripData,
                    itinerary: data.data.itinerary
                };

                setTrips(prev => [newTrip, ...prev]);
                setCurrentTrip(newTrip);
                setSelectedTrip(newTrip);
                setSelectedTripId(newTrip.id);
                setView('itinerary');
                setIsCreating(false);

                sendChatMessage(`I just created a new itinerary for ${formData.destination}! Can you give me some additional tips?`);
                setChatOpen(true);
            }
        } catch (error) {
            console.error('Trip creation error:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleInterest = (interest) => {
        setFormData(prev => ({
            ...prev,
            interests: prev.interests.includes(interest)
                ? prev.interests.filter(i => i !== interest)
                : [...prev.interests, interest]
        }));
    };

    const loadSavedFlights = async (tripId) => {
        if (!tripId) return;

        setLoadingFlights(true);
        try {
            const response = await fetch(`${API_BASE_URL}/trips/${tripId}/flights`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.success) {
                setSavedFlights(data.data);
            }
        } catch (error) {
            console.error('Load flights error:', error);
        } finally {
            setLoadingFlights(false);
        }
    };

    useEffect(() => {
        const activeTrip = trips.find(t => t.status === 'active');
        if (activeTrip) {
            setSelectedTrip(activeTrip);
            setSelectedTripId(activeTrip.id);
            setView('itinerary');
            loadSavedFlights(activeTrip.id);
        } else {
            setView('create');
            setIsCreating(true);
            setSelectedTrip(null);
            setSelectedTripId(null);
        }
    }, []);

    useEffect(() => {
        if (view === 'itinerary' && selectedTrip?.id) {
            loadSavedFlights(selectedTrip.id);
        }
    }, [view, selectedTrip?.id]);

    const openAirlineBooking = (flight) => {
        const bookingUrls = {
            'AA': `https://www.aa.com/booking/search`,
            'UA': `https://www.united.com/en/us`,
            'DL': `https://www.delta.com`,
            'CM': `https://www.copaair.com/en/web/us`,
            'BA': `https://www.britishairways.com`,
            'LH': `https://www.lufthansa.com`,
            'AF': `https://www.airfrance.com`,
            'KL': `https://www.klm.com`
        };

        const url = bookingUrls[flight.airline] || `https://www.google.com/travel/flights?q=flights+from+${flight.origin}+to+${flight.destination}+on+${flight.departure_date}`;
        window.open(url, '_blank');
    };

    const removeFlightFromTrip = async (flightId) => {
        if (!confirm('Remove this flight from your trip?')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/trips/${selectedTrip.id}/flights/${flightId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                setSavedFlights(prev => prev.filter(f => f.id !== flightId));
            }
        } catch (error) {
            console.error('Remove flight error:', error);
        }
    };

    const formatFlightTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatFlightDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const parseItinerary = (itineraryText) => {
        if (!itineraryText) return [];

        const days = [];
        const lines = itineraryText.split('\n');
        let currentDay = null;

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // Check if this is a day header
            const dayMatch = line.match(/\*?\*?\s*Day\s+(\d+)[:\-\s]*(.*?)\*?\*?/i);
            if (dayMatch) {
                if (currentDay) {
                    days.push(currentDay);
                }
                currentDay = {
                    number: parseInt(dayMatch[1]),
                    title: dayMatch[2].replace(/\*/g, '').trim() || 'Exploration Day',
                    activities: [],
                    totalCost: 0
                };
                return;
            }

            // Extract costs
            const costMatch = line.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
            if (costMatch && currentDay) {
                currentDay.totalCost += parseFloat(costMatch[1].replace(/,/g, ''));
            }

            // Add activities - be less strict
            if (currentDay && line.length > 3) {
                const cleanLine = line
                    .replace(/^\*+\s*/, '')
                    .replace(/\*+$/, '')
                    .replace(/\*\*(.*?)\*\*/g, '$1')
                    .replace(/^[-•]\s*/, '')
                    .replace(/^\d+\.\s*/, '')
                    .trim();

                if (cleanLine) {
                    currentDay.activities.push(cleanLine);
                }
            }
        });
        if (currentDay) {
            days.push(currentDay);
        }


        // Remove duplicate days (same day number)
        const uniqueDays = [];
        const seenDayNumbers = new Set();

        days.forEach(day => {
            if (!seenDayNumbers.has(day.number)) {
                seenDayNumbers.add(day.number);
                uniqueDays.push(day);
            }
        });

        // Fallback if no structured days found
        if (uniqueDays.length === 0 && itineraryText.length > 0) {
            const activities = lines
                .filter(line => line.trim().length > 10)
                .filter(line => !line.match(/^(Day \d+|Morning Activity|Afternoon Activity|Evening Activity|Lunch|Dinner|Breakfast):?\s*$/i))
                .map(line => line
                    .replace(/^\*+\s*/, '')
                    .replace(/\*+$/, '')
                    .replace(/\*\*(.*?)\*\*/g, '$1')
                    .trim()
                )
                .filter(line => line && line.length > 10);

            uniqueDays.push({
                number: 1,
                title: 'Full Itinerary',
                activities: activities,
                totalCost: 0
            });
        }

        return uniqueDays;
    };
    // Add a function to format activities for display
    const formatActivityText = (text) => {
        // Check if it's a section header (Morning Activity, Lunch, etc.)
        const sectionMatch = text.match(/^(Morning Activity|Afternoon Activity|Evening Activity|Lunch|Dinner|Breakfast)(\s*\(.*?\))?:/i);

        if (sectionMatch) {
            return {
                type: 'header',
                text: sectionMatch[1],
                time: sectionMatch[2] ? sectionMatch[2].replace(/[()]/g, '').trim() : null
            };
        }

        // Check if it's an activity detail (Activity:, Venue:, etc.)
        const detailMatch = text.match(/^(Activity|Venue|Address|Cost|Price Range|Note|Duration):\s*(.+)/i);

        if (detailMatch) {
            return {
                type: 'detail',
                label: detailMatch[1],
                value: detailMatch[2].trim()
            };
        }

        // Regular text
        return {
            type: 'text',
            text: text
        };
    };

    const getDayDate = (startDate, dayNumber) => {
        if (!startDate) return null;
        const date = new Date(startDate);
        date.setDate(date.getDate() + (dayNumber - 1));
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    const extractLocations = (activities) => {
        const locations = activities
            .map(activity => {
                const cleaned = activity
                    .replace(/^(Visit|Explore|See|Discover|Tour|Walk through|Experience)\s+/i, '')
                    .replace(/\s*\(.*?\)/g, '')
                    .replace(/\s*-.*$/g, '')
                    .replace(/\$\d+(\.\d{2})?/g, '')
                    .trim();

                const firstPart = cleaned.split(/[,.]|and |or /i)[0].trim();

                if (firstPart.length > 0 && firstPart.length < 50) {
                    return firstPart;
                }
                return null;
            })
            .filter(Boolean)
            .slice(0, 5);

        return locations.length > 0 ? locations : [selectedTrip?.destination || 'Location'];
    };

    const openMapForDay = (day) => {
        const locations = extractLocations(day.activities);
        setSelectedDayForMap({ ...day, locations });
        setMapModalOpen(true);
    };

    // ITINERARY VIEW
    if (view === 'itinerary' && (selectedTrip || selectedTripId)) {
        const tripToShow = selectedTrip || trips.find(t => t.id === selectedTripId);

        if (!tripToShow) {
            setView('create');
            return nul;
        }
        const days = parseItinerary(tripToShow.itinerary?.itinerary || tripToShow.itinerary);

        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <button
                    onClick={() => {
                        setView('create');
                        setSelectedTrip(null);
                        setSelectedTripId(null);
                    }}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-4"
                >
                    <span>←</span>
                    <span>Back to Trip Planning</span>
                </button>

                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-2">
                            {tripToShow.title || `${tripToShow.destination} Trip`}
                        </h2>
                        <div className="flex items-center space-x-4 text-gray-600">
                            <span className="flex items-center space-x-1">
                                <MapPin className="w-4 h-4" />
                                <span>{tripToShow.destination}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4" />
                                <span>{tripToShow.duration} days</span>
                            </span>
                            {tripToShow.budget && (
                                <span className="flex items-center space-x-1">
                                    <span>💰</span>
                                    <span>${tripToShow.budget} budget</span>
                                </span>
                            )}
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                tripToShow.status === 'active' ? 'bg-green-100 text-green-700' :
                                tripToShow.status === 'upcoming' ? 'bg-blue-100 text-blue-700' :
                                tripToShow.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                                'bg-purple-100 text-purple-700'
                            }`}>
                                {tripToShow.status ? tripToShow.status.toUpperCase() : 'PLANNING'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => setView('trips')}
                        className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        View All Trips
                    </button>
                </div>

                {/* Day Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {days.map((day) => {
                        const dayDate = getDayDate(tripToShow.startDate, day.number);

                        return (
                            <div key={day.number} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                                <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center space-x-2 mb-1">
                                                <span className="text-2xl font-bold">Day {day.number}</span>
                                                {dayDate && (
                                                    <span className="text-blue-100 text-sm">• {dayDate}</span>
                                                )}
                                            </div>
                                            <h3 className="text-lg font-semibold">{day.title}</h3>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openMapForDay(day);
                                                }}
                                                className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors flex flex-col items-center"
                                                title="View on map"
                                            >
                                                <MapPin className="w-5 h-5" />
                                                <span className="text-xs mt-1">Map</span>
                                            </button>
                                            {day.totalCost > 0 && (
                                                <div className="text-right">
                                                    <div className="text-xs text-blue-100">Estimated</div>
                                                    <div className="text-2xl font-bold">${day.totalCost.toFixed(0)}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <div className="space-y-4">
                                        {day.activities.map((activity, idx) => {
                                            const formatted = formatActivityText(activity);

                                            if (formatted.type === 'header') {
                                                return (
                                                    <div key={idx} className="mt-4 first:mt-0">
                                                        <h4 className="font-bold text-gray-900 text-base flex items-center">
                                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded mr-2 text-sm">
                                                                {formatted.text}
                                                            </span>
                                                            {formatted.time && (
                                                                <span className="text-sm text-gray-600 font-normal">
                                                                    {formatted.time}
                                                                </span>
                                                            )}
                                                        </h4>
                                                    </div>
                                                );
                                            }

                                            if (formatted.type === 'detail') {
                                                return (
                                                    <div key={idx} className="ml-4 flex items-start space-x-2">
                                                        <span className="font-semibold text-gray-700 text-sm min-w-[80px]">
                                                            {formatted.label}:
                                                        </span>
                                                        <span className="text-gray-600 text-sm flex-1">
                                                            {formatted.value}
                                                        </span>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={idx} className="flex items-start space-x-3 text-gray-700 ml-2">
                                                    <span className="text-blue-500 mt-1">•</span>
                                                    <span className="flex-1 leading-relaxed text-sm">{formatted.text}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex items-center justify-between">
                                    <button
                                        onClick={() => {
                                            sendChatMessage(`Tell me more details about Day ${day.number}: ${day.title} in ${selectedTrip.destination}`);
                                            setChatOpen(true);
                                        }}
                                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        <span>Ask AI for more details</span>
                                    </button>
                                    <button
                                        onClick={() => setEditingDay(day)}
                                        className="text-sm text-purple-600 hover:text-purple-700 flex items-center space-x-1"
                                    >
                                        <span>Edit Day</span>
                                        <span>✏️</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Saved Flights Section */}
                {savedFlights.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-2xl font-bold text-gray-900 flex items-center">
                                <Plane className="w-6 h-6 mr-2 text-blue-600" />
                                Your Selected Flights
                            </h3>
                            <span className="text-sm text-gray-600">
                                {savedFlights.length} flight{savedFlights.length !== 1 ? 's' : ''} saved
                            </span>
                        </div>

                        <div className="space-y-4">
                            {savedFlights.map((flight) => {
                                const itinerary = flight.itinerary_data;
                                const outbound = itinerary?.[0];
                                const returnFlight = itinerary?.[1];

                                return (
                                    <div key={flight.id} className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full font-medium">
                                                    {flight.airline_name || flight.airline}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900">
                                                        {flight.origin} → {flight.destination}
                                                    </div>
                                                    <div className="text-sm text-gray-600">
                                                        {flight.passengers} passenger{flight.passengers > 1 ? 's' : ''} • {flight.travel_class}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-bold text-blue-600">
                                                    ${parseFloat(flight.price).toFixed(2)}
                                                </div>
                                                <div className="text-sm text-gray-500">{flight.currency}</div>
                                            </div>
                                        </div>

                                        {/* Outbound Flight */}
                                        {outbound && outbound.segments && (
                                            <div className="mb-4">
                                                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                                    <Plane className="w-4 h-4 mr-1 text-blue-600" />
                                                    Outbound - {formatFlightDate(flight.departure_date)}
                                                </div>
                                                <div className="bg-gray-50 rounded-lg p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-center">
                                                            <div className="text-2xl font-bold text-gray-900">
                                                                {formatFlightTime(outbound.segments[0]?.departure?.at)}
                                                            </div>
                                                            <div className="text-sm text-gray-600">
                                                                {outbound.segments[0]?.departure?.iataCode}
                                                            </div>
                                                        </div>

                                                        <div className="flex-1 px-4">
                                                            <div className="flex items-center justify-center">
                                                                <div className="flex-1 border-t-2 border-gray-300"></div>
                                                                <Plane className="w-5 h-5 text-blue-600 mx-2" />
                                                                f                <div className="flex-1 border-t-2 border-gray-300"></div>
                                                            </div>
                                                            <div className="text-center text-xs text-gray-500 mt-1">
                                                                {outbound.segments.length === 1 ? 'Direct' : `${outbound.segments.length - 1} stop(s)`}
                                                            </div>
                                                        </div>

                                                        <div className="text-center">
                                                            <div className="text-2xl font-bold text-gray-900">
                                                                {formatFlightTime(outbound.segments[outbound.segments.length - 1]?.arrival?.at)}
                                                            </div>
                                                            <div className="text-sm text-gray-600">
                                                                {outbound.segments[outbound.segments.length - 1]?.arrival?.iataCode}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Return Flight */}
                                        {returnFlight && returnFlight.segments && (
                                            <div className="mb-4">
                                                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                                    <Plane className="w-4 h-4 mr-1 text-purple-600 transform rotate-180" />
                                                    Return - {formatFlightDate(flight.return_date)}
                                                </div>
                                                <div className="bg-purple-50 rounded-lg p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-center">
                                                            <div className="text-2xl font-bold text-gray-900">
                                                                {formatFlightTime(returnFlight.segments[0]?.departure?.at)}
                                                            </div>
                                                            <div className="text-sm text-gray-600">
                                                                {returnFlight.segments[0]?.departure?.iataCode}
                                                            </div>
                                                        </div>

                                                        <div className="flex-1 px-4">
                                                            <div className="flex items-center justify-center">
                                                                <div className="flex-1 border-t-2 border-purple-300"></div>
                                                                <Plane className="w-5 h-5 text-purple-600 mx-2 transform rotate-180" />
                                                                <div className="flex-1 border-t-2 border-purple-300"></div>
                                                            </div>
                                                            <div className="text-center text-xs text-gray-500 mt-1">
                                                                {returnFlight.segments.length === 1 ? 'Direct' : `${returnFlight.segments.length - 1} stop(s)`}
                                                            </div>
                                                        </div>

                                                        <div className="text-center">
                                                            <div className="text-2xl font-bold text-gray-900">
                                                                {formatFlightTime(returnFlight.segments[returnFlight.segments.length - 1]?.arrival?.at)}
                                                            </div>
                                                            <div className="text-sm text-gray-600">
                                                                {returnFlight.segments[returnFlight.segments.length - 1]?.arrival?.iataCode}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex space-x-3 pt-4 border-t">
                                            <button
                                                onClick={() => openAirlineBooking(flight)}
                                                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 font-medium"
                                            >
                                                <Plane className="w-5 h-5" />
                                                <span>Book with {flight.airline_name || 'Airline'}</span>
                                            </button>
                                            <button
                                                onClick={() => removeFlightFromTrip(flight.id)}
                                                className="px-4 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                            >
                                                Remove
                                            </button>
                                        </div>

                                        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <p className="text-sm text-blue-800">
                                                💡 <strong>Tip:</strong> Clicking "Book with {flight.airline_name || 'Airline'}" will open the airline's website.
                                                Have your dates ({formatFlightDate(flight.departure_date)}{flight.return_date && ` - ${formatFlightDate(flight.return_date)}`})
                                                and passenger info ready.
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {loadingFlights && (
                    <div className="mb-8 bg-white rounded-xl shadow-lg p-12 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading saved flights...</p>
                    </div>
                )}

                {/* Trip Summary */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-lg p-6 mb-8">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">Trip Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <div className="text-sm text-gray-600 mb-1">Total Duration</div>
                            <div className="text-2xl font-bold text-gray-900">{tripToShow.duration} days</div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600 mb-1">Estimated Total Cost</div>
                            <div className="text-2xl font-bold text-gray-900">
                                ${days.reduce((sum, day) => sum + day.totalCost, 0).toFixed(0)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600 mb-1">Budget Remaining</div>
                            <div className="text-2xl font-bold text-green-600">
                                ${Math.max(0, (tripToShow.budget || 0) - days.reduce((sum, day) => sum + day.totalCost, 0)).toFixed(0)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">Complete Your Trip Booking</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={() => setView('flights')}
                            className="flex flex-col items-center justify-center space-y-2 bg-blue-600 text-white px-6 py-6 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plane className="w-8 h-8" />
                            <span className="font-medium text-lg">Search Flights</span>
                            <span className="text-xs text-blue-100">Compare prices & book</span>
                        </button>
                        <button
                            onClick={() => setView('hotels')}
                            className="flex flex-col items-center justify-center space-y-2 bg-green-600 text-white px-6 py-6 rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Star className="w-8 h-8" />
                            <span className="font-medium text-lg">Search Hotels</span>
                            <span className="text-xs text-green-100">Find perfect accommodations</span>
                        </button>
                        <button
                            onClick={() => setView('activities')}
                            className="flex flex-col items-center justify-center space-y-2 bg-orange-600 text-white px-6 py-6 rounded-lg hover:bg-orange-700 transition-colors"
                        >
                            <MapPin className="w-8 h-8" />
                            <span className="font-medium text-lg">Find Activities</span>
                            <span className="text-xs text-orange-100">Tours, dining & experiences</span>
                        </button>
                    </div>
                </div>

                <MapModal
                    isOpen={mapModalOpen}
                    onClose={() => setMapModalOpen(false)}
                    dayTitle={selectedDayForMap ? `Day ${selectedDayForMap.number}: ${selectedDayForMap.title}` : ''}
                    locations={selectedDayForMap?.locations || []}
                    destination={tripToShow?.destination || ''}
                    token={token}
                />
                {editingDay && (
                    <DayEditor
                        day={editingDay}
                        tripId={tripToShow.id}
                        destination={tripToShow.destination}
                        onSave={handleDaySave}
                        onCancel={() => setEditingDay(null)}
                        token={token}
                    />
                )}
            </div>
        );
    }

    // ACTIVITIES VIEW
    if (view === 'activities' && (selectedTrip || selectedTripId)) {
        const tripToShow = selectedTrip || trips.find(t => t.id === selectedTripId);

        if (!tripToShow) {
            setView('itinerary');
            return null;
        }
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <button
                    onClick={() => setView('itinerary')}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-6"
                >
                    <span>←</span>
                    <span>Back to Itinerary</span>
                </button>
                <ActivitiesSearch trip={tripToShow} token={token} location={location} sendChatMessage={sendChatMessage} />
            </div>
        );
    }

    // FLIGHTS VIEW
    if (view === 'flights' && (selectedTrip || selectedTripId)) {
        const tripToShow = selectedTrip || trips.find(t => t.id === selectedTripId);
        if (!tripToShow) {
            setView('itinerary');
            return null;
        }
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <button
                    onClick={() => {
                        setView('itinerary');
                        loadSavedFlights(tripToShow.id);
                    }}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-6"
                >
                    <span>←</span>
                    <span>Back to Itinerary</span>
                </button>
                <FlightSearch
                    trip={tripToShow}
                    token={token}
                    onFlightSelected={(flight) => {
                        loadSavedFlights(tripToShow.id);
                        setView('itinerary');
                    }}
                />
            </div>
        );
    }

    // HOTELS VIEW
    if (view === 'hotels' && (selectedTrip || selectedTripId)) {
        const tripToShow = selectedTrip || trips.find(t => t.id === selectedTripId);

        if (!tripToShow) {
            setView('itinerary');
            return null;
        }
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <button
                    onClick={() => setView('itinerary')}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-6"
                >
                    <span>←</span>
                    <span>Back to Itinerary</span>
                </button>
                <HotelSearch trip={tripToShow} token={token} />
            </div>
        );
    }

    // TRIPS LIST VIEW - Organized by Status
    if (view === 'trips') {
        // Organize trips by status
        const activeTrips = trips.filter(t => t.status === 'active');
        const upcomingTrips = trips.filter(t => t.status === 'upcoming');
        const planningTrips = trips.filter(t => t.status === 'planning');
        const completedTrips = trips.filter(t => t.status === 'completed');

        const TripCard = ({ trip }) => (
            <div
                key={trip.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                    setSelectedTripId(trip.id);
                    setSelectedTrip(trip);
                    setView('itinerary');
                }}
            >
                <div className={`h-32 flex items-center justify-center ${
                    trip.status === 'active' ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                    trip.status === 'upcoming' ? 'bg-gradient-to-r from-blue-500 to-indigo-600' :
                    trip.status === 'completed' ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                    'bg-gradient-to-r from-purple-500 to-pink-600'
                }`}>
                    <Plane className="w-16 h-16 text-white opacity-20" />
                </div>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-lg text-gray-900">
                            {trip.title || `${trip.destination} Trip`}
                        </h3>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            trip.status === 'active' ? 'bg-green-100 text-green-700' :
                            trip.status === 'upcoming' ? 'bg-blue-100 text-blue-700' :
                            trip.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                            'bg-purple-100 text-purple-700'
                        }`}>
                            {trip.status.toUpperCase()}
                        </span>
                    </div>
                    <p className="text-gray-600 text-sm mb-3">{trip.destination}</p>

                    {(trip.start_date || trip.startDate) && (
                        <p className="text-xs text-gray-500 mb-3">
                            {new Date(trip.start_date || trip.startDate).toLocaleDateString()} -
                            {new Date(trip.end_date || trip.endDate).toLocaleDateString()}
                        </p>
                    )}

                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                        <span className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {trip.duration} days
                        </span>
                        {trip.budget && (
                            <span className="flex items-center">
                                <DollarSign className="w-4 h-4 mr-1" />
                                {trip.budget}
                            </span>
                        )}
                    </div>

                    {(trip.bookingCount > 0 || trip.totalSpent > 0) && (
                        <div className="border-t pt-3 mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-600">
                                <span>{trip.bookingCount || 0} bookings</span>
                                <span className="font-semibold">${trip.totalSpent || 0} spent</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );

        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="mb-8">
                    <button
                        onClick={() => setView('create')}
                        className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-4"
                    >
                        <span>←</span>
                        <span>Back to Create New Trip</span>
                    </button>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Your Trips</h2>
                    <p className="text-gray-600">View and manage your trips organized by status</p>
                </div>

                {trips.length > 0 ? (
                    <div className="space-y-8">
                        {/* Active Trips */}
                        {activeTrips.length > 0 && (
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                    <div className="w-2 h-8 bg-green-500 rounded mr-3"></div>
                                    Active Trips ({activeTrips.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {activeTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
                                </div>
                            </div>
                        )}

                        {/* Upcoming Trips */}
                        {upcomingTrips.length > 0 && (
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                    <div className="w-2 h-8 bg-blue-500 rounded mr-3"></div>
                                    Upcoming Trips ({upcomingTrips.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {upcomingTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
                                </div>
                            </div>
                        )}

                        {/* Planning Trips */}
                        {planningTrips.length > 0 && (
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                    <div className="w-2 h-8 bg-purple-500 rounded mr-3"></div>
                                    Planning ({planningTrips.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {planningTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
                                </div>
                            </div>
                        )}

                        {/* Completed Trips */}
                        {completedTrips.length > 0 && (
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                    <div className="w-2 h-8 bg-gray-400 rounded mr-3"></div>
                                    Completed Trips ({completedTrips.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {completedTrips.map(trip => <TripCard key={trip.id} trip={trip} />)}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-white rounded-xl shadow-lg">
                        <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No trips yet</h3>
                        <p className="text-gray-500 mb-4">Create your first trip to get started!</p>
                        <button
                            onClick={() => setView('create')}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                        >
                            Create Your First Trip
                        </button>
                    </div>
                )}
            </div>
        );
    }

    //TRIP MANAGER VIEW (when selectedTripId is set but view is still 'create')
    if (selectedTripId && view === 'manage') {
        const tripToShow = trips.find(t => t.id === selectedTripId);

        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <button
                    onClick={() => {
                        setSelectedTripId(null);
                        setSelectedTrip(null);
                        setView('create');
                    }}
                    className="mb-4 text-blue-600 hover:text-blue-700 flex items-center"
                >
                    ← Back to Create New Trip
                </button>

                <TripManager
                    trip={tripToShow}
                    onUpdate={handleTripUpdate}
                    onSchedule={handleTripSchedule}
                    token={token}
                    sendChatMessage={sendChatMessage}
                    setChatOpen={setChatOpen}
                />
            </div>
        );
    }

    // DEFAULT: CREATE NEW TRIP VIEW
    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-2">Plan Your Next Adventure</h2>
                        <p className="text-gray-600">Create a personalized AI-powered itinerary</p>
                    </div>
                    <div className="flex items-center space-x-3">
                        {/* Active Trip Shortcut */}
                        {activeTrip && (
                            <button
                                onClick={() => {
                                    setSelectedTrip(activeTrip);
                                    setSelectedTripId(activeTrip.id);
                                    setView('manage');
                                }}
                                className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition-colors flex items-center space-x-2 shadow-lg"
                            >
                                <Check className="w-5 h-5" />
                                <div className="text-left">
                                    <div className="text-xs opacity-90">Active Trip</div>
                                    <div className="font-semibold">{activeTrip.destination}</div>
                                </div>
                            </button>
                        )}
                        {trips.length > 0 && (
                            <button
                                onClick={() => setView('trips')}
                                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
                            >
                                <Calendar className="w-4 h-4" />
                                <span>View All Trips ({trips.length})</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {/* Active Trip Card - Show prominently if exists */}
            {activeTrip && (
                <div className="mb-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-xl p-6 text-white shadow-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <Check className="w-6 h-6" />
                                <h3 className="text-2xl font-bold">Your Active Trip</h3>
                            </div>
                            <p className="text-xl mb-1">{activeTrip.title || `${activeTrip.destination} Trip`}</p>
                            <div className="flex items-center space-x-4 text-green-100">
                                <span>{activeTrip.duration} days</span>
                                <span>•</span>
                                <span>{activeTrip.destination}</span>
                                {activeTrip.startDate && (
                                    <>
                                        <span>•</span>
                                        <span>Starts {new Date(activeTrip.startDate).toLocaleDateString()}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedTrip(activeTrip);
                                setSelectedTripId(activeTrip.id);
                                setView('manage');
                            }}
                            className="bg-white text-green-600 px-6 py-3 rounded-lg hover:bg-green-50 transition-colors font-semibold"
                        >
                            Manage Trip →
                        </button>
                    </div>
                </div>
            )}


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Trip Creation Form */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold text-gray-900">Plan New Trip</h3>
                            <button
                                onClick={() => setIsCreating(!isCreating)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                {isCreating ? 'Cancel' : 'New Trip'}
                            </button>
                        </div>

                        {isCreating && (
                            <form onSubmit={handleCreateTrip} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Destination *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            value={formData.destination}
                                            onChange={(e) => setFormData(prev => ({ ...prev, destination: e.target.value }))}
                                            placeholder="e.g., Tokyo, Japan"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Duration (days) *
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            max="365"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            value={formData.duration}
                                            onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                                            placeholder="7"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Budget ($)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            value={formData.budget}
                                            onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                                            placeholder="2000"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Travel Style
                                        </label>
                                        <select
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            value={formData.travelStyle}
                                            onChange={(e) => setFormData(prev => ({ ...prev, travelStyle: e.target.value }))}
                                        >
                                            <option value="budget">Budget</option>
                                            <option value="moderate">Moderate</option>
                                            <option value="luxury">Luxury</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Start Date
                                        </label>
                                        <input
                                            type="date"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            value={formData.startDate}
                                            onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            End Date
                                        </label>
                                        <input
                                            type="date"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            value={formData.endDate}
                                            onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">
                                        Interests
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {interestOptions.map(interest => (
                                            <button
                                                key={interest}
                                                type="button"
                                                onClick={() => toggleInterest(interest)}
                                                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                                                    formData.interests.includes(interest)
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                            >
                                                {interest}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !formData.destination || !formData.duration}
                                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                            Generating AI Itinerary...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-5 h-5 mr-2" />
                                            Generate AI Itinerary
                                        </>
                                    )}
                                </button>
                            </form>
                        )}

                        {!isCreating && trips.length > 0 && (
                            <div className="space-y-4">
                                <h4 className="text-lg font-semibold text-gray-900">Your Recent Trips</h4>
                                {trips.slice(0, 3).map(trip => (
                                    <div
                                        key={trip.id}
                                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                                        onClick={() => {
                                            setSelectedTrip(trip);
                                            setView('itinerary');
                                        }}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center space-x-2 mb-1">
                                                    <h5 className="font-semibold text-gray-900">{trip.title}</h5>
                                                    {trip.status === 'active' && (
                                                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                                                            ACTIVE
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-gray-600 text-sm">{trip.destination}</p>
                                                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                                    <span>{trip.duration} days</span>
                                                    {trip.budget && <span>${trip.budget}</span>}
                                                    <span className={`px-2 py-1 rounded-full ${
                                                        trip.status === 'active' ? 'bg-green-100 text-green-700' :
                                                            trip.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {trip.status}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTrip(trip);
                                                    setView('itinerary');
                                                }}
                                                className="text-blue-600 hover:text-blue-700 text-sm"
                                            >
                                                View Details →
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {trips.length > 3 && (
                                    <button
                                        onClick={() => setView('trips')}
                                        className="w-full text-center text-blue-600 hover:text-blue-700 text-sm py-2"
                                    >
                                        View all {trips.length} trips →
                                    </button>
                                )}
                            </div>
                        )}

                        {!isCreating && trips.length === 0 && (
                            <div className="text-center py-12">
                                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No trips yet</h3>
                                <p className="text-gray-500 mb-4">Start planning your first adventure!</p>
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                                >
                                    Create First Trip
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Features</h3>
                        <div className="space-y-3">
                            <div className="flex items-start space-x-3">
                                <div className="bg-blue-100 p-2 rounded-lg">
                                    <Zap className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900 text-sm">Smart Itineraries</h4>
                                    <p className="text-xs text-gray-600">AI creates personalized day-by-day plans</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <div className="bg-green-100 p-2 rounded-lg">
                                    <Plane className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900 text-sm">Flight Search</h4>
                                    <p className="text-xs text-gray-600">Find and compare flights instantly</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <div className="bg-purple-100 p-2 rounded-lg">
                                    <Star className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900 text-sm">Hotel Booking</h4>
                                    <p className="text-xs text-gray-600">Browse accommodations that fit your style</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Travel Tips</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-start space-x-2">
                                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5"></div>
                                <p className="text-gray-700">Book flights 6-8 weeks in advance for best prices</p>
                            </div>
                            <div className="flex items-start space-x-2">
                                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5"></div>
                                <p className="text-gray-700">Tuesday and Wednesday are cheapest days to fly</p>
                            </div>
                            <div className="flex items-start space-x-2">
                                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5"></div>
                                <p className="text-gray-700">Hotels are cheaper on weekdays than weekends</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
// ===================================
// COMPANION MODE COMPONENT
// ===================================

const CompanionMode = ({ user, token, location, weather, nearbyPlaces, currentTrip, sendChatMessage, setChatOpen }) => {

// Emergency contacts data
const emergencyContacts = {
    default: { general: '112', police: '112', ambulance: '112', fire: '112' },
    US: { general: '911', police: '911', ambulance: '911', fire: '911' },
    EU: { general: '112', police: '112', ambulance: '112', fire: '112' },
    UK: { general: '999', police: '999', ambulance: '999', fire: '999' },
    AU: { general: '000', police: '000', ambulance: '000', fire: '000' },
    JP: { general: '110', police: '110', ambulance: '119', fire: '119' },
    CN: { general: '110', police: '110', ambulance: '120', fire: '119' },
    IN: { general: '112', police: '100', ambulance: '102', fire: '101' }
};
    // State Management
    const [selectedPlaceType, setSelectedPlaceType] = useState('all');
    const [searchRadius, setSearchRadius] = useState(1000);
    const [loading, setLoading] = useState(false);
    const [places, setPlaces] = useState([]);
    const [showScheduleEdit, setShowScheduleEdit] = useState(false);
    const [todaySchedule, setTodaySchedule] = useState([]);
    const [upcomingBookings, setUpcomingBookings] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [activeTrip, setActiveTrip] = useState(null);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Photo ID states
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoIdentifying, setPhotoIdentifying] = useState(false);
    const [photoResult, setPhotoResult] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [cameraActive, setCameraActive] = useState(false);

    // Translation states
    const [showTranslateModal, setShowTranslateModal] = useState(false);
    const [translateText, setTranslateText] = useState('');
    const [targetLanguage, setTargetLanguage] = useState('es');
    const [translating, setTranslating] = useState(false);
    const [translationResult, setTranslationResult] = useState(null);

    // Emergency states
    const [showEmergencyModal, setShowEmergencyModal] = useState(false);
    const [localEmergency, setLocalEmergency] = useState(emergencyContacts.default);
    const [detectedCountry, setDetectedCountry] = useState('Unknown');

    // Navigation states
    const [showNavigationModal, setShowNavigationModal] = useState(false);
    const [navigationDestination, setNavigationDestination] = useState('');

    // Activity search states
    const [showActivitySearchModal, setShowActivitySearchModal] = useState(false);
    const [searchingActivities, setSearchingActivities] = useState(false);
    const [activities, setActivities] = useState([]);

    // Add Memory states
    const [showAddMemoryModal, setShowAddMemoryModal] = useState(false);
    const [memoryData, setMemoryData] = useState({
        title: '',
        description: '',
        memoryType: 'experience',
        rating: 5,
        memoryDate: new Date().toISOString().split('T')[0]
    });
    const [memoryPhotos, setMemoryPhotos] = useState([]);
    const [memoryPhotosPreviews, setMemoryPhotosPreviews] = useState([]);
    const [savingMemory, setSavingMemory] = useState(false);

    // Add Expense states
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
    const [expenseData, setExpenseData] = useState({
        title: '',
        description: '',
        amount: '',
        currency: 'USD',
        category: 'general',
        expenseDate: new Date().toISOString().split('T')[0]
    });
    const [receiptPhotos, setReceiptPhotos] = useState([]);
    const [receiptPhotosPreviews, setReceiptPhotosPreviews] = useState([]);
    const [savingExpense, setSavingExpense] = useState(false);

    // Place Details Modal states
    const [showPlaceDetailsModal, setShowPlaceDetailsModal] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [placeDetails, setPlaceDetails] = useState(null);
    const [loadingPlaceDetails, setLoadingPlaceDetails] = useState(false);

    // Load data on mount
    useEffect(() => {
        loadActiveTrip();
        loadNotifications();
        loadUpcomingBookings();
    }, [token]);

    useEffect(() => {
        if (activeTrip) {
            loadTodaySchedule();
        }
    }, [activeTrip]);

    useEffect(() => {
        if (location) {
            detectCountryAndSetEmergency(location);
        }
    }, [location]);

    // Detect country from coordinates and set emergency contacts
    const detectCountryAndSetEmergency = async (coords) => {
        try {
            // Use reverse geocoding to detect country
            const response = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lng}&localityLanguage=en`
            );

            if (!response.ok) throw new Error('Geocoding failed');

            const data = await response.json();
            const countryCode = data.countryCode;
            const countryName = data.countryName || 'Unknown';

            // Map country codes to emergency contact sets
            let emergencySet = emergencyContacts.default;

            if (countryCode === 'US') {
                emergencySet = emergencyContacts.US;
            } else if (countryCode === 'GB') {
                emergencySet = emergencyContacts.UK;
            } else if (countryCode === 'AU') {
                emergencySet = emergencyContacts.AU;
            } else if (countryCode === 'JP') {
                emergencySet = emergencyContacts.JP;
            } else if (countryCode === 'CN') {
                emergencySet = emergencyContacts.CN;
            } else if (countryCode === 'IN') {
                emergencySet = emergencyContacts.IN;
            } else if (['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'].includes(countryCode)) {
                // EU countries
                emergencySet = emergencyContacts.EU;
            }

            setLocalEmergency(emergencySet);
            setDetectedCountry(countryName);
            console.log(`Emergency contacts set for country: ${countryCode} (${countryName})`);
        } catch (error) {
            console.error('Error detecting country:', error);
            // Fallback to default emergency contacts
            setLocalEmergency(emergencyContacts.default);
            setDetectedCountry('Unknown');
        }
    };

    useEffect(() => {
        setPlaces(nearbyPlaces);
    }, [nearbyPlaces]);

    useEffect(() => {
        if (location) {
            searchNearbyPlaces();
        }
    }, [selectedPlaceType, searchRadius, location]);

    useEffect(() => {
        const timerId = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timerId);
    }, []);

    const formattedTime = currentTime.toLocaleTimeString();
    const formattedDate = currentTime.toLocaleDateString();

    // API Functions
    const loadActiveTrip = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/trips/active`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setActiveTrip(data.data || currentTrip);
            }
        } catch (error) {
            console.error('Load active trip error:', error);
            setActiveTrip(currentTrip);
        }
    };

    const loadTodaySchedule = async () => {
        if (!activeTrip) {
            setScheduleLoading(false);
            setTodaySchedule([]);
            return;
        }

        setScheduleLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/trips/active/schedule`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success) {
                setTodaySchedule(data.data || []);
            }
        } catch (error) {
            console.error('Load schedule error:', error);
            setTodaySchedule([]);
        } finally {
            setScheduleLoading(false);
        }
    };

    const loadNotifications = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/notifications`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setNotifications(data.data || []);
            }
        } catch (error) {
            console.error('Load notifications error:', error);
        }
    };

    const loadUpcomingBookings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/bookings/upcoming`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setUpcomingBookings(data.data || []);
            }
        } catch (error) {
            console.error('Load bookings error:', error);
        }
    };

    const searchNearbyPlaces = async (type = selectedPlaceType) => {
        if (!location) return;

        setLoading(true);
        try {
            const searchType = type === 'all' ? 'tourist_attraction' : type;
            const response = await fetch(
                `${API_BASE_URL}/places/nearby?lat=${location.lat}&lng=${location.lng}&type=${searchType}&radius=${searchRadius}`
            );
            const data = await response.json();

            if (data.success) {
                setPlaces(data.data);
            }
        } catch (error) {
            console.error('Places search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPlaceDetails = async (place) => {
        setSelectedPlace(place);
        setShowPlaceDetailsModal(true);
        setLoadingPlaceDetails(true);
        setPlaceDetails(null);

        try {
            const response = await fetch(`${API_BASE_URL}/places/${place.id}`);
            const data = await response.json();

            if (data.success) {
                setPlaceDetails(data.data);
            }
        } catch (error) {
            console.error('Place details error:', error);
        } finally {
            setLoadingPlaceDetails(false);
        }
    };

    // Photo ID Functions
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setCameraActive(true);
            }
        } catch (error) {
            console.error('Camera access error:', error);
            alert('Could not access camera. Please check permissions.');
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            setCameraActive(false);
        }
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            canvas.toBlob((blob) => {
                const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
                setPhotoFile(file);
                setPhotoPreview(canvas.toDataURL('image/jpeg'));
                stopCamera();
            }, 'image/jpeg', 0.95);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onload = (e) => setPhotoPreview(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    const identifyPhoto = async () => {
        if (!photoFile) return;

        setPhotoIdentifying(true);
        setPhotoResult(null);

        try {
            const formData = new FormData();
            formData.append('photo', photoFile);
            formData.append('location', JSON.stringify(location));

            const response = await fetch(`${API_BASE_URL}/ai/identify-photo`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                setPhotoResult(data.data);
            } else {
                setPhotoResult({ error: data.error || 'Identification failed' });
            }
        } catch (error) {
            console.error('Photo identification error:', error);
            setPhotoResult({ error: 'Failed to identify photo' });
        } finally {
            setPhotoIdentifying(false);
        }
    };

    const closePhotoModal = () => {
        setShowPhotoModal(false);
        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoResult(null);
        stopCamera();
    };

    // Translation Functions
    const handleTranslate = async () => {
        if (!translateText.trim()) return;

        setTranslating(true);
        setTranslationResult(null);

        try {
            const response = await fetch(`${API_BASE_URL}/ai/translate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: translateText,
                    targetLanguage: targetLanguage,
                    sourceLanguage: 'auto',
                    context: { location: location }
                })
            });

            const data = await response.json();

            if (data.success) {
                setTranslationResult(data.data);
            } else {
                setTranslationResult({ error: data.error || 'Translation failed' });
            }
        } catch (error) {
            console.error('Translation error:', error);
            setTranslationResult({ error: 'Failed to translate text' });
        } finally {
            setTranslating(false);
        }
    };

    // Navigation Functions
    const getDirections = (place) => {
        if (!location || !place.location) return;

        const origin = `${location.lat},${location.lng}`;
        const destination = `${place.location.lat},${place.location.lng}`;
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;

        window.open(mapsUrl, '_blank');
    };

    // Activity Search Functions
    const searchActivities = async () => {
        if (!location) return;

        setSearchingActivities(true);
        try {
            const response = await fetch(
                `${API_BASE_URL}/activities/search?latitude=${location.lat}&longitude=${location.lng}&radius=5`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            const data = await response.json();

            if (data.success) {
                setActivities(data.data.activities || []);
            }
        } catch (error) {
            console.error('Activity search error:', error);
        } finally {
            setSearchingActivities(false);
        }
    };

    const addActivityToSchedule = async (activity) => {
        if (!activeTrip) return;

        try {
            const scheduleItem = {
                title: activity.name,
                type: 'activity',
                time: '09:00',
                duration: '2 hours',
                location: activity.geoCode ? `${activity.geoCode.latitude}, ${activity.geoCode.longitude}` : 'Unknown',
                status: 'upcoming',
                date: new Date().toISOString().split('T')[0]
            };

            const response = await fetch(`${API_BASE_URL}/trips/${activeTrip.id}/schedule`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(scheduleItem)
            });

            if (response.ok) {
                await loadTodaySchedule();
                setShowActivitySearchModal(false);
            }
        } catch (error) {
            console.error('Add activity error:', error);
        }
    };

    // Memory Functions
    const handleMemoryPhotosUpload = (e) => {
        const files = Array.from(e.target.files);
        setMemoryPhotos(prev => [...prev, ...files]);

        // Create previews
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                setMemoryPhotosPreviews(prev => [...prev, e.target.result]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeMemoryPhoto = (index) => {
        setMemoryPhotos(prev => prev.filter((_, i) => i !== index));
        setMemoryPhotosPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const saveMemory = async () => {
        if (!memoryData.title) return;

        setSavingMemory(true);
        try {
            const formData = new FormData();
            formData.append('title', memoryData.title);
            formData.append('description', memoryData.description);
            formData.append('memoryType', memoryData.memoryType);
            formData.append('rating', memoryData.rating);
            formData.append('memoryDate', memoryData.memoryDate);
            if (activeTrip) {
                formData.append('tripId', activeTrip.id);
            }

            memoryPhotos.forEach(photo => {
                formData.append('photos', photo);
            });

            const response = await fetch(`${API_BASE_URL}/memories`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                // Reset form
                setMemoryData({
                    title: '',
                    description: '',
                    memoryType: 'experience',
                    rating: 5,
                    memoryDate: new Date().toISOString().split('T')[0]
                });
                setMemoryPhotos([]);
                setMemoryPhotosPreviews([]);
                setShowAddMemoryModal(false);
                alert('Memory saved successfully!');
            }
        } catch (error) {
            console.error('Save memory error:', error);
            alert('Failed to save memory');
        } finally {
            setSavingMemory(false);
        }
    };

    // Expense Functions
    const handleReceiptPhotosUpload = (e) => {
        const files = Array.from(e.target.files);
        setReceiptPhotos(prev => [...prev, ...files]);

        // Create previews
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                setReceiptPhotosPreviews(prev => [...prev, e.target.result]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeReceiptPhoto = (index) => {
        setReceiptPhotos(prev => prev.filter((_, i) => i !== index));
        setReceiptPhotosPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const saveExpense = async () => {
        if (!expenseData.title || !expenseData.amount) return;

        setSavingExpense(true);
        try {
            const formData = new FormData();
            formData.append('title', expenseData.title);
            formData.append('description', expenseData.description);
            formData.append('amount', expenseData.amount);
            formData.append('currency', expenseData.currency);
            formData.append('category', expenseData.category);
            formData.append('expenseDate', expenseData.expenseDate);
            if (activeTrip) {
                formData.append('tripId', activeTrip.id);
            }

            receiptPhotos.forEach(photo => {
                formData.append('receipt_photos', photo);
            });

            const response = await fetch(`${API_BASE_URL}/expenses`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                // Reset form
                setExpenseData({
                    title: '',
                    description: '',
                    amount: '',
                    currency: 'USD',
                    category: 'general',
                    expenseDate: new Date().toISOString().split('T')[0]
                });
                setReceiptPhotos([]);
                setReceiptPhotosPreviews([]);
                setShowAddExpenseModal(false);
                alert('Expense saved successfully!');
            }
        } catch (error) {
            console.error('Save expense error:', error);
            alert('Failed to save expense');
        } finally {
            setSavingExpense(false);
        }
    };

    // Helper functions
    const getCurrentTrip = () => {
        return activeTrip || currentTrip || {
            id: null,
            title: "No Active Trip",
            destination: "Unknown",
            status: "planning",
            currentDay: 1,
            duration: 7
        };
    };

    const tripData = getCurrentTrip();

    const getWeatherIcon = (condition) => {
        switch (condition?.toLowerCase()) {
            case 'sunny':
            case 'clear':
                return '☀️';
            case 'rain':
            case 'rainy':
                return '🌧️';
            case 'cloudy':
                return '☁️';
            default:
                return '🌙';
        }
    };

    const getActivityIcon = (type) => {
        switch (type) {
            case 'dining': return <Utensils className="w-4 h-4" />;
            case 'accommodation': return <Hotel className="w-4 h-4" />;
            case 'transport': return <Plane className="w-4 h-4" />;
            default: return <Calendar className="w-4 h-4" />;
        }
    };

    const getBookingIcon = (type) => {
        switch (type) {
            case 'flight': return <Plane className="w-5 h-5" />;
            case 'hotel': return <Hotel className="w-5 h-5" />;
            default: return <Calendar className="w-5 h-5" />;
        }
    };

    const placeCategories = [
        { value: 'all', label: 'All Places', icon: '🌟' },
        { value: 'restaurant', label: 'Restaurants', icon: '🍽️' },
        { value: 'tourist_attraction', label: 'Attractions', icon: '🏛️' },
        { value: 'shopping_mall', label: 'Shopping', icon: '🛍️' },
        { value: 'cafe', label: 'Cafes', icon: '☕' },
        { value: 'museum', label: 'Museums', icon: '🎨' },
        { value: 'lodging', label: 'Hotels', icon: '🏨' },
        { value: 'gas_station', label: 'Gas Stations', icon: '⛽' },
        { value: 'hospital', label: 'Healthcare', icon: '🏥' },
        { value: 'park', label: 'Parks', icon: '🌳' }
    ];

    const generateWeatherForecast = () => {
        if (!weather) return [];
        const baseTemp = weather.temperature || 24;
        return [
            { time: "12 PM", temp: baseTemp + 2, condition: weather.condition || "sunny", alert: false },
            { time: "3 PM", temp: baseTemp + 3, condition: "cloudy", alert: false },
            { time: "6 PM", temp: baseTemp, condition: "clear", alert: false },
            { time: "9 PM", temp: baseTemp - 2, condition: "clear", alert: false }
        ];
    };

    const weatherForecast = generateWeatherForecast();

    // COMPONENTS
    const CurrentActivity = () => {
        if (scheduleLoading) {
            return (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white mb-6">
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                        <span className="ml-3">Loading schedule...</span>
                    </div>
                </div>
            );
        }

        if (todaySchedule.length === 0) {
            return (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white mb-6">
                    <div className="text-center py-8">
                        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-75" />
                        <h3 className="text-xl font-bold mb-2">No Activities Scheduled</h3>
                        <p className="opacity-90 mb-4">Start planning your day!</p>
                        <button
                            onClick={() => sendChatMessage("Help me plan activities for today")}
                            className="bg-white/20 hover:bg-white/30 px-6 py-2 rounded-lg transition-colors"
                        >
                            Plan Activities
                        </button>
                    </div>
                </div>
            );
        }

        const currentActivity = todaySchedule.find(item => item.status === 'current') || todaySchedule[0];
        const nextActivity = todaySchedule[todaySchedule.findIndex(item => item.id === currentActivity.id) + 1];

        return (
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white mb-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                            <Clock className="w-5 h-5" />
                            <span className="text-sm font-medium opacity-90">Current Activity</span>
                        </div>
                        <h3 className="text-2xl font-bold mb-1">{currentActivity.title}</h3>
                        <div className="flex items-center space-x-4 text-sm opacity-90 flex-wrap gap-2">
                            <span className="flex items-center space-x-1">
                                <MapPin className="w-4 h-4" />
                                <span>{currentActivity.location}</span>
                            </span>
                            <span>{currentActivity.time}</span>
                            {currentActivity.duration && <span>• {currentActivity.duration}</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => sendChatMessage(`Get directions to ${currentActivity.location}`)}
                        className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
                    >
                        <Navigation className="w-5 h-5" />
                    </button>
                </div>

                {nextActivity && (
                    <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <ChevronRight className="w-4 h-4" />
                                <div>
                                    <p className="text-sm opacity-75">Up Next</p>
                                    <p className="font-medium">{nextActivity.title}</p>
                                </div>
                            </div>
                            <span className="text-sm opacity-75">{nextActivity.time}</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const WeatherAlert = () => {
        const hasAlert = weatherForecast.some(f => f.alert);
        if (!hasAlert) return null;

        return (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="font-semibold text-yellow-900 mb-1">Weather Alert</h4>
                        <p className="text-yellow-800 text-sm mb-2">
                            Weather changes expected. Consider indoor alternatives?
                        </p>
                        <button
                            onClick={() => sendChatMessage("Show me indoor activities near me")}
                            className="text-xs bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
                        >
                            Show Alternatives
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const TodaySchedulePanel = () => (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <span>Today's Schedule</span>
                </h3>
                <button
                    onClick={() => setShowScheduleEdit(true)}
                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center space-x-1"
                >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                </button>
            </div>

            <div className="space-y-3">
                {todaySchedule.map((item) => (
                    <div
                        key={item.id}
                        className={`border rounded-lg p-3 transition-all ${
                            item.status === 'current'
                                ? 'border-blue-500 bg-blue-50'
                                : item.status === 'completed'
                                    ? 'border-gray-200 bg-gray-50 opacity-60'
                                    : 'border-gray-200 hover:border-blue-300'
                        }`}
                    >
                        <div className="flex items-start space-x-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                item.status === 'current' ? 'bg-blue-600 text-white' :
                                    item.status === 'completed' ? 'bg-green-600 text-white' :
                                        'bg-gray-200 text-gray-600'
                            }`}>
                                {item.status === 'completed' ? <CheckCircle className="w-4 h-4" /> : getActivityIcon(item.type)}
                            </div>

                            <div className="flex-1">
                                <p className="font-medium text-gray-900">{item.title}</p>
                                <div className="flex items-center space-x-2 mt-1 text-sm text-gray-600">
                                    <span>{item.time}</span>
                                    {item.duration && <span>• {item.duration}</span>}
                                </div>
                                <p className="text-xs text-gray-500 mt-1 flex items-center space-x-1">
                                    <MapPin className="w-3 h-3" />
                                    <span>{item.location}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex space-x-2">
                <button
                    onClick={() => {
                        setShowActivitySearchModal(true);
                        searchActivities();
                    }}
                    className="flex-1 border-2 border-dashed border-gray-300 rounded-lg py-3 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center space-x-2"
                >
                    <MapPin className="w-4 h-4" />
                    <span>Search Activities</span>
                </button>
                <button
                    onClick={() => {
                        sendChatMessage("Help me plan a new activity");
                        setChatOpen(true);
                    }}
                    className="flex-1 border-2 border-dashed border-gray-300 rounded-lg py-3 text-gray-600 hover:border-purple-400 hover:text-purple-600 transition-colors flex items-center justify-center space-x-2"
                >
                    <MessageCircle className="w-4 h-4" />
                    <span>AI Assist</span>
                </button>
            </div>
        </div>
    );

    const UpcomingBookings = () => (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Bell className="w-5 h-5 text-orange-500" />
                <span>Upcoming Bookings</span>
            </h3>

            <div className="space-y-3">
                {upcomingBookings.length > 0 ? upcomingBookings.map(booking => (
                    <div key={booking.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                                {getBookingIcon(booking.type)}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-medium text-gray-900">{booking.title}</h4>
                                <p className="text-sm text-gray-600">{booking.time}</p>
                                <p className="text-xs text-gray-500 mt-1">Confirmation: {booking.confirmation}</p>
                            </div>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                {booking.status}
                            </span>
                        </div>
                    </div>
                )) : (
                    <p className="text-gray-500 text-sm text-center py-4">No upcoming bookings</p>
                )}
            </div>
        </div>
    );

    const SmartInsights = () => (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Zap className="w-5 h-5 text-purple-600" />
                <span>Smart Insights</span>
            </h3>

            <div className="space-y-3">
                <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-700">
                        💡 <strong>Local Tip:</strong> Popular attractions are less crowded before 9 AM.
                    </p>
                </div>
                <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-700">
                        🍜 <strong>Food Recommendation:</strong> Try local specialties at nearby restaurants!
                    </p>
                </div>
            </div>
        </div>
    );

    const QuickTools = () => {
        const tools = [
            {
                id: 'landmark',
                icon: <ScanLine className="w-6 h-6" />,
                title: 'Photo ID',
                description: 'Identify landmarks',
                color: 'from-purple-500 to-purple-600',
                action: () => setShowPhotoModal(true)
            },
            {
                id: 'translate',
                icon: <Languages className="w-6 h-6" />,
                title: 'Live Translate',
                description: 'Real-time translation',
                color: 'from-blue-500 to-blue-600',
                action: () => setShowTranslateModal(true)
            },
            {
                id: 'navigation',
                icon: <Map className="w-6 h-6" />,
                title: 'Navigation',
                description: 'Get directions',
                color: 'from-green-500 to-green-600',
                action: () => setShowNavigationModal(true)
            },
            {
                id: 'emergency',
                icon: <Shield className="w-6 h-6" />,
                title: 'Emergency',
                description: 'Local contacts',
                color: 'from-red-500 to-red-600',
                action: () => setShowEmergencyModal(true)
            }
        ];

        return (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    <span>Quick Tools</span>
                </h3>

                <div className="grid grid-cols-2 gap-3">
                    {tools.map(tool => (
                        <button
                            key={tool.id}
                            onClick={tool.action}
                            className={`bg-gradient-to-r ${tool.color} text-white rounded-lg p-4 hover:shadow-lg transition-all`}
                        >
                            <div className="flex flex-col items-center text-center space-y-2">
                                {tool.icon}
                                <div>
                                    <p className="font-semibold text-sm">{tool.title}</p>
                                    <p className="text-xs opacity-90">{tool.description}</p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    const FindNearby = () => (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <span>Find Nearby</span>
                </h3>
                <select
                    value={searchRadius}
                    onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                    className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                >
                    <option value={500}>500m</option>
                    <option value={1000}>1km</option>
                    <option value={2000}>2km</option>
                    <option value={5000}>5km</option>
                </select>
            </div>

            <div className="flex overflow-x-auto space-x-2 mb-4 pb-2">
                {placeCategories.map(cat => (
                    <button
                        key={cat.value}
                        onClick={() => setSelectedPlaceType(cat.value)}
                        className={`flex-shrink-0 px-3 py-2 rounded-full text-sm transition-colors ${
                            selectedPlaceType === cat.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <span className="mr-1">{cat.icon}</span>
                        {cat.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Finding places...</span>
                </div>
            ) : places.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {places.map((place, index) => (
                        <div key={place.id || index} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
                            <div className="flex space-x-3">
                                <div
                                    className="flex space-x-3 flex-1 cursor-pointer"
                                    onClick={() => fetchPlaceDetails(place)}
                                >
                                    {place.photos && place.photos.length > 0 && (
                                        <img
                                            src={place.photos[0]}
                                            alt={place.name}
                                            className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-gray-900 truncate">{place.name}</h4>
                                        <div className="flex items-center space-x-2 mt-1">
                                            {place.rating && (
                                                <div className="flex items-center space-x-1">
                                                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                                                    <span className="text-sm text-gray-700">{place.rating}</span>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{place.address}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => getDirections(place)}
                                    className="text-blue-600 hover:text-blue-700 flex-shrink-0"
                                    title="Get Directions"
                                >
                                    <Navigation className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8">
                    <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No places found nearby</p>
                </div>
            )}
        </div>
    );

    const TripProgress = () => (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Trip Progress</h3>
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Days Completed</span>
                        <span className="font-medium">{tripData.currentDay} of {tripData.duration}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                            style={{width: `${(tripData.currentDay / tripData.duration) * 100}%`}}
                        ></div>
                    </div>
                </div>

                <div className="pt-3 border-t">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Activities Completed</span>
                        <span className="text-2xl font-bold text-blue-600">
                            {todaySchedule.filter(s => s.status === 'completed').length}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

    const LocalInformation = () => (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Local Information</h3>
            <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-600">Local Time</span>
                    <span className="font-medium">{formattedTime}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Date</span>
                    <span className="font-medium">{formattedDate}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Emergency</span>
                    <button
                        onClick={() => setShowEmergencyModal(true)}
                        className="font-medium text-red-600 hover:text-red-700"
                    >
                        {localEmergency.general}
                    </button>
                </div>
            </div>

            <button
                onClick={() => sendChatMessage("Tell me about local customs")}
                className="w-full mt-4 bg-blue-50 text-blue-600 py-2 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
            >
                View Full Guide
            </button>
        </div>
    );

    const QuickActions = () => (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
                <button
                    onClick={() => setShowAddMemoryModal(true)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-3"
                >
                    <Camera className="w-5 h-5 text-gray-600" />
                    <span className="text-sm">Add Memory</span>
                </button>
                <button
                    onClick={() => setShowAddExpenseModal(true)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-3"
                >
                    <DollarSign className="w-5 h-5 text-gray-600" />
                    <span className="text-sm">Log Expense</span>
                </button>
                <button
                    onClick={() => {
                        sendChatMessage("I need help with something");
                        setChatOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-3"
                >
                    <MessageCircle className="w-5 h-5 text-gray-600" />
                    <span className="text-sm">Ask AI Assistant</span>
                </button>
            </div>
        </div>
    );

    const WeatherForecast = () => (
        <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Today&apos;s Forecast</h3>
            <div className="grid grid-cols-4 gap-4">
                {weatherForecast.map((item, index) => (
                    <div
                        key={index}
                        className={`text-center p-4 rounded-lg ${item.alert ? 'bg-yellow-50 border-2 border-yellow-400' : 'bg-gray-50'}`}
                    >
                        <p className="text-sm text-gray-600 mb-2">{item.time}</p>
                        <div className="text-3xl mb-2">
                            {getWeatherIcon(item.condition)}
                        </div>
                        <p className="text-lg font-semibold">{item.temp}°C</p>
                        {item.alert && (
                            <p className="text-xs text-yellow-700 mt-2 font-medium">⚠️ Alert</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    // MODALS
    const PhotoModal = () => {
        if (!showPhotoModal) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold">Identify Photo</h3>
                            <button onClick={closePhotoModal} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        {!photoPreview ? (
                            <div className="space-y-4">
                                {!cameraActive ? (
                                    <>
                                        <button
                                            onClick={startCamera}
                                            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
                                        >
                                            <Camera className="w-5 h-5" />
                                            <span>Take Photo</span>
                                        </button>

                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleFileUpload}
                                                className="hidden"
                                                id="photo-upload"
                                            />
                                            <label
                                                htmlFor="photo-upload"
                                                className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 flex items-center justify-center space-x-2 cursor-pointer"
                                            >
                                                <Upload className="w-5 h-5" />
                                                <span>Upload Photo</span>
                                            </label>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: '300px' }}>
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className="w-full h-full object-cover"
                                                style={{ minHeight: '300px', maxHeight: '500px' }}
                                            />
                                        </div>
                                        <canvas ref={canvasRef} className="hidden" />
                                        <div className="flex space-x-3">
                                            <button
                                                onClick={capturePhoto}
                                                className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
                                            >
                                                Capture
                                            </button>
                                            <button
                                                onClick={stopCamera}
                                                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <img src={photoPreview} alt="Preview" className="w-full rounded-lg" />

                                {!photoResult ? (
                                    <div className="flex space-x-3">
                                        <button
                                            onClick={identifyPhoto}
                                            disabled={photoIdentifying}
                                            className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                                        >
                                            {photoIdentifying ? (
                                                <>
                                                    <Loader className="w-5 h-5 animate-spin" />
                                                    <span>Identifying...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="w-5 h-5" />
                                                    <span>Identify</span>
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setPhotoPreview(null);
                                                setPhotoFile(null);
                                            }}
                                            className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200"
                                        >
                                            Retake
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        {photoResult.error ? (
                                            <div className="text-red-600">
                                                <AlertCircle className="w-5 h-5 inline mr-2" />
                                                {photoResult.error}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <h4 className="font-semibold text-lg">{photoResult.name || 'Result'}</h4>
                                                <p className="text-gray-700">{photoResult.description}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const TranslateModal = () => {
        if (!showTranslateModal) return null;

        const handleSubmit = (e) => {
            e.preventDefault();
            handleTranslate();
        };

        const closeTranslateModal = () => {
            setShowTranslateModal(false);
            setTranslateText('');
            setTranslationResult(null);
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold">Live Translation</h3>
                            <button onClick={closeTranslateModal} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Text to translate
                                </label>
                                <textarea
                                    value={translateText}
                                    onChange={(e) => {
                                        setTranslateText(e.target.value);
                                        setTranslationResult(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.ctrlKey) {
                                            e.preventDefault();
                                            handleTranslate();
                                        }
                                    }}
                                    placeholder="Enter text to translate..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px] resize-y"
                                    disabled={translating}
                                />
                                <p className="text-xs text-gray-500 mt-1">Press Ctrl+Enter to translate</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Target Language
                                </label>
                                <select
                                    value={targetLanguage}
                                    onChange={(e) => setTargetLanguage(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    disabled={translating}
                                >
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                    <option value="de">German</option>
                                    <option value="it">Italian</option>
                                    <option value="pt">Portuguese</option>
                                    <option value="ja">Japanese</option>
                                    <option value="zh">Chinese</option>
                                    <option value="ko">Korean</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                disabled={!translateText.trim() || translating}
                                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                            >
                                {translating ? (
                                    <>
                                        <Loader className="w-5 h-5 animate-spin" />
                                        <span>Translating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Globe className="w-5 h-5" />
                                        <span>Translate</span>
                                    </>
                                )}
                            </button>

                            {translationResult && (
                                <div className="bg-gray-50 rounded-lg p-4">
                                    {translationResult.error ? (
                                        <div className="text-red-600">
                                            <AlertCircle className="w-5 h-5 inline mr-2" />
                                            {translationResult.error}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-sm text-gray-600 mb-1">Translation:</p>
                                                <p className="text-lg font-medium text-gray-900">{translationResult.translation}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        );
    };

    const EmergencyModal = () => {
        if (!showEmergencyModal) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-md w-full">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-red-600" />
                                </div>
                                <h3 className="text-xl font-semibold">Emergency Contacts</h3>
                            </div>
                            <button onClick={() => setShowEmergencyModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                            <p className="text-sm text-red-800 font-medium mb-2">
                                ⚠️ In case of emergency, call immediately
                            </p>
                            {detectedCountry !== 'Unknown' && (
                                <p className="text-xs text-red-700">
                                    Location: {detectedCountry}
                                </p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="bg-white border-2 border-red-600 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-700">General Emergency</span>
                                    <Phone className="w-5 h-5 text-red-600" />
                                </div>
                                <a
                                    href={`tel:${localEmergency.general}`}
                                    className="text-3xl font-bold text-red-600 hover:text-red-700"
                                >
                                    {localEmergency.general}
                                </a>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-gray-50 rounded-lg p-4 text-center">
                                    <Phone className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                                    <p className="text-xs text-gray-600 mb-1">Police</p>
                                    <a
                                        href={`tel:${localEmergency.police}`}
                                        className="text-lg font-bold text-blue-600 hover:text-blue-700"
                                    >
                                        {localEmergency.police}
                                    </a>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 text-center">
                                    <Phone className="w-5 h-5 text-red-600 mx-auto mb-2" />
                                    <p className="text-xs text-gray-600 mb-1">Ambulance</p>
                                    <a
                                        href={`tel:${localEmergency.ambulance}`}
                                        className="text-lg font-bold text-red-600 hover:text-red-700"
                                    >
                                        {localEmergency.ambulance}
                                    </a>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 text-center">
                                    <Phone className="w-5 h-5 text-orange-600 mx-auto mb-2" />
                                    <p className="text-xs text-gray-600 mb-1">Fire</p>
                                    <a
                                        href={`tel:${localEmergency.fire}`}
                                        className="text-lg font-bold text-orange-600 hover:text-orange-700"
                                    >
                                        {localEmergency.fire}
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <button
                                onClick={() => {
                                    if (location) {
                                        const mapsUrl = `https://www.google.com/maps/search/hospital/@${location.lat},${location.lng},15z`;
                                        window.open(mapsUrl, '_blank');
                                    }
                                }}
                                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
                            >
                                <MapPin className="w-5 h-5" />
                                <span>Find Nearest Hospital</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const NavigationModal = () => {
        if (!showNavigationModal) return null;

        const handleNavigate = () => {
            if (!navigationDestination.trim()) {
                alert('Please enter a destination');
                return;
            }

            let mapsUrl;
            if (location) {
                // If we have user's current location, provide directions
                const origin = `${location.lat},${location.lng}`;
                mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(navigationDestination)}&travelmode=driving`;
            } else {
                // If no location, just search for the destination
                mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(navigationDestination)}`;
            }

            window.open(mapsUrl, '_blank');
            setShowNavigationModal(false);
            setNavigationDestination('');
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-md w-full">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                    <Map className="w-6 h-6 text-green-600" />
                                </div>
                                <h3 className="text-xl font-semibold">Navigation</h3>
                            </div>
                            <button onClick={() => {
                                setShowNavigationModal(false);
                                setNavigationDestination('');
                            }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Where would you like to go?
                                </label>
                                <input
                                    type="text"
                                    value={navigationDestination}
                                    onChange={(e) => setNavigationDestination(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleNavigate();
                                        }
                                    }}
                                    placeholder="Enter destination (e.g., Eiffel Tower, Paris)"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>

                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <p className="text-sm text-green-800">
                                    💡 <strong>Tip:</strong> Enter any address, place name, or landmark to get directions
                                </p>
                            </div>

                            <div className="flex space-x-3">
                                <button
                                    onClick={() => {
                                        setShowNavigationModal(false);
                                        setNavigationDestination('');
                                    }}
                                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleNavigate}
                                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                                >
                                    <MapPin className="w-5 h-5" />
                                    <span>Navigate</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Place Details Modal
    const PlaceDetailsModal = () => {
        if (!showPlaceDetailsModal) return null;

        const formatHours = (hours) => {
            if (!hours || !hours.display || hours.display.length === 0) {
                return 'Hours not available';
            }
            return hours.display.join('\n');
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    {/* Header with close button */}
                    <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-t-xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-white">{selectedPlace?.name}</h2>
                                {selectedPlace?.rating && (
                                    <div className="flex items-center space-x-2 mt-2">
                                        <div className="flex items-center space-x-1">
                                            <Star className="w-5 h-5 text-yellow-300 fill-current" />
                                            <span className="text-white font-semibold">{selectedPlace.rating}</span>
                                        </div>
                                        {selectedPlace.userRatingsTotal && (
                                            <span className="text-blue-100 text-sm">
                                                ({selectedPlace.userRatingsTotal} reviews)
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    setShowPlaceDetailsModal(false);
                                    setSelectedPlace(null);
                                    setPlaceDetails(null);
                                }}
                                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {loadingPlaceDetails ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                <span className="ml-3 text-gray-600">Loading details...</span>
                            </div>
                        ) : placeDetails ? (
                            <div className="space-y-6">
                                {/* Photos Gallery */}
                                {placeDetails.photos && placeDetails.photos.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-gray-900 text-lg">Photos</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {placeDetails.photos.slice(0, 4).map((photo, index) => (
                                                <img
                                                    key={index}
                                                    src={photo}
                                                    alt={`${selectedPlace.name} photo ${index + 1}`}
                                                    className="w-full h-48 object-cover rounded-lg"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Description */}
                                {placeDetails.description && (
                                    <div className="space-y-2">
                                        <h3 className="font-semibold text-gray-900 text-lg flex items-center space-x-2">
                                            <Info className="w-5 h-5 text-blue-600" />
                                            <span>About</span>
                                        </h3>
                                        <p className="text-gray-700">{placeDetails.description}</p>
                                    </div>
                                )}

                                {/* Categories */}
                                {placeDetails.categories && placeDetails.categories.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="font-semibold text-gray-900 text-lg">Categories</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {placeDetails.categories.map((category, index) => (
                                                <span
                                                    key={index}
                                                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                                                >
                                                    {category}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Contact Information */}
                                <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                                    <h3 className="font-semibold text-gray-900 text-lg">Contact & Location</h3>

                                    {/* Address */}
                                    {placeDetails.address && (
                                        <div className="flex items-start space-x-3">
                                            <MapPin className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">Address</p>
                                                <p className="text-gray-900">{placeDetails.address}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Phone */}
                                    {placeDetails.phone && (
                                        <div className="flex items-start space-x-3">
                                            <Phone className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">Phone</p>
                                                <a
                                                    href={`tel:${placeDetails.phone}`}
                                                    className="text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    {placeDetails.phone}
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {/* Website */}
                                    {placeDetails.website && (
                                        <div className="flex items-start space-x-3">
                                            <Globe className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">Website</p>
                                                <a
                                                    href={placeDetails.website}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-700 font-medium truncate block"
                                                >
                                                    Visit Website
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {/* Hours */}
                                    {placeDetails.hours && (
                                        <div className="flex items-start space-x-3">
                                            <Clock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-700 mb-2">Hours</p>
                                                <div className="text-gray-900 text-sm whitespace-pre-line">
                                                    {formatHours(placeDetails.hours)}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Tips */}
                                {placeDetails.tips && placeDetails.tips.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-gray-900 text-lg">Tips from Visitors</h3>
                                        <div className="space-y-2">
                                            {placeDetails.tips.slice(0, 3).map((tip, index) => (
                                                <div key={index} className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                                                    <p className="text-sm text-gray-800">{tip.text || tip}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">Failed to load place details</p>
                            </div>
                        )}
                    </div>

                    {/* Footer with actions */}
                    <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 rounded-b-xl">
                        <button
                            onClick={() => {
                                if (selectedPlace) {
                                    getDirections(selectedPlace);
                                }
                            }}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 font-medium"
                        >
                            <Navigation className="w-5 h-5" />
                            <span>Get Directions</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Schedule Edit Modal (with manual booking)
    const ScheduleEditModal = () => {
        if (!showScheduleEdit) return null;

        const [bookingData, setBookingData] = useState({
            type: 'activity',
            title: '',
            time: '09:00',
            duration: '1 hour',
            location: '',
            date: new Date().toISOString().split('T')[0]
        });

        const handleAddBooking = async () => {
            if (!bookingData.title || !activeTrip) return;

            try {
                const response = await fetch(`${API_BASE_URL}/trips/${activeTrip.id}/schedule`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ...bookingData,
                        status: 'upcoming'
                    })
                });

                if (response.ok) {
                    await loadTodaySchedule();
                    setShowScheduleEdit(false);
                    setBookingData({
                        type: 'activity',
                        title: '',
                        time: '09:00',
                        duration: '1 hour',
                        location: '',
                        date: new Date().toISOString().split('T')[0]
                    });
                }
            } catch (error) {
                console.error('Add booking error:', error);
            }
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold">Add to Schedule</h3>
                            <button onClick={() => setShowScheduleEdit(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                                <select
                                    value={bookingData.type}
                                    onChange={(e) => setBookingData(prev => ({ ...prev, type: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="activity">Activity</option>
                                    <option value="dining">Dining</option>
                                    <option value="accommodation">Accommodation</option>
                                    <option value="transport">Transport</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={bookingData.title}
                                    onChange={(e) => setBookingData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g., Visit Eiffel Tower"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                                    <input
                                        type="date"
                                        value={bookingData.date}
                                        onChange={(e) => setBookingData(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                                    <input
                                        type="time"
                                        value={bookingData.time}
                                        onChange={(e) => setBookingData(prev => ({ ...prev, time: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                                <input
                                    type="text"
                                    value={bookingData.duration}
                                    onChange={(e) => setBookingData(prev => ({ ...prev, duration: e.target.value }))}
                                    placeholder="e.g., 2 hours"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                                <input
                                    type="text"
                                    value={bookingData.location}
                                    onChange={(e) => setBookingData(prev => ({ ...prev, location: e.target.value }))}
                                    placeholder="Address or venue"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="flex space-x-3 pt-4">
                                <button
                                    onClick={() => setShowScheduleEdit(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddBooking}
                                    disabled={!bookingData.title}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Add to Schedule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Activity Search Modal
    const ActivitySearchModal = () => {
        if (!showActivitySearchModal) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold">Search Activities</h3>
                            <button onClick={() => setShowActivitySearchModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {searchingActivities ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                <span className="ml-3 text-gray-600">Searching for activities...</span>
                            </div>
                        ) : activities.length > 0 ? (
                            <div className="space-y-3">
                                {activities.map((activity, index) => (
                                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-gray-900">{activity.name}</h4>
                                                {activity.shortDescription && (
                                                    <p className="text-sm text-gray-600 mt-1">{activity.shortDescription}</p>
                                                )}
                                                {activity.price && (
                                                    <p className="text-sm text-gray-500 mt-2">
                                                        From {activity.price.amount} {activity.price.currencyCode}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => addActivityToSchedule(activity)}
                                                className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                            >
                                                Add to Schedule
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <p className="text-gray-500">No activities found in your area</p>
                                <button
                                    onClick={searchActivities}
                                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Search Again
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Add Memory Modal
    const AddMemoryModal = () => {
        if (!showAddMemoryModal) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold">Add Memory</h3>
                            <button onClick={() => setShowAddMemoryModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={memoryData.title}
                                    onChange={(e) => setMemoryData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g., Amazing sunset at the beach"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <textarea
                                    value={memoryData.description}
                                    onChange={(e) => setMemoryData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Describe your memory..."
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                                    <select
                                        value={memoryData.memoryType}
                                        onChange={(e) => setMemoryData(prev => ({ ...prev, memoryType: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="experience">Experience</option>
                                        <option value="photo">Photo</option>
                                        <option value="note">Note</option>
                                        <option value="recommendation">Recommendation</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
                                    <select
                                        value={memoryData.rating}
                                        onChange={(e) => setMemoryData(prev => ({ ...prev, rating: parseInt(e.target.value) }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value={5}>5 - Excellent</option>
                                        <option value={4}>4 - Great</option>
                                        <option value={3}>3 - Good</option>
                                        <option value={2}>2 - Fair</option>
                                        <option value={1}>1 - Poor</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                                <input
                                    type="date"
                                    value={memoryData.memoryDate}
                                    onChange={(e) => setMemoryData(prev => ({ ...prev, memoryDate: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleMemoryPhotosUpload}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                                {memoryPhotosPreviews.length > 0 && (
                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                        {memoryPhotosPreviews.map((preview, index) => (
                                            <div key={index} className="relative">
                                                <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-20 object-cover rounded" />
                                                <button
                                                    onClick={() => removeMemoryPhoto(index)}
                                                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex space-x-3 pt-4">
                                <button
                                    onClick={() => setShowAddMemoryModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveMemory}
                                    disabled={!memoryData.title || savingMemory}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {savingMemory ? 'Saving...' : 'Save Memory'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Add Expense Modal
    const AddExpenseModal = () => {
        if (!showAddExpenseModal) return null;

        const expenseCategories = [
            { value: 'general', label: 'General' },
            { value: 'food', label: 'Food & Dining' },
            { value: 'transport', label: 'Transportation' },
            { value: 'accommodation', label: 'Accommodation' },
            { value: 'entertainment', label: 'Entertainment' },
            { value: 'shopping', label: 'Shopping' },
            { value: 'other', label: 'Other' }
        ];

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold">Log Expense</h3>
                            <button onClick={() => setShowAddExpenseModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={expenseData.title}
                                    onChange={(e) => setExpenseData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g., Lunch at cafe"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <textarea
                                    value={expenseData.description}
                                    onChange={(e) => setExpenseData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Additional details..."
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={expenseData.amount}
                                        onChange={(e) => setExpenseData(prev => ({ ...prev, amount: e.target.value }))}
                                        placeholder="0.00"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                                    <select
                                        value={expenseData.currency}
                                        onChange={(e) => setExpenseData(prev => ({ ...prev, currency: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="GBP">GBP</option>
                                        <option value="JPY">JPY</option>
                                        <option value="AUD">AUD</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                                    <select
                                        value={expenseData.category}
                                        onChange={(e) => setExpenseData(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        {expenseCategories.map(cat => (
                                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                                    <input
                                        type="date"
                                        value={expenseData.expenseDate}
                                        onChange={(e) => setExpenseData(prev => ({ ...prev, expenseDate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Photos</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleReceiptPhotosUpload}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                                {receiptPhotosPreviews.length > 0 && (
                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                        {receiptPhotosPreviews.map((preview, index) => (
                                            <div key={index} className="relative">
                                                <img src={preview} alt={`Receipt ${index + 1}`} className="w-full h-20 object-cover rounded" />
                                                <button
                                                    onClick={() => removeReceiptPhoto(index)}
                                                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex space-x-3 pt-4">
                                <button
                                    onClick={() => setShowAddExpenseModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveExpense}
                                    disabled={!expenseData.title || !expenseData.amount || savingExpense}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {savingExpense ? 'Saving...' : 'Save Expense'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // MAIN RENDER
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2 text-gray-700">
                                <MapPin className="w-5 h-5 text-blue-600" />
                                <span className="font-medium">
                                    {location ? `${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}` : 'Location unavailable'}
                                </span>
                            </div>
                            {weather && (
                                <div className="hidden md:flex items-center space-x-2 text-gray-700">
                                    <Cloud className="w-5 h-5 text-blue-600" />
                                    <span>{Math.round(weather.temperature)}°C</span>
                                    <span className="text-gray-500">•</span>
                                    <span className="text-gray-600 capitalize">{weather.description}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center space-x-3">
                            <div className="hidden md:block text-sm text-gray-600">
                                Day {tripData?.currentDay || 1} of {tripData?.duration || 7}
                            </div>
                            <button className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                                <Bell className="w-5 h-5" />
                                {notifications.length > 0 && (
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                <CurrentActivity />
                <WeatherAlert />

                {/* Main Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-1 space-y-6">
                        <TodaySchedulePanel />
                        <UpcomingBookings />
                        <SmartInsights />
                    </div>

                    {/* Middle Column */}
                    <div className="lg:col-span-1">
                        <FindNearby />
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-1 space-y-6">
                        <QuickTools />
                        <TripProgress />
                        <LocalInformation />
                        <QuickActions />
                    </div>
                </div>

                {/* Weather Forecast Strip */}
                <div className="mt-6">
                    <WeatherForecast />
                </div>
            </div>

            {/* Modals */}
            <PhotoModal />
            <TranslateModal />
            <NavigationModal />
            <EmergencyModal />
            <PlaceDetailsModal />
            <ScheduleEditModal />
            <ActivitySearchModal />
            <AddMemoryModal />
            <AddExpenseModal />

            {/* Floating AI Button */}
            <button
                onClick={() => {
                    sendChatMessage("Hi, I need help with something");
                    setChatOpen(true);
                }}
                className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-40"
                aria-label="Open AI Chat"
            >
                <MessageCircle className="w-6 h-6" />
                <div className="absolute -top-2 -right-2 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </button>
        </div>
    );
};


// ===================================
// MEMORY MODE COMPONENT - FIXED
// ===================================
const MemoryMode = ({user, token, memories, setMemories, trips, dashboardData, sendChatMessage}) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [showCreateMemory, setShowCreateMemory] = useState(false);
    const [travelStory, setTravelStory] = useState(null);
    const [loadingStory, setLoadingStory] = useState(false);

    const tabs = [
        {id: 'overview', label: 'Overview', icon: TrendingUp},
        {id: 'memories', label: 'Memories', icon: Camera},
        {id: 'story', label: 'Travel Story', icon: Book},
        {id: 'insights', label: 'Insights', icon: Globe}
    ];

    const generateTravelStory = async (tripId = null) => {
        setLoadingStory(true);
        try {
            const url = tripId ? `${API_BASE_URL}/memories/story/${tripId}` : `${API_BASE_URL}/memories/story`;
            const response = await fetch(url, {
                headers: {Authorization: `Bearer ${token}`}
            });
            const data = await response.json();

            if (data.success) {
                setTravelStory(data.data);
            }
        } catch (error) {
            console.error('Story generation error:', error);
        } finally {
            setLoadingStory(false);
        }
    };

    const CreateMemoryModal = () => {
        const [formData, setFormData] = useState({
            title: '',
            description: '',
            notes: '',
            rating: 5,
            type: 'experience',
            tripId: '',
            tags: []
        });
        const [photos, setPhotos] = useState([]);
        const [loading, setLoading] = useState(false);

        const handleSubmit = async (e) => {
            e.preventDefault();
            setLoading(true);

            try {
                const submitData = new FormData();
                Object.keys(formData).forEach(key => {
                    if (key === 'tags') {
                        submitData.append(key, JSON.stringify(formData[key]));
                    } else {
                        submitData.append(key, formData[key]);
                    }
                });

                photos.forEach(photo => {
                    submitData.append('photos', photo);
                });

                const response = await fetch(`${API_BASE_URL}/memories`, {
                    method: 'POST',
                    headers: {Authorization: `Bearer ${token}`},
                    body: submitData
                });

                const data = await response.json();

                if (data.success) {
                    setMemories(prev => [data.data, ...prev]);
                    setShowCreateMemory(false);
                    sendChatMessage(`I just created a new memory: ${formData.title}. Can you help me reflect on this experience?`);
                    setChatOpen(true);
                }
            } catch (error) {
                console.error('Memory creation error:', error);
            } finally {
                setLoading(false);
            }
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold">Create Memory</h3>
                            <button
                                onClick={() => setShowCreateMemory(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Title
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        value={formData.title}
                                        onChange={(e) => setFormData(prev => ({...prev, title: e.target.value}))}
                                        placeholder="Amazing sunset at the beach"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Type
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        value={formData.type}
                                        onChange={(e) => setFormData(prev => ({...prev, type: e.target.value}))}
                                    >
                                        <option value="experience">Experience</option>
                                        <option value="photo">Photo</option>
                                        <option value="note">Note</option>
                                        <option value="recommendation">Recommendation</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Description
                                </label>
                                <textarea
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    rows={3}
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
                                    placeholder="Describe your experience..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Notes
                                </label>
                                <textarea
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    rows={2}
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
                                    placeholder="Additional notes..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Rating
                                    </label>
                                    <div className="flex space-x-1">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button
                                                key={star}
                                                type="button"
                                                onClick={() => setFormData(prev => ({...prev, rating: star}))}
                                                className={`w-8 h-8 ${star <= formData.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                                            >
                                                <Star className="w-full h-full fill-current"/>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Trip
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        value={formData.tripId}
                                        onChange={(e) => setFormData(prev => ({...prev, tripId: e.target.value}))}
                                    >
                                        <option value="">No specific trip</option>
                                        {trips.map(trip => (
                                            <option key={trip.id} value={trip.id}>
                                                {trip.title}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Photos
                                </label>
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    onChange={(e) => setPhotos(Array.from(e.target.files))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                                {photos.length > 0 && (
                                    <p className="text-sm text-gray-500 mt-1">
                                        {photos.length} photo(s) selected
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateMemory(false)}
                                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {loading ? 'Creating...' : 'Create Memory'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-2">Travel Memories</h2>
                        <p className="text-gray-600">Capture and relive your travel experiences</p>
                    </div>
                    <button
                        onClick={() => setShowCreateMemory(true)}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors flex items-center space-x-2"
                    >
                        <Camera className="w-5 h-5"/>
                        <span>Add Memory</span>
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-xl shadow-lg mb-8">
                <div className="border-b border-gray-200">
                    <nav className="flex space-x-8 px-6">
                        {tabs.map(({id, label, icon: Icon}) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center space-x-2 py-4 border-b-2 transition-colors ${
                                    activeTab === id
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <Icon className="w-5 h-5"/>
                                <span>{label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-6">
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="space-y-8">
                            {/* Statistics Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div
                                    className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-blue-100 text-sm">Total Trips</p>
                                            <p className="text-3xl font-bold">{dashboardData?.trips?.total_trips || 0}</p>
                                        </div>
                                        <Plane className="w-8 h-8 text-blue-200"/>
                                    </div>
                                </div>

                                <div
                                    className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-green-100 text-sm">Memories</p>
                                            <p className="text-3xl font-bold">{dashboardData?.memories?.total_memories || memories.length}</p>
                                        </div>
                                        <Camera className="w-8 h-8 text-green-200"/>
                                    </div>
                                </div>

                                <div
                                    className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-purple-100 text-sm">Avg Rating</p>
                                            <p className="text-3xl font-bold">{dashboardData?.memories?.avg_rating?.toFixed(1) || '4.8'}</p>
                                        </div>
                                        <Star className="w-8 h-8 text-purple-200"/>
                                    </div>
                                </div>

                                <div
                                    className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-orange-100 text-sm">Active Days</p>
                                            <p className="text-3xl font-bold">{dashboardData?.memories?.active_days || '12'}</p>
                                        </div>
                                        <Clock className="w-8 h-8 text-orange-200"/>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                                <div className="space-y-3">
                                    {dashboardData?.recentActivity?.slice(0, 5).map((activity, index) => (
                                        <div key={index}
                                             className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                                            <div
                                                className={`w-2 h-2 rounded-full ${activity.type === 'memory' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900">{activity.activity}</p>
                                                <p className="text-sm text-gray-500">
                                                    {new Date(activity.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded-full ${
                                                activity.type === 'memory' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                        {activity.type}
                      </span>
                                        </div>
                                    )) || (
                                        <p className="text-gray-500">No recent activity</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Memories Tab */}
                    {activeTab === 'memories' && (
                        <div>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold">Your Travel Memories</h3>
                                <div className="flex space-x-2">
                                    <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                        <option>All Types</option>
                                        <option>Experience</option>
                                        <option>Photo</option>
                                        <option>Note</option>
                                        <option>Recommendation</option>
                                    </select>
                                    <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                        <option>All Trips</option>
                                        {trips.map(trip => (
                                            <option key={trip.id} value={trip.id}>{trip.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {memories.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {memories.map(memory => (
                                        <div key={memory.id}
                                             className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                                            {memory.photos && memory.photos.length > 0 && (
                                                <div className="aspect-video bg-gray-200">
                                                    <img
                                                        src={memory.photos[0].url}
                                                        alt={memory.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}

                                            <div className="p-4">
                                                <div className="flex items-start justify-between mb-2">
                                                    <h4 className="font-semibold text-gray-900">{memory.title}</h4>
                                                    {memory.rating && (
                                                        <div className="flex items-center space-x-1">
                                                            <Star className="w-4 h-4 text-yellow-400 fill-current"/>
                                                            <span
                                                                className="text-sm text-gray-600">{memory.rating}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <p className="text-gray-600 text-sm mb-3 line-clamp-2">{memory.description}</p>

                                                <div
                                                    className="flex items-center justify-between text-xs text-gray-500">
                                                    <span>{new Date(memory.memory_date || memory.created_at).toLocaleDateString()}</span>
                                                    <span
                                                        className="bg-gray-100 px-2 py-1 rounded">{memory.memory_type || memory.type}</span>
                                                </div>

                                                {memory.tags && memory.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {memory.tags.slice(0, 3).map((tag, index) => (
                                                            <span key={index}
                                                                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                {tag}
                              </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Camera className="w-16 h-16 text-gray-300 mx-auto mb-4"/>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No memories yet</h3>
                                    <p className="text-gray-500 mb-4">Start capturing your travel experiences!</p>
                                    <button
                                        onClick={() => setShowCreateMemory(true)}
                                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                                    >
                                        Create First Memory
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Travel Story Tab */}
                    {activeTab === 'story' && (
                        <div>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold">AI-Generated Travel Story</h3>
                                <div className="flex space-x-2">
                                    <select
                                        onChange={(e) => generateTravelStory(e.target.value || null)}
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    >
                                        <option value="">All trips</option>
                                        {trips.map(trip => (
                                            <option key={trip.id} value={trip.id}>{trip.title}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => generateTravelStory()}
                                        disabled={loadingStory}
                                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center space-x-2"
                                    >
                                        {loadingStory ? (
                                            <div
                                                className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        ) : (
                                            <Book className="w-4 h-4"/>
                                        )}
                                        <span>{loadingStory ? 'Generating...' : 'Generate Story'}</span>
                                    </button>
                                </div>
                            </div>

                            {travelStory ? (
                                <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-8">
                                    <div className="prose max-w-none">
                                        <div className="mb-6">
                                            <h4 className="text-xl font-bold text-gray-900 mb-2">Your Travel
                                                Journey</h4>
                                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                <span>{travelStory.memories?.length || 0} memories</span>
                                                <span>{travelStory.wordCount} words</span>
                                                <span>Generated {new Date(travelStory.generatedAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                                            {travelStory.story}
                                        </div>

                                        <div className="mt-8 flex space-x-3">
                                            <button
                                                onClick={() => {
                                                    sendChatMessage("Help me improve this travel story");
                                                    setChatOpen(true);
                                                }}
                                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                                            >
                                                Improve Story
                                            </button>
                                            <button
                                                onClick={() => {
                                                    sendChatMessage("Create a shorter version of this story for social media");
                                                    setChatOpen(true);
                                                }}
                                                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                                            >
                                                Social Media Version
                                            </button>
                                            <button
                                                onClick={() => navigator.share && navigator.share({
                                                    title: 'My Travel Story',
                                                    text: travelStory.story
                                                })}
                                                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                                            >
                                                Share Story
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Book className="w-16 h-16 text-gray-300 mx-auto mb-4"/>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No travel story yet</h3>
                                    <p className="text-gray-500 mb-4">Generate an AI-powered narrative of your
                                        travels!</p>
                                    <button
                                        onClick={() => generateTravelStory()}
                                        disabled={loadingStory || memories.length === 0}
                                        className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                    >
                                        Generate Travel Story
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Insights Tab */}
                    {activeTab === 'insights' && (
                        <div>
                            <h3 className="text-lg font-semibold mb-6">Travel Insights & Recommendations</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Travel Patterns */}
                                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6">
                                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                                        <TrendingUp className="w-5 h-5 mr-2 text-blue-600"/>
                                        Travel Patterns
                                    </h4>
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-sm text-gray-600">Preferred Season</p>
                                            <p className="font-medium">Summer (60% of trips)</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Favorite Activity Type</p>
                                            <p className="font-medium">Cultural Experiences</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Average Trip Duration</p>
                                            <p className="font-medium">7 days</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Budget Range</p>
                                            <p className="font-medium">$1,000 - $2,500</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Recommendations */}
                                <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-6">
                                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                                        <Globe className="w-5 h-5 mr-2 text-green-600"/>
                                        Next Destination Ideas
                                    </h4>
                                    <div className="space-y-3">
                                        {[
                                            {
                                                destination: 'Iceland',
                                                reason: 'Perfect for your love of nature and photography',
                                                match: '95%'
                                            },
                                            {
                                                destination: 'Morocco',
                                                reason: 'Great cultural experiences and food',
                                                match: '88%'
                                            },
                                            {
                                                destination: 'New Zealand',
                                                reason: 'Adventure activities and stunning landscapes',
                                                match: '82%'
                                            }
                                        ].map((rec, index) => (
                                            <div key={index} className="border border-gray-200 rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h5 className="font-medium text-gray-900">{rec.destination}</h5>
                                                    <span
                                                        className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded">
                            {rec.match} match
                          </span>
                                                </div>
                                                <p className="text-sm text-gray-600">{rec.reason}</p>
                                                <button
                                                    onClick={() => {
                                                        sendChatMessage(`Tell me more about traveling to ${rec.destination}`);
                                                        setChatOpen(true);
                                                    }}
                                                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                                                >
                                                    Learn more →
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* AI Insights */}
                            <div className="mt-8 bg-white border border-gray-200 rounded-lg p-6">
                                <h4 className="font-semibold text-gray-900 mb-4">AI Travel Personality Analysis</h4>
                                <div className="prose max-w-none text-gray-700">
                                    <p>
                                        Based on your travel memories and preferences, you're a <strong>Cultural
                                        Explorer</strong> who enjoys
                                        immersive experiences that blend local culture, history, and cuisine. You
                                        tend to prefer moderate
                                        budgets with occasional splurges on unique experiences, and you value
                                        authentic connections with
                                        local communities.
                                    </p>
                                    <p>
                                        Your travel style suggests you'd enjoy destinations with rich cultural
                                        heritage, diverse food scenes,
                                        and opportunities for both structured activities and spontaneous
                                        exploration. Consider adding more
                                        off-the-beaten-path destinations to your future plans.
                                    </p>
                                </div>

                                <div className="mt-4 flex space-x-3">
                                    <button
                                        onClick={() => {
                                            sendChatMessage("Analyze my travel personality and give me personalized recommendations");
                                            setChatOpen(true);
                                        }}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                                    >
                                        Deep Dive Analysis
                                    </button>
                                    <button
                                        onClick={() => {
                                            sendChatMessage("What destinations would be perfect for my travel style?");
                                            setChatOpen(true);
                                        }}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                                    >
                                        Get Recommendations
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showCreateMemory && <CreateMemoryModal/>}
        </div>
    );
};

// ===================================
// AI CHAT COMPONENT
// ===================================
// ===================================
// AI CHAT COMPONENT
// ===================================
const AIChat = ({isOpen, onClose, messages, onSendMessage, currentMode, connected}) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim()) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    const quickActions = {
        planning: [
            'Help me plan a weekend trip',
            'Find cheap flights to my destination',
            'Recommend budget hotels',
            'Compare flight prices',
            'Show me hotel deals'
        ],
        companion: [
            'Find restaurants near me',
            'What\'s the weather like?',
            'Translate this phrase',
            'Get directions',
            'Book a nearby hotel'
        ],
        memory: [
            'Help me write about this experience',
            'Suggest photo captions',
            'Create a travel story',
            'Analyze my travel patterns'
        ]
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-end z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-md h-[600px] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                            <MessageCircle className="w-4 h-4"/>
                        </div>
                        <div>
                            <h3 className="font-semibold">AI Travel Assistant</h3>
                            <div className="flex items-center space-x-2 text-xs">
                                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                <span>{connected ? 'Connected' : 'Demo Mode'}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-white/80 transition-colors p-1 hover:bg-white/10 rounded"
                        aria-label="Close chat"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-500">
                            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3"/>
                            <p className="text-sm mb-4">
                                Hi! I&apos;m your AI travel assistant. I can help you with planning, real-time assistance, and memory creation.
                            </p>
                            <div className="text-left">
                                <p className="text-xs font-medium text-gray-700 mb-2">Quick actions for {currentMode} mode:</p>
                                <div className="space-y-1">
                                    {quickActions[currentMode]?.slice(0, 3).map((action, index) => (
                                        <button
                                            key={index}
                                            onClick={() => onSendMessage(action)}
                                            className="block w-full text-left text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors"
                                        >
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {messages.map((message, index) => (
                        <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-3 rounded-lg ${
                                message.type === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                            }`}>
                                <div className="text-sm whitespace-pre-wrap break-words">
                                    {message.content}
                                </div>
                                <div className="flex items-center justify-between mt-2 text-xs opacity-70">
                                    <span>{message.timestamp.toLocaleTimeString()}</span>
                                    {message.model && message.type === 'ai' && (
                                        <span className="bg-black/10 px-1 rounded text-xs">{message.model}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef}/>
                </div>

                {/* Input */}
                <div className="p-4 border-t bg-gray-50 rounded-b-xl flex-shrink-0">
                    <form onSubmit={handleSubmit} className="flex space-x-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                            placeholder="Ask me anything..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm"
                            autoComplete="off"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        >
                            Send
                        </button>
                    </form>

                    {quickActions[currentMode] && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {quickActions[currentMode].slice(0, 2).map((action, index) => (
                                <button
                                    key={index}
                                    onClick={() => onSendMessage(action)}
                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                                >
                                    {action}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ===================================
// FLOATING CHAT BUTTON
// ===================================
const FloatingChatButton = ({onClick}) => {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-40 group"
            aria-label="Open AI Chat"
        >
            <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform"/>
            <div className="absolute -top-2 -right-2 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
        </button>
    );
};

export default App;
