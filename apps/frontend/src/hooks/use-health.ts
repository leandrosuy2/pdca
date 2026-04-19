import { useState } from 'react';
import { checkBackendHealth } from '@/services/api';

export function useHealth() {
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await checkBackendHealth();
      setHealthStatus(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend.');
      setHealthStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return { healthStatus, loading, error, checkHealth };
}
