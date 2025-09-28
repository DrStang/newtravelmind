class OllamaService {
    constructor() {
        this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.models = {
            chat: process.env.OLLAMA_CHAT_MODEL || 'llama2',
            planning: process.env.OLLAMA_PLANNING_MODEL || 'llama2:13b',
            translation: process.env.OLLAMA_TRANSLATION_MODEL || 'mistral',
            analysis: process.env.OLLAMA_ANALYSIS_MODEL || 'llama2'
        };
    }

    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        } catch (error) {
            console.error('Ollama health check failed:', error.message);
            return false;
        }
    }

    async chat(message, context = {}, modelType = 'chat') {
        try {
            const model = this.models[modelType] || this.models.chat;
            const prompt = this.buildContextPrompt(message, context, modelType);

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: this.getTemperatureForType(modelType),
                        top_p: 0.9,
                        top_k: 40,
                        num_ctx: 4096
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const data = await response.json();
            return {
                message: data.response,
                model: model,
                tokens: data.eval_count || 0,
                responseTime: data.total_duration || 0,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Ollama chat error:', error);
            throw error;
        }
    }

    buildContextPrompt(message, context, modelType) {
        let systemPrompt = '';

        switch (modelType) {
            case 'planning':
                systemPrompt = `You are an expert travel planner. Create detailed, personalized itineraries with specific times, costs, and logistics. Always consider budget constraints and user preferences.`;
                break;
            case 'companion':
                systemPrompt = `You are a real-time travel companion. Provide immediate, location-specific assistance. Be concise but helpful for travelers on-the-go.`;
                break;
            case 'translation':
                systemPrompt = `You are a professional translator specializing in travel contexts. Provide accurate translations with cultural context when relevant.`;
                break;
            case 'analysis':
                systemPrompt = `You are a travel analytics expert. Analyze travel data to provide insights, patterns, and recommendations based on user behavior and preferences.`;
                break;
            default:
                systemPrompt = `You are a helpful AI travel assistant. Provide friendly, accurate, and contextual travel advice.`;
        }

        let contextInfo = `
Current context:
${context.mode ? `- Mode: ${context.mode}` : ''}
${context.location ? `- Location: ${context.location.name || `${context.location.lat}, ${context.location.lng}`}` : ''}
${context.weather ? `- Weather: ${context.weather}` : ''}
${context.userPreferences ? `- Preferences: ${context.userPreferences.join(', ')}` : ''}
${context.budget ? `- Budget: $${context.budget}` : ''}
${context.travelStyle ? `- Travel style: ${context.travelStyle}` : ''}
`;

        return `${systemPrompt}\n\n${contextInfo}\n\nUser message: ${message}\n\nResponse:`;
    }

    getTemperatureForType(modelType) {
        const temperatures = {
            planning: 0.3,    // More deterministic for planning
            companion: 0.7,   // Balanced for conversation
            translation: 0.1, // Very deterministic for accuracy
            analysis: 0.2     // Low for consistent analysis
        };
        return temperatures[modelType] || 0.7;
    }

    async generateDetailedItinerary(tripData, userPreferences = []) {
        const context = {
            mode: 'planning',
            userPreferences,
            budget: tripData.budget,
            travelStyle: tripData.travelStyle
        };

        const prompt = `Create a detailed ${tripData.duration}-day itinerary for ${tripData.destination}.

Requirements:
- Budget: $${tripData.budget} total
- Travel style: ${tripData.travelStyle || 'Moderate'}
- Interests: ${tripData.interests?.join(', ') || 'General tourism'}

For each day, provide:
1. Morning activity (9 AM - 12 PM) with estimated cost
2. Lunch recommendation with price range
3. Afternoon activity (1 PM - 5 PM) with estimated cost
4. Dinner recommendation with price range
5. Evening activity or rest (6 PM - 10 PM)
6. Total daily budget breakdown
7. Transportation tips and costs

Include specific venue names, addresses, and booking recommendations where possible.`;

        const response = await this.chat(prompt, context, 'planning');
        return {
            itinerary: response.message,
            model: response.model,
            generatedAt: response.timestamp
        };
    }

    async translateWithContext(text, targetLanguage, sourceLanguage = 'auto', context = {}) {
        const contextPrompt = `Translate this travel-related text from ${sourceLanguage} to ${targetLanguage}.

Context: ${context.type || 'general travel'}
${context.location ? `Location: ${context.location}` : ''}

Text to translate: "${text}"

Provide just the translation, no additional explanation.`;

        const response = await this.chat(contextPrompt, context, 'translation');

        return {
            translation: response.message,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            confidence: 0.9,
            model: response.model
        };
    }
}

module.exports = { OllamaService };
