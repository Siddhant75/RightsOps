import { z } from "zod";

const emptyObject = z.object({}).strict();

export async function acceptsOnlyEmptyObject(request: Request): Promise<boolean> {
  const body = await request.text();
  if (body.trim() === "") return true;

  try {
    return emptyObject.safeParse(JSON.parse(body)).success;
  } catch {
    return false;
  }
}
