import React, { useState, useEffect } from 'react';
import { Search, Plane, MapPin, X, Globe } from 'lucide-react';

const AirportLookupModal = ({ isOpen, onClose, onSelect, fieldName }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const timer = setTimeout(() => {
        searchAirports();
      }, 500); // Debounce search

      return () => clearTimeout(timer);
    } else {
      setAirports([]);
    }
  }, [searchTerm]);

  const searchAirports = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/airports/search?keyword=${encodeURIComponent(searchTerm)}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const data = await response.json();

      if (data.success) {
        setAirports(data.data);
        if (data.data.length === 0) {
          setError('No airports found. Try a different search term.');
        }
      } else {
        setError(data.error || 'Failed to search airports');
      }
    } catch (err) {
      console.error('Airport search error:', err);
      setError('Failed to search airports');
    } finally {
      setLoading(false);
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
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Plane className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Find Airport Code</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by city or airport name (e.g., 'New York', 'JFK', 'London')"
              className="w-full pl-10 pr-4 py-3 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <p className="text-white/80 text-sm mt-2">
            Search for airports by city name, airport name, or code
          </p>
        </div>

        {/* Results */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Searching airports...</span>
            </div>
          )}

          {error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
              {error}
            </div>
          )}

          {!loading && !error && searchTerm.length < 2 && (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Start typing to search
              </h3>
              <p className="text-gray-500 mb-4">
                Enter at least 2 characters to search for airports
              </p>
              <div className="bg-blue-50 rounded-lg p-4 text-left max-w-md mx-auto">
                <p className="font-medium text-blue-900 mb-2">Examples:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• "New York" - finds JFK, LGA, EWR</li>
                  <li>• "Los Angeles" - finds LAX</li>
                  <li>• "London" - finds LHR, LGW, STN</li>
                  <li>• "Paris" - finds CDG, ORY</li>
                </ul>
              </div>
            </div>
          )}

          {!loading && !error && airports.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 mb-3">
                Found {airports.length} airport{airports.length !== 1 ? 's' : ''}
              </p>
              {airports.map((airport) => (
                <button
                  key={airport.id}
                  onClick={() => handleSelect(airport)}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="bg-blue-600 text-white px-3 py-1 rounded font-bold text-lg group-hover:bg-blue-700 transition-colors">
                          {airport.iataCode}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {airport.name}
                          </h3>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        {airport.address?.cityName && (
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-4 h-4" />
                            <span>{airport.address.cityName}</span>
                          </div>
                        )}
                        {airport.address?.countryName && (
                          <div className="flex items-center space-x-1">
                            <Globe className="w-4 h-4" />
                            <span>{airport.address.countryName}</span>
                          </div>
                        )}
                      </div>

                      {airport.detailedName && (
                        <p className="text-xs text-gray-500 mt-1">
                          {airport.detailedName}
                        </p>
                      )}
                    </div>

                    <div className="ml-4">
                      <div className="bg-gray-100 group-hover:bg-blue-100 text-gray-700 group-hover:text-blue-700 px-3 py-1 rounded text-sm transition-colors">
                        Select
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Tips */}
        <div className="bg-gray-50 border-t px-6 py-4">
          <div className="flex items-start space-x-2 text-sm text-gray-600">
            <div className="text-blue-600 font-bold">💡</div>
            <p>
              <strong>Tip:</strong> You can search by city name (like "San Francisco") or airport code (like "SFO"). 
              Major cities often have multiple airports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Example usage in parent component:
const FlightSearchWithAirportLookup = () => {
  const [showLookup, setShowLookup] = useState(false);
  const [lookupField, setLookupField] = useState('');
  const [searchParams, setSearchParams] = useState({
    origin: '',
    destination: ''
  });

  const openLookup = (field) => {
    setLookupField(field);
    setShowLookup(true);
  };

  const handleAirportSelect = (code, field) => {
    setSearchParams(prev => ({
      ...prev,
      [field]: code
    }));
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Flight Search</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            From
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Airport code"
              maxLength={3}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
              value={searchParams.origin}
              onChange={(e) => setSearchParams(prev => ({ ...prev, origin: e.target.value.toUpperCase() }))}
            />
            <button
              onClick={() => openLookup('origin')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Search className="w-4 h-4" />
              <span>Find</span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            To
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Airport code"
              maxLength={3}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
              value={searchParams.destination}
              onChange={(e) => setSearchParams(prev => ({ ...prev, destination: e.target.value.toUpperCase() }))}
            />
            <button
              onClick={() => openLookup('destination')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Search className="w-4 h-4" />
              <span>Find</span>
            </button>
          </div>
        </div>
      </div>

      <AirportLookupModal
        isOpen={showLookup}
        onClose={() => setShowLookup(false)}
        onSelect={handleAirportSelect}
        fieldName={lookupField}
      />
    </div>
  );
};

export default FlightSearchWithAirportLookup;