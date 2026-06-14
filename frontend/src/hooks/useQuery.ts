import { useState, useEffect, useCallback, useRef } from 'react';

type RefetchFn = () => Promise<any>;

// Global registry linking query keys to active refetch callbacks
const queryRegistry = new Map<string, Set<RefetchFn>>();

/**
 * Invalidates all active queries whose keys match or start with the given pattern.
 */
export function invalidateQueries(keyPattern: string) {
  for (const [key, refetchSet] of queryRegistry.entries()) {
    if (key === keyPattern || key.startsWith(keyPattern) || keyPattern === '*') {
      refetchSet.forEach((refetch) => {
        refetch().catch(() => {});
      });
    }
  }
}

interface UseQueryOptions {
  enabled?: boolean;
  onSuccess?: (data: any) => void;
}

export function useQuery<T = any>(
  key: string,
  fetchFn: () => Promise<T>,
  options: UseQueryOptions = {}
) {
  const { enabled = true, onSuccess } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  
  const fetchFnRef = useRef(fetchFn);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
    onSuccessRef.current = onSuccess;
  }, [fetchFn, onSuccess]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
      if (onSuccessRef.current) {
        onSuccessRef.current(result);
      }
      return result;
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let isSubscribed = true;
    
    const runFetch = async () => {
      setLoading(true);
      try {
        const result = await fetchFnRef.current();
        if (isSubscribed) {
          setData(result);
          setError(null);
          if (onSuccessRef.current) {
            onSuccessRef.current(result);
          }
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    };

    runFetch();

    return () => {
      isSubscribed = false;
    };
  }, [key, enabled]);

  // Register the query key and refetch hook in the query registry
  useEffect(() => {
    if (!enabled) return;

    let set = queryRegistry.get(key);
    if (!set) {
      set = new Set();
      queryRegistry.set(key, set);
    }
    set.add(refetch);

    return () => {
      const activeSet = queryRegistry.get(key);
      if (activeSet) {
        activeSet.delete(refetch);
        if (activeSet.size === 0) {
          queryRegistry.delete(key);
        }
      }
    };
  }, [key, enabled, refetch]);

  return { data, error, loading, refetch };
}

interface UseMutationOptions<T, V> {
  onSuccess?: (data: T, variables: V) => void;
  onError?: (error: Error, variables: V) => void;
}

export function useMutation<T = any, V = any>(
  mutationFn: (variables: V) => Promise<T>,
  options: UseMutationOptions<T, V> = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const mutate = useCallback(
    async (variables?: V) => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutationFn(variables as V);
        setData(result);
        if (options.onSuccess) {
          options.onSuccess(result, variables as V);
        }
        return result;
      } catch (err: any) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        if (options.onError) {
          options.onError(errorObj, variables as V);
        }
        throw errorObj;
      } finally {
        setLoading(false);
      }
    },
    [mutationFn, options]
  );

  return { mutate, data, error, loading };
}
