import { json, type RequestEvent } from "@sveltejs/kit";

/** A failure the caller caused, sent back as `{ error }` with its status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorResponse = (status: number, message: string) =>
  json({ error: message }, { status });

/**
 * Turns an HttpError into its response. Anything else is a bug and goes on to
 * handleError (hooks.server.ts), which logs it and answers 500.
 */
export function route<E extends RequestEvent>(
  handler: (event: E) => Response | Promise<Response>,
) {
  return async (event: E): Promise<Response> => {
    try {
      return await handler(event);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.status, e.message);
      throw e;
    }
  };
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null)
      return body as Record<string, unknown>;
  } catch {
    // Falls through to the same answer as a non-object body.
  }
  throw new HttpError(400, "リクエストの形式が正しくありません");
}

export async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new HttpError(400, "リクエストの形式が正しくありません");
  }
}
