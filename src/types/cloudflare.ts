export interface CFCustomHostname {
  id: string;
  hostname: string;
  status:
    | "active"
    | "pending"
    | "active_redeploying"
    | "moved"
    | "pending_deletion"
    | "deleted"
    | "pending_migration"
    | "pending_provisioned"
    | "test_pending"
    | "test_active"
    | "test_active_apex";
  ssl: {
    status: string;
    method: string;
    type: string;
    validation_errors?: Array<{ message: string }>;
  };
  verification_errors?: string[];
  ownership_verification?: {
    type: string;
    name: string;
    value: string;
  };
}

export interface CFApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

export interface CFListResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T[];
  result_info: {
    page: number;
    per_page: number;
    total_pages: number;
    count: number;
    total_count: number;
  };
}
