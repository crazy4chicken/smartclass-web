import { fileHttp } from '@/api/http'
import type { Page } from '@/api/types'

/**
 * Client for nsc-filehouse. The service serves everything under `/api/v1`,
 * its probes at the root and presigned redemption under `/presign`, so call
 * sites pass those exact paths and the dev proxy (`/file-api`) only strips its
 * own prefix.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** A bucket: the ownership, quota and usage envelope around objects. */
export interface Bucket {
  id: string
  name: string
  description: string
  owner_id: string
  owner_kind: string
  team_id: string
  quota_bytes: number
  quota_objects: number
  used_bytes: number
  used_objects: number
  created_at: string
  updated_at: string
}

/**
 * `POST /api/v1/buckets` body; `quota_bytes`/`quota_objects` of 0 mean unlimited.
 * `owner`/`owner_kind` name the owning subject: omitting them keeps the caller and its
 * own kind, and a foreign owner additionally needs the platform-wide
 * `filehouse:manage:any` grant because the bucket then lands outside the caller's scope.
 */
export interface BucketPayload {
  name: string
  description?: string
  quota_bytes?: number
  quota_objects?: number
  team_id?: string
  owner?: string
  owner_kind?: 'user' | 'service'
}

/**
 * `PATCH /api/v1/buckets/{bucket}` body; the quota fields plus `owner`, `owner_kind` and
 * `team_id` need the platform-wide `filehouse:manage:any` grant, since a quota bounds
 * every future writer and the ownership fields move the bucket between scopes.
 * `team_id: ''` clears the bucket's team; `owner` must not be empty.
 */
export interface BucketPatch {
  description?: string
  quota_bytes?: number
  quota_objects?: number
  team_id?: string
  owner?: string
  owner_kind?: 'user' | 'service'
}

/** One stored object; `key` is the path inside the bucket. */
export interface FileObject {
  bucket_id: string
  key: string
  size: number
  content_type: string
  etag: string
  blob_hash: string
  metadata: Record<string, string>
  owner_id: string
  created_at: string
  updated_at: string
}

/** One uploaded part of a multipart upload. */
export interface UploadPart {
  upload_id: string
  part_no: number
  size: number
  sha256: string
  created_at: string
}

/** A multipart upload in progress. */
export interface MultipartUpload {
  upload_id: string
  bucket_id: string
  key: string
  content_type: string
  declared_size: number
  owner_id: string
  metadata: Record<string, string>
  part_count: number
  parts: UploadPart[]
  expires_at: string
  created_at: string
}

/** `POST /api/v1/buckets/{bucket}/uploads` body. */
export interface UploadInitPayload {
  key: string
  size?: number
  content_type?: string
  metadata?: Record<string, string>
}

/** `POST /api/v1/presign` body; the URL exercises the method it was minted for. */
export interface PresignPayload {
  bucket: string
  key: string
  method: 'GET' | 'HEAD' | 'PUT'
  ttl_seconds?: number
  content_type?: string
  max_bytes?: number
}

/** A minted presigned link; `url` carries the only credential needed to redeem it. */
export interface PresignedLink {
  bucket: string
  key: string
  method: string
  url: string
  expires_at: string
}

/** `GET /api/v1/usage` — the caller's totals plus a per-bucket breakdown. */
export interface Usage {
  subject: { id: string; kind: string }
  used_bytes: number
  used_objects: number
  quota_bytes: number
  quota_objects: number
  buckets: Array<{
    bucket_id: string
    bucket_name: string
    owner_id: string
    owner_kind: string
    team_id: string
    quota_bytes: number
    quota_objects: number
    subject_max_bytes: number
    subject_max_objects: number
    used_bytes: number
    used_objects: number
  }>
}

/** `GET /api/v1/admin/stats` — platform-wide counters (requires `filehouse:manage:any`). */
export interface AdminStats {
  buckets: number
  objects: number
  logical_bytes: number
  blobs: number
  blob_bytes: number
  physical_blobs: number
  physical_bytes: number
  zero_ref_blobs: number
  uploads: number
  expired_uploads: number
  quotas: number
}

/** `GET /api/v1/admin/quotas` — a per-subject quota override. */
export interface QuotaOverride {
  subject_kind: string
  subject_id: string
  max_bytes: number
  max_objects: number
  updated_at: string
}

/** `POST /api/v1/admin/gc` result. */
export interface GcResult {
  blobs_deleted: number
  bytes_deleted: number
  orphan_files_deleted: number
  orphan_bytes_deleted: number
  uploads_deleted: number
  idempotency_deleted: number
  errors: number
}

/** Probe payload of `GET /healthz` and `GET /readyz`. */
export interface ProbeResult {
  status: string
}

export interface ListQuery {
  limit?: number
  cursor?: string
}

