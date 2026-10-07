"use client";

import {LocalizedText} from '@/components/LocalizedText';
import React from "react";

type PanelPosition = {
    x: number;
    y: number;
};

type FloatingHudPanelProps = {
    title?: string;
    subtitle?: string;
    initialPosition: PanelPosition;
    className?: string;
    panelHeight?: number | string;
    contentClassName?: string;
    scrollContent?: boolean;
    draggable?: boolean;
    showHeader?: boolean;
    children: React.ReactNode;
};

const MOBILE_MARGIN = 12;

export default function FloatingHudPanel({
    title,
    subtitle,
    initialPosition,
    className = "",
    panelHeight,
    contentClassName = "",
    scrollContent = true,
    draggable = true,
    showHeader = true,
    children,
}: FloatingHudPanelProps) {
    const panelRef = React.useRef<HTMLDivElement>(null);
    const pointerOffsetRef = React.useRef({ x: 0, y: 0 });
    const [position, setPosition] = React.useState(initialPosition);
    const [dragging, setDragging] = React.useState(false);

    const clampPosition = React.useCallback((nextPosition: PanelPosition) => {
        const panel = panelRef.current;
        if (!panel || typeof window === "undefined") {
            return nextPosition;
        }

        const rect = panel.getBoundingClientRect();
        const maxX = Math.max(
            MOBILE_MARGIN,
            window.innerWidth - rect.width - MOBILE_MARGIN,
        );
        const maxY = Math.max(
            MOBILE_MARGIN,
            window.innerHeight - rect.height - MOBILE_MARGIN,
        );

        return {
            x: Math.min(Math.max(MOBILE_MARGIN, nextPosition.x), maxX),
            y: Math.min(Math.max(MOBILE_MARGIN, nextPosition.y), maxY),
        };
    }, []);

    React.useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            setPosition(clampPosition(initialPosition));
        });

        return () => window.cancelAnimationFrame(frame);
    }, [clampPosition, initialPosition]);

    React.useEffect(() => {
        const handleResize = () =>
            setPosition((current) => clampPosition(current));
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [clampPosition]);

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) {
            return;
        }

        pointerOffsetRef.current = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };

        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) {
            return;
        }

        setPosition(
            clampPosition({
                x: event.clientX - pointerOffsetRef.current.x,
                y: event.clientY - pointerOffsetRef.current.y,
            }),
        );
    };

    const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) {
            return;
        }

        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    return (
        <div
            ref={panelRef}
            className={`fixed z-40 flex w-[min(92vw,320px)] flex-col overflow-hidden rounded-2xl border border-cyan-300/25 bg-slate-950/78 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-xl ${className}`}
            style={{
                left: position.x,
                top: position.y,
                height: panelHeight,
                minHeight: panelHeight,
                maxHeight: panelHeight,
            }}
        >
            <div
                aria-hidden={!showHeader}
                className={`${showHeader ? "flex" : "hidden"} items-center justify-between border-b border-cyan-200/10 bg-linear-to-r from-cyan-300/12 via-sky-300/10 to-transparent px-4 py-3 ${
                    showHeader && draggable
                        ? `cursor-grab touch-none active:cursor-grabbing ${dragging ? "cursor-grabbing" : ""}`
                        : ""
                }`}
                onPointerDown={
                    showHeader && draggable ? onPointerDown : undefined
                }
                onPointerMove={
                    showHeader && draggable ? onPointerMove : undefined
                }
                onPointerUp={showHeader && draggable ? stopDragging : undefined}
                onPointerCancel={
                    showHeader && draggable ? stopDragging : undefined
                }
            >
                <div>
                    <h2 className="text-sm font-semibold text-white">
                        <LocalizedText source={title} />
                    </h2>
                </div>
                <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-cyan-100/80">
                    <LocalizedText source={subtitle || "Arrastrar"} />
                </span>
            </div>

            <div
                className={`min-h-0 flex-1 p-3 ${
                    scrollContent ? "overflow-auto" : "overflow-hidden"
                } ${contentClassName}`}
                style={{
                    touchAction: "pan-y",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                }}
            >
                {children}
            </div>
        </div>
    );
}
