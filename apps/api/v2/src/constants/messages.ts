export const Messages = {
    SUCCESS: 'Success',
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',

    USER_NOT_FOUND: 'User not found',
    NOT_FOUND: 'Resource not found',
    USER_ALREADY_EXISTS: 'User already exists',
    ALREADY_EXISTS: 'Resource already exists',
    INVALID_CREDENTIALS: 'Invalid credentials',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    VALIDATION_ERROR: 'Validation failed',
    INTERNAL_ERROR: 'Internal server error',

    TOKEN_EXPIRED: 'Token has expired',
    TOKEN_INVALID: 'Invalid token',
    TOKEN_MISSING: 'Token is missing',

    EMAIL_ALREADY_EXISTS: 'Email already exists',
    PHONE_ALREADY_EXISTS: 'Phone number already exists',

    LEAD_CREATED: 'Lead created successfully',
    LEAD_UPDATED: 'Lead updated successfully',
    LEAD_DELETED: 'Lead deleted successfully',
    LEAD_NOT_FOUND: 'Lead not found',
    LEAD_STATUS_UPDATED: 'Lead status updated successfully',
    LEAD_STATUS_NOT_FOUND: 'Lead status not found',

    EMPLOYEE_CREATED: 'Employee created successfully',
    EMPLOYEE_UPDATED: 'Employee updated successfully',
    EMPLOYEE_NOT_FOUND: 'Employee not found',

    DEPARTMENT_CREATED: 'Department created successfully',
    DEPARTMENT_UPDATED: 'Department updated successfully',
    DEPARTMENT_NOT_FOUND: 'Department not found',
} as const;

export type MessageKey = keyof typeof Messages;