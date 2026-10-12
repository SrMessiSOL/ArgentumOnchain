import { forwardSessionJsonRequest } from "../../auth/shared";
export async function GET(request: Request) {
    return forwardSessionJsonRequest(
        "/auth/ranked/characters",
        { method: "GET" },
        request,
    );
}
