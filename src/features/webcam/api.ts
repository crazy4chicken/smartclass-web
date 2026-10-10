import { webcamHttp } from '@/api/http'

/**
 * Client for smartclass-webcam-server. The service serves its management plane under
 * `/api` and its two probes at the root, so call sites pass those exact paths and the dev
 * proxy (`/webcam-api`) only strips its own prefix. Every request needs a teamusers bearer
 * whose claims carry a `cam:<action>:<scope>` key: `read`, `manage` or `control`.
 */

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/** A registered device (classroom camera host). */
export interface Device {
  id: string
  name: string
  location?: string
  team_id?: string
  owner_id?: string
  /** Last WebSocket registration seen by the service; absent for a device that never connected. */
  last_seen?: string
  created_at: string
  updated_at: string
}

/** One camera reported by the device during registration. */
export interface CameraCapability {
  camera_enum: number
  /** The resolution the camera is at for the current connection. */
  resolution: string
  /** The frame rate the camera is at for the current connection. */
  fps: number
  /** Every resolution a camera switch may select for this camera. */
  supported_resolutions: string[]
  /** Every frame rate a camera switch may select for this camera. */
  supported_framerates: number[]
  /** Every codec a recording may select for this camera; the first entry is the device's preferred one. */
  supported_codec: string[]
  attrs?: Record<string, unknown>
}

/** `GET /api/devices/{id}/` — the device plus the state of its live session. */
export interface DeviceDetail extends Device {
  online: boolean
  cameras: CameraCapability[]
}

/** Body of device registration and token rotation; the token is returned exactly once. */
export interface DeviceToken {
  device: Device
  token: string
}

/** Camera parameters a stream was started with. */
export interface StreamMetadata {
  resolution?: string
  fps?: number
  codec?: string
  codecs?: string[]
}

export type StreamStatus = 'active' | 'completed' | 'failed'

/** A recording session for one camera of a device. */
export interface Stream {
  id: string
  device_id: string
  camera_enum: number
  status: StreamStatus
  started_at: string
  ended_at?: string
  metadata: StreamMetadata
}

/** One uploaded video chunk of a stream. */
export interface StreamSegment {
  id: string
  stream_id: string
  device_id: string
  camera_enum: number
  segment_seq: number
  size_bytes: number
  duration_ms?: number
  created_at: string
}

/** Segment with a pre-signed download URL, present while the object still exists. */
export interface SegmentWithURL extends StreamSegment {
  download_url?: string
}

/** `GET /api/streams/{id}/` — the stream with its segments and their download URLs. */
export interface StreamDetail extends Stream {
  segments: SegmentWithURL[]
}

/** A captured still. */
export interface Photo {
  id: string
  device_id: string
  camera_enum: number
  content_type: string
  size_bytes: number
  request_id?: string
  taken_at: string
  created_at: string
}

/** `GET /api/photos/{id}/` — the photo with a pre-signed download URL. */
export interface PhotoDetail extends Photo {
  download_url?: string
}

/** Every collection endpoint wraps its rows in `items`. */
export interface ListResponse<T> {
  items: T[]
}

/** `GET /healthz` and `GET /readyz`. */
export interface ProbeResult {
  status: string
  reason?: string
}

// ---------------------------------------------------------------------------
// Request bodies and command acknowledgements
// ---------------------------------------------------------------------------

/** `POST /api/devices` body. Ownership may only be set by an `any`-scope caller. */
export interface DeviceCreatePayload {
  name: string
  location?: string
  team_id?: string
  owner_id?: string
}

/** `PUT /api/devices/{id}/` body; present fields overwrite, absent fields are kept. */
export interface DeviceUpdatePayload {
  name?: string
  location?: string
  team_id?: string
  owner_id?: string
}

/** Body of the commands that carry nothing but the target camera. */
export interface CameraCommandPayload {
  camera_enum: number
}

/**
 * `POST /api/devices/{id}/camera/switch` body. A device captures from one camera at one
 * resolution and frame rate at a time, and only this command changes them, so a switch may
 * carry new parameters for the camera it selects. Each must be one the camera declared
 * during registration; an absent one keeps its current value.
 */
export interface SwitchCameraPayload {
  camera_enum: number
  resolution?: string
  fps?: number
}

/**
 * `POST /api/devices/{id}/recording/start` body. The codec can be chosen only here - never
 * on a camera switch or a photo - and must be one the camera declared; absent records with
 * the device's preferred codec, the first entry of its `supported_codec` list.
 */
export interface StartRecordingPayload {
  camera_enum: number
  codec?: string
}

/** `POST /api/devices/{id}/camera/switch` — the queued command. */
export interface CommandAccepted {
  command_id: string
  camera_enum: number
}

