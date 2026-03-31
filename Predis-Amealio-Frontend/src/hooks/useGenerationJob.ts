import { useEffect, useRef, useState } from 'react';
import { generationApi, GenerationJob, CreateGenerationJobDto } from '@/lib/api/generation';

type State =
  | { status: 'idle'; job: null; error: null }
  | { status: 'creating'; job: null; error: null }
  | { status: 'polling'; job: GenerationJob; error: null }
  | { status: 'done'; job: GenerationJob; error: null }
  | { status: 'failed'; job: GenerationJob | null; error: string };

/**
 * Why a shared hook:
 * - Merchant + Admin must share the exact same generation/polling logic.
 * - Any future changes (SSE/Websocket, retry rules, provider switching) happen once here.
 */
export function useGenerationJob() {
  const [state, setState] = useState<State>({ status: 'idle', job: null, error: null });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  useEffect(() => stop, []);

  const poll = (jobId: string) => {
    stop();
    intervalRef.current = setInterval(async () => {
      try {
        const res = await generationApi.getJob(jobId);
        const job = res.data;
        if (job.status === 'done') {
          stop();
          setState({ status: 'done', job, error: null });
        } else if (job.status === 'failed') {
          stop();
          setState({ status: 'failed', job, error: job.error || 'Generation failed' });
        } else {
          setState({ status: 'polling', job, error: null });
        }
      } catch (e: any) {
        stop();
        setState({
          status: 'failed',
          job: null,
          error: e?.response?.data?.message || e?.message || 'Failed to poll job',
        });
      }
    }, 2500);
  };

  const createAndPoll = async (dto: CreateGenerationJobDto) => {
    stop();
    setState({ status: 'creating', job: null, error: null });
    try {
      const res = await generationApi.createJob(dto);
      const job = res.data;
      setState({ status: 'polling', job, error: null });
      poll(job.id);
      return job;
    } catch (e: any) {
      setState({
        status: 'failed',
        job: null,
        error: e?.response?.data?.message || e?.message || 'Failed to create job',
      });
      throw e;
    }
  };

  return { state, createAndPoll, stop };
}

