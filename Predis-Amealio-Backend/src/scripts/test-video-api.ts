import axios from 'axios';

async function testVideoGeneration() {
  const backendUrl = 'http://localhost:8001/api';
  const token = 'YOUR_AUTH_TOKEN'; // Replace with a valid token or skip auth for testing

  try {
    const response = await axios.post(`${backendUrl}/video/generate`, {
      prompt: 'A sunset over the mountains',
      type: 'text',
      duration: 10,
      model: 'wan',
      platform: 'instagram'
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Video Generation Result:', response.data);
  } catch (error: any) {
    console.error('Error testing video generation:', error.response?.data || error.message);
  }
}

// testVideoGeneration();
