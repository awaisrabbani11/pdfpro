import { sql } from '@vercel/postgres';

export { sql };

// Helper function to execute queries with error handling
export async function query<T = any>(sqlQuery: string, params: any[] = []): Promise<T[]> {
  try {
    const result = await sql.query(sqlQuery, params);
    return result.rows as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper to get a single row
export async function queryOne<T = any>(sqlQuery: string, params: any[] = []): Promise<T | null> {
  const results = await query<T>(sqlQuery, params);
  return results.length > 0 ? results[0] : null;
}
