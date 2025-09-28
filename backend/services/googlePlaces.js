class GooglePlacesService {
    constructor() {
        this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
        this.baseUrl = 'https://maps.googleapis.com/maps/api';
    }

    async searchNearby(location, type = 'tourist_attraction', radius = 1000, options = {}) {
        if (!this.apiKey) {
            throw new Error('Google Maps API key not configured');
        }

        try {
            let url = `${this.baseUrl}/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=${radius}&type=${type}&key=${this.apiKey}`;

            if (options.minprice) url += `&minprice=${options.minprice}`;
            if (options.maxprice) url += `&maxprice=${options.maxprice}`;
            if (options.opennow) url += `&opennow=true`;
            if (options.keyword) url += `&keyword=${encodeURIComponent(options.keyword)}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK') {
                throw new Error(`Google Places API error: ${data.status}`);
            }

            return data.results.map(place => ({
                id: place.place_id,
                name: place.name,
                rating: place.rating,
                userRatingsTotal: place.user_ratings_total,
                address: place.vicinity,
                types: place.types,
                priceLevel: place.price_level,
                openNow: place.opening_hours?.open_now,
                photos: place.photos?.map(photo =>
                    `${this.baseUrl}/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${this.apiKey}`
                ) || [],
                location: {
                    lat: place.geometry.location.lat,
                    lng: place.geometry.location.lng
                }
            }));
        } catch (error) {
            console.error('Google Places search error:', error);
            throw error;
        }
    }

    async getPlaceDetails(placeId, fields = ['name', 'rating', 'formatted_address', 'formatted_phone_number', 'opening_hours', 'website', 'reviews']) {
        try {
            const url = `${this.baseUrl}/place/details/json?place_id=${placeId}&fields=${fields.join(',')}&key=${this.apiKey}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK') {
                throw new Error(`Google Places API error: ${data.status}`);
            }

            return data.result;
        } catch (error) {
            console.error('Google Places details error:', error);
            throw error;
        }
    }

    async getWeatherInfo(location) {
        try {
            const weatherApiKey = process.env.WEATHER_API_KEY;
            if (!weatherApiKey) return null;

            const response = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lng}&appid=${weatherApiKey}&units=metric`
            );

            const data = await response.json();

            return {
                temperature: data.main.temp,
                description: data.weather[0].description,
                humidity: data.main.humidity,
                windSpeed: data.wind.speed,
                condition: data.weather[0].main,
                icon: data.weather[0].icon
            };
        } catch (error) {
            console.error('Weather API error:', error);
            return null;
        }
    }
}

module.exports = { GooglePlacesService };
