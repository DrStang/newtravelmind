import React, { useState } from 'react';
import { 
  Calendar, Edit3, Plus, Trash2, Check, X, Bell, 
  Plane, Hotel, Car, MapPin, Clock, DollarSign,
  Save, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';

const TripManager = ({ trip, onUpdate, onActivate, token }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedItinerary, setEditedItinerary] = useState(trip?.itinerary || '');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);

  const isActive = trip?.status === 'active';
  const bookings = trip?.booking_data ? JSON.parse(trip.booking_data) : [];
  const reminders = trip?.reminders ? JSON.parse(trip.reminders) : [];

  const handleActivate = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/trips/${trip.id}/activate`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        onActivate(trip.id);
      }
    } catch (error) {
      console.error('Activation error:', error);
    }
  };

  const handleSaveItinerary = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/trips/${trip.id}/itinerary`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itinerary: editedItinerary })
      });
      
      if (response.ok) {
        onUpdate({ ...trip, itinerary: editedItinerary });
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const AddBookingModal = () => {
    const [bookingType, setBookingType] = useState('flight');
    const [bookingData, setBookingData] = useState({
      type: 'flight',
      title: '',
      confirmationNumber: '',
      date: '',
      time: '',
      cost: '',
      notes: '',
      location: ''
    });

    const handleSubmit = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/trips/${trip.id}/bookings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bookingData)
        });
        
        if (response.ok) {
          const data = await response.json();
          onUpdate({ ...trip, booking_data: JSON.stringify(data.data) });
          setShowBookingModal(false);
        }
      } catch (error) {
        console.error('Booking error:', error);
      }
    };

    const bookingTypes = [
      { value: 'flight', label: 'Flight', icon: Plane },
      { value: 'hotel', label: 'Hotel', icon: Hotel },
      { value: 'car', label: 'Car Rental', icon: Car },
      { value: 'activity', label: 'Activity', icon: MapPin }
    ];

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">Add Booking</h3>
            <button onClick={() => setShowBookingModal(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Booking Type</label>
              <div className="grid grid-cols-2 gap-2">
                {bookingTypes.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setBookingType(value);
                      setBookingData(prev => ({ ...prev, type: value }));
                    }}
                    className={`flex items-center justify-center space-x-2 p-3 rounded-lg border transition-colors ${
                      bookingType === value
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., United Airlines UA123"
                value={bookingData.title}
                onChange={(e) => setBookingData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirmation Number</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="ABC123"
                value={bookingData.confirmationNumber}
                onChange={(e) => setBookingData(prev => ({ ...prev, confirmationNumber: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={bookingData.date}
                  onChange={(e) => setBookingData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                <input
                  type="time"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={bookingData.time}
                  onChange={(e) => setBookingData(prev => ({ ...prev, time: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cost ($)</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                value={bookingData.cost}
                onChange={(e) => setBookingData(prev => ({ ...prev, cost: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Address or venue"
                value={bookingData.location}
                onChange={(e) => setBookingData(prev => ({ ...prev, location: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Additional details..."
                value={bookingData.notes}
                onChange={(e) => setBookingData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                onClick={() => setShowBookingModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!bookingData.title}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Add Booking
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AddReminderModal = () => {
    const [reminderData, setReminderData] = useState({
      title: '',
      datetime: '',
      type: 'general',
      notes: ''
    });

    const handleSubmit = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/trips/${trip.id}/reminders`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reminderData)
        });
        
        if (response.ok) {
          const data = await response.json();
          onUpdate({ ...trip, reminders: JSON.stringify(data.data) });
          setShowReminderModal(false);
        }
      } catch (error) {
        console.error('Reminder error:', error);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">Add Reminder</h3>
            <button onClick={() => setShowReminderModal(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reminder Title</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Check in for flight"
                value={reminderData.title}
                onChange={(e) => setReminderData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date & Time</label>
              <input
                type="datetime-local"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={reminderData.datetime}
                onChange={(e) => setReminderData(prev => ({ ...prev, datetime: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={reminderData.type}
                onChange={(e) => setReminderData(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="general">General</option>
                <option value="booking">Booking Related</option>
                <option value="activity">Activity</option>
                <option value="packing">Packing</option>
                <option value="important">Important</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Additional details..."
                value={reminderData.notes}
                onChange={(e) => setReminderData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                onClick={() => setShowReminderModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!reminderData.title || !reminderData.datetime}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Add Reminder
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!trip) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`p-6 ${isActive ? 'bg-gradient-to-r from-green-500 to-blue-500' : 'bg-gradient-to-r from-blue-600 to-purple-600'}`}>
        <div className="flex items-start justify-between text-white">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-2xl font-bold">{trip.title}</h3>
              {isActive && (
                <span className="bg-white text-green-600 text-xs px-2 py-1 rounded-full font-semibold flex items-center">
                  <Check className="w-3 h-3 mr-1" />
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-white/90">{trip.destination}</p>
            <div className="flex items-center space-x-4 mt-3 text-sm text-white/80">
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                {trip.duration} days
              </span>
              {trip.budget && (
                <span className="flex items-center">
                  <DollarSign className="w-4 h-4 mr-1" />
                  ${trip.budget}
                </span>
              )}
              {trip.startDate && (
                <span className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  {new Date(trip.startDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isActive && (
              <button
                onClick={handleActivate}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium flex items-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>Make Active</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons (only show when active) */}
      {isActive && (
        <div className="border-b border-gray-200 p-4 bg-gray-50">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              <span>{isEditing ? 'Cancel Edit' : 'Edit Itinerary'}</span>
            </button>

            <button
              onClick={() => setShowBookingModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Booking</span>
            </button>

            <button
              onClick={() => setShowReminderModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span>Add Reminder</span>
            </button>
          </div>
        </div>
      )}

      {/* Bookings Section */}
      {isActive && bookings.length > 0 && (
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-lg font-semibold mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Your Bookings ({bookings.length})
          </h4>
          <div className="space-y-3">
            {bookings.map((booking) => {
              const IconComponent = {
                flight: Plane,
                hotel: Hotel,
                car: Car,
                activity: MapPin
              }[booking.type] || MapPin;

              return (
                <div key={booking.id} className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <IconComponent className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="font-semibold text-gray-900">{booking.title}</h5>
                        {booking.confirmationNumber && (
                          <p className="text-sm text-gray-600">Confirmation: {booking.confirmationNumber}</p>
                        )}
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                          {booking.date && (
                            <span className="flex items-center">
                              <Calendar className="w-3 h-3 mr-1" />
                              {new Date(booking.date).toLocaleDateString()}
                            </span>
                          )}
                          {booking.time && (
                            <span className="flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {booking.time}
                            </span>
                          )}
                          {booking.cost && (
                            <span className="flex items-center">
                              <DollarSign className="w-3 h-3 mr-1" />
                              {booking.cost}
                            </span>
                          )}
                        </div>
                        {booking.location && (
                          <p className="text-sm text-gray-600 mt-1 flex items-center">
                            <MapPin className="w-3 h-3 mr-1" />
                            {booking.location}
                          </p>
                        )}
                        {booking.notes && (
                          <p className="text-sm text-gray-600 mt-1">{booking.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reminders Section */}
      {isActive && reminders.length > 0 && (
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-lg font-semibold mb-4 flex items-center">
            <Bell className="w-5 h-5 mr-2 text-purple-600" />
            Reminders ({reminders.length})
          </h4>
          <div className="space-y-2">
            {reminders.sort((a, b) => new Date(a.datetime) - new Date(b.datetime)).map((reminder) => (
              <div key={reminder.id} className="flex items-start space-x-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium text-gray-900">{reminder.title}</h5>
                    <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded">
                      {reminder.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {new Date(reminder.datetime).toLocaleString()}
                  </p>
                  {reminder.notes && (
                    <p className="text-sm text-gray-500 mt-1">{reminder.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Itinerary Section */}
      <div className="p-6">
        <h4 className="text-lg font-semibold mb-4">Itinerary</h4>
        
        {isEditing ? (
          <div className="space-y-4">
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              rows={20}
              value={editedItinerary}
              onChange={(e) => setEditedItinerary(e.target.value)}
            />
            <div className="flex space-x-3">
              <button
                onClick={handleSaveItinerary}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedItinerary(trip.itinerary);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap text-gray-700 bg-gray-50 p-4 rounded-lg">
              {trip.itinerary?.itinerary || trip.itinerary || 'No itinerary available'}
            </div>
          </div>
        )}
      </div>

      {showBookingModal && <AddBookingModal />}
      {showReminderModal && <AddReminderModal />}
    </div>
  );
};

// Demo wrapper with sample data
const Demo = () => {
  const [trip, setTrip] = useState({
    id: 1,
    title: 'Tokyo Adventure',
    destination: 'Tokyo, Japan',
    duration: 7,
    budget: 2500,
    startDate: '2025-11-01',
    status: 'planning',
    itinerary: 'Day 1: Arrival in Tokyo\n- Check into hotel in Shibuya\n- Evening walk around Shibuya Crossing\n- Dinner at local izakaya\n\nDay 2: Cultural Exploration\n- Morning visit to Senso-ji Temple\n- Lunch in Asakusa\n- Afternoon in Akihabara\n- Evening in Shinjuku\n\nDay 3: Modern Tokyo\n- TeamLab Borderless museum\n- Shopping in Harajuku\n- Meiji Shrine visit\n- Dinner in Roppongi',
    booking_data: JSON.stringify([]),
    reminders: JSON.stringify([])
  });

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Trip Manager Demo</h1>
          <p className="text-gray-600">Click "Make Active" to unlock editing, bookings, and reminders</p>
        </div>
        
        <TripManager 
          trip={trip}
          onUpdate={(updated) => setTrip(updated)}
          onActivate={() => setTrip(prev => ({ ...prev, status: 'active' }))}
          token="demo-token"
        />
      </div>
    </div>
  );
};

export default Demo;
