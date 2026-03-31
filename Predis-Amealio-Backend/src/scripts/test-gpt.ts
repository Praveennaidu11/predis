import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GPT_MODEL = process.env.GPT_MODEL || 'gpt-4o-mini';

async function testGPTDirectly() {
  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set in .env');
    return;
  }

  const url = 'https://api.openai.com/v1/chat/completions';

  const body = {
    model: GPT_MODEL,
    messages: [
      {
        role: 'user',
        parts: [{ text: 'Write a short tagline for an AI-powered social media content creator tool called Predis.' }],
      },
    ],
    max_tokens: 100,
    temperature: 0.7,
  };

  // Correcting the body format for OpenAI (OpenAI uses 'content' instead of 'parts' in 'messages')
  const correctedBody = {
    model: GPT_MODEL,
    messages: [
      {
        role: 'user',
        content: 'Write a short tagline for an AI-powered social media content creator tool called Predis.',
      },
    ],
    max_tokens: 100,
    temperature: 0.7,
  };

  console.log(`Testing GPT (${GPT_MODEL})...`);

  try {
    const response = await axios.post(url, correctedBody, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const text = response.data?.choices?.[0]?.message?.content;

    if (text) {
      console.log('Success! GPT response:');
      console.log('-------------------------');
      console.log(text.trim());
      console.log('-------------------------');
    } else {
      console.error('Failed to get a valid response from GPT.');
      console.log('Response data:', JSON.stringify(response.data, null, 2));
    }
  } catch (error: any) {
    console.error('Error calling OpenAI API:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testGPTDirectly();
