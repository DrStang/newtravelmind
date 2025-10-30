const cron = require('node-cron');
const { NotificationService } = require('./notifications');
const { FlightTrackingService } = require('./flightTracking');
const { DatabaseService } = require('./database');
const { getWeatherInfo } = require('./googlePlaces');

class NotificationScheduler {
    constructor() {
        this.notificationService = new NotificationService();
        this.flightTrackingService = new FlightTrackingService();
        this.db = new DatabaseService();
        this.jobs = [];
        this.isRunning = false;
    }

    async initialize() {
        await this.notificationService.initialize();
        await this.db.initialize();
        console.log('✅ Notification scheduler initialized');
    }

    /**
     * Start all scheduled jobs
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ Notification scheduler already running');
            return;
        }

        console.log('🚀 Starting notification scheduler...');

        // Check booking reminders every 30 minutes
        const bookingReminderJob = cron.schedule('*/30 * * * *', async () => {
            console.log('⏰ Running booking reminder check...');
            try {
                await this.notificationService.checkBookingReminders();
            } catch (error) {
                console.error('Booking reminder job error:', error);
            }
        });
        this.jobs.push(bookingReminderJob);

        // Check flight status every 15 minutes (for flights within 48 hours)
        const flightStatusJob = cron.schedule('*/15 * * * *', async () => {
            console.log('✈️ Running flight status check...');
            try {
                await this.checkFlightStatuses();
            } catch (error) {
                console.error('Flight status job error:', error);
            }
        });
        this.jobs.push(flightStatusJob);

        // Check weather forecast every 6 hours
        const weatherJob = cron.schedule('0 */6 * * *', async () => {
            console.log('🌤️ Running weather forecast check...');
            try {
                await this.checkWeatherForTrips();
            } catch (error) {
                console.error('Weather check job error:', error);
            }
        });
        this.jobs.push(weatherJob);

        // Clean flight tracking cache every hour
        const cacheCleanJob = cron.schedule('0 * * * *', () => {
            console.log('🧹 Cleaning flight tracking cache...');
            this.flightTrackingService.cleanCache();
        });
        this.jobs.push(cacheCleanJob);

        this.isRunning = true;
        console.log('✅ Notification scheduler started with 4 jobs');
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        console.log('🛑 Stopping notification scheduler...');
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        this.isRunning = false;
        console.log('✅ Notification scheduler stopped');
    }

    /**
     * Check flight statuses for upcoming flights
     */
    async checkFlightStatuses() {
        try {
            const users = await this.db.pool.query('SELECT id FROM users');

            for (const user of users) {
                // Get flights within next 48 hours
                const flights = await this.db.getFlightBookings(user.id, 2);

                for (const flight of flights) {
                    if (!flight.flight_number) {
                        continue;
                    }

                    // Get current flight status
                    const status = await this.flightTrackingService.getFlightStatus(
                        flight.flight_number,
                        flight.booking_date
                    );

                    if (status) {
                        // Check for significant changes
                        await this.processFlightStatus(user.id, flight, status);
                    }
                }
            }

            console.log('✅ Flight status check completed');
        } catch (error) {
            console.error('Check flight statuses error:', error);
        }
    }

    /**
     * Process flight status and send notifications if needed
     */
    async processFlightStatus(userId, flight, status) {
        try {
            // Determine if we should send a notification
            let shouldNotify = false;
            let statusData = {
                status: status.status,
                delay: status.delay || 0,
                gate: status.departure?.gate,
                terminal: status.departure?.terminal
            };

            // Delayed flight (more than 15 minutes)
            if (status.delay && status.delay > 15) {
                shouldNotify = true;
                statusData.newDepartureTime = status.departure?.estimated || status.departure?.scheduled;
            }

            // Cancelled flight
            if (status.status === 'cancelled') {
                shouldNotify = true;
            }

            // Gate change (check if it's different from stored info)
            if (status.departure?.gate && flight.details) {
                try {
                    const details = JSON.parse(flight.details);
                    if (details.gate && details.gate !== status.departure.gate) {
                        shouldNotify = true;
                        statusData.status = 'gate_change';
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }

            // Boarding status (within 2 hours of flight)
            if (status.status === 'active' || status.status === 'boarding') {
                const hoursUntil = this.getHoursUntilFlight(flight.booking_date, flight.booking_time);
                if (hoursUntil <= 2 && hoursUntil > 0) {
                    shouldNotify = true;
                    statusData.status = 'boarding';
                }
            }

            if (shouldNotify) {
                // Check if we already sent a similar notification recently
                const recentNotifications = await this.db.pool.query(`
                    SELECT * FROM notifications
                    WHERE user_id = ?
                    AND booking_id = ?
                    AND type IN ('flight_delay', 'flight_update')
                    AND created_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
                `, [userId, flight.id]);

                if (recentNotifications.length === 0) {
                    await this.notificationService.createFlightStatusNotification(
                        userId,
                        flight,
                        statusData
                    );

                    // Update booking details with latest gate/terminal info
                    if (status.departure?.gate) {
                        const details = {
                            gate: status.departure.gate,
                            terminal: status.departure.terminal,
                            lastChecked: new Date().toISOString()
                        };

                        await this.db.updateBooking(flight.id, userId, {
                            details: JSON.stringify(details)
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Process flight status error:', error);
        }
    }

    /**
     * Check weather for trips and send alerts
     */
    async checkWeatherForTrips() {
        try {
            const users = await this.db.pool.query('SELECT id FROM users');

            for (const user of users) {
                // Get active trips
                const activeTrips = await this.db.getActiveTrips(user.id);

                for (const trip of activeTrips) {
                    // Get upcoming activities/bookings for the trip
                    const bookings = await this.db.getTripBookings(trip.id, user.id);

                    for (const booking of bookings) {
                        // Check bookings within next 3 days
                        const daysUntil = this.getDaysUntilBooking(booking.booking_date);

                        if (daysUntil >= 0 && daysUntil <= 3) {
                            // For outdoor activities, check weather
                            if (booking.booking_type === 'activity' || booking.booking_type === 'transport') {
                                await this.checkWeatherForBooking(user.id, trip, booking);
                            }
                        }
                    }

                    // Also check weather for trip destination
                    if (trip.destination) {
                        await this.checkWeatherForDestination(user.id, trip);
                    }
                }
            }

            console.log('✅ Weather check for trips completed');
        } catch (error) {
            console.error('Check weather for trips error:', error);
        }
    }

    /**
     * Check weather for a specific booking
     */
    async checkWeatherForBooking(userId, trip, booking) {
        try {
            // Parse location details if available
            let details = {};
            try {
                if (booking.details) {
                    details = JSON.parse(booking.details);
                }
            } catch (e) {
                // Ignore parsing errors
            }

            // Get coordinates if available (from details or geocode location)
            if (details.latitude && details.longitude) {
                const weather = await getWeatherInfo({
                    lat: details.latitude,
                    lng: details.longitude
                });

                if (weather) {
                    // Check if we already sent a weather alert for this booking recently
                    const recentAlerts = await this.db.pool.query(`
                        SELECT * FROM notifications
                        WHERE user_id = ?
                        AND booking_id = ?
                        AND type = 'weather_alert'
                        AND created_at >= DATE_SUB(NOW(), INTERVAL 12 HOUR)
                    `, [userId, booking.id]);

                    if (recentAlerts.length === 0) {
                        await this.notificationService.createWeatherAlert(
                            userId,
                            trip.id,
                            weather,
                            booking.location || trip.destination
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Check weather for booking error:', error);
        }
    }

    /**
     * Check weather for trip destination
     */
    async checkWeatherForDestination(userId, trip) {
        try {
            // In a real implementation, you would geocode the destination
            // For now, we'll log that we would check
            console.log(`Would check weather for destination: ${trip.destination}`);
        } catch (error) {
            console.error('Check weather for destination error:', error);
        }
    }

    /**
     * Helper: Calculate hours until flight
     */
    getHoursUntilFlight(flightDate, flightTime) {
        const now = new Date();
        const flight = new Date(`${flightDate} ${flightTime || '00:00:00'}`);
        const diffMs = flight - now;
        return diffMs / (1000 * 60 * 60);
    }

    /**
     * Helper: Calculate days until booking
     */
    getDaysUntilBooking(bookingDate) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const booking = new Date(bookingDate);
        booking.setHours(0, 0, 0, 0);
        const diffMs = booking - now;
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    /**
     * Run a specific job manually (for testing)
     */
    async runJob(jobName) {
        console.log(`🔧 Manually running job: ${jobName}`);

        switch (jobName) {
            case 'bookingReminders':
                await this.notificationService.checkBookingReminders();
                break;
            case 'flightStatus':
                await this.checkFlightStatuses();
                break;
            case 'weather':
                await this.checkWeatherForTrips();
                break;
            default:
                console.error(`Unknown job: ${jobName}`);
        }
    }
}

module.exports = { NotificationScheduler };
