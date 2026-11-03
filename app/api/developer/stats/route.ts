import { handleOperations } from "@/lib/operations/service";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleOperations(request, "stats");
