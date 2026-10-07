export function useSecureCookies(requestUrl:string):boolean {
    const configured=process.env.NEXT_PUBLIC_SITE_URL||process.env.SITE_URL;
    if(configured)return new URL(configured).protocol==='https:';
    return process.env.NODE_ENV==='production'||new URL(requestUrl).protocol==='https:';
}
