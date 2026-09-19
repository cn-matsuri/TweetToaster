// Keep one deadline across validation, headers, and body consumption. Disposing
// removes the caller's listener too, so completed requests do not retain jobs.
export function requestScope({ signal, timeoutMs, timeoutMessage }) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException(timeoutMessage, "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}

export async function cancelResponseBody(response) {
  if (response?.body && !response.body.locked) {
    await response.body.cancel().catch(() => {});
  }
}

export async function readLimitedBody(response, maxBytes, { signal } = {}) {
  const reader = response.body?.getReader();
  let finished = false;
  let cancellation;
  const cancel = (reason) => {
    if (!cancellation) cancellation = reader?.cancel(reason).catch(() => {}) || Promise.resolve();
    return cancellation;
  };
  const abort = () => { void cancel(signal.reason); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const declared = Number(response.headers.get("content-length") || 0);
    const tooLarge = () => Object.assign(new Error("远程文件过大"), { code: "REMOTE_BODY_TOO_LARGE" });
    if (declared > maxBytes) throw tooLarge();
    const chunks = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw tooLarge();
      chunks.push(Buffer.from(value));
    }
    finished = true;
    return Buffer.concat(chunks, size);
  } finally {
    signal?.removeEventListener("abort", abort);
    // Await the stream's cancellation, not just a race against its read. This
    // closes the actual response before the job can return its capacity slot.
    if (!finished) await cancel(signal?.reason);
    reader?.releaseLock();
  }
}
