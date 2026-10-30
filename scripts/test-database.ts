function parseDatabase(value: string, name: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a PostgreSQL URL`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${name} must be a PostgreSQL URL`);
  }
  if (url.search || url.hash) {
    throw new Error(`${name} must not contain query parameters or fragments`);
  }
  return url;
}

export function requireTestDatabase(
  testValue: string | undefined,
  workingValue: string | undefined,
) {
  if (!testValue) throw new Error("TEST_DATABASE_URL is required");
  const test = parseDatabase(testValue, "TEST_DATABASE_URL");
  if (decodeURIComponent(test.pathname) !== "/aster_test") {
    throw new Error(
      "TEST_DATABASE_URL must name the disposable aster_test database",
    );
  }
  if (workingValue) {
    const working = parseDatabase(workingValue, "DATABASE_URL");
    // Reject equal database names even across host aliases or differing credentials.
    if (
      decodeURIComponent(working.pathname) === decodeURIComponent(test.pathname)
    ) {
      throw new Error("Test database must differ from the working database");
    }
  }
  return testValue;
}
