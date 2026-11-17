import { ApiError } from "../http";
import { attemptKey, endAttempt } from "../idempotency";
import { completeImageUpload, requestImageUpload } from "./endpoints";
import type { AdminImage, UploadTicket } from "./dto";

/**
 * Product image upload, exactly as the API defines it: (1) ask the API for an upload ticket (it checks staff authorization, type and size and returns a
 * presigned URL for a server-chosen object key); (2) the BROWSER sends the file bytes straight to the object store with the ticket's headers — no credentials
 * are ever in the browser, and the key is never chosen here; (3) tell the API it is done, so it inspects the stored object and only then attaches it to the product.
 */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PutFn = (ticket: UploadTicket, file: Blob, onProgress: (fraction: number) => void, signal?: AbortSignal) => Promise<void>;

/** Direct upload with real progress (XMLHttpRequest: fetch cannot report upload progress). */
export const putWithXhr: PutFn = (ticket, file, onProgress, signal) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.upload.method || "PUT", ticket.upload.url);
    for (const [k, v] of Object.entries(ticket.upload.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError({ status: xhr.status, code: "upload_put_failed" })));
    xhr.onerror = () => reject(new ApiError({ status: 0, code: "network_error" }));
    xhr.ontimeout = () => reject(new ApiError({ status: 0, code: "timeout" }));
    xhr.onabort = () => reject(new ApiError({ status: 0, code: "upload_aborted" }));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });

export async function uploadProductImage(productId: string, file: File, onProgress: (fraction: number) => void = () => undefined, put: PutFn = putWithXhr, signal?: AbortSignal): Promise<AdminImage> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new ApiError({ status: 422, code: "upload_type_not_allowed" });
  if (file.size <= 0) throw new ApiError({ status: 422, code: "upload_missing" });
  const scope = `image:${productId}`;
  // the same file, retried after an uncertain outcome, reuses the same ticket request (idempotent on the server); a different file is a new request
  const key = attemptKey(scope, { name: file.name, size: file.size, type: file.type, modified: file.lastModified });
  try {
    const ticket = await requestImageUpload(productId, file.type, file.size, { idempotencyKey: key, signal });
    await put(ticket, file, onProgress, signal);
    onProgress(1);
    const image = await completeImageUpload(productId, ticket.uploadId, { signal });
    endAttempt(scope);
    return image;
  } catch (e) {
    const p = (e as ApiError).problem;
    if (p && p.code !== "timeout" && p.code !== "network_error" && (p.status ?? 0) < 500) endAttempt(scope); // a definite refusal ends the attempt
    throw e;
  }
}
