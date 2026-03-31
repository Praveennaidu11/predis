import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

async function listModels() {
  if (!GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY or GOOGLE_API_KEY is not set in .env');
    return;
  }

  console.log('Fetching available models for this key...');
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  try {
    const response = await axios.get(url);
    console.log('Available models:');
    response.data.models.forEach((m: any) => {
      if (m.supportedGenerationMethods.includes('generateContent')) {
        console.log(`- ${m.name.replace('models/', '')}`);
      }
    });
  } catch (error: any) {
    console.error('Error listing models:', error.response?.data || error.message);
  }
}

listModels();