/** Objects are listed under an optional key prefix. */
export interface ObjectQuery extends ListQuery {
  prefix?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Percent-encodes a key for the URL path while keeping its `/` separators. */
export function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

/** Hex SHA-256 of raw bytes; the value multipart completion reports per part. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export async function listBuckets(query: ListQuery = {}): Promise<Page<Bucket>> {
  const { data } = await fileHttp.get<Page<Bucket>>('/api/v1/buckets', { params: query })
  return data
}

export async function createBucket(payload: BucketPayload, idempotencyKey?: string): Promise<Bucket> {
  const { data } = await fileHttp.post<Bucket>('/api/v1/buckets', payload, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
  return data
}

export async function getBucket(bucket: string): Promise<Bucket> {
  const { data } = await fileHttp.get<Bucket>(`/api/v1/buckets/${encodeURIComponent(bucket)}`)
  return data
}

export async function patchBucket(bucket: string, payload: BucketPatch): Promise<Bucket> {
  const { data } = await fileHttp.patch<Bucket>(`/api/v1/buckets/${encodeURIComponent(bucket)}`, payload)
  return data
}

/** `DELETE /api/v1/buckets/{bucket}` — 409 `bucket_not_empty` while objects remain. */
export async function deleteBucket(bucket: string): Promise<void> {
  await fileHttp.delete(`/api/v1/buckets/${encodeURIComponent(bucket)}`)
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

export async function listObjects(bucket: string, query: ObjectQuery = {}): Promise<Page<FileObject>> {
  const { data } = await fileHttp.get<Page<FileObject>>(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/objects`,
    { params: query },
  )
  return data
}

/** `PUT /api/v1/buckets/{bucket}/objects/{key}` — overwrites the key and answers 200. */
export async function uploadObject(
  bucket: string,
  key: string,
  body: Blob,
  contentType: string,
): Promise<FileObject> {
  const { data } = await fileHttp.put<FileObject>(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeKey(key)}`,
    body,
    { headers: { 'Content-Type': contentType } },
  )
  return data
}

/** Downloads through the authenticated object route; the reply is the raw blob. */
export async function downloadObject(bucket: string, key: string): Promise<Blob> {
  const { data } = await fileHttp.get<Blob>(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeKey(key)}`,
    { responseType: 'blob' },
  )
  return data
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await fileHttp.delete(`/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeKey(key)}`)
}

// ---------------------------------------------------------------------------
// Multipart uploads
// ---------------------------------------------------------------------------

export async function initiateUpload(
  bucket: string,
  payload: UploadInitPayload,
  idempotencyKey?: string,
): Promise<{ upload_id: string; part_count: number; expires_at: string }> {
  const { data } = await fileHttp.post<{ upload_id: string; part_count: number; expires_at: string }>(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/uploads`,
    payload,
    { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined },
  )
  return data
}

/** Uploads one part; the reply carries the `sha256` completion must repeat. */
export async function uploadPart(
  bucket: string,
  uploadId: string,
  partNo: number,
  body: Blob,
): Promise<UploadPart> {
  const { data } = await fileHttp.put<UploadPart>(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/uploads/${encodeURIComponent(uploadId)}/parts/${partNo}`,
    body,
  )
  return data
}

/** `POST .../complete` — the parts list must carry every part's `part_no` and `sha256`. */
export async function completeUpload(
  bucket: string,
  uploadId: string,
  parts: Array<{ part_no: number; sha256: string }>,
  idempotencyKey?: string,
): Promise<FileObject> {
  const { data } = await fileHttp.post<FileObject>(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/uploads/${encodeURIComponent(uploadId)}/complete`,
    { parts },
    { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined },
  )
  return data
}

export async function getUpload(bucket: string, uploadId: string): Promise<MultipartUpload> {
  const { data } = await fileHttp.get<MultipartUpload>(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/uploads/${encodeURIComponent(uploadId)}`,
  )
  return data
}

/** `DELETE .../uploads/{uploadID}` — aborts the upload; parts are discarded. */
export async function abortUpload(bucket: string, uploadId: string): Promise<void> {
  await fileHttp.delete(
    `/api/v1/buckets/${encodeURIComponent(bucket)}/uploads/${encodeURIComponent(uploadId)}`,
  )
}

// ---------------------------------------------------------------------------
// Presigned links
// ---------------------------------------------------------------------------

/** Minting needs `filehouse:share:<scope>` plus the verb the link will exercise. */
export async function mintPresign(payload: PresignPayload, idempotencyKey?: string): Promise<PresignedLink> {
  const { data } = await fileHttp.post<PresignedLink>('/api/v1/presign', payload, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
  return data
}

// ---------------------------------------------------------------------------
// Self-service, admin and probes
// ---------------------------------------------------------------------------

export async function fetchUsage(): Promise<Usage> {
  const { data } = await fileHttp.get<Usage>('/api/v1/usage')
  return data
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data } = await fileHttp.get<AdminStats>('/api/v1/admin/stats')
  return data
}

export async function listQuotas(query: ListQuery = {}): Promise<Page<QuotaOverride>> {
  const { data } = await fileHttp.get<Page<QuotaOverride>>('/api/v1/admin/quotas', { params: query })
  return data
}

/** Upserts a quota override; `0` means unlimited for that dimension. */
export async function upsertQuota(
  kind: string,
  id: string,
  payload: { max_bytes: number; max_objects: number },
): Promise<QuotaOverride> {
  const { data } = await fileHttp.put<QuotaOverride>(
    `/api/v1/admin/quotas/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
    payload,
  )
  return data
}

export async function runGc(idempotencyKey?: string): Promise<GcResult> {
  const { data } = await fileHttp.post<GcResult>('/api/v1/admin/gc', undefined, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
  return data
}

export async function fetchLiveness(): Promise<ProbeResult> {
  const { data } = await fileHttp.get<ProbeResult>('/healthz')
  return data
}

export async function fetchReadiness(): Promise<ProbeResult> {
  const { data } = await fileHttp.get<ProbeResult>('/readyz')
  return data
}
