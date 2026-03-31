import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

async function testGeminiDirectly() {
  if (!GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY or GOOGLE_API_KEY is not set in .env');
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Write a short tagline for an AI-powered social media content creator tool called Predis.' }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 100,
    },
  };

  console.log(`Testing Gemini (${GEMINI_MODEL})...`);

  try {
    const response = await axios.post(url, body, { timeout: 30000 });
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      console.log('Success! Gemini response:');
      console.log('-------------------------');
      console.log(text.trim());
      console.log('-------------------------');
    } else {
      console.error('Failed to get a valid response from Gemini.');
      console.log('Response data:', JSON.stringify(response.data, null, 2));
    }
  } catch (error: any) {
    console.error('Error calling Gemini API:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testGeminiDirectly();
