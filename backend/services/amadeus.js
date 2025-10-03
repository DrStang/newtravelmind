// backend/services/amadeus.js - CORRECTED VERSION with v2 endpoint
class AmadeusService {
    constructor() {
        this.apiKey = process.env.AMADEUS_API_KEY;
        this.apiSecret = process.env.AMADEUS_API_SECRET;
        this.baseUrl = 'https://test.api.amadeus.com'; // Test environment
        // For production, use: 'https://api.amadeus.com'
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async getAccessToken() {
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('Amadeus API credentials not configured');
        }

        // Return cached token if still valid
        if (this.accessToken && this.tokenExpiry > Date.now()) {
            return this.accessToken;
        }

        try {
            const response = await fetch(`${this.baseUrl}/v1/security/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.apiSecret}`
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Amadeus auth error: ${data.error_description || JSON.stringify(data)}`);
            }

            this.accessToken = data.access_token;
            // Set expiry with 5 minute buffer
            this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

            console.log('✅ Amadeus access token obtained');
            return this.accessToken;
        } catch (error) {
            console.error('❌ Amadeus authentication error:', error);
            throw error;
        }
    }

    async searchFlights(params) {
        const token = await this.getAccessToken();

        const {
            origin,
            destination,
            departureDate,
            returnDate,
            adults = 1,
            children = 0,
            infants = 0,
            travelClass = 'ECONOMY',
            nonStop = false,
            currencyCode = 'USD',
            max = 10
        } = params;

        // Build URL with query parameters - USING V2 ENDPOINT
        let url = `${this.baseUrl}/v2/shopping/flight-offers?originLocationCode=${origin}&destinationLocationCode=${destination}&departureDate=${departureDate}&adults=${adults}`;

        if (returnDate) url += `&returnDate=${returnDate}`;
        if (children > 0) url += `&children=${children}`;
        if (infants > 0) url += `&infants=${infants}`;
        if (travelClass !== 'ECONOMY') url += `&travelClass=${travelClass}`;
        if (nonStop) url += `&nonStop=true`;
        if (currencyCode) url += `&currencyCode=${currencyCode}`;
        if (max) url += `&max=${max}`;

        try {
            console.log(`🔍 Searching flights: ${origin} → ${destination} on ${departureDate}`);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data.errors?.[0]?.detail || data.error_description || 'Unknown error';
                throw new Error(`Amadeus flight search error: ${errorMsg}`);
            }

            if (!data.data || data.data.length === 0) {
                return {
                    offers: [],
                    meta: { count: 0 },
                    message: 'No flights found for the specified criteria'
                };
            }

            // Parse and format the flight offers
            const offers = data.data.map(offer => ({
                id: offer.id,
                type: offer.type,
                source: offer.source,
                instantTicketingRequired: offer.instantTicketingRequired,
                nonHomogeneous: offer.nonHomogeneous,
                oneWay: offer.oneWay,
                lastTicketingDate: offer.lastTicketingDate,
                numberOfBookableSeats: offer.numberOfBookableSeats,

                // Price information
                price: {
                    currency: offer.price.currency,
                    total: parseFloat(offer.price.total),
                    base: parseFloat(offer.price.base),
                    fees: offer.price.fees?.map(fee => ({
                        amount: parseFloat(fee.amount),
                        type: fee.type
                    })),
                    grandTotal: parseFloat(offer.price.grandTotal)
                },

                // Price breakdown per traveler
                pricingOptions: {
                    fareType: offer.pricingOptions?.fareType,
                    includedCheckedBagsOnly: offer.pricingOptions?.includedCheckedBagsOnly
                },

                // Traveler pricing
                travelerPricings: offer.travelerPricings?.map(tp => ({
                    travelerId: tp.travelerId,
                    fareOption: tp.fareOption,
                    travelerType: tp.travelerType,
                    price: {
                        currency: tp.price.currency,
                        total: parseFloat(tp.price.total),
                        base: parseFloat(tp.price.base)
                    }
                })),

                // Itineraries (outbound and return)
                itineraries: offer.itineraries.map(itinerary => ({
                    duration: itinerary.duration,
                    segments: itinerary.segments.map(segment => ({
                        // Departure information
                        departure: {
                            iataCode: segment.departure.iataCode,
                            terminal: segment.departure.terminal,
                            at: segment.departure.at
                        },
                        // Arrival information
                        arrival: {
                            iataCode: segment.arrival.iataCode,
                            terminal: segment.arrival.terminal,
                            at: segment.arrival.at
                        },
                        // Flight details
                        carrierCode: segment.carrierCode,
                        number: segment.number,
                        aircraft: {
                            code: segment.aircraft?.code
                        },
                        operating: {
                            carrierCode: segment.operating?.carrierCode
                        },
                        duration: segment.duration,
                        id: segment.id,
                        numberOfStops: segment.numberOfStops,
                        blacklistedInEU: segment.blacklistedInEU
                    }))
                })),

                // Validating airline codes
                validatingAirlineCodes: offer.validatingAirlineCodes
            }));

            console.log(`✅ Found ${offers.length} flight offers`);

            return {
                offers,
                dictionaries: data.dictionaries,
                meta: {
                    count: offers.length,
                    links: data.meta?.links
                }
            };

        } catch (error) {
            console.error('❌ Amadeus flight search error:', error);
            throw error;
        }
    }

    async searchHotels(params) {
        const token = await this.getAccessToken();

        const {
            cityCode,
            latitude,
            longitude,
            checkInDate,
            checkOutDate,
            adults = 1,
            roomQuantity = 1,
            radius = 5,
            radiusUnit = 'KM',
            currency = 'USD',
            ratings,
            amenities,
            priceRange,
            hotelName
        } = params;

        try {
            // First, search for hotels by city or location
            let searchUrl = `${this.baseUrl}/v1/reference-data/locations/hotels/by-city?cityCode=${cityCode}`;

            if (latitude && longitude) {
                searchUrl = `${this.baseUrl}/v1/reference-data/locations/hotels/by-geocode?latitude=${latitude}&longitude=${longitude}`;
            }

            if (radius) searchUrl += `&radius=${radius}`;
            if (radiusUnit) searchUrl += `&radiusUnit=${radiusUnit}`;
            if (hotelName) searchUrl += `&hotelName=${encodeURIComponent(hotelName)}`;
            if (amenities) searchUrl += `&amenities=${amenities.join(',')}`;
            if (ratings) searchUrl += `&ratings=${ratings.join(',')}`;

            console.log(`🏨 Searching hotels in: ${cityCode}`);

            const hotelListResponse = await fetch(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            const hotelListData = await hotelListResponse.json();

            if (!hotelListResponse.ok) {
                const errorMsg = hotelListData.errors?.[0]?.detail || 'Unknown error';
                throw new Error(`Amadeus hotel search error: ${errorMsg}`);
            }

            if (!hotelListData.data || hotelListData.data.length === 0) {
                return {
                    hotels: [],
                    meta: { count: 0 },
                    message: 'No hotels found for the specified criteria'
                };
            }

            // Get hotel IDs for offer search
            const hotelIds = hotelListData.data.slice(0, 20).map(hotel => hotel.hotelId).join(',');

            // Search for hotel offers with pricing
            const offersUrl = `${this.baseUrl}/v3/shopping/hotel-offers?hotelIds=${hotelIds}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&adults=${adults}&roomQuantity=${roomQuantity}&currency=${currency}`;

            const offersResponse = await fetch(offersUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            const offersData = await offersResponse.json();

            if (!offersResponse.ok) {
                // If offers API fails, return hotel list without pricing
                console.warn('⚠️ Could not fetch hotel offers, returning hotel list only');
                return {
                    hotels: hotelListData.data.map(hotel => ({
                        hotelId: hotel.hotelId,
                        name: hotel.name,
                        iataCode: hotel.iataCode,
                        address: hotel.address,
                        geoCode: hotel.geoCode,
                        distance: hotel.distance
                    })),
                    meta: { count: hotelListData.data.length }
                };
            }

            const hotels = offersData.data?.map(offer => ({
                hotelId: offer.hotel.hotelId,
                name: offer.hotel.name,
                chainCode: offer.hotel.chainCode,
                iataCode: offer.hotel.iataCode,
                dupeId: offer.hotel.dupeId,
                latitude: offer.hotel.latitude,
                longitude: offer.hotel.longitude,

                // Available offers
                offers: offer.offers?.map(hotelOffer => ({
                    id: hotelOffer.id,
                    checkInDate: hotelOffer.checkInDate,
                    checkOutDate: hotelOffer.checkOutDate,
                    rateCode: hotelOffer.rateCode,
                    rateFamilyEstimated: hotelOffer.rateFamilyEstimated,

                    room: {
                        type: hotelOffer.room?.type,
                        typeEstimated: hotelOffer.room?.typeEstimated,
                        description: hotelOffer.room?.description?.text
                    },

                    guests: {
                        adults: hotelOffer.guests?.adults
                    },

                    price: {
                        currency: hotelOffer.price?.currency,
                        base: parseFloat(hotelOffer.price?.base),
                        total: parseFloat(hotelOffer.price?.total),
                        taxes: hotelOffer.price?.taxes?.map(tax => ({
                            amount: parseFloat(tax.amount),
                            currency: tax.currency,
                            code: tax.code,
                            included: tax.included
                        }))
                    },

                    policies: {
                        cancellation: hotelOffer.policies?.cancellation,
                        paymentType: hotelOffer.policies?.paymentType
                    }
                })) || []
            })) || [];

            console.log(`✅ Found ${hotels.length} hotels with offers`);

            return {
                hotels,
                meta: {
                    count: hotels.length
                }
            };

        } catch (error) {
            console.error('❌ Amadeus hotel search error:', error);
            throw error;
        }
    }

    async getHotelDetails(hotelId) {
        const token = await this.getAccessToken();

        try {
            const response = await fetch(
                `${this.baseUrl}/v1/reference-data/locations/hotels/by-hotels?hotelIds=${hotelId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Amadeus hotel details error: ${data.errors?.[0]?.detail || 'Unknown error'}`);
            }

            return data.data?.[0] || null;
        } catch (error) {
            console.error('Hotel details error:', error);
            throw error;
        }
    }
    // backend/services/amadeus.js - Add this method to AmadeusService

    async searchAirports(keyword) {
        const token = await this.getAccessToken();

        try {
            const url = `${this.baseUrl}/v1/reference-data/locations?subType=AIRPORT,CITY&keyword=${encodeURIComponent(keyword)}&page[limit]=20`;

            console.log(`🔍 Searching airports: ${keyword}`);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Amadeus airport search error: ${data.errors?.[0]?.detail || 'Unknown error'}`);
            }

            // Format the response
            const airports = (data.data || []).map(location => ({
                id: location.id,
                type: location.type,
                subType: location.subType,
                name: location.name,
                detailedName: location.detailedName,
                iataCode: location.iataCode,
                address: {
                    cityName: location.address?.cityName,
                    cityCode: location.address?.cityCode,
                    countryName: location.address?.countryName,
                    countryCode: location.address?.countryCode,
                    stateCode: location.address?.stateCode,
                    regionCode: location.address?.regionCode
                },
                geoCode: {
                    latitude: location.geoCode?.latitude,
                    longitude: location.geoCode?.longitude
                },
                timeZone: location.timeZoneOffset
            }));

            console.log(`✅ Found ${airports.length} airports`);

            return {
                airports,
                meta: {
                    count: airports.length
                }
            };

        } catch (error) {
            console.error('❌ Amadeus airport search error:', error);
            throw error;
        }
    }

    async searchActivities(params) {
        const token = await this.getAccessToken();

        const {
            latitude,
            longitude,
            radius = 1
        } = params;

        try {
            const url = `${this.baseUrl}/v1/shopping/activities?latitude=${latitude}&longitude=${longitude}&radius=${radius}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Amadeus activities search error: ${data.errors?.[0]?.detail || 'Unknown error'}`);
            }

            return {
                activities: data.data || [],
                meta: {
                    count: data.meta?.count || 0
                }
            };
        } catch (error) {
            console.error('Activities search error:', error);
            throw error;
        }
    }
}

module.exports = { AmadeusService };
