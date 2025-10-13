import React, { useState } from 'react';
import { 
  Calendar, Edit3, Plus, Trash2, Check, X, Bell, 
  Plane, Hotel, Car, MapPin, Clock, DollarSign,
  Save, ChevronDown, ChevronUp, AlertCircle, MessageCircle
} from 'lucide-react';

const TripManager = ({ trip, onUpdate, onActivate, onDeactivate, token, sendChatMessage, setChatOpen }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedItinerary, setEditedItinerary] = useState(trip?.itinerary || '');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'text'
  const [editingDay, setEditingDay] = useState(null);

  const isActive = trip?.status === 'active';
  const bookings = trip?.booking_data ? JSON.parse(trip.booking_data) : [];
  const reminders = trip?.reminders ? JSON.parse(trip.reminders) : [];

  // Parse itinerary into structured days
  const parseItinerary = (itineraryText) => {
    if (!itineraryText) return [];

    const days = [];
    const lines = typeof itineraryText === 'string' ? itineraryText.split('\n') : 
                  (itineraryText?.itinerary || '').split('\n');
    let currentDay = null;

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      // Match day headers
      const dayMatch = line.match(/^#+\s*\*?\*?Day\s+(\d+)[:\-\s]*(.*?)\*?\*?$/i) || 
                      line.match(/^\*?\*?Day\s+(\d+)[:\-\s]*(.*?)\*?\*?$/i);
      
      if (dayMatch) {
        if (currentDay) {
          days.push(currentDay);
        }
        currentDay = {
          number: parseInt(dayMatch[1]),
          title: dayMatch[2].replace(/\*/g, '').replace(/#/g, '').trim() || 'Exploration Day',
          activities: [],
          totalCost: 0
        };
        return;
      }

      const costMatch = line.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (costMatch && currentDay) {
        currentDay.totalCost += parseFloat(costMatch[1].replace(/,/g, ''));
      }

      if (currentDay && line.length > 3 && !line.match(/^#+/) && !line.match(/^\-\-\-+$/)) {
        const cleanLine = line
          .replace(/^#+\s*/, '')
          .replace(/^\*+\s*/, '')
          .replace(/\*+$/, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/^-\s*/, '')
          .replace(/^•\s*/, '')
          .replace(/^\d+\.\s*/, '')
          .trim();

        if (cleanLine && !cleanLine.match(/^(Day \d+)/i) && cleanLine !== '---') {
          currentDay.activities.push(cleanLine);
        }
      }
    });

    if (currentDay) {
      days.push(currentDay);
    }

    if (days.length === 0 && lines.length > 0) {
      const activities = lines
        .filter(line => line.trim().length > 3 && !line.match(/^\-\-\-+$/))
        .map(line => line
          .replace(/^#+\s*/, '')
          .replace(/^\*+\s*/, '')
          .replace(/\*+$/, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .trim()
        )
        .filter(line => line && !line.match(/^(Day \d+)/i));

      days.push({
        number: 1,
        title: 'Full Itinerary',
        activities: activities,
        totalCost: 0
      });
    }

    return days;
  };

  const formatActivityText = (text) => {
    const sectionMatch = text.match(/^(Morning Activity|Afternoon Activity|Evening Activity|Lunch|Dinner|Breakfast)(\s*\(.*?\))?:/i);
    
    if (sectionMatch) {
      return {
        type: 'header',
        text: sectionMatch[1],
        time: sectionMatch[2] ? sectionMatch[2].replace(/[()]/g, '').trim() : null
      };
    }
    
    const detailMatch = text.match(/^(Activity|Venue|Address|Cost|Price Range|Note|Duration):\s*(.+)/i);
    
    if (detailMatch) {
      return {
        type: 'detail',
        label: detailMatch[1],
        value: detailMatch[2].trim()
      };
    }
    
    return { type: 'text', text: text };
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
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

  const handleActivate = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/trips/${trip.id}/activate`, {
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
      const response = await fetch(`${API_BASE_URL}/trips/${trip.id}/itinerary`, {
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
        setViewMode('cards');
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  // Day Editor Modal Component
  const DayEditor = ({ day, onSave, onCancel }) => {
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
        const response = await fetch(`${API_BASE_URL}/trips/${trip.id}/days/${day.number}`, {
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
                <p className="text-blue-100 text-sm mt-1">{day.title} - {trip.destination}</p>
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
        const response = await fetch(`${API_BASE_URL}/trips/${trip.id}/bookings`, {
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
        const response = await fetch(`${API_BASE_URL}/trips/${trip.id}/reminders`, {
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

  const days = parseItinerary(trip.itinerary);

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

      {/* Action Buttons */}
      {isActive && (
        <div className="border-b border-gray-200 p-4 bg-gray-50">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setIsEditing(!isEditing);
                setViewMode(isEditing ? 'cards' : 'text');
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              <span>{isEditing ? 'Cancel Edit' : 'Edit Itinerary'}</span>
            </button>

            {!isEditing && (
              <button
                onClick={() => setViewMode(viewMode === 'cards' ? 'text' : 'cards')}
                className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {viewMode === 'cards' ? '📝' : '🗂️'}
                <span>{viewMode === 'cards' ? 'Text View' : 'Card View'}</span>
              </button>
            )}

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
            {trip.status === 'active' && (
                    <button
                        onClick={() => {
                            if (confirm('Deactivate this trip?')) {
                                onDeactivate(trip.id);
                            }
                        }}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                        Deactivate Trip
                    </button>
                )}
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
                  setViewMode('cards');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : viewMode === 'cards' && days.length > 0 ? (
          <>
            {/* Day Cards View */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {days.map((day) => {
                const dayDate = getDayDate(trip.startDate, day.number);

                return (
                  <div key={day.number} className="bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow">
                    {/* Day Header */}
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
                        {day.totalCost > 0 && (
                          <div className="text-right">
                            <div className="text-xs text-blue-100">Estimated</div>
                            <div className="text-2xl font-bold">${day.totalCost.toFixed(0)}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Day Activities */}
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

                    {/* Day Footer */}
                    {isActive && (
                      <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex items-center justify-between">
                        <button
                          onClick={() => {
                              if (sendChatMessage) {
                                  sendChatMessage(`Give me more details and suggestions for Day ${day.number}: ${day.title} in ${trip.destination}`);
                                  if (setChatOpen) {
                                      setChatOpen(true);
                                  }  
                              } else {
                                  console.log(`AI request for Day ${day.number}`);
                              }
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>Ask AI</span>
                        </button>
                        <button
                          onClick={() => setEditingDay(day)}
                          className="text-sm text-purple-600 hover:text-purple-700 flex items-center space-x-1"
                        >
                          <span>✏️</span>
                          <span>Edit Day</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Trip Summary */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Trip Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Total Duration</div>
                  <div className="text-2xl font-bold text-gray-900">{trip.duration} days</div>
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
                    ${Math.max(0, (trip.budget || 0) - days.reduce((sum, day) => sum + day.totalCost, 0)).toFixed(0)}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Text View */
          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap text-gray-700 bg-gray-50 p-4 rounded-lg">
              {typeof trip.itinerary === 'string' 
                ? trip.itinerary 
                : trip.itinerary?.itinerary || 'No itinerary available'}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showBookingModal && <AddBookingModal />}
      {showReminderModal && <AddReminderModal />}
      {editingDay && (
        <DayEditor
          day={editingDay}
          onSave={(updatedDay) => {
            setEditingDay(null);
            if (onUpdate) {
              // Reload the trip to get updated data
              onUpdate(trip);
            }
          }}
          onCancel={() => setEditingDay(null)}
        />
      )}
    </div>
  );
};

export default TripManager;
