/**
 * Public surface of `@care/shared`. The tsconfig path alias resolves `@care/shared`
 * to this file only, so every domain schema/type must be re-exported here. The
 * server imports schemas + types (validation); the client imports types only.
 */
export * from './enums';
export * from './health';
export * from './service-user';
export * from './week-plan';
export * from './day-entry';
export * from './activity-type';
export * from './user';
export * from './home';
export * from './home-assignment';
export * from './auth';
export * from './compliance';
export * from './audit';
export * from './review-hint';
export * from './staff-assignment';
export * from './summary';
export * from './report';
