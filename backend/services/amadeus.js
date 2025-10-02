// backend/services/amadeus.js
class AmadeusService {
    constructor() {
        this.apiKey = process.env.AMADEUS_API_KEY;
        this.apiSecret = process.env.AMADEUS_API_SECRET;
        this.baseUrl = 'https://test.api.amadeus.com/v1';
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
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('client_id', this.apiKey);
            params.append('client_secret', this.apiSecret);

            const response = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Amadeus auth error:', errorText);
                throw new Error(`Amadeus authentication failed: ${response.status}`);
            }

            const data = await response.json();
            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

            console.log('✅ Amadeus authentication successful');
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
            console.log('🔍 Searching flights:', { origin, destination, departureDate, returnDate });
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            // Log the full response for debugging
            console.log('Amadeus API Response Status:', response.status);
            console.log('Amadeus API Response:', JSON.stringify(data, null, 2));

            if (!response.ok) {
                // Better error handling with specific error messages
                const errorMessage = data.errors?.[0]?.detail || data.errors?.[0]?.title || 'Unknown error';
                const errorCode = data.errors?.[0]?.code || 'UNKNOWN';
                console.error('Amadeus API Error:', errorCode, errorMessage);
                throw new Error(`Amadeus flight search error: ${errorMessage} (${errorCode})`);
            }

            // Check if we have data
            if (!data.data || data.data.length === 0) {
                console.log('No flights found for query');
                return [];
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
            console.log('🏨 Searching hotels:', { cityCode, checkInDate, checkOutDate });

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

            // Log the response
            console.log('Amadeus Hotels API Response Status:', hotelsResponse.status);
            console.log('Amadeus Hotels API Response:', JSON.stringify(hotelsData, null, 2));

            if (!hotelsResponse.ok) {
                const errorMessage = hotelsData.errors?.[0]?.detail || hotelsData.errors?.[0]?.title || 'Unknown error';
                const errorCode = hotelsData.errors?.[0]?.code || 'UNKNOWN';
                console.error('Amadeus Hotels API Error:', errorCode, errorMessage);
                throw new Error(`Amadeus hotel search error: ${errorMessage} (${errorCode})`);
            }

            if (!hotelsData.data || hotelsData.data.length === 0) {
                console.log('No hotels found for city code:', cityCode);
                return [];
            }

            return hotelsData.data.slice(0, 20); // Return first 20 hotels
        } catch (error) {
            console.error('Amadeus hotel search error:', error);
            throw error;
        }
    }
}

module.exports = { AmadeusService };
