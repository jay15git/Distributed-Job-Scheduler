export interface SuccessResponse<T = any> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, any>;
}

export interface ErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details: string[] | Record<string, any>[];
  };
  requestId: string;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

export interface PaginatedMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> extends SuccessResponse<T[]> {
  meta: PaginatedMeta;
}
