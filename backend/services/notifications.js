const { DatabaseService } = require('./database');
const { getWeatherInfo } = require('./googlePlaces');

class NotificationService {
    constructor() {
        this.db = new DatabaseService();
    }

    async initialize() {
        await this.db.initialize();
    }

    /**
     * Create a booking reminder notification
     */
    async createBookingReminder(userId, booking) {
        try {
            const hoursUntil = this.getHoursUntilBooking(booking.booking_date, booking.booking_time);

            let title, message, priority;

            if (hoursUntil <= 2) {
                title = `Upcoming ${booking.booking_type}: ${booking.title}`;
                message = `Your ${booking.booking_type} is starting soon! Time: ${booking.booking_time || 'Check booking details'}`;
                priority = 'urgent';
            } else if (hoursUntil <= 24) {
                title = `Tomorrow: ${booking.title}`;
                message = `Your ${booking.booking_type} is tomorrow at ${booking.booking_time || 'the scheduled time'}. Location: ${booking.location || 'Check booking details'}`;
                priority = 'high';
            } else {
                title = `Reminder: ${booking.title}`;
                message = `Your ${booking.booking_type} is coming up on ${booking.booking_date}`;
                priority = 'medium';
            }

            await this.db.createNotification(userId, {
                tripId: booking.trip_id,
                bookingId: booking.id,
                type: 'booking_reminder',
                title,
                message,
                priority,
                metadata: {
                    bookingType: booking.booking_type,
                    bookingDate: booking.booking_date,
                    bookingTime: booking.booking_time,
                    location: booking.location
                }
            });

            console.log(`✅ Created booking reminder for user ${userId}, booking ${booking.id}`);
        } catch (error) {
            console.error('Create booking reminder error:', error);
        }
    }

    /**
     * Create a flight check-in reminder (24 hours before)
     */
    async createCheckInReminder(userId, flight) {
        try {
            const hoursUntil = this.getHoursUntilBooking(flight.booking_date, flight.booking_time);

            // Only send check-in reminder between 24-26 hours before flight
            if (hoursUntil < 22 || hoursUntil > 26) {
                return;
            }

            await this.db.createNotification(userId, {
                tripId: flight.trip_id,
                bookingId: flight.id,
                type: 'checkin_reminder',
                title: '✈️ Check-in Available',
                message: `Check-in is now available for your flight ${flight.flight_number || flight.title}. Check in now to select your seat!`,
                priority: 'high',
                metadata: {
                    flightNumber: flight.flight_number,
                    departureDate: flight.booking_date,
                    departureTime: flight.booking_time
                }
            });

            console.log(`✅ Created check-in reminder for user ${userId}, flight ${flight.id}`);
        } catch (error) {
            console.error('Create check-in reminder error:', error);
        }
    }

    /**
     * Create a weather alert notification
     */
    async createWeatherAlert(userId, tripId, weatherData, location) {
        try {
            const { description, condition, temperature } = weatherData;

            // Check if weather is concerning (rain, snow, storms)
            const concerningConditions = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow', 'Mist', 'Fog'];
            const isConcerning = concerningConditions.some(c => condition.includes(c));

            if (!isConcerning) {
                return; // Don't send notification for good weather
            }

            let title, message, priority;

            if (condition.includes('Thunderstorm')) {
                title = '⚠️ Severe Weather Alert';
                message = `Thunderstorms forecasted for ${location}. Consider rescheduling outdoor activities.`;
                priority = 'high';
            } else if (condition.includes('Rain') || condition.includes('Drizzle')) {
                title = '🌧️ Rain Expected';
                message = `Rain forecasted for ${location} (${description}). You might want to plan indoor activities or bring an umbrella!`;
                priority = 'medium';
            } else if (condition.includes('Snow')) {
                title = '❄️ Snow Expected';
                message = `Snow forecasted for ${location}. Check travel conditions and dress warmly!`;
                priority = 'medium';
            } else {
                title = '🌫️ Weather Notice';
                message = `${condition} expected in ${location}. Weather: ${description}, Temp: ${Math.round(temperature)}°C`;
                priority = 'low';
            }

            await this.db.createNotification(userId, {
                tripId,
                type: 'weather_alert',
                title,
                message,
                priority,
                metadata: {
                    location,
                    condition,
                    description,
                    temperature
                }
            });

            console.log(`✅ Created weather alert for user ${userId}, trip ${tripId}`);
        } catch (error) {
            console.error('Create weather alert error:', error);
        }
    }

