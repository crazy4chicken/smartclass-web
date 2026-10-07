import { ApiError, hubHttp } from '@/api/http'
import type { ProblemDetails } from '@/api/types'
import { errorMessage } from '@/utils/error'

/**
 * Client for smartclass-dispatchub. The service serves everything under `/api/v1`
 * and its two probes at the root, so call sites pass those exact paths and the
 * dev proxy (`/dispatch-api`) only strips its own prefix.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** A term (teaching semester) and its 节次 time table. */
export interface Term {
  term_code: string
  name: string
  /** Monday of teaching week 1, `YYYY-MM-DD` in the request, RFC3339 in responses. */
  week1_monday: string
  /** Teaching weeks, 1-30. */
  weeks: number
  created_at: string
  updated_at: string
}

/** One 节次 (period) of a term's daily time table; `HH:MM` local wall-clock. */
export interface Period {
  period_no: number
  start_time: string
  end_time: string
}

/** `POST /api/v1/terms` body. An existing `term_code` is replaced. */
export interface TermPayload {
  term_code: string
  name: string
  week1_monday: string
  weeks: number
}

/** A `room_code` → webcam-server device binding. */
export interface Room {
  room_code: string
  name: string
  device_id: string
  /** Camera the scheduler records with; other cameras are still switchable live. */
  camera_enum: number
  enabled: boolean
  team_id?: string | null
  owner_id?: string | null
  created_at: string
  updated_at: string
}

/** `PUT /api/v1/rooms/{room_code}` body. */
export interface RoomBindingPayload {
  name: string
  device_id: string
  camera_enum: number
  enabled: boolean
}

/** Live device state; proxied from webcam-server on every request. */
export interface RoomLive {
  online: boolean
  cameras: Array<{
    camera_enum: number
    fps: number
    resolution: string
    supported_codec: string[]
  }>
  active_session?: {
    id: string
    stream_id: string
    started_at: string
  } | null
}

/** Session lifecycle states reported by dispatchub. */
export type SessionStatus =
  | 'planned'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'missed'

/** A materialized recording session. */
export interface Session {
  id: string
  room_code: string
  device_id: string
  camera_enum: number
  /** Timetable entry that produced the session; manual sessions carry none. */
  entry_id?: string | null
  origin: string
  status: SessionStatus | string
  starts_at: string
  ends_at: string
  started_at?: string | null
  stopped_at?: string | null
  stream_id?: string | null
  retry_count: number
  last_error?: string | null
  created_at: string
  updated_at: string
}

/** A snapshot request tracked in the photo ledger. */
export interface SessionPhoto {
  id: string
  room_code: string
  device_id: string
  camera_enum: number
  request_id: string
  photo_id?: string | null
  session_id?: string | null
  actor_id?: string | null
  source: string
  status: string
  attempts: number
  next_poll_at?: string | null
  taken_at: string
  resolved_at?: string | null
  created_at: string
}

/** `GET /api/v1/sessions/{id}` — the session plus its photo ledger. */
export interface SessionDetail extends Session {
  photos: SessionPhoto[]
  upstream?: unknown
}

/** `GET /api/v1/sessions/{id}/artifacts` — 15-minute download URLs. */
export interface SessionArtifacts {
  status: string
  stream_id?: string | null
  segments: Array<{ segment_seq: number; size_bytes: number; duration_ms?: number | null; download_url: string }>
  photos: Array<{ photo_id: string; taken_at: string; download_url: string }>
}

/** One import batch; `status` is `dry_run`, `committed` or `failed`. */
export interface ImportBatch {
  id: string
  term_code: string
  mode: string
  filename: string
  sha256: string
  row_count: number
  ok_count: number
  error_count: number
  status: string
  imported_by: string
  created_at: string
  errors: ImportError[]
}

/** A per-row validation failure of an import batch. */
export interface ImportError {
  row: number
  code: string
  message: string
  column?: string
}

/** `POST /api/v1/timetable/imports` — commit mode also reports a per-course preview. */
export interface ImportResult extends ImportBatch {
  preview?: Array<{
    row: number
    course_code: string
    session_count: number
    first_starts_at: string
    last_ends_at: string
  }>
}

