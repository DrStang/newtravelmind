# TravelMind.ai - Smart Notification System

## Overview
TravelMind.ai now includes a comprehensive notification system that keeps travelers informed about their bookings, flight status, weather conditions, and important reminders.

## Features

### 1. **Booking Reminders**
- Automated reminders for upcoming bookings at multiple intervals:
  - 7 days before
  - 3 days before
  - 24 hours before
  - 2 hours before
- Works for all booking types: flights, hotels, activities, transport, etc.

### 2. **Flight Check-in Alerts**
- Automatic reminder 24 hours before flight departure
- Prompts users to check in and select seats
- Only sent for bookings with flight numbers

### 3. **Weather Alerts**
- Monitors weather forecast for upcoming activities
- Sends rain/storm alerts for outdoor activities within next 3 days
- Suggests rescheduling or indoor alternatives
- Priority-based alerts:
  - **High**: Thunderstorms
  - **Medium**: Rain/Snow
  - **Low**: Fog/Mist

### 4. **Flight Status Monitoring**
- Real-time flight tracking for flights within 48 hours
- Monitors and alerts for:
  - **Flight Delays** (>15 minutes)
  - **Flight Cancellations**
  - **Gate Changes**
  - **Boarding Status**
- Uses FlightAware API (primary) and AviationStack API (backup)

## Technical Architecture

### Backend Components

#### 1. Database Schema
**Notifications Table:**
```sql
CREATE TABLE notifications (
    id INT PRIMARY KEY,
    user_id INT,
    trip_id INT,
    booking_id INT,
    type ENUM('booking_reminder', 'checkin_reminder', 'weather_alert', 'flight_delay', 'flight_update', 'general'),
    title VARCHAR(255),
    message TEXT,
    priority ENUM('low', 'medium', 'high', 'urgent'),
    dismissed BOOLEAN DEFAULT FALSE,
    metadata JSON,
    created_at TIMESTAMP
);
```

**Bookings Table Updates:**
- Added `flight_number` field for flight tracking

#### 2. Services

**NotificationService** (`backend/services/notifications.js`)
- Creates and manages notifications
- Handles different notification types
- Priority-based notification system

**FlightTrackingService** (`backend/services/flightTracking.js`)
- FlightAware API integration
- AviationStack API as backup
- Caching system to minimize API calls
- 5-minute cache duration

**NotificationScheduler** (`backend/services/notificationScheduler.js`)
- Cron-based job scheduler
- Runs periodic checks:
  - Booking reminders: Every 30 minutes
  - Flight status: Every 15 minutes (for flights within 48 hours)
  - Weather: Every 6 hours
  - Cache cleanup: Every hour

#### 3. API Endpoints

**GET /api/notifications**
- Fetch user's active notifications
- Returns up to 10 notifications, sorted by priority

**PATCH /api/notifications/:id/dismiss**
- Dismiss a notification
- Removes it from active notifications list

### Frontend Components

#### NotificationPanel Component
- Slide-out panel from top-right
- Color-coded by priority:
  - 🔴 Urgent: Red border
  - 🟠 High: Orange border
  - 🔵 Medium: Blue border
  - ⚪ Low: Gray border
- Icons by notification type:
  - ✈️ Flight updates: Clock icon
  - 🌧️ Weather: Cloud icon
  - ✅ Check-in: Plane icon
  - 🔔 Booking: Bell icon
- Individual dismiss and "Clear All" options

## Setup & Configuration

### Required API Keys

Add to your `.env` file:

```bash
# Weather API
WEATHER_API_KEY=your_openweathermap_api_key

# Flight Tracking (choose one or both for redundancy)
FLIGHTAWARE_API_KEY=your_flightaware_api_key
AVIATIONSTACK_API_KEY=your_aviationstack_api_key
```

### Getting API Keys

#### OpenWeatherMap (Free Tier Available)
1. Sign up at https://openweathermap.org/api
2. Get free API key (1000 calls/day)
3. Used for weather forecasts

#### FlightAware AeroAPI (Recommended)
1. Sign up at https://flightaware.com/commercial/aeroapi/
2. Free tier: 500 queries/month
3. More accurate and comprehensive flight data

#### AviationStack (Backup)
1. Sign up at https://aviationstack.com/
2. Free tier: 100 calls/month
3. Automatic fallback if FlightAware unavailable

