export type VerifiedTokenRow = {
  token_hash: string
  osm_uid: number
  verified_at: string
}

export async function getVerifiedToken(db: D1Database, tokenHash: string) {
  return db
    .prepare(
      `SELECT vt.token_hash, vt.osm_uid, vt.verified_at, u.display_name
       FROM verified_tokens vt
       LEFT JOIN osm_users u ON u.osm_uid = vt.osm_uid
       WHERE vt.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<VerifiedTokenRow & { display_name: string | null }>()
}

export async function upsertVerifiedToken(
  db: D1Database,
  tokenHash: string,
  osmUid: number,
  verifiedAt: string,
) {
  await db
    .prepare(
      `INSERT INTO verified_tokens (token_hash, osm_uid, verified_at)
       VALUES (?, ?, ?)
       ON CONFLICT (token_hash) DO UPDATE SET
         osm_uid = excluded.osm_uid,
         verified_at = excluded.verified_at`,
    )
    .bind(tokenHash, osmUid, verifiedAt)
    .run()
}

export async function deleteVerifiedToken(db: D1Database, tokenHash: string) {
  await db.prepare('DELETE FROM verified_tokens WHERE token_hash = ?').bind(tokenHash).run()
}

export async function purgeVerifiedTokensOlderThan(db: D1Database, cutoffIso: string) {
  await db.prepare('DELETE FROM verified_tokens WHERE verified_at < ?').bind(cutoffIso).run()
}
