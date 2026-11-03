import { handleOperations } from "@/lib/operations/service";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handleOperations(request, "feedback-update", (await context.params).id); }
