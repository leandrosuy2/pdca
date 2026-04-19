import { healthUrl } from '@/lib/api-url';

export async function checkBackendHealth() {
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Real-time check
    });
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error("Fetch Health Error:", error);
    throw error;
  }
}
