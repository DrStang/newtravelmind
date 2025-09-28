class AmadeusService {
    constructor() {
        this.apiKey = process.env.AMADEUS_API_KEY;
        this.apiSecret = process.env.AMADEUS_API_SECRET;
        this.baseUrl = 'https://api.amadeus.com/v1';
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async getAccessToken() {
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('Amadeus API credentials not configured');
        }

        if (this.accessToken && this.tokenExpiry > Date.now()) {
            return this.accessToken;
        }

        try {
            const response = await fetch('https://api.amadeus.com/v1/security/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.apiSecret}`
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Amadeus auth error: ${data.error_description}`);
            }

            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            return this.accessToken;
        } catch (error) {
            console.error('Amadeus authentication error:', error);
            throw error;
        }
    }

    async searchFlights(params) {
        const token = await this.getAccessToken();

        const { origin, destination, departureDate, returnDate, adults = 1, travelClass = 'ECONOMY' } = params;

        let url = `${this.baseUrl}/shopping/flight-offers?originLocationCode=${origin}&destinationLocationCode=${destination}&departureDate=${departureDate}&adults=${adults}&travelClass=${travelClass}`;

        if (returnDate) url += `&returnDate=${returnDate}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Amadeus flight search error: ${data.errors?.[0]?.detail || 'Unknown error'}`);
            }

            return data.data.map(offer => ({
                id: offer.id,
                price: {
                    total: offer.price.total,
                    currency: offer.price.currency
                },
                itineraries: offer.itineraries.map(itinerary => ({
                    duration: itinerary.duration,
                    segments: itinerary.segments.map(segment => ({
                        departure: {
                            iataCode: segment.departure.iataCode,
                            at: segment.departure.at
                        },
                        arrival: {
                            iataCode: segment.arrival.iataCode,
                            at: segment.arrival.at
                        },
                        carrierCode: segment.carrierCode,
                        number: segment.number,
                        aircraft: segment.aircraft?.code,
                        duration: segment.duration
                    }))
                })),
                validatingAirlineCodes: offer.validatingAirlineCodes
            }));
        } catch (error) {
            console.error('Amadeus flight search error:', error);
            throw error;
        }
    }

    async searchHotels(params) {
        const token = await this.getAccessToken();

        const { cityCode, checkInDate, checkOutDate, adults = 1, rooms = 1 } = params;

        try {
            // First get hotel IDs in the city
            const hotelsResponse = await fetch(
                `${this.baseUrl}/reference-data/locations/hotels/by-city?cityCode=${cityCode}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            );

            const hotelsData = await hotelsResponse.json();

            if (!hotelsResponse.ok) {
                throw new Error(`Amadeus hotel search error: ${hotelsData.errors?.[0]?.detail || 'Unknown error'}`);
            }

            return hotelsData.data || [];
        } catch (error) {
            console.error('Amadeus hotel search error:', error);
            throw error;
        }
    }
}

module.exports = { AmadeusService };
