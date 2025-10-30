const axios = require('axios');

class FlightTrackingService {
    constructor() {
        // FlightAware AeroAPI credentials
        this.flightAwareApiKey = process.env.FLIGHTAWARE_API_KEY;
        this.flightAwareBaseUrl = 'https://aeroapi.flightaware.com/aeroapi';

        // AviationStack API as backup (free tier available)
        this.aviationStackApiKey = process.env.AVIATIONSTACK_API_KEY;
        this.aviationStackBaseUrl = 'http://api.aviationstack.com/v1';

        // Cache for flight status to avoid excessive API calls
        this.cache = new Map();
        this.cacheDuration = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get flight status using FlightAware API
     */
    async getFlightStatusFlightAware(flightNumber, date) {
        try {
            if (!this.flightAwareApiKey) {
                console.warn('FlightAware API key not configured');
                return null;
            }

            // Parse flight number (e.g., "AA123" -> airline: "AA", flight: "123")
            const match = flightNumber.match(/^([A-Z]{2,3})(\d+)$/);
            if (!match) {
                console.error('Invalid flight number format:', flightNumber);
                return null;
            }

            const [, airline, flightNum] = match;
            const ident = `${airline}${flightNum}`;

            // Format date as YYYY-MM-DD
            const flightDate = new Date(date).toISOString().split('T')[0];

            console.log(`🔍 Fetching FlightAware status for ${ident} on ${flightDate}`);

            const response = await axios.get(
                `${this.flightAwareBaseUrl}/flights/${ident}`,
                {
                    headers: {
                        'x-apikey': this.flightAwareApiKey
                    },
                    params: {
                        start: flightDate,
                        end: flightDate
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.flights && response.data.flights.length > 0) {
                const flight = response.data.flights[0];

                return {
                    flightNumber: ident,
                    status: this.mapFlightAwareStatus(flight.status),
                    departure: {
                        airport: flight.origin.code,
                        scheduled: flight.scheduled_out,
                        estimated: flight.estimated_out,
                        actual: flight.actual_out,
                        terminal: flight.origin.terminal,
                        gate: flight.origin.gate
                    },
                    arrival: {
                        airport: flight.destination.code,
                        scheduled: flight.scheduled_in,
                        estimated: flight.estimated_in,
                        actual: flight.actual_in,
                        terminal: flight.destination.terminal,
                        gate: flight.destination.gate
                    },
                    delay: this.calculateDelay(flight),
                    aircraft: flight.aircraft_type,
                    source: 'flightaware'
                };
            }

            return null;
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`Flight ${flightNumber} not found in FlightAware`);
                return null;
            }
            console.error('FlightAware API error:', error.message);
            return null;
        }
    }

    /**
     * Get flight status using AviationStack API (backup)
     */
    async getFlightStatusAviationStack(flightNumber, date) {
        try {
            if (!this.aviationStackApiKey) {
                console.warn('AviationStack API key not configured');
                return null;
            }

            console.log(`🔍 Fetching AviationStack status for ${flightNumber}`);

            const response = await axios.get(
                `${this.aviationStackBaseUrl}/flights`,
                {
                    params: {
                        access_key: this.aviationStackApiKey,
                        flight_iata: flightNumber,
                        flight_date: new Date(date).toISOString().split('T')[0]
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.data && response.data.data.length > 0) {
                const flight = response.data.data[0];

                return {
                    flightNumber: flight.flight.iata,
                    status: flight.flight_status,
                    departure: {
                        airport: flight.departure.iata,
                        scheduled: flight.departure.scheduled,
                        estimated: flight.departure.estimated,
                        actual: flight.departure.actual,
                        terminal: flight.departure.terminal,
                        gate: flight.departure.gate,
                        delay: flight.departure.delay
                    },
                    arrival: {
                        airport: flight.arrival.iata,
                        scheduled: flight.arrival.scheduled,
                        estimated: flight.arrival.estimated,
                        actual: flight.arrival.actual,
                        terminal: flight.arrival.terminal,
                        gate: flight.arrival.gate,
                        delay: flight.arrival.delay
                    },
                    delay: flight.departure.delay || 0,
                    aircraft: flight.aircraft?.iata,
                    airline: flight.airline.name,
                    source: 'aviationstack'
                };
            }

            return null;
        } catch (error) {
            console.error('AviationStack API error:', error.message);
            return null;
        }
    }

    /**
     * Get flight status with caching and fallback
     */
    async getFlightStatus(flightNumber, date) {
        try {
            // Check cache first
            const cacheKey = `${flightNumber}_${date}`;
            const cached = this.cache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
                console.log(`✅ Returning cached status for ${flightNumber}`);
                return cached.data;
            }

            // Try FlightAware first
            let status = await this.getFlightStatusFlightAware(flightNumber, date);

            // Fallback to AviationStack if FlightAware fails
            if (!status) {
                status = await this.getFlightStatusAviationStack(flightNumber, date);
            }

            // Cache the result
            if (status) {
                this.cache.set(cacheKey, {
                    data: status,
                    timestamp: Date.now()
                });
            }

            return status;
        } catch (error) {
            console.error('Get flight status error:', error);
            return null;
        }
    }

    /**
     * Map FlightAware status to standard status
     */
    mapFlightAwareStatus(status) {
        const statusMap = {
            'Scheduled': 'scheduled',
            'Filed': 'scheduled',
            'Active': 'active',
            'En Route': 'active',
            'Landed': 'landed',
            'Arrived': 'landed',
            'Cancelled': 'cancelled',
            'Diverted': 'diverted',
            'Delayed': 'delayed'
        };

        return statusMap[status] || status.toLowerCase();
    }

    /**
     * Calculate delay in minutes
     */
    calculateDelay(flight) {
        if (!flight.scheduled_out || !flight.estimated_out) {
            return 0;
        }

        const scheduled = new Date(flight.scheduled_out);
        const estimated = new Date(flight.estimated_out);
        const diffMs = estimated - scheduled;

        return Math.max(0, Math.round(diffMs / (1000 * 60))); // Convert to minutes
    }

    /**
     * Check if flight has significant updates
     */
    hasSignificantUpdate(oldStatus, newStatus) {
        if (!oldStatus || !newStatus) return false;

        // Check for status changes
        if (oldStatus.status !== newStatus.status) {
            return true;
        }

        // Check for significant delay (more than 15 minutes)
        if (Math.abs(oldStatus.delay - newStatus.delay) > 15) {
            return true;
        }

        // Check for gate changes
        if (oldStatus.departure?.gate !== newStatus.departure?.gate) {
            return true;
        }

        return false;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('Flight tracking cache cleared');
    }

    /**
     * Clear old cache entries
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheDuration) {
                this.cache.delete(key);
            }
        }
    }
}

module.exports = { FlightTrackingService };
