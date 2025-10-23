class FoursquarePlacesService {
    constructor() {
        this.apiKey = process.env.FOURSQUARE_API_KEY;
        this.baseUrl = 'https://places-api.foursquare.com';
    }

    async searchNearby(location, categories = null, radius = 1000, options = {}) {
        if (!this.apiKey) {
            console.warn('Foursquare API key not configured, skipping Foursquare results');
            return [];
        }

        try {
            // Map Google Places types to Foursquare categories
            const categoryMap = {
                'restaurant': '13065',  // Food and Dining
                'cafe': '13032',        // Coffee Shop
                'bar': '13003',         // Bar
                'lodging': '19014',     // Hotel
                'tourist_attraction': '16000', // Landmarks and Outdoors
                'museum': '10027',      // Museum
                'park': '16032',        // Park
                'shopping_mall': '17069', // Shopping Mall
                'gym': '18021',         // Gym / Fitness Center
                'spa': '18041'          // Spa
            };

            // Build query parameters
            const params = new URLSearchParams({
                ll: `${location.lat},${location.lng}`,
                radius: radius,
                limit: 50  // Foursquare allows up to 50 results
            });

            // Add category if mapped
            if (categories && categoryMap[categories]) {
                params.append('categories', categoryMap[categories]);
            }

            // Add optional filters
            if (options.keyword) {
                params.append('query', options.keyword);
            }
            if (options.minprice || options.maxprice) {
                // Foursquare uses price tiers 1-4
                const priceMin = options.minprice || 1;
                const priceMax = options.maxprice || 4;
                params.append('price', `${priceMin},${priceMax}`);
            }
            
            if (options.opennow) {
                params.append('open_now', 'true');
            }

            const url = `${this.baseUrl}/places/search?${params.toString()}`;
            console.log(url);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.error('Foursquare API: Invalid API key');
                    return [];
                }
                throw new Error(`Foursquare API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                console.log(`No Foursquare results found for ${categories} near ${location.lat},${location.lng}`);
                return [];
            }
            if (response.status === 410) {
                console.error('Foursquare API: Endpoint depreciated(410)');
                return [];
            }

            // Transform Foursquare results to match Google Places format
            return data.results.map(place => ({
                id: `fsq_${place.fsq_id}`,
                name: place.name,
                rating: place.rating ? place.rating / 2 : undefined, // Foursquare uses 0-10 scale, convert to 0-5
                userRatingsTotal: place.stats?.total_ratings || undefined,
                address: place.location?.formatted_address || place.location?.address,
                types: place.categories?.map(cat => cat.name.toLowerCase().replace(/\s+/g, '_')) || [],
                priceLevel: place.price || undefined,
                openNow: undefined, // Foursquare doesn't provide this in basic search
                photos: place.photos?.map(photo =>
                    `${photo.prefix}300x300${photo.suffix}`
                ).slice(0, 5) || [],
                location: {
                    lat: place.geocodes?.main?.latitude || location.lat,
                    lng: place.geocodes?.main?.longitude || location.lng
                },
                source: 'foursquare',
                distance: place.distance,
                categories: place.categories?.map(cat => cat.name) || []
            }));

        } catch (error) {
            console.error('Foursquare Places search error:', error);
            // Return empty array on error instead of throwing
            return [];
        }
    }

    async getPlaceDetails(fsqId) {
        if (!this.apiKey) {
            throw new Error('Foursquare API key not configured');
        }

        try {
            const url = `${this.baseUrl}/${fsqId}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`Foursquare API error: ${response.status}`);
            }

            const data = await response.json();

            return {
                id: data.fsq_id,
                name: data.name,
                rating: data.rating ? data.rating / 2 : undefined,
                address: data.location?.formatted_address,
                phone: data.tel,
                website: data.website,
                hours: data.hours,
                photos: data.photos?.map(photo =>
                    `${photo.prefix}original${photo.suffix}`
                ) || [],
                description: data.description,
                tips: data.tips,
                categories: data.categories?.map(cat => cat.name) || [],
                source: 'foursquare'
            };

        } catch (error) {
            console.error('Foursquare place details error:', error);
            throw error;
        }
    }
}

module.exports = { FoursquarePlacesService };





