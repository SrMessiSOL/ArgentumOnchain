import {useI18n} from '../../I18nProvider';
import {localizeLoadingDetail} from '../../../lib/game-i18n';
type LoadingOverlayProps = {
    stage: string;
    detail: string;
    progress: number;
    active: boolean;
};

export function LoadingOverlay({
    stage,
    detail,
    progress,
    active,
}: LoadingOverlayProps) {
    const {text,locale}=useI18n();
    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(120,53,15,0.32),_transparent_42%),linear-gradient(180deg,_rgba(12,10,9,0.88),_rgba(0,0,0,0.96))] px-6 text-stone-100">
            <div className="w-full max-w-sm rounded-3xl border border-amber-300/20 bg-stone-950/70 p-6 shadow-2xl backdrop-blur-md">
                <p className="text-[10px] uppercase tracking-[0.35em] text-amber-300/80">
                    AOWeb
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                    {text(stage)}
                </h2>
                <p className="mt-2 text-sm text-stone-300">{localizeLoadingDetail(detail,locale)}</p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-800/85">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-300 to-cyan-300 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-stone-400">
                    <span>
                        {text(active ? "Cargando assets" : "Preparando escena")}
                    </span>
                    <span>{progress}%</span>
                </div>
            </div>
        </div>
    );
}
