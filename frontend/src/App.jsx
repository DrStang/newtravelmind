// ===================================
// frontend/src/App.jsx - Part 1: Main App and Authentication
// ===================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    MessageCircle, MapPin, Plane, Calendar, Star, Camera,
    Navigation, Cloud, Sun, CloudRain, Settings, User,
    TrendingUp, Clock, Heart, Globe, Zap, Book, X
} from 'lucide-react';
import io from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

// ===================================
// AUTHENTICATION HOOK
// ===================================
const useAuth = () => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            // For demo, set a mock user
            setUser({
                id: 1,
                name: 'Demo User',
                email: 'demo@travelmind.ai',
                preferences: ['culture', 'food', 'sightseeing'],
                travelStyle: 'moderate'
            });
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
const useSocket = (token) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (token) {
      // Determine the correct backend URL
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      const WS_URL = API_BASE_URL.replace('/api', ''); // Remove /api suffix for socket connection
      
      console.log('Connecting to Socket.IO at:', WS_URL);

      const newSocket = io(WS_URL, {
        auth: { token },
        transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
        withCredentials: true,
        forceNew: true,
        timeout: 20000,
        // Additional options for better connectivity
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        maxReconnectionAttempts: 5
      });

      // Enhanced event listeners
      newSocket.on('connect', () => {
        setConnected(true);
        console.log('✅ Socket connected successfully');
        console.log('Socket ID:', newSocket.id);
      });

      newSocket.on('disconnect', (reason) => {
        setConnected(false);
        console.log('❌ Socket disconnected:', reason);
      });

      newSocket.on('connect_error', (error) => {
        setConnected(false);
        console.error('🔴 Socket connection error:', error);
        
        // Provide helpful error messages
        if (error.message.includes('CORS')) {
          console.error('CORS Error: Check backend CORS configuration');
        } else if (error.message.includes('timeout')) {
          console.error('Timeout Error: Backend might be slow to respond');
        } else if (error.message.includes('403')) {
          console.error('Auth Error: Check JWT token');
        }
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
        setConnected(true);
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('🔴 Socket reconnection error:', error);
      });

      newSocket.on('ai_response', (data) => {
        setChatMessages(prev => [...prev, {
          type: 'ai',
          content: data.success ? data.data.message : data.fallback,
          timestamp: new Date(),
          model: data.data?.model
        }]);
      });

      newSocket.on('location_context', (data) => {
        setNearbyPlaces(data.nearbyRecommendations || []);
      });

      setSocket(newSocket);

      return () => {
        console.log('🔌 Cleaning up socket connection');
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
    const { socket, connected } = useSocket(token);

    const [currentMode, setCurrentMode] = useState('planning');
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [trips, setTrips] = useState([]);
    const [memories, setMemories] = useState([]);
    const [nearbyPlaces, setNearbyPlaces] = useState([]);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [dashboardData, setDashboardData] = useState(null);

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
            const response = await fetch(`${API_BASE_URL}/trips?limit=10`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setTrips(data.data);
                // Set active trip as current
                const activeTrip = data.data.find(trip => trip.status === 'active');
                if (activeTrip) setCurrentTrip(activeTrip);
            }
        } catch (error) {
            console.error('Trips load error:', error);
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

    const sendChatMessage = (message) => {
        const userMessage = {
            type: 'user',
            content: message,
            timestamp: new Date()
        };

        setChatMessages(prev => [...prev, userMessage]);

        if (socket) {
            socket.emit('ai_chat', {
                message,
                context: {
                    mode: currentMode,
                    location: location,
                    weather: weather,
                    currentTrip: currentTrip,
                    userPreferences: user?.preferences
                }
            });
        } else {
            // Mock AI response for demo
            setTimeout(() => {
                setChatMessages(prev => [...prev, {
                    type: 'ai',
                    content: `I understand you're asking about "${message}". I'd be happy to help with your travel needs!`,
                    timestamp: new Date(),
                    model: 'demo'
                }]);
            }, 1000);
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
                    />
                )}

                {currentMode === 'companion' && (
                    <CompanionMode
                        user={user}
                        token={token}
                        location={location}
                        weather={weather}
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
const Header = ({ user, logout, currentMode, setCurrentMode, connected, location, weather }) => {
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
};

// ===================================
// PLANNING MODE COMPONENT
// ===================================
const PlanningMode = ({ user, token, trips, setTrips, setCurrentTrip, sendChatMessage }) => {
    const [isCreating, setIsCreating] = useState(false);
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

    const interestOptions = [
        'Adventure', 'Culture', 'Food', 'History', 'Nature', 'Nightlife',
        'Photography', 'Relaxation', 'Shopping', 'Sports'
    ];

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

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    const newTrip = {
                        id: Date.now(),
                        title: `${formData.destination} Trip`,
                        destination: formData.destination,
                        duration: parseInt(formData.duration),
                        budget: parseFloat(formData.budget),
                        status: 'planning',
                        startDate: formData.startDate,
                        endDate: formData.endDate,
                        interests: formData.interests
                    };

                    setTrips(prev => [newTrip, ...prev]);
                    setCurrentTrip(newTrip);
                    setIsCreating(false);
                    setFormData({
                        destination: '',
                        duration: '',
                        budget: '',
                        startDate: '',
                        endDate: '',
                        travelStyle: user?.travelStyle || 'moderate',
                        interests: []
                    });

                    sendChatMessage(`I just created a new itinerary for ${formData.destination}! Can you give me some additional tips?`);
                }
            } else {
                // Create trip anyway for demo
                const newTrip = {
                    id: Date.now(),
                    title: `${formData.destination} Trip`,
                    destination: formData.destination,
                    duration: parseInt(formData.duration),
                    budget: parseFloat(formData.budget),
                    status: 'planning',
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    interests: formData.interests
                };

                setTrips(prev => [newTrip, ...prev]);
                setCurrentTrip(newTrip);
                setIsCreating(false);
                setFormData({
                    destination: '',
                    duration: '',
                    budget: '',
                    startDate: '',
                    endDate: '',
                    travelStyle: user?.travelStyle || 'moderate',
                    interests: []
                });

                sendChatMessage(`I just created a new itinerary for ${formData.destination}! Can you give me some additional tips?`);
            }
        } catch (error) {
            console.error('Trip creation error:', error);
            // Still create for demo
            const newTrip = {
                id: Date.now(),
                title: `${formData.destination} Trip`,
                destination: formData.destination,
                duration: parseInt(formData.duration),
                budget: parseFloat(formData.budget),
                status: 'planning',
                startDate: formData.startDate,
                endDate: formData.endDate,
                interests: formData.interests
            };

            setTrips(prev => [newTrip, ...prev]);
            setCurrentTrip(newTrip);
            setIsCreating(false);
            setFormData({
                destination: '',
                duration: '',
                budget: '',
                startDate: '',
                endDate: '',
                travelStyle: user?.travelStyle || 'moderate',
                interests: []
            });
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

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Trip Planning</h2>
                <p className="text-gray-600">Create your perfect itinerary with AI assistance</p>
            </div>

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
                                                    Destination
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
                                                    Duration (days)
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

                                {/* Recent Trips */}
                                {!isCreating && (
                                    <div className="space-y-4">
                                        <h4 className="text-lg font-semibold text-gray-900">Your Recent Trips</h4>
                                        {trips.length > 0 ? trips.slice(0, 3).map(trip => (
                                            <div key={trip.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <h5 className="font-semibold text-gray-900">{trip.title}</h5>
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
                                                        onClick={() => setCurrentTrip(trip)}
                                                        className="text-blue-600 hover:text-blue-700 text-sm"
                                                    >
                                                        View Details
                                                    </button>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-8 text-gray-500">
                                                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                                <p>No trips yet. Create your first trip!</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                        </div>
                    </div>

                    {/* Quick Actions & Info */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                            <div className="space-y-3">
                                <button
                                    onClick={() => sendChatMessage("Help me plan a weekend getaway")}
                                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center space-x-3">
                                        <Calendar className="w-5 h-5 text-blue-600" />
                                        <span>Weekend Getaway</span>
                                    </div>
                                </button>

                                <button
                                    onClick={() => sendChatMessage("Find flights for my next trip")}
                                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center space-x-3">
                                        <Plane className="w-5 h-5 text-blue-600" />
                                        <span>Find Flights</span>
                                    </div>
                                </button>

                                <button
                                    onClick={() => sendChatMessage("Recommend hotels in my destination")}
                                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center space-x-3">
                                        <Star className="w-5 h-5 text-blue-600" />
                                        <span>Find Hotels</span>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Budget Insights */}
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Insights</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Average Trip Cost</span>
                                    <span className="font-semibold">$1,200</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Budget Saved</span>
                                    <span className="font-semibold text-green-600">15%</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Best Time to Book</span>
                                    <span className="font-semibold">6-8 weeks ahead</span>
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
const CompanionMode = ({ user, token, location, weather, nearbyPlaces, currentTrip, sendChatMessage }) => {
    const [selectedPlaceType, setSelectedPlaceType] = useState('restaurant');
    const [searchRadius, setSearchRadius] = useState(1000);
    const [loading, setLoading] = useState(false);
    const [places, setPlaces] = useState(nearbyPlaces || []);
    const [currentActivity, setCurrentActivity] = useState(null);

    const placeTypes = [
        { value: 'restaurant', label: 'Restaurants', icon: '🍽️' },
        { value: 'tourist_attraction', label: 'Attractions', icon: '🏛️' },
        { value: 'lodging', label: 'Hotels', icon: '🏨' },
        { value: 'shopping_mall', label: 'Shopping', icon: '🛍️' },
        { value: 'hospital', label: 'Healthcare', icon: '🏥' },
        { value: 'gas_station', label: 'Gas Stations', icon: '⛽' }
    ];

    // Demo nearby places data
    const demoPlaces = {
        restaurant: [
            { id: 1, name: 'La Boquería Market', rating: 4.5, address: 'La Rambla, 91', priceLevel: 2, openNow: true, types: ['food', 'market'] },
            { id: 2, name: 'Cal Pep', rating: 4.3, address: 'Plaça de les Olles, 8', priceLevel: 3, openNow: true, types: ['restaurant', 'spanish'] },
            { id: 3, name: 'Bar del Pla', rating: 4.4, address: 'Carrer de Montcada, 2', priceLevel: 2, openNow: false, types: ['bar', 'tapas'] }
        ],
        tourist_attraction: [
            { id: 4, name: 'Sagrada Família', rating: 4.7, address: 'Carrer de Mallorca, 401', priceLevel: 3, openNow: true, types: ['church', 'landmark'] },
            { id: 5, name: 'Park Güell', rating: 4.6, address: 'Carrer d\'Olot', priceLevel: 2, openNow: true, types: ['park', 'gaudi'] },
            { id: 6, name: 'Gothic Quarter', rating: 4.5, address: 'Barri Gòtic', priceLevel: 1, openNow: true, types: ['neighborhood', 'historic'] }
        ],
        lodging: [
            { id: 7, name: 'Hotel Casa Fuster', rating: 4.4, address: 'Passeig de Gràcia, 132', priceLevel: 4, openNow: true, types: ['hotel', 'luxury'] },
            { id: 8, name: 'Generator Barcelona', rating: 4.2, address: 'Carrer de Còrsega, 377', priceLevel: 2, openNow: true, types: ['hostel', 'budget'] }
        ]
    };

    const searchNearbyPlaces = async (type = selectedPlaceType) => {
        if (!location) {
            // Use demo data
            setPlaces(demoPlaces[type] || []);
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(
                `${API_BASE_URL}/places/nearby?lat=${location.lat}&lng=${location.lng}&type=${type}&radius=${searchRadius}&opennow=true`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setPlaces(data.data);
                } else {
                    setPlaces(demoPlaces[type] || []);
                }
            } else {
                setPlaces(demoPlaces[type] || []);
            }
        } catch (error) {
            console.error('Places search error:', error);
            setPlaces(demoPlaces[type] || []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (nearbyPlaces && nearbyPlaces.length > 0) {
            setPlaces(nearbyPlaces);
        } else {
            setPlaces(demoPlaces[selectedPlaceType] || []);
        }
    }, [nearbyPlaces, selectedPlaceType]);

    useEffect(() => {
        searchNearbyPlaces();
    }, [selectedPlaceType, searchRadius]);

    // Mock current activity for demo
    useEffect(() => {
        if (currentTrip) {
            setCurrentActivity({
                title: 'Exploring Gothic Quarter',
                time: '2:30 PM - 5:00 PM',
                status: 'active',
                next: 'Dinner at Cal Pep (7:00 PM)'
            });
        }
    }, [currentTrip]);

    const getWeatherRecommendation = () => {
        if (!weather) return null;

        if (weather.condition?.toLowerCase().includes('rain')) {
            return {
                type: 'warning',
                message: 'Rain expected - consider indoor activities',
                suggestions: ['Museums', 'Shopping centers', 'Cafes']
            };
        }

        if (weather.temperature > 30) {
            return {
                type: 'info',
                message: 'Hot weather - stay hydrated and seek shade',
                suggestions: ['Parks with shade', 'Air-conditioned venues', 'Swimming']
            };
        }

        return {
            type: 'success',
            message: 'Perfect weather for exploring!',
            suggestions: ['Outdoor activities', 'Walking tours', 'Street food']
        };
    };

    const weatherRec = getWeatherRecommendation();

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Travel Companion</h2>
                <p className="text-gray-600">Real-time assistance for your current location</p>
            </div>

            {/* Current Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Location Card */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <MapPin className="w-6 h-6 text-blue-600" />
                        <h3 className="text-lg font-semibold">Current Location</h3>
                    </div>
                    {location ? (
                        <div className="space-y-2">
                            <p className="text-gray-600">Barcelona, Spain</p>
                            <p className="text-sm text-gray-500">
                                {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                            </p>
                            <p className="text-sm text-gray-500">
                                Accuracy: ±{location.accuracy?.toFixed(0) || '50'}m
                            </p>
                            <button
                                onClick={() => sendChatMessage("What's interesting around my current location?")}
                                className="text-sm text-blue-600 hover:text-blue-700"
                            >
                                Explore this area →
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-gray-600">Barcelona, Spain (Demo)</p>
                            <p className="text-sm text-gray-500">Enable location for real-time features</p>
                            <button
                                onClick={() => {
                                    if (navigator.geolocation) {
                                        navigator.geolocation.getCurrentPosition(
                                            (position) => {
                                                window.location.reload();
                                            }
                                        );
                                    }
                                }}
                                className="text-sm text-blue-600 hover:text-blue-700"
                            >
                                Enable Location →
                            </button>
                        </div>
                    )}
                </div>

                {/* Weather Card */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <Cloud className="w-6 h-6 text-blue-600" />
                        <h3 className="text-lg font-semibold">Weather</h3>
                    </div>
                    {weather ? (
                        <div className="space-y-2">
                            <p className="text-2xl font-bold">{Math.round(weather.temperature)}°C</p>
                            <p className="text-gray-600 capitalize">{weather.description}</p>
                            <p className="text-sm text-gray-500">
                                Humidity: {weather.humidity}% | Wind: {weather.windSpeed} m/s
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-2xl font-bold">22°C</p>
                            <p className="text-gray-600">Partly cloudy</p>
                            <p className="text-sm text-gray-500">
                                Humidity: 65% | Wind: 3.2 m/s
                            </p>
                        </div>
                    )}
                </div>

                {/* Current Activity Card */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <Clock className="w-6 h-6 text-blue-600" />
                        <h3 className="text-lg font-semibold">Current Activity</h3>
                    </div>
                    {currentActivity ? (
                        <div className="space-y-2">
                            <p className="font-medium">{currentActivity.title}</p>
                            <p className="text-gray-600 text-sm">{currentActivity.time}</p>
                            <span className="inline-block px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                                {currentActivity.status}
                            </span>
                            <p className="text-sm text-gray-500 mt-2">
                                Next: {currentActivity.next}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-gray-500">No scheduled activity</p>
                            <button
                                onClick={() => sendChatMessage("What should I do right now?")}
                                className="text-sm text-blue-600 hover:text-blue-700"
                            >
                                Get suggestions →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Weather Recommendation */}
            {weatherRec && (
                <div className={`mb-8 p-4 rounded-lg border-l-4 ${
                    weatherRec.type === 'warning' ? 'bg-yellow-50 border-yellow-400' :
                        weatherRec.type === 'info' ? 'bg-blue-50 border-blue-400' :
                            'bg-green-50 border-green-400'
                }`}>
                    <div className="flex items-start space-x-3">
                        <div className="flex-1">
                            <p className="font-medium text-gray-900">{weatherRec.message}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {weatherRec.suggestions.map((suggestion, index) => (
                                    <button
                                        key={index}
                                        onClick={() => sendChatMessage(`Find ${suggestion.toLowerCase()} near me`)}
                                        className="text-xs bg-white px-2 py-1 rounded border hover:bg-gray-50"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Place Type Selector */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl shadow-lg p-6 sticky top-24">
                        <h3 className="text-lg font-semibold mb-4">Find Nearby</h3>

                        <div className="space-y-2 mb-6">
                            {placeTypes.map(type => (
                                <button
                                    key={type.value}
                                    onClick={() => setSelectedPlaceType(type.value)}
                                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center space-x-3 ${
                                        selectedPlaceType === type.value
                                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                            : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <span className="text-xl">{type.icon}</span>
                                    <span>{type.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Search Radius
                            </label>
                            <select
                                value={searchRadius}
                                onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value={500}>500m</option>
                                <option value={1000}>1km</option>
                                <option value={2000}>2km</option>
                                <option value={5000}>5km</option>
                            </select>
                        </div>

                        <button
                            onClick={() => searchNearbyPlaces()}
                            disabled={loading}
                            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Searching...' : 'Refresh'}
                        </button>

                        {!location && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-sm text-yellow-700">
                                    📍 Using demo data. Enable location for real nearby places.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Places List */}
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold">
                                Nearby {placeTypes.find(t => t.value === selectedPlaceType)?.label}
                            </h3>
                            <span className="text-sm text-gray-500">
                                {places.length} results within {searchRadius}m
                            </span>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                <span className="ml-3 text-gray-600">Finding places...</span>
                            </div>
                        ) : places.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {places.map((place, index) => (
                                    <div key={place.id || index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-gray-800 mb-1">{place.name}</h4>
                                                <p className="text-sm text-gray-600 mb-2">{place.address}</p>

                                                <div className="flex items-center space-x-3 mb-2">
                                                    {place.rating && (
                                                        <div className="flex items-center space-x-1">
                                                            <Star className="w-4 h-4 text-yellow-400 fill-current" />
                                                            <span className="text-sm text-gray-700">{place.rating}</span>
                                                            {place.userRatingsTotal && (
                                                                <span className="text-xs text-gray-500">({place.userRatingsTotal})</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {place.priceLevel && (
                                                        <span className="text-sm text-gray-600">
                                                            {'$'.repeat(place.priceLevel)}
                                                        </span>
                                                    )}

                                                    {place.openNow !== undefined && (
                                                        <span className={`text-xs px-2 py-1 rounded-full ${
                                                            place.openNow ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                        }`}>
                                                            {place.openNow ? 'Open' : 'Closed'}
                                                        </span>
                                                    )}
                                                </div>

                                                {place.types && (
                                                    <div className="flex flex-wrap gap-1 mb-3">
                                                        {place.types.slice(0, 3).map((type, i) => (
                                                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                                                {type.replace(/_/g, ' ')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => sendChatMessage(`Tell me more about ${place.name}`)}
                                                className="flex-1 bg-blue-100 text-blue-700 py-2 rounded text-sm hover:bg-blue-200 transition-colors"
                                            >
                                                Ask AI
                                            </button>
                                            <button
                                                onClick={() => sendChatMessage(`Get directions to ${place.name}`)}
                                                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded text-sm hover:bg-gray-200 transition-colors"
                                            >
                                                Directions
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                {location ? 'No places found nearby' : 'Enable location to find places'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ===================================
// MEMORY MODE COMPONENT - FIXED
// ===================================
const MemoryMode = ({ user, token, memories, setMemories, trips, dashboardData, sendChatMessage }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [showCreateMemory, setShowCreateMemory] = useState(false);
    const [travelStory, setTravelStory] = useState(null);
    const [loadingStory, setLoadingStory] = useState(false);

    const tabs = [
        { id: 'overview', label: 'Overview', icon: TrendingUp },
        { id: 'memories', label: 'Memories', icon: Camera },
        { id: 'story', label: 'Travel Story', icon: Book },
        { id: 'insights', label: 'Insights', icon: Globe }
    ];

    const generateTravelStory = async (tripId = null) => {
        setLoadingStory(true);
        try {
            const url = tripId ? `${API_BASE_URL}/memories/story/${tripId}` : `${API_BASE_URL}/memories/story`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
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
                    headers: { Authorization: `Bearer ${token}` },
                    body: submitData
                });

                const data = await response.json();

                if (data.success) {
                    setMemories(prev => [data.data, ...prev]);
                    setShowCreateMemory(false);
                    sendChatMessage(`I just created a new memory: ${formData.title}. Can you help me reflect on this experience?`);
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
                                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
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
                                        onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
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
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
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
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
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
                                                onClick={() => setFormData(prev => ({ ...prev, rating: star }))}
                                                className={`w-8 h-8 ${star <= formData.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                                            >
                                                <Star className="w-full h-full fill-current" />
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
                                        onChange={(e) => setFormData(prev => ({ ...prev, tripId: e.target.value }))}
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
                        <Camera className="w-5 h-5" />
                        <span>Add Memory</span>
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-xl shadow-lg mb-8">
                <div className="border-b border-gray-200">
                    <nav className="flex space-x-8 px-6">
                        {tabs.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center space-x-2 py-4 border-b-2 transition-colors ${
                                    activeTab === id
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <Icon className="w-5 h-5" />
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
                                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-blue-100 text-sm">Total Trips</p>
                                            <p className="text-3xl font-bold">{dashboardData?.trips?.total_trips || 0}</p>
                                        </div>
                                        <Plane className="w-8 h-8 text-blue-200" />
                                    </div>
                                </div>

                                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-green-100 text-sm">Memories</p>
                                            <p className="text-3xl font-bold">{dashboardData?.memories?.total_memories || memories.length}</p>
                                        </div>
                                        <Camera className="w-8 h-8 text-green-200" />
                                    </div>
                                </div>

                                <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-purple-100 text-sm">Avg Rating</p>
                                            <p className="text-3xl font-bold">{dashboardData?.memories?.avg_rating?.toFixed(1) || '4.8'}</p>
                                        </div>
                                        <Star className="w-8 h-8 text-purple-200" />
                                    </div>
                                </div>

                                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-orange-100 text-sm">Active Days</p>
                                            <p className="text-3xl font-bold">{dashboardData?.memories?.active_days || '12'}</p>
                                        </div>
                                        <Clock className="w-8 h-8 text-orange-200" />
                                    </div>
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                                <div className="space-y-3">
                                    {dashboardData?.recentActivity?.slice(0, 5).map((activity, index) => (
                                        <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                                            <div className={`w-2 h-2 rounded-full ${activity.type === 'memory' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
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
                                        <div key={memory.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
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
                                                            <Star className="w-4 h-4 text-yellow-400 fill-current" />
                                                            <span className="text-sm text-gray-600">{memory.rating}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <p className="text-gray-600 text-sm mb-3 line-clamp-2">{memory.description}</p>

                                                <div className="flex items-center justify-between text-xs text-gray-500">
                                                    <span>{new Date(memory.memory_date || memory.created_at).toLocaleDateString()}</span>
                                                    <span className="bg-gray-100 px-2 py-1 rounded">{memory.memory_type || memory.type}</span>
                                                </div>

                                                {memory.tags && memory.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {memory.tags.slice(0, 3).map((tag, index) => (
                                                            <span key={index} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
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
                                    <Camera className="w-16 h-16 text-gray-300 mx-auto mb-4" />
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
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        ) : (
                                            <Book className="w-4 h-4" />
                                        )}
                                        <span>{loadingStory ? 'Generating...' : 'Generate Story'}</span>
                                    </button>
                                </div>
                            </div>

                            {travelStory ? (
                                <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-8">
                                    <div className="prose max-w-none">
                                        <div className="mb-6">
                                            <h4 className="text-xl font-bold text-gray-900 mb-2">Your Travel Journey</h4>
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
                                                onClick={() => sendChatMessage("Help me improve this travel story")}
                                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                                            >
                                                Improve Story
                                            </button>
                                            <button
                                                onClick={() => sendChatMessage("Create a shorter version of this story for social media")}
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
                                    <Book className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No travel story yet</h3>
                                    <p className="text-gray-500 mb-4">Generate an AI-powered narrative of your travels!</p>
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
                                        <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
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
                                        <Globe className="w-5 h-5 mr-2 text-green-600" />
                                        Next Destination Ideas
                                    </h4>
                                    <div className="space-y-3">
                                        {[
                                            { destination: 'Iceland', reason: 'Perfect for your love of nature and photography', match: '95%' },
                                            { destination: 'Morocco', reason: 'Great cultural experiences and food', match: '88%' },
                                            { destination: 'New Zealand', reason: 'Adventure activities and stunning landscapes', match: '82%' }
                                        ].map((rec, index) => (
                                            <div key={index} className="border border-gray-200 rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h5 className="font-medium text-gray-900">{rec.destination}</h5>
                                                    <span className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded">
                            {rec.match} match
                          </span>
                                                </div>
                                                <p className="text-sm text-gray-600">{rec.reason}</p>
                                                <button
                                                    onClick={() => sendChatMessage(`Tell me more about traveling to ${rec.destination}`)}
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
                                        Based on your travel memories and preferences, you're a <strong>Cultural Explorer</strong> who enjoys
                                        immersive experiences that blend local culture, history, and cuisine. You tend to prefer moderate
                                        budgets with occasional splurges on unique experiences, and you value authentic connections with
                                        local communities.
                                    </p>
                                    <p>
                                        Your travel style suggests you'd enjoy destinations with rich cultural heritage, diverse food scenes,
                                        and opportunities for both structured activities and spontaneous exploration. Consider adding more
                                        off-the-beaten-path destinations to your future plans.
                                    </p>
                                </div>

                                <div className="mt-4 flex space-x-3">
                                    <button
                                        onClick={() => sendChatMessage("Analyze my travel personality and give me personalized recommendations")}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                                    >
                                        Deep Dive Analysis
                                    </button>
                                    <button
                                        onClick={() => sendChatMessage("What destinations would be perfect for my travel style?")}
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

            {showCreateMemory && <CreateMemoryModal />}
        </div>
    );
};

// ===================================
// AI CHAT COMPONENT
// ===================================
const AIChat = ({ isOpen, onClose, messages, onSendMessage, currentMode, connected }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
            'Find flights to my destination',
            'Recommend hotels',
            'Create a budget estimate'
        ],
        companion: [
            'Find restaurants near me',
            'What\'s the weather like?',
            'Translate this phrase',
            'Get directions'
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
                            <MessageCircle className="w-4 h-4" />
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
                        className="text-white/80 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-500">
                            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm mb-4">
                                Hi! I'm your AI travel assistant. I can help you with planning, real-time assistance, and memory creation.
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
                        <div
                            key={index}
                            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] p-3 rounded-lg ${
                                    message.type === 'user'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-800'
                                }`}
                            >
                                <div className="text-sm whitespace-pre-wrap break-words">
                                    {message.content}
                                </div>
                                <div className="flex items-center justify-between mt-2 text-xs opacity-70">
                                    <span>{message.timestamp.toLocaleTimeString()}</span>
                                    {message.model && message.type === 'ai' && (
                                        <span className="bg-black/10 px-1 rounded text-xs">
                                            {message.model}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSubmit} className="p-4 border-t bg-gray-50 rounded-b-xl">
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask me anything..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Send
                        </button>
                    </div>

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
                </form>
            </div>
        </div>
    );
};

// ===================================
// FLOATING CHAT BUTTON
// ===================================
const FloatingChatButton = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-40 group"
            aria-label="Open AI Chat"
        >
            <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <div className="absolute -top-2 -right-2 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
        </button>
    );
};

export default App;

