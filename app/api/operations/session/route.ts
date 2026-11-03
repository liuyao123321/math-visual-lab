import { handleOperations } from "@/lib/operations/service";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleOperations(request, "session");
export const POST = (request: Request) => handleOperations(request, "session");
export const DELETE = (request: Request) => handleOperations(request, "session");
