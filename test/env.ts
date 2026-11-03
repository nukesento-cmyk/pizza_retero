export const TEST_OWNER_URL =
  process.env.TEST_DATABASE_OWNER_URL ?? "postgres://retero_owner:retero_owner_dev@localhost:54329/retero_test";
export const TEST_APP_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://retero_app:retero_app_dev@localhost:54329/retero_test";
export const TEST_SYSTEM_URL =
  process.env.TEST_DATABASE_SYSTEM_URL ?? "postgres://retero_system:retero_system_dev@localhost:54329/retero_test";
