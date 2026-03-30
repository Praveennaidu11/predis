import axios from 'axios';

async function testAIServiceDirectly(duration: number, model: string, numClips?: number) {
  const videoApiUrl = 'https://textvideogenerator.amealio.com/generate';
  
  const payload: any = {
    prompt: 'A test video of a cat',
    duration: duration,
    model: model, 
    video_type: 'text-to-video',
    platform: 'instagram',
  };

  if (numClips) {
    payload.num_clips = numClips;
  }

  console.log(`\n--- Testing Duration: ${duration}s, Model: ${model}, num_clips: ${numClips} ---`);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(videoApiUrl, payload, {
      timeout: 300000,
    });

    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
  }
}

async function runTests() {
  await testAIServiceDirectly(10, 'local', 2);
}

runTests();
