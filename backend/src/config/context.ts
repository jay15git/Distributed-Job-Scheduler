import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  organizationId?: string;
  projectId?: string;
  queueId?: string;
  jobId?: string;
  executionId?: string;
  workerId?: string;
  schedulerId?: string;
  userId?: string;
}

export const contextStorage = new AsyncLocalStorage<RequestContext>();

export const getContext = (): RequestContext | undefined => {
  return contextStorage.getStore();
};
