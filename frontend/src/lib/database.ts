import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export interface ConversationMessage {
  id: number;
  session_id: string;
  message_text: string;
  role: 'user' | 'assistant';
  vector_store?: 'qdrant';
  created_at: Date;
}

// Save a message to the conversation
export async function saveMessage(
  sessionId: string,
  messageText: string,
  role: 'user' | 'assistant',
  vectorStore: 'qdrant' = 'qdrant'
): Promise<ConversationMessage> {
  const query = `
    INSERT INTO conversations (session_id, message_text, role, vector_store)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const result = await pool.query(query, [sessionId, messageText, role, vectorStore]);
  return result.rows[0];
}

// Get recent messages for a session (last 5 messages for context)
export async function getRecentMessages(sessionId: string, limit: number = 5): Promise<ConversationMessage[]> {
  const query = `
    SELECT * FROM conversations
    WHERE session_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [sessionId, limit]);
  return result.rows.reverse(); // Return in chronological order
}

// Get all messages for a session
export async function getSessionMessages(sessionId: string): Promise<ConversationMessage[]> {
  const query = `
    SELECT * FROM conversations
    WHERE session_id = $1
    ORDER BY created_at ASC
  `;

  const result = await pool.query(query, [sessionId]);
  return result.rows;
}

// Clear old sessions (older than 5 days)
export async function cleanupOldSessions(): Promise<number> {
  const query = `
    DELETE FROM conversations
    WHERE created_at < NOW() - INTERVAL '5 days'
  `;

  const result = await pool.query(query);
  return result.rowCount || 0;
}

// Delete a specific session
export async function deleteSession(sessionId: string): Promise<number> {
  const query = `
    DELETE FROM conversations
    WHERE session_id = $1
  `;

  const result = await pool.query(query, [sessionId]);
  return result.rowCount || 0;
}