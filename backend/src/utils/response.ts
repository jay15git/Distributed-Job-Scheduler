import { Response } from 'express';
// @ts-expect-error Types for shared package are not resolved properly by tsc in this workspace setup
import { SuccessResponse, ErrorResponse } from 'shared';

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T,
  meta?: Record<string, any>
) => {
  const response: SuccessResponse<T> = {
    success: true,
    message,
    data,
    meta,
  };
  return res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  code: string,
  details: any[] = []
) => {
  const response: ErrorResponse = {
    success: false,
    message,
    error: {
      code,
      details,
    },
    requestId: (res.locals.requestId as string) || 'unknown',
  };
  return res.status(statusCode).json(response);
};
