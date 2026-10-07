import {forwardSessionJsonRequest} from '../auth/shared';
export async function GET(request:Request){return forwardSessionJsonRequest('/auth/economy',{method:'GET'},request,20000);}
