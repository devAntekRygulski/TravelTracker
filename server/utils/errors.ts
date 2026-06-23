export function getDatabaseErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLowerCase();

  if (message.includes('bad auth') || message.includes('authentication failed')) {
    return 'Database login failed. Check the username and password in your .env file.';
  }

  if (message.includes('querysrv') || message.includes('econnrefused')) {
    return 'Could not reach MongoDB. Check Atlas IP Access List and your connection string.';
  }

  if (message.includes('timed out')) {
    return 'Database connection timed out. Check Atlas Network Access and your internet connection.';
  }

  return fallback;
}