    /**
     * Create a flight status update notification
     */
    async createFlightStatusNotification(userId, flight, statusData) {
        try {
            const { status, delay, gate, terminal } = statusData;

            let title, message, priority, type;

            if (status === 'delayed' || delay > 0) {
                title = '⚠️ Flight Delayed';
                message = `Your flight ${flight.flight_number} has been delayed by ${delay} minutes. New departure time: ${statusData.newDepartureTime}`;
                priority = delay > 60 ? 'urgent' : 'high';
                type = 'flight_delay';
            } else if (status === 'cancelled') {
                title = '🚨 Flight Cancelled';
                message = `Your flight ${flight.flight_number} has been cancelled. Please contact ${flight.provider || 'your airline'} immediately.`;
                priority = 'urgent';
                type = 'flight_update';
            } else if (status === 'gate_change' || gate) {
                title = 'ℹ️ Gate Change';
                message = `Gate change for flight ${flight.flight_number}. New gate: ${gate}${terminal ? `, Terminal ${terminal}` : ''}`;
                priority = 'high';
                type = 'flight_update';
            } else if (status === 'boarding') {
                title = '✈️ Now Boarding';
                message = `Your flight ${flight.flight_number} is now boarding at gate ${gate || 'TBD'}`;
                priority = 'urgent';
                type = 'flight_update';
            } else {
                title = 'ℹ️ Flight Update';
                message = `Status update for flight ${flight.flight_number}: ${status}`;
                priority = 'medium';
                type = 'flight_update';
            }

            await this.db.createNotification(userId, {
                tripId: flight.trip_id,
                bookingId: flight.id,
                type,
                title,
                message,
                priority,
                metadata: {
                    flightNumber: flight.flight_number,
                    status,
                    delay,
                    gate,
                    terminal,
                    ...statusData
                }
            });

            console.log(`✅ Created flight status notification for user ${userId}, flight ${flight.id}`);
        } catch (error) {
            console.error('Create flight status notification error:', error);
        }
    }

    /**
     * Check weather for active and upcoming trips
     */
    async checkWeatherForTrips() {
        try {
            console.log('🌤️ Checking weather for active/upcoming trips...');

            // Get all users (we'll need to query active trips per user)
            const users = await this.db.pool.query('SELECT id FROM users');

            for (const user of users) {
                // Get active and upcoming trips
                const activeTrips = await this.db.getActiveTrips(user.id);
                const upcomingTrips = await this.db.getUpcomingTrips(user.id);
                const trips = [...activeTrips, ...upcomingTrips];

                for (const trip of trips) {
                    // Get weather for trip destination
                    // We need coordinates - in a real app, you'd geocode the destination
                    // For now, we'll check if trip has activities with locations
                    const activities = await this.db.getTripBookings(trip.id, user.id);

                    for (const activity of activities) {
                        if (activity.booking_type === 'activity' && activity.location) {
                            // Check if activity is within next 3 days
                            const daysUntil = this.getDaysUntilBooking(activity.booking_date);

                            if (daysUntil >= 0 && daysUntil <= 3) {
                                // In production, you'd geocode the location first
                                // For now, we'll skip if we don't have coordinates
                                console.log(`Would check weather for activity: ${activity.title} at ${activity.location}`);
                            }
                        }
                    }
                }
            }

            console.log('✅ Weather check completed');
        } catch (error) {
            console.error('Check weather for trips error:', error);
        }
    }

    /**
     * Check booking reminders and send notifications
     */
    async checkBookingReminders() {
        try {
            console.log('📅 Checking booking reminders...');

            const users = await this.db.pool.query('SELECT id FROM users');

            for (const user of users) {
                // Get upcoming bookings for next 7 days
                const bookings = await this.db.getUpcomingBookings(user.id, 7);

                for (const booking of bookings) {
                    const hoursUntil = this.getHoursUntilBooking(booking.booking_date, booking.booking_time);

                    // Send reminders at specific intervals
                    // 2 hours before, 24 hours before, 3 days before, 7 days before
                    const reminderIntervals = [2, 24, 72, 168]; // in hours

                    for (const interval of reminderIntervals) {
                        // Check if we're within 30 minutes of the reminder time
                        if (Math.abs(hoursUntil - interval) <= 0.5) {
                            // Check if we already sent this reminder
                            const existingNotifications = await this.db.pool.query(`
                                SELECT * FROM notifications
                                WHERE user_id = ?
                                AND booking_id = ?
                                AND type = 'booking_reminder'
                                AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval + 1} HOUR)
                            `, [user.id, booking.id]);

                            if (existingNotifications.length === 0) {
                                await this.createBookingReminder(user.id, booking);
                            }
                        }
                    }

                    // Check-in reminder for flights (24 hours before)
                    if (booking.booking_type === 'flight') {
                        await this.createCheckInReminder(user.id, booking);
                    }
                }
            }

            console.log('✅ Booking reminders check completed');
        } catch (error) {
            console.error('Check booking reminders error:', error);
        }
    }

    /**
     * Helper: Calculate hours until a booking
     */
    getHoursUntilBooking(bookingDate, bookingTime = '00:00:00') {
        const now = new Date();
        const bookingDateTime = new Date(`${bookingDate} ${bookingTime}`);
        const diffMs = bookingDateTime - now;
        return diffMs / (1000 * 60 * 60); // Convert to hours
    }

    /**
     * Helper: Calculate days until a booking
     */
    getDaysUntilBooking(bookingDate) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const booking = new Date(bookingDate);
        booking.setHours(0, 0, 0, 0);
        const diffMs = booking - now;
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
}

module.exports = { NotificationService };
