export {};
import {apiRequest} from './apiRequest';
const config = require("./config");
const API_REQUEST_TIMEOUT_MS = 8000;

const funct = new (Funct as any)();

function Funct(this: any) {
    this.jsonDecode = function <T>(this: any, data: string): T {
        return JSON.parse(data) as T;
    };

    this.dumpError = function (this: any, err: unknown): void {
        if (typeof err === "object") {
            if (err && "message" in err && typeof err.message === "string") {
                console.log("\nMessage: " + err.message);
            }
            if (err && "stack" in err && typeof err.stack === "string") {
                console.log("\nStacktrace:");
                console.log("====================");
                console.log(err.stack);
            }
        } else {
            console.log("dumpError :: argument is not an object");
        }
    };

    this.randomIntFromInterval = function (this: any, min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1) + min);
    };

    this.sign = function (this: any, x: number): number {
        return x > 0 ? 1 : x < 0 ? -1 : 0;
    };

    this.dateFormat = function (this: any, date: Date, fstr: string, utc?: boolean): string {
        const accessorPrefix = utc ? "getUTC" : "get";
        return fstr.replace(/%[YmdHMS]/g, function (m: string) {
            const dateWithDynamicGetters = date as unknown as Record<string, () => number>;
            switch (m) {
                case "%Y":
                    return String(dateWithDynamicGetters[accessorPrefix + "FullYear"]());
                case "%m":
                    m = String(1 + dateWithDynamicGetters[accessorPrefix + "Month"]());
                    break;
                case "%d":
                    m = String(dateWithDynamicGetters[accessorPrefix + "Date"]());
                    break;
                case "%H":
                    m = String(dateWithDynamicGetters[accessorPrefix + "Hours"]());
                    break;
                case "%M":
                    m = String(dateWithDynamicGetters[accessorPrefix + "Minutes"]());
                    break;
                case "%S":
                    m = String(dateWithDynamicGetters[accessorPrefix + "Seconds"]());
                    break;
                default:
                    return m.slice(1); // unknown code, remove %
            }
            // add leading zero if required
            return ("0" + m).slice(-2);
        });
    };

    this.sendTelegramMessage = (_message: string): void => {
        void _message;
        // Open-source builds do not send operational notifications to private channels.
    };

    this.logOnlineRecord = (): void => {
        const vars = require("./vars");
        const handleProtocol = require("./handleProtocol");
        const onlineOpenWorld = Number(vars.usuariosOnline) || 0;
        const onlineArena = Number(vars.usuariosOnlinePvP) || 0;
        const onlineTotal = onlineOpenWorld + onlineArena;

        if (onlineTotal <= vars.maxUsersOnline) {
            return;
        }

        vars.maxUsersOnline = onlineTotal;

        const message = `[Online Record] Nuevo record: ${onlineTotal} jugadores en simultáneo (mundo abierto: ${onlineOpenWorld}, arena: ${onlineArena})`;

        console.log(message);
        this.sendTelegramMessage(message);
        handleProtocol.consoleToAll(message, "#E69500", 1, 0);
    };

    this.logCharacterActivity = (_payload: unknown): void => {
        void _payload;
    };

    this.logChallengeHistory = (payload: unknown): void => {
        const vars = require("./vars");

        void this.fetchUrl("/internal/challenges/history", {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "application/json",
                Authorization: vars.tokenAuth,
            },
        }).catch((error: unknown) => {
            this.dumpError(error);
        });
    };

    this.fetchUrl = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
        return apiRequest<T>(config.apiBaseUrl + url,options,API_REQUEST_TIMEOUT_MS);
    };
}

module.exports = funct;
