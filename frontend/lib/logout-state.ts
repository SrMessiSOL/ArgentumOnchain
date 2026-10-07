/** Classify raw server feedback independently of display locale and legacy accents. */
export function logoutFeedback(text:string):'started'|'closing'|'cancelled'|'denied'|null {
 if(/^\[(?:Servidor|Server)\] (?:Cerrando sesi|Logging out)/.test(text))return 'closing';
 if(/^\[(?:Servidor|Server)\] (?:Debes permanecer quieto durante 10 segundos|Stay still for 10 seconds)/.test(text))return 'started';
 if(/^\[(?:Servidor|Server)\] (?:La salida se cancel|Logout cancelled|Logout canceled)/.test(text))return 'cancelled';
 if(/^\[(?:Servidor|Server)\] (?:No puedes salir |You cannot log out )/.test(text))return 'denied';
 return null;
}