/** `POST /api/devices/{id}/photo` — the queued capture and the request id it will report. */
export interface PhotoCommandAccepted {
  command_id: string
  request_id: string
  camera_enum: number
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** `GET /api/devices` — the caller's devices, narrowed by the scope of their read grant. */
export async function listDevices(limit?: number): Promise<Device[]> {
  const { data } = await webcamHttp.get<ListResponse<Device>>('/api/devices', { params: { limit } })
  return data.items
}

/** `POST /api/devices` — registers a device and returns its device token exactly once. */
export async function createDevice(payload: DeviceCreatePayload): Promise<DeviceToken> {
  const { data } = await webcamHttp.post<DeviceToken>('/api/devices', payload)
  return data
}

/** `GET /api/devices/{id}/` — the device with its live session and registered cameras. */
export async function getDevice(deviceId: string): Promise<DeviceDetail> {
  const { data } = await webcamHttp.get<DeviceDetail>(`/api/devices/${encodeURIComponent(deviceId)}/`)
  return data
}

/** `PUT /api/devices/{id}/` — partial update of name, location and (for `any` callers) ownership. */
export async function updateDevice(deviceId: string, payload: DeviceUpdatePayload): Promise<Device> {
  const { data } = await webcamHttp.put<Device>(`/api/devices/${encodeURIComponent(deviceId)}/`, payload)
  return data
}

/** `DELETE /api/devices/{id}/` — also drops the device's streams, segments and photos. */
export async function deleteDevice(deviceId: string): Promise<void> {
  await webcamHttp.delete(`/api/devices/${encodeURIComponent(deviceId)}/`)
}

/** `POST /api/devices/{id}/token` — rotates the device token; the new one is shown once. */
export async function rotateDeviceToken(deviceId: string): Promise<DeviceToken> {
  const { data } = await webcamHttp.post<DeviceToken>(`/api/devices/${encodeURIComponent(deviceId)}/token`)
  return data
}

/** `GET /api/devices/{id}/streams` — the device's recording sessions, newest first. */
export async function listDeviceStreams(deviceId: string, limit?: number): Promise<Stream[]> {
  const { data } = await webcamHttp.get<ListResponse<Stream>>(
    `/api/devices/${encodeURIComponent(deviceId)}/streams`,
    { params: { limit } },
  )
  return data.items
}

/** `GET /api/devices/{id}/photos` — the device's captured stills, newest first. */
export async function listDevicePhotos(deviceId: string, limit?: number): Promise<Photo[]> {
  const { data } = await webcamHttp.get<ListResponse<Photo>>(
    `/api/devices/${encodeURIComponent(deviceId)}/photos`,
    { params: { limit } },
  )
  return data.items
}

// ---------------------------------------------------------------------------
// Camera commands
// ---------------------------------------------------------------------------

/**
 * `POST /api/devices/{id}/camera/switch` — asks the live device to switch camera, optionally
 * at new parameters. Omitting `resolution` and `fps` leaves that camera where it was.
 */
export async function switchCamera(deviceId: string, payload: SwitchCameraPayload): Promise<CommandAccepted> {
  const { data } = await webcamHttp.post<CommandAccepted>(
    `/api/devices/${encodeURIComponent(deviceId)}/camera/switch`,
    payload,
  )
  return data
}

/** `POST /api/devices/{id}/recording/start` — creates the stream and starts the recording. */
export async function startRecording(deviceId: string, payload: StartRecordingPayload): Promise<Stream> {
  const { data } = await webcamHttp.post<Stream>(
    `/api/devices/${encodeURIComponent(deviceId)}/recording/start`,
    payload,
  )
  return data
}

/** `POST /api/devices/{id}/recording/stop` — stops the camera's active stream. */
export async function stopRecording(deviceId: string, cameraEnum: number): Promise<Stream> {
  const { data } = await webcamHttp.post<Stream>(
    `/api/devices/${encodeURIComponent(deviceId)}/recording/stop`,
    { camera_enum: cameraEnum } satisfies CameraCommandPayload,
  )
  return data
}

/** `POST /api/devices/{id}/photo` — asks the live device for a still. */
export async function capturePhoto(deviceId: string, cameraEnum: number): Promise<PhotoCommandAccepted> {
  const { data } = await webcamHttp.post<PhotoCommandAccepted>(
    `/api/devices/${encodeURIComponent(deviceId)}/photo`,
    { camera_enum: cameraEnum } satisfies CameraCommandPayload,
  )
  return data
}

// ---------------------------------------------------------------------------
// Streams, segments and photos
// ---------------------------------------------------------------------------

/** `GET /api/streams/{id}/` — the stream with its segments and their download URLs. */
export async function getStream(streamId: string, limit?: number): Promise<StreamDetail> {
  const { data } = await webcamHttp.get<StreamDetail>(`/api/streams/${encodeURIComponent(streamId)}/`, {
    params: { limit },
  })
  return data
}

/** `GET /api/streams/{id}/segments` — the segments alone, without download URLs. */
export async function listStreamSegments(streamId: string, limit?: number): Promise<StreamSegment[]> {
  const { data } = await webcamHttp.get<ListResponse<StreamSegment>>(
    `/api/streams/${encodeURIComponent(streamId)}/segments`,
    { params: { limit } },
  )
  return data.items
}

/** `GET /api/photos/{id}/` — the photo with a pre-signed download URL. */
export async function getPhoto(photoId: string): Promise<PhotoDetail> {
  const { data } = await webcamHttp.get<PhotoDetail>(`/api/photos/${encodeURIComponent(photoId)}/`)
  return data
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/** `GET /healthz` — unauthenticated liveness probe. */
export async function fetchLiveness(): Promise<ProbeResult> {
  const { data } = await webcamHttp.get<ProbeResult>('/healthz')
  return data
}

/** `GET /readyz` — unauthenticated readiness probe. */
export async function fetchReadiness(): Promise<ProbeResult> {
  const { data } = await webcamHttp.get<ProbeResult>('/readyz')
  return data
}
