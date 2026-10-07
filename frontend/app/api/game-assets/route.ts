import {forwardSessionJsonRequest} from '../auth/shared';
export async function GET(request:Request){return forwardSessionJsonRequest('/auth/game-assets',{method:'GET'},request,30000);}