/** Probe payload of `GET /healthz` and `GET /readyz`. */
export interface ProbeResult {
  status: string
  reason?: string
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export interface SessionQuery {
  term_code?: string
  room_code?: string
  status?: string
  /** `YYYY-MM-DD`, matched against a UTC calendar day of `starts_at`. */
  date?: string
  course_code?: string
  limit?: number
}

/** Which camera a control call targets; `camera_enum` is validated against the device. */
export interface CameraCommand {
  camera_enum: number
}

/** Files larger than this are rejected by the service before upload. */
export const MAX_IMPORT_BYTES = 1024 * 1024

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Collection routes require the any-scoped key; pass `limit` to cap the page (default 100). */
export async function listTerms(limit = 100): Promise<Term[]> {
  const { data } = await hubHttp.get<{ items: Term[] }>('/api/v1/terms', { params: { limit } })
  return data.items
}

/** `POST /api/v1/terms` — creates the term or replaces its name, week1_monday and weeks. */
export async function upsertTerm(payload: TermPayload): Promise<Term> {
  const { data } = await hubHttp.post<Term>('/api/v1/terms', payload)
  return data
}

/** `GET /api/v1/terms/{term_code}/periods` — 404 `periods_not_configured` when unset. */
export async function getPeriods(termCode: string): Promise<Period[]> {
  const { data } = await hubHttp.get<{ items: Period[] }>(
    `/api/v1/terms/${encodeURIComponent(termCode)}/periods`,
  )
  return data.items
}

/** `PUT /api/v1/terms/{term_code}/periods` — replaces the whole 节次 table. */
export async function replacePeriods(termCode: string, periods: Period[]): Promise<Period[]> {
  const { data } = await hubHttp.put<{ items: Period[] }>(
    `/api/v1/terms/${encodeURIComponent(termCode)}/periods`,
    { periods },
  )
  return data.items
}

export async function listRooms(limit = 100): Promise<Room[]> {
  const { data } = await hubHttp.get<{ items: Room[] }>('/api/v1/rooms', { params: { limit } })
  return data.items
}

/** `PUT /api/v1/rooms/{room_code}` — binds or re-binds a room, validating the device live. */
export async function bindRoom(roomCode: string, payload: RoomBindingPayload): Promise<Room> {
  const { data } = await hubHttp.put<Room>(`/api/v1/rooms/${encodeURIComponent(roomCode)}`, payload)
  return data
}

/** `DELETE /api/v1/rooms/{room_code}` — 409 `room_has_history` once the room has history. */
export async function unbindRoom(roomCode: string): Promise<void> {
  await hubHttp.delete(`/api/v1/rooms/${encodeURIComponent(roomCode)}`)
}

/** `GET /api/v1/rooms/{room_code}/live` — never cached; 503 when webcam-server is down. */
export async function getRoomLive(roomCode: string): Promise<RoomLive> {
  const { data } = await hubHttp.get<RoomLive>(`/api/v1/rooms/${encodeURIComponent(roomCode)}/live`)
  return data
}

export async function listSessions(query: SessionQuery = {}): Promise<Session[]> {
  const { data } = await hubHttp.get<{ items: Session[] }>('/api/v1/sessions', { params: query })
  return data.items
}

export async function getSession(id: string): Promise<SessionDetail> {
  const { data } = await hubHttp.get<SessionDetail>(`/api/v1/sessions/${encodeURIComponent(id)}`)
  return data
}

/** Artifact URLs are minted per response and expire after roughly 15 minutes. */
export async function getSessionArtifacts(id: string): Promise<SessionArtifacts> {
  const { data } = await hubHttp.get<SessionArtifacts>(`/api/v1/sessions/${encodeURIComponent(id)}/artifacts`)
  return data
}

/** `POST /api/v1/sessions/{id}/recording/start` — the manual early start or retry of a session. */
export async function startSessionRecording(id: string, idempotencyKey: string): Promise<Session> {
  const { data } = await hubHttp.post<Session>(
    `/api/v1/sessions/${encodeURIComponent(id)}/recording/start`,
    undefined,
    { headers: idempotencyHeader(idempotencyKey) },
  )
  return data
}

/** `POST /api/v1/sessions/{id}/recording/stop` — ends the session before its scheduled end. */
export async function stopSessionRecording(id: string, idempotencyKey: string): Promise<Session> {
  const { data } = await hubHttp.post<Session>(
    `/api/v1/sessions/${encodeURIComponent(id)}/recording/stop`,
    undefined,
    { headers: idempotencyHeader(idempotencyKey) },
  )
  return data
}

/** `POST /api/v1/rooms/{room_code}/recording/start` — ad-hoc recording with no scheduled end. */
export async function startRoomRecording(roomCode: string, idempotencyKey: string): Promise<Session> {
  const { data } = await hubHttp.post<Session>(
    `/api/v1/rooms/${encodeURIComponent(roomCode)}/recording/start`,
    undefined,
    { headers: idempotencyHeader(idempotencyKey) },
  )
  return data
}

/** `POST /api/v1/rooms/{room_code}/recording/stop` — stops whichever session is live. */
export async function stopRoomRecording(roomCode: string, idempotencyKey: string): Promise<Session> {
  const { data } = await hubHttp.post<Session>(
    `/api/v1/rooms/${encodeURIComponent(roomCode)}/recording/stop`,
    undefined,
    { headers: idempotencyHeader(idempotencyKey) },
  )
  return data
}

/** `POST /api/v1/rooms/{room_code}/camera/switch` — 202 with the upstream command id. */
export async function switchCamera(
  roomCode: string,
  cameraEnum: number,
  idempotencyKey: string,
): Promise<{ command_id: string; camera_enum: number }> {
  const { data } = await hubHttp.post<{ command_id: string; camera_enum: number }>(
    `/api/v1/rooms/${encodeURIComponent(roomCode)}/camera/switch`,
    { camera_enum: cameraEnum },
    { headers: idempotencyHeader(idempotencyKey) },
  )
  return data
}

/** `POST /api/v1/rooms/{room_code}/photo` — resolves asynchronously through the photo ledger. */
export async function captureRoomPhoto(
  roomCode: string,
  idempotencyKey: string,
): Promise<{ request_id: string; session_photo_id: string; status: string }> {
  const { data } = await hubHttp.post<{ request_id: string; session_photo_id: string; status: string }>(
    `/api/v1/rooms/${encodeURIComponent(roomCode)}/photo`,
    undefined,
    { headers: idempotencyHeader(idempotencyKey) },
  )
  return data
}

export async function listImports(termCode: string, limit = 100): Promise<ImportBatch[]> {
  const params: Record<string, string | number> = { limit }
  if (termCode !== '') {
    params.term_code = termCode
  }
  const { data } = await hubHttp.get<{ items: ImportBatch[] }>('/api/v1/timetable/imports', { params })
  return data.items
}

export async function getImport(id: string): Promise<ImportBatch> {
  const { data } = await hubHttp.get<ImportBatch>(`/api/v1/timetable/imports/${encodeURIComponent(id)}`)
  return data
}

/** Query switches of the import call. */
export interface ImportOptions {
  /** `replace` supersedes the term's previous entries; `append` keeps them. */
  mode: 'replace' | 'append'
  /** Validate only: nothing is written and the batch carries a preview. */
  dryRun: boolean
  /** Commit even though the same sha256 was already imported for the term. */
  force: boolean
}

/** A rejected import: `errors` holds the full per-row report when validation failed. */
export interface ImportFailure {
  ok: false
  status: number
  detail: string
  message: string
  errors: ImportError[]
}

export type ImportOutcome = { ok: true; batch: ImportResult } | ImportFailure

/**
 * `POST /api/v1/timetable/imports` — multipart upload whose single `file` part holds the CSV.
 * Validation failures answer 422 `import_validation_failed` with the full per-row list, so the
 * call keeps 4xx bodies resolvable and reports them as data instead of losing them to `ApiError`.
 */
export async function importTimetable(file: File, options: ImportOptions): Promise<ImportOutcome> {
  const body = new FormData()
  body.append('file', file)
  const params: Record<string, string> = { mode: options.mode }
  if (options.dryRun) {
    params.dry_run = 'true'
  }
  if (options.force) {
    params.force = 'true'
  }
  const response = await hubHttp.post<ImportResult & Partial<ProblemDetails>>('/api/v1/timetable/imports', body, {
    params,
    validateStatus: (status) => status < 500,
  })
  if (response.status === 200 || response.status === 201) {
    return { ok: true, batch: response.data }
  }
  const data = response.data
  return {
    ok: false,
    status: response.status,
    detail: data.detail ?? '',
    message: errorMessage(
      new ApiError(response.status, data.title ?? '', data.detail ?? '', data.type ?? '', data.instance ?? ''),
    ),
    errors: parseImportErrors(data),
  }
}

/** The 422 body carries `errors` next to the problem members; unknown shapes degrade to none. */
function parseImportErrors(data: unknown): ImportError[] {
  if (typeof data !== 'object' || data === null || !('errors' in data)) {
    return []
  }
  const { errors } = data
  if (!Array.isArray(errors)) {
    return []
  }
  return errors.flatMap((entry) => (isImportError(entry) ? [entry] : []))
}

function isImportError(value: unknown): value is ImportError {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('row' in value) || !('code' in value) || !('message' in value)) {
    return false
  }
  return typeof value.row === 'number' && typeof value.code === 'string' && typeof value.message === 'string'
}

/** `GET /healthz` — unauthenticated liveness probe; never touches the database. */
export async function fetchLiveness(): Promise<ProbeResult> {
  const { data } = await hubHttp.get<ProbeResult>('/healthz')
  return data
}

/** `GET /readyz` — unauthenticated readiness probe; 503 names the unreachable dependencies. */
export async function fetchReadiness(): Promise<ProbeResult> {
  const { data } = await hubHttp.get<ProbeResult>('/readyz')
  return data
}

/**
 * Control POSTs accept `X-Idempotency-Key`; a replayed key returns the stored outcome
 * without issuing a second upstream command. A fresh key per operator action is correct:
 * it only deduplicates retries of that same action.
 */
function idempotencyHeader(key: string): Record<string, string> {
  return { 'X-Idempotency-Key': key }
}