## Job Schedule

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Booking Reminders | Every 30 min | Check and send booking reminders |
| Flight Status | Every 15 min | Track flights within 48 hours |
| Weather Forecast | Every 6 hours | Check weather for next 3 days |
| Cache Cleanup | Every hour | Clear expired cache entries |

## Usage

### For Users

1. **View Notifications**: Click the bell icon in Companion Mode
2. **Dismiss Notification**: Click "Dismiss" on individual notifications
3. **Clear All**: Click "Clear All" button at bottom of panel

### For Developers

#### Manually Trigger Jobs (for testing)
```javascript
// In server console or via API endpoint
notificationScheduler.runJob('bookingReminders');
notificationScheduler.runJob('flightStatus');
notificationScheduler.runJob('weather');
```

#### Create Custom Notification
```javascript
await database.createNotification(userId, {
    tripId: 123,
    bookingId: 456,
    type: 'general',
    title: 'Custom Notification',
    message: 'Your custom message here',
    priority: 'medium',
    metadata: { customField: 'value' }
});
```

## Notification Types

| Type | Description | Priority | Icon |
|------|-------------|----------|------|
| `booking_reminder` | Upcoming booking reminder | Medium/High/Urgent | 🔔 |
| `checkin_reminder` | Flight check-in available | High | ✈️ |
| `weather_alert` | Rain/storm forecast | Medium/High | 🌧️ |
| `flight_delay` | Flight delayed | High/Urgent | ⏰ |
| `flight_update` | Gate change, cancellation, boarding | High/Urgent | ✈️ |
| `general` | Custom notifications | Low | ℹ️ |

## Notification Priority Logic

### Booking Reminders
- **Urgent**: < 2 hours before booking
- **High**: 24 hours before booking
- **Medium**: 3-7 days before booking

### Weather Alerts
- **High**: Thunderstorms
- **Medium**: Rain, Snow
- **Low**: Fog, Mist

### Flight Updates
- **Urgent**: Cancellation, >60 min delay, boarding
- **High**: <60 min delay, gate change
- **Medium**: General status updates

## Future Enhancements

### Planned Features
- [ ] SMS/Email notifications (optional)
- [ ] Push notifications for mobile app
- [ ] Customizable notification preferences
- [ ] Notification sound/vibration settings
- [ ] Snooze functionality
- [ ] Smart notification grouping
- [ ] AI-powered notification prioritization
- [ ] Integration with calendar apps
- [ ] Hotel check-in reminders
- [ ] Rental car pickup reminders
- [ ] Restaurant reservation reminders

### API Expansion
- [ ] Add more flight tracking providers
- [ ] Extended weather forecast (7-14 days)
- [ ] Traffic alerts for ground transportation
- [ ] Currency exchange rate alerts
- [ ] Travel advisory notifications

## Troubleshooting

### Notifications Not Appearing
1. Check if notification scheduler is running (logs on server startup)
2. Verify API keys are set in `.env`
3. Check database connection
4. Ensure bookings have proper date/time fields

### Flight Tracking Not Working
1. Verify `flight_number` field is set on booking
2. Check FlightAware/AviationStack API key
3. Review API quota limits
4. Check flight is within 48-hour window

### Weather Alerts Not Sent
1. Confirm Weather API key is valid
2. Check if activities have location data
3. Verify activity is within 3-day window

## Database Maintenance

### Clean Old Notifications (Monthly)
```sql
DELETE FROM notifications
WHERE dismissed = TRUE
AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

### Monitor Notification Volume
```sql
SELECT
    type,
    priority,
    COUNT(*) as count,
    DATE(created_at) as date
FROM notifications
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY type, priority, DATE(created_at);
```

## Performance Considerations

- **Caching**: Flight status cached for 5 minutes
- **Rate Limiting**: Respects API rate limits with backoff
- **Batch Processing**: Users processed sequentially to avoid overload
- **Database Indexing**: Indexes on user_id, dismissed, created_at
- **Notification Deduplication**: Prevents duplicate notifications within 2-hour window

## Security

- All endpoints require authentication (JWT)
- Notifications tied to user_id (users can only see their own)
- API keys stored in environment variables
- No sensitive data in notification metadata

---

**Version**: 1.0.0
**Last Updated**: 2025-10-30
**Author**: TravelMind.ai Development Team
