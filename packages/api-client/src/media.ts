import type { components } from '@perum/api-schema/tenant';

import type { ApiClient, RequestOptions } from './index.ts';

export type MediaUploadSessionCreate = components['schemas']['UploadSessionCreate'];
export type MediaUploadSession = components['schemas']['UploadSessionOut'];
export type MediaObject = components['schemas']['MediaObjectOut'];

export interface MediaUploadOptions extends RequestOptions {
  fieldName?: string;
}

export interface MediaWaitOptions extends RequestOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
}

const terminalObjectStates = new Set(['clean', 'infected', 'rejected', 'missing', 'deleted']);

export function createMediaUploadSession(
  client: ApiClient,
  payload: MediaUploadSessionCreate,
  options?: RequestOptions,
): Promise<MediaUploadSession> {
  return client.post('/media/upload-sessions', payload, options);
}

export function uploadMediaSession(
  client: ApiClient,
  sessionId: string,
  file: Blob,
  options: MediaUploadOptions = {},
): Promise<MediaObject> {
  const { fieldName = 'file', ...requestOptions } = options;
  const data = new FormData();
  data.append(fieldName, file);
  return client.putFormData(`/media/upload-sessions/${encodeURIComponent(sessionId)}/content`, data, requestOptions);
}

export function getMediaUploadSession(
  client: ApiClient,
  sessionId: string,
  options?: RequestOptions,
): Promise<MediaUploadSession> {
  return client.get(`/media/upload-sessions/${encodeURIComponent(sessionId)}`, options);
}

export function getMediaObject(
  client: ApiClient,
  objectId: string,
  options?: RequestOptions,
): Promise<MediaObject> {
  return client.get(`/media/objects/${encodeURIComponent(objectId)}`, options);
}

export async function waitForMediaObjectTerminal(
  client: ApiClient,
  objectId: string,
  options: MediaWaitOptions = {},
): Promise<MediaObject> {
  const {
    initialDelayMs = 250,
    maxDelayMs = 2_000,
    maxAttempts = 20,
    ...requestOptions
  } = options;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || initialDelayMs < 0 || maxDelayMs < 0) {
    throw new RangeError('Invalid media polling options');
  }
  let delayMs = Math.min(initialDelayMs, maxDelayMs);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const object = await getMediaObject(client, objectId, requestOptions);
    if (terminalObjectStates.has(object.state)) return object;
    if (attempt + 1 < maxAttempts) {
      await abortableDelay(delayMs, options.signal);
      delayMs = Math.min(maxDelayMs, Math.max(delayMs * 2, 1));
    }
  }
  throw new Error(`Media object ${objectId} did not reach a terminal state`);
}

export function downloadMediaObject(
  client: ApiClient,
  objectId: string,
  options?: RequestOptions,
): Promise<Response> {
  return client.requestResponse(`/media/objects/${encodeURIComponent(objectId)}/content`, options);
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
