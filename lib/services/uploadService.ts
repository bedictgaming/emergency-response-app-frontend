import apiClient from '@/lib/apiClient';

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
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB client-side (backend accepts 10MB)

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string'
    ? resolve(reader.result)
    : reject(new Error('The selected photo could not be read.'));
  reader.onerror = () => reject(new Error('The selected photo could not be read.'));
  reader.readAsDataURL(file);
});

const uploadThroughBackend = async (file: File): Promise<UploadResult> => {
  try {
    const response = await apiClient.post<{ data: UploadResult }>('/upload/v1/image', {
      imageData: await fileToDataUrl(file),
      fileName: file.name,
    }, {
      // Image transfer and Cloudinary processing can legitimately exceed the
      // normal API timeout on a mobile or congested connection.
      timeout: 60_000,
    });
    return response.data.data;
  } catch (error: unknown) {
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
export const uploadIncidentPhoto = async (file: File): Promise<UploadResult> => {
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
    signature = (await apiClient.post<SignatureResponse>('/upload/v1/signature')).data.data;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 429) throw new Error('Photo upload limit reached. Try again later.');
    // If the browser cannot complete even the signed-upload handshake, use
    // the authenticated same-origin API path instead of surfacing a raw
    // browser "Failed to fetch" error.
    return uploadThroughBackend(file);
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

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/authenticated/upload`, {
      method: 'POST',
      body: form,
    });
  } catch {
    // Browser privacy shields, restrictive networks, and some mobile WebViews
    // can block direct cross-origin Cloudinary requests. The authenticated
    // backend route performs the same private upload without exposing secrets.
    return uploadThroughBackend(file);
  }
  if (!response.ok) throw new Error('Secure image upload failed');
  const asset = await response.json();
  return {
    url: asset.secure_url,
    publicId: asset.public_id,
    format: asset.format,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    fileName: file.name,
  };
};
