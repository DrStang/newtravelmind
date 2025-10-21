// backend/services/ai.js
class OllamaService {
    constructor() {
        this.provider = process.env.AI_PROVIDER || 'ollama'; // 'ollama' or 'openai'
        this.ollamaUrl = process.env.OLLAMA_BASE_URL || 'https://chat.drstang.xyz/ollama';
        this.openaiKey = process.env.OPENAI_API_KEY;
        this.timeout = parseInt(process.env.AI_TIMEOUT) || 60000; // 60 seconds default
    }

    async chat(message, context = {}, modelType = 'chat') {
        const startTime = Date.now();

        try {
            if (this.provider === 'openai') {
                return await this.chatOpenAI(message, context, modelType);
            } else {
                return await this.chatOllama(message, context, modelType);
            }
        } catch (error) {
            const elapsed = Date.now() - startTime;
            console.error(`AI chat error (${this.provider}) after ${elapsed}ms:`, error.message);

            // If Ollama times out, try OpenAI as fallback
            if (this.provider === 'ollama' && elapsed > 30000 && this.openaiKey) {
                console.log('⚠️ Ollama timeout, falling back to OpenAI...');
                return await this.chatOpenAI(message, context, modelType);
            }

            throw error;
        }
    }

    async chatOpenAI(message, context = {}, modelType = 'chat') {
        if (!this.openaiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const prompt = this.buildContextPrompt(message, context, modelType);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openaiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: this.getSystemPrompt(modelType) },
                        { role: 'user', content: prompt }
                    ],
                    temperature: this.getTemperatureForType(modelType),
                    max_tokens: 2000
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('OpenAI API error details:', {
                    status: response.status,
                    error: errorData,
                    model: 'gpt-4o-mini'
                });
                throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown'}`);
            }

            const data = await response.json();
            return {
                message: data.choices[0].message.content,
                model: 'gpt-4o-mini',
                tokens: data.usage.total_tokens,
                responseTime: Date.now() - Date.now(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('OpenAI request timeout');
            }
            throw error;
        }
    }

    async chatOllama(message, context = {}, modelType = 'chat') {
        const model = this.getOllamaModel(modelType);
        const prompt = this.buildContextPrompt(message, context, modelType);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
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
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

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
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Ollama request timeout');
            }
            throw error;
        }
    }

    getOllamaModel(modelType) {
        const models = {
            chat: process.env.OLLAMA_CHAT_MODEL || 'llama2',
            planning: process.env.OLLAMA_PLANNING_MODEL || 'llama2',
            translation: process.env.OLLAMA_TRANSLATION_MODEL || 'mistral',
            analysis: process.env.OLLAMA_ANALYSIS_MODEL || 'llama2'
        };
        return models[modelType] || models.chat;
    }

    getSystemPrompt(modelType) {
        const prompts = {
            planning: 'You are an expert travel planner. Create detailed, personalized itineraries with specific times, costs, and logistics. Include hotel recommendations',
            companion: 'You are a real-time travel companion. Provide immediate, location-specific assistance. Be concise but helpful.',
            translation: 'You are a professional translator specializing in travel contexts.',
            analysis: 'You are a travel analytics expert. Analyze travel data to provide insights and recommendations.',
            chat: 'You are a helpful AI travel assistant. Provide friendly, accurate, and contextual travel advice.'
        };
        return prompts[modelType] || prompts.chat;
    }

    buildContextPrompt(message, context, modelType) {
        const systemPrompt = this.getSystemPrompt(modelType);

        let contextInfo = `
Current context:
${context.mode ? `- Mode: ${context.mode}` : ''}
${context.location ? `- Location: ${context.location.name || `${context.location.lat}, ${context.location.lng}`}` : ''}
${context.weather ? `- Weather: ${JSON.stringify(context.weather)}` : ''}
${context.userPreferences ? `- Preferences: ${Array.isArray(context.userPreferences) ? context.userPreferences.join(', ') : context.userPreferences}` : ''}
${context.budget ? `- Budget: $${context.budget}` : ''}
${context.travelStyle ? `- Travel style: ${context.travelStyle}` : ''}
`;

        return `${systemPrompt}\n\n${contextInfo}\n\nUser message: ${message}\n\nResponse:`;
    }

    getTemperatureForType(modelType) {
        const temperatures = {
            planning: 0.3,
            companion: 0.7,
            translation: 0.1,
            analysis: 0.2
        };
        return temperatures[modelType] || 0.7;
    }

    async healthCheck() {
        if (this.provider === 'openai') {
            return !!this.openaiKey;
        }

        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch (error) {
            return false;
        }
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
    // ===================================
// ADD THESE METHODS TO OllamaService CLASS IN ollama.js
// Add after the generateDetailedItinerary method
// ===================================

    async identifyPhoto(imagePath, location = null) {
        const fs = require('fs');

        try {
            // Try vision model first if available
            if (this.provider === 'openai' && this.openaiKey) {
                return await this.identifyPhotoOpenAI(imagePath, location);
            } else {
                return await this.identifyPhotoOllama(imagePath, location);
            }
        } catch (error) {
            console.error('Photo identification error:', error.message);

            // Fallback to basic analysis
            return {
                name: 'Photo Analysis',
                description: 'Unable to perform detailed image analysis. Vision model not available.',
                landmarks: [],
                confidence: 0.3,
                method: 'fallback'
            };
        }
    }

    async identifyPhotoOpenAI(imagePath, location) {
        const fs = require('fs');

        if (!this.openaiKey) {
            throw new Error('OpenAI API key not configured');
        }

        // Read image as base64
        const imageBuffer = await fs.promises.readFile(imagePath);
        const imageBase64 = imageBuffer.toString('base64');

        const prompt = `Analyze this travel photo and identify landmarks or locations. ${location ? `Photo taken near: ${location.lat}, ${location.lng}` : ''}

Please provide:
1. The name of the landmark or location
2. A detailed description
3. Any notable features or landmarks visible
4. Your confidence in the identification (0.0 to 1.0)

Format:
NAME: [name]
DESCRIPTION: [description]
LANDMARKS: [comma-separated list]
CONFIDENCE: [0.0-1.0]`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openaiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/jpeg;base64,${imageBase64}`
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.3
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`OpenAI Vision API error: ${errorData.error?.message}`);
            }

            const data = await response.json();
            return this.parsePhotoIdentification(data.choices[0].message.content, 'openai-vision');
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    async identifyPhotoOllama(imagePath, location) {
        const fs = require('fs');

        // Check if vision model is available
        try {
            const tagsResponse = await fetch(`${this.ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });

            if (!tagsResponse.ok) {
                throw new Error('Ollama not available');
            }

            const tagsData = await tagsResponse.json();
            const hasVision = tagsData.models?.some(m =>
                m.name.includes('llava') ||
                m.name.includes('bakllava') ||
                m.name.includes('vision')
            );

            if (!hasVision) {
                throw new Error('No vision model available in Ollama');
            }
        } catch (error) {
            console.error('Vision model check failed:', error.message);
            throw new Error('Ollama vision model not available. Install with: ollama pull llava');
        }

        // Read image as base64
        const imageBuffer = await fs.promises.readFile(imagePath);
        const imageBase64 = imageBuffer.toString('base64');

        const prompt = `Analyze this travel photo and identify landmarks or locations. ${location ? `Photo taken near: ${location.lat}, ${location.lng}` : ''}

Please provide:
1. The name of the landmark or location
2. A detailed description
3. Any notable features or landmarks visible
4. Your confidence in the identification (0.0 to 1.0)

Format:
NAME: [name]
DESCRIPTION: [description]
LANDMARKS: [comma-separated list]
CONFIDENCE: [0.0-1.0]`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // Vision needs more time

        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llava',
                    prompt: prompt,
                    images: [imageBase64],
                    stream: false,
                    options: {
                        temperature: 0.3,
                        top_p: 0.9,
                        num_ctx: 4096
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Ollama vision API error: ${response.status}`);
            }

            const data = await response.json();
            return this.parsePhotoIdentification(data.response, 'ollama-vision');
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Photo identification timeout');
            }
            throw error;
        }
    }

    parsePhotoIdentification(aiResponse, method) {
        const lines = aiResponse.split('\n');
        let name = 'Unknown Location';
        let description = '';
        let landmarks = [];
        let confidence = 0.7;

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('NAME:')) {
                name = trimmedLine.replace('NAME:', '').trim();
            } else if (trimmedLine.startsWith('DESCRIPTION:')) {
                description = trimmedLine.replace('DESCRIPTION:', '').trim();
            } else if (trimmedLine.startsWith('LANDMARKS:')) {
                const landmarkStr = trimmedLine.replace('LANDMARKS:', '').trim();
                landmarks = landmarkStr.split(',').map(l => l.trim()).filter(Boolean);
            } else if (trimmedLine.startsWith('CONFIDENCE:')) {
                const confStr = trimmedLine.replace('CONFIDENCE:', '').trim();
                confidence = parseFloat(confStr) || 0.7;
            } else if (trimmedLine && !description && !trimmedLine.includes(':')) {
                // Accumulate description from unformatted text
                description += trimmedLine + ' ';
            }
        }

        // If no structured parsing worked, use the raw response as description
        if (!description.trim()) {
            description = aiResponse.trim();
        }

        // Ensure confidence is in valid range
        confidence = Math.max(0, Math.min(1, confidence));

        return {
            name: name || 'Location Analysis',
            description: description.trim() || 'Photo analyzed successfully.',
            landmarks: landmarks.length > 0 ? landmarks : ['No specific landmarks identified'],
            confidence: confidence,
            method: method
        };
    }

    async checkVisionAvailability() {
        if (this.provider === 'openai') {
            return !!this.openaiKey;
        }

        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) return false;

            const data = await response.json();
            return data.models?.some(m =>
                m.name.includes('llava') ||
                m.name.includes('bakllava') ||
                m.name.includes('vision')
            );
        } catch (error) {
            return false;
        }
    }
}


module.exports = { OllamaService };


