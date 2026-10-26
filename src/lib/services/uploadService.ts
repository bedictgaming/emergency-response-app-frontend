import apiClient from '@/lib/apiClient';
import type { SubmissionStage } from '@/lib/reportSubmission';

type UploadOptions = { signal?: AbortSignal; onStage?: (stage: SubmissionStage) => void };
const checkUploadActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
};

export interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  fileName: string;
}

interface SignatureResponse {
  data: {
    timestamp: number;
    folder: string;
    publicId: string;
    allowed_formats: string;
    signature: string;
    apiKey: string;
    cloudName: string;
    type: 'authenticated';
  };
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
// Base64 adds roughly one third. Stay below the gateway's 4 MB request cap.
const MAX_FALLBACK_SIZE_BYTES = 2.5 * 1024 * 1024;
const MAX_FALLBACK_PAYLOAD_BYTES = 3.5 * 1024 * 1024;
const FALLBACK_SIZE_MESSAGE = 'Direct photo upload was blocked. Allow access to the photo service, or retake a photo under 2.5 MB for the secure fallback. Your report has not been submitted.';

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string'
    ? resolve(reader.result)
    : reject(new Error('The selected photo could not be read.'));
  reader.onerror = () => reject(new Error('The selected photo could not be read.'));
  reader.readAsDataURL(file);
});

const uploadThroughBackend = async (file: File, options: UploadOptions): Promise<UploadResult> => {
  checkUploadActive(options.signal); options.onStage?.('photo-fallback');
  // Never resize/re-encode incident evidence silently to fit the proxy.
  if (file.size > MAX_FALLBACK_SIZE_BYTES) throw new Error(FALLBACK_SIZE_MESSAGE);
  const body = { imageData: await fileToDataUrl(file), fileName: file.name };
  checkUploadActive(options.signal);
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_FALLBACK_PAYLOAD_BYTES) {
    throw new Error(FALLBACK_SIZE_MESSAGE);
  }
  try {
    const response = await apiClient.post<{ data: UploadResult }>('/upload/v1/image', body, {
      // Image transfer and Cloudinary processing can legitimately exceed the
      // normal API timeout on a mobile or congested connection.
      timeout: 60_000,
      signal: options.signal,
    });
    return response.data.data;
  } catch (error: unknown) {
    checkUploadActive(options.signal);
    if ((error as { response?: { status?: number } }).response?.status === 413) throw new Error(FALLBACK_SIZE_MESSAGE);
    const responseMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message;
    if (responseMessage) throw new Error(responseMessage);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('You are offline. Reconnect before uploading the proof photo.');
    }
    throw new Error('The secure photo service could not be reached. Check your connection and try again.');
  }
};

/**
 * Gets a short-lived server signature and uploads directly to Cloudinary.
 */
export const uploadIncidentPhoto = async (file: File, options: UploadOptions = {}): Promise<UploadResult> => {
  checkUploadActive(options.signal);
  // --- Client-side validation ---
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      `Invalid file type: "${file.type}". Only JPEG, PNG, and WEBP images are accepted.`
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `Photo is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 5MB.`
    );
  }

  let signature: SignatureResponse['data'];
  try {
    options.onStage?.('photo-signature');
    signature = (await apiClient.post<SignatureResponse>('/upload/v1/signature', undefined, { signal: options.signal })).data.data;
  } catch (error: unknown) {
    checkUploadActive(options.signal);
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 429) throw new Error('Photo upload limit reached. Try again later.');
    if (status === 401 || status === 403) throw new Error('Your session cannot upload this photo. Sign in again before retrying.');
    // If the browser cannot complete even the signed-upload handshake, use
    // the authenticated same-origin API path instead of surfacing a raw
    // browser "Failed to fetch" error.
    return uploadThroughBackend(file, options);
  }
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('folder', signature.folder);
  form.append('public_id', signature.publicId);
  form.append('allowed_formats', signature.allowed_formats);
  form.append('signature', signature.signature);
  form.append('overwrite', 'false');
  form.append('type', signature.type);

  checkUploadActive(options.signal); options.onStage?.('photo-upload');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
  try {
    let response: Response;
    try {
      response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
        method: 'POST', body: form, signal: controller.signal,
      });
    } catch (error) {
      checkUploadActive(options.signal);
      if (timedOut) throw error;
      // Browser privacy shields and restrictive networks can block the direct
      // request. Only a network failure uses the authenticated fallback.
      clearTimeout(deadline); options.signal?.removeEventListener('abort', cancel);
      return await uploadThroughBackend(file, options);
    }
    if (!response.ok) throw new Error('Secure image upload failed');
    const asset = await response.json();
    checkUploadActive(options.signal);
    return {
      url: asset.secure_url, publicId: asset.public_id, format: asset.format,
      bytes: asset.bytes, width: asset.width, height: asset.height, fileName: file.name,
    };
  } catch (error) {
    checkUploadActive(options.signal);
    // A timed-out upload may have reached the provider: do not duplicate it
    // automatically through the fallback. Creation has not been sent yet.
    if (timedOut) throw new Error('Photo upload timed out. This attempt has not submitted a report. Check your connection before retrying.');
    throw error;
  } finally { clearTimeout(deadline); options.signal?.removeEventListener('abort', cancel); }
};
