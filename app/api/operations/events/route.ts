import { handleOperations } from "@/lib/operations/service";
export const POST = (request: Request) => handleOperations(request, "events");
