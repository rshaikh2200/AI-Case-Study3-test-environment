import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { input } = await req.json();

    if (!input) {
      return NextResponse.json({ error: 'Input is required.' }, { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'alloy',
        input,
      }),
    });

    console.log('API Response Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Stream the response directly to the client
    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Transfer-Encoding', 'chunked');

    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Error generating audio:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}