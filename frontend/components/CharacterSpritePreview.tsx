"use client";

import {useI18n} from './I18nProvider';
import {assetUiEnglish,assetUiSpanish} from '@/lib/asset-ui-copy';
import { LocalizedText } from '@/components/LocalizedText';
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Application,
    Assets,
    Container,
    Rectangle,
    Sprite,
    Texture,
} from "pixi.js";
import type {
    BodiesDB,
    DirectionalGraphicData,
    GraphicsDB,
    HeadsDB,
    HelmetsDB,
    ShieldsDB,
    WeaponsDB,
    GraphicData,
} from "../types/game";
import {
    loadBodiesDB,
    loadGraphicsDB,
    loadHelmetsDB,
    loadHeadsDB,
    loadShieldsDB,
    loadWeaponsDB,
} from "../utils/gameLoader";

type CharacterSpritePreviewProps = {
    bodyId: number;
    headId: number;
    weaponId?: number;
    shieldId?: number;
    helmetId?: number;
    scale?: number;
    className?: string;
    mode?: "full" | "head";
};

type SpritePosition = {
    x: number;
    y: number;
};

const VIEW_WIDTH = 112;
const VIEW_HEIGHT = 138;
const HEAD_VIEW_WIDTH = 72;
const HEAD_VIEW_HEIGHT = 72;
const FRONT_DIRECTION = "2";
const baseTexturePromiseCache = new Map<string, Promise<Texture>>();

function roundToEven(value: number) {
    const rounded = Math.round(value);

    return rounded % 2 === 0 ? rounded : rounded + 1;
}

function getGraphicImagePaths(imageFile: string | number) {
    return [
        `/graphics/${imageFile}.png`,
        `/static/graphics/${imageFile}.png`,
        `/static/graficosbk/${imageFile}.png`,
    ];
}

function getBodySpritePosition(width: number, height: number): SpritePosition {
    return {
        x: 16 - Math.floor((width * 16) / 32),
        y: 32 - Math.floor((height * 32) / 32),
    };
}

function getHeadSpritePosition(
    bodyPosition: SpritePosition,
    bodyWidth: number,
    bodyHeight: number,
    headWidth: number,
    headOffsetX = 0,
    headOffsetY = 0,
): SpritePosition {
    return {
        x: bodyPosition.x + bodyWidth / 2 - headWidth / 2 + headOffsetX,
        y: bodyPosition.y + bodyHeight - 50 + headOffsetY,
    };
}

function getEquipmentSpritePosition(
    kind: "weapon" | "shield",
    width: number,
    height: number,
): SpritePosition {
    return {
        x: 16 - Math.floor((width * 16) / 32),
        y: (kind === "weapon" ? 28 : 32) - Math.floor((height * 32) / 32),
    };
}

function getHelmetSpritePosition(
    bodyPosition: SpritePosition,
    bodyWidth: number,
    bodyHeight: number,
    helmetWidth: number,
    headOffsetX = 0,
    headOffsetY = 0,
    helmetOffsetX = 0,
    helmetOffsetY = 0,
): SpritePosition {
    const basePosition = getHeadSpritePosition(
        bodyPosition,
        bodyWidth,
        bodyHeight,
        helmetWidth,
        headOffsetX,
        headOffsetY,
    );

    return {
        x: basePosition.x + helmetOffsetX,
        y: basePosition.y + helmetOffsetY,
    };
}

function resolveGraphicFrame(
    graphicsDB: GraphicsDB,
    graphicId: number,
    direction: string,
) {
    const graphic = graphicsDB[graphicId.toString()];

    if (!graphic) {
        return null;
    }

    if (graphic.numFile && graphic.numFrames <= 1) {
        return graphic;
    }

    const frameId =
        (graphic.numFrames > 1 ? graphic.frames?.["1"] : undefined) ??
        graphic.frames?.[direction] ??
        graphic.frames?.["1"] ??
        Object.values(graphic.frames ?? {})[0];

    if (!frameId) {
        return null;
    }

    return graphicsDB[frameId.toString()] ?? null;
}

function resolveDirectionalGraphicFrame(
    graphicsDB: GraphicsDB,
    directionalData: DirectionalGraphicData | undefined,
    direction: string,
) {
    if (!directionalData) {
        return null;
    }

    const graphicId =
        directionalData[direction as keyof DirectionalGraphicData];

    if (!graphicId) {
        return null;
    }

    return resolveGraphicFrame(graphicsDB, graphicId, direction);
}

async function loadBaseTexture(imageFile: string | number): Promise<Texture> {
    const candidatePaths = getGraphicImagePaths(imageFile);
    const cacheKey = candidatePaths.join("|");
    const cachedPromise = baseTexturePromiseCache.get(cacheKey);

    if (cachedPromise) {
        return cachedPromise;
    }

    const loadPromise = (async () => {
        let lastError: unknown;

        for (const candidatePath of candidatePaths) {
            try {
                const texture = await Assets.load(candidatePath);
                texture.source.scaleMode = "nearest";
                return texture;
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError ?? new Error("Failed to load base texture");
    })();

    baseTexturePromiseCache.set(cacheKey, loadPromise);
    return loadPromise;
}

async function loadGraphicTexture(graphicData: GraphicData): Promise<Texture> {
    const baseTexture = await loadBaseTexture(graphicData.numFile);

    return new Texture({
        source: baseTexture.source,
        frame: new Rectangle(
            graphicData.sX,
            graphicData.sY,
            graphicData.width,
            graphicData.height,
        ),
    });
}

function getVisibleAlphaBounds(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
) {
    let minX = width;
    let maxX = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = pixels[(y * width + x) * 4 + 3];

            if (alpha === 0) {
                continue;
            }

            if (x < minX) {
                minX = x;
            }

            if (x > maxX) {
                maxX = x;
            }
        }
    }

    if (maxX < minX) {
        return null;
    }

    return { minX, maxX };
}

export default function CharacterSpritePreview({
    bodyId,
    headId,
    weaponId = 0,
    shieldId = 0,
    helmetId = 0,
    scale = 2.1,
    className,
    mode = "full",
}: CharacterSpritePreviewProps) {
    const previewWidth = roundToEven(
        (mode === "head" ? HEAD_VIEW_WIDTH : VIEW_WIDTH) * scale,
    );
    const previewHeight = roundToEven(
        (mode === "head" ? HEAD_VIEW_HEIGHT : VIEW_HEIGHT) * scale,
    );
    const hostRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<Application | null>(null);
    const {locale}=useI18n();const ui=locale==='es'?assetUiSpanish:assetUiEnglish;
    const [portraitReady,setPortraitReady]=useState(false),[portraitFailed,setPortraitFailed]=useState(false);
    const [isAppReady, setIsAppReady] = useState(false);
    const [graphicsDB, setGraphicsDB] = useState<GraphicsDB | null>(null);
    const [bodiesDB, setBodiesDB] = useState<BodiesDB | null>(null);
    const [headsDB, setHeadsDB] = useState<HeadsDB | null>(null);
    const [weaponsDB, setWeaponsDB] = useState<WeaponsDB | null>(null);
    const [shieldsDB, setShieldsDB] = useState<ShieldsDB | null>(null);
    const [helmetsDB, setHelmetsDB] = useState<HelmetsDB | null>(null);

    useEffect(() => {
        let cancelled = false;

        Promise.all([
            loadGraphicsDB(),
            loadBodiesDB(),
            loadHeadsDB(),
            loadWeaponsDB(),
            loadShieldsDB(),
            loadHelmetsDB(),
        ])
            .then(([graphics, bodies, heads, weapons, shields, helmets]) => {
                if (cancelled) {
                    return;
                }

                setGraphicsDB(graphics);
                setBodiesDB(bodies);
                setHeadsDB(heads);
                setWeaponsDB(weapons);
                setShieldsDB(shields);
                setHelmetsDB(helmets);
            })
            .catch((error) => {
                console.error("Error loading character preview assets:", error);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let disposed = false;
        const host = hostRef.current;

        if (!host) {
            return;
        }

        setIsAppReady(false);

        void (async () => {
            const app = new Application();
            const resolution = Math.min(window.devicePixelRatio || 1, 2);
            await app.init({
                width: previewWidth,
                height: previewHeight,
                antialias: false,
                backgroundAlpha: 0,
                resolution,
                autoDensity: true,
                autoStart: false,
            });

            if (disposed) {
                app.destroy(undefined, { children: true });
                return;
            }

            host.innerHTML = "";
            host.appendChild(app.canvas);
            app.canvas.style.display = "block";
            app.canvas.style.width = `${previewWidth}px`;
            app.canvas.style.height = `${previewHeight}px`;

            app.stage.sortableChildren = true;
            appRef.current = app;
            setIsAppReady(true);
        })();

        return () => {
            disposed = true;
            setIsAppReady(false);

            if (appRef.current) {
                appRef.current.destroy(undefined, { children: true });
                appRef.current = null;
            }

            if (host) {
                host.innerHTML = "";
            }
        };
    }, [previewHeight, previewWidth]);

    const isDataReady = useMemo(
        () =>
            Boolean(
                graphicsDB &&
                bodiesDB &&
                headsDB &&
                weaponsDB &&
                shieldsDB &&
                helmetsDB,
            ),
        [graphicsDB, bodiesDB, headsDB, weaponsDB, shieldsDB, helmetsDB],
    );

    useEffect(() => {
        let cancelled = false;
        setPortraitReady(false);setPortraitFailed(false);
        const app = appRef.current;

        if (!app || !isAppReady || !isDataReady) {
            return;
        }

        const stage = app.stage;
        const disposableTextures: Texture[] = [];

        void (async () => {
            const bodyData = bodiesDB?.[bodyId.toString()];
            const headData = headsDB?.[headId.toString()];

            if (
                !bodyData ||
                !headData ||
                !graphicsDB ||
                !weaponsDB ||
                !shieldsDB ||
                !helmetsDB
            ) {
                return;
            }

            const bodyGraphic = resolveGraphicFrame(
                graphicsDB,
                bodyData[FRONT_DIRECTION],
                FRONT_DIRECTION,
            );
            const headGraphic = resolveGraphicFrame(
                graphicsDB,
                headData[FRONT_DIRECTION],
                FRONT_DIRECTION,
            );
            const weaponGraphic = resolveDirectionalGraphicFrame(
                graphicsDB,
                weaponId > 0 ? weaponsDB[weaponId.toString()] : undefined,
                FRONT_DIRECTION,
            );
            const shieldGraphic = resolveDirectionalGraphicFrame(
                graphicsDB,
                shieldId > 0 ? shieldsDB[shieldId.toString()] : undefined,
                FRONT_DIRECTION,
            );
            const helmetData =
                helmetId > 0 ? helmetsDB[helmetId.toString()] : undefined;
            const helmetGraphic = resolveDirectionalGraphicFrame(
                graphicsDB,
                helmetData,
                FRONT_DIRECTION,
            );

            if (!bodyGraphic || !headGraphic) {
                return;
            }

            const bodyTexture = await loadGraphicTexture(bodyGraphic);
            const headTexture = await loadGraphicTexture(headGraphic);
            const weaponTexture = weaponGraphic
                ? await loadGraphicTexture(weaponGraphic)
                : null;
            const shieldTexture = shieldGraphic
                ? await loadGraphicTexture(shieldGraphic)
                : null;
            const helmetTexture = helmetGraphic
                ? await loadGraphicTexture(helmetGraphic)
                : null;

            if (cancelled) {
                bodyTexture.destroy();
                headTexture.destroy();
                weaponTexture?.destroy();
                shieldTexture?.destroy();
                helmetTexture?.destroy();
                return;
            }

            disposableTextures.push(bodyTexture, headTexture);
            if (weaponTexture) {
                disposableTextures.push(weaponTexture);
            }
            if (shieldTexture) {
                disposableTextures.push(shieldTexture);
            }
            if (helmetTexture) {
                disposableTextures.push(helmetTexture);
            }

            stage
                .removeChildren()
                .forEach((child) => child.destroy({ children: true }));

            const bodyPosition = getBodySpritePosition(
                bodyTexture.width,
                bodyTexture.height,
            );
            const headPosition = getHeadSpritePosition(
                bodyPosition,
                bodyTexture.width,
                bodyTexture.height,
                headTexture.width,
                bodyData.headOffsetX,
                bodyData.headOffsetY,
            );
            const weaponPosition = weaponTexture
                ? getEquipmentSpritePosition(
                      "weapon",
                      weaponTexture.width,
                      weaponTexture.height,
                  )
                : null;
            const shieldPosition = shieldTexture
                ? getEquipmentSpritePosition(
                      "shield",
                      shieldTexture.width,
                      shieldTexture.height,
                  )
                : null;
            const helmetPosition = helmetTexture
                ? getHelmetSpritePosition(
                      bodyPosition,
                      bodyTexture.width,
                      bodyTexture.height,
                      helmetTexture.width,
                      bodyData.headOffsetX,
                      bodyData.headOffsetY,
                      helmetData?.offsetX,
                      helmetData?.offsetY,
                  )
                : null;

            const frameHeight =
                mode === "head" ? HEAD_VIEW_HEIGHT : VIEW_HEIGHT;
            const minY =
                mode === "head"
                    ? headPosition.y
                    : Math.min(
                          bodyPosition.y,
                          headPosition.y,
                          weaponPosition?.y ?? Number.POSITIVE_INFINITY,
                          shieldPosition?.y ?? Number.POSITIVE_INFINITY,
                          helmetPosition?.y ?? Number.POSITIVE_INFINITY,
                      );
            const maxY =
                mode === "head"
                    ? headPosition.y + headTexture.height
                    : Math.max(
                          bodyPosition.y + bodyTexture.height,
                          headPosition.y + headTexture.height,
                          weaponPosition && weaponTexture
                              ? weaponPosition.y + weaponTexture.height
                              : Number.NEGATIVE_INFINITY,
                          shieldPosition && shieldTexture
                              ? shieldPosition.y + shieldTexture.height
                              : Number.NEGATIVE_INFINITY,
                          helmetPosition && helmetTexture
                              ? helmetPosition.y + helmetTexture.height
                              : Number.NEGATIVE_INFINITY,
                      );
            const contentHeight = maxY - minY;
            const offsetX = 0;
            const offsetY =
                (frameHeight - contentHeight) / 2 -
                minY +
                (mode === "full" ? 6 : 0);

            const characterContainer = new Container();
            characterContainer.sortableChildren = true;

            if (mode === "full") {
                const bodySprite = new Sprite(bodyTexture);
                bodySprite.x = Math.round((bodyPosition.x + offsetX) * scale);
                bodySprite.y = Math.round((bodyPosition.y + offsetY) * scale);
                bodySprite.scale.set(scale);
                bodySprite.zIndex = 0.2;
                characterContainer.addChild(bodySprite);

                if (shieldTexture && shieldPosition) {
                    const shieldSprite = new Sprite(shieldTexture);
                    shieldSprite.x = Math.round(
                        (shieldPosition.x + offsetX) * scale,
                    );
                    shieldSprite.y = Math.round(
                        (shieldPosition.y + offsetY) * scale,
                    );
                    shieldSprite.scale.set(scale);
                    shieldSprite.zIndex = 0.5;
                    characterContainer.addChild(shieldSprite);
                }

                if (weaponTexture && weaponPosition) {
                    const weaponSprite = new Sprite(weaponTexture);
                    weaponSprite.x = Math.round(
                        (weaponPosition.x + offsetX) * scale,
                    );
                    weaponSprite.y = Math.round(
                        (weaponPosition.y + offsetY) * scale,
                    );
                    weaponSprite.scale.set(scale);
                    weaponSprite.zIndex = 0.4;
                    characterContainer.addChild(weaponSprite);
                }
            }

            const headSprite = new Sprite(headTexture);
            headSprite.x = Math.round((headPosition.x + offsetX) * scale);
            headSprite.y = Math.round((headPosition.y + offsetY) * scale);
            headSprite.scale.set(scale);
            headSprite.zIndex = 0.1;
            characterContainer.addChild(headSprite);

            if (mode === "full" && helmetTexture && helmetPosition) {
                const helmetSprite = new Sprite(helmetTexture);
                helmetSprite.x = Math.round(
                    (helmetPosition.x + offsetX) * scale,
                );
                helmetSprite.y = Math.round(
                    (helmetPosition.y + offsetY) * scale,
                );
                helmetSprite.scale.set(scale);
                helmetSprite.zIndex = 0.3;
                characterContainer.addChild(helmetSprite);
            }

            stage.addChild(characterContainer);
            app.renderer.render(stage);

            const extracted = app.renderer.extract.pixels({
                target: stage,
                frame: new Rectangle(0, 0, previewWidth, previewHeight),
            });
            const visibleBounds = getVisibleAlphaBounds(
                extracted.pixels,
                extracted.width,
                extracted.height,
            );

            if (visibleBounds) {
                const rendererResolution = app.renderer.resolution || 1;
                const currentCenterPx = Math.round(
                    (visibleBounds.minX + visibleBounds.maxX) / 2,
                );
                const desiredCenterPx = Math.round((extracted.width - 1) / 2);
                characterContainer.x +=
                    (desiredCenterPx - currentCenterPx) / rendererResolution;
                app.renderer.render(stage);
            }
            if(!cancelled)setPortraitReady(true);
        })().catch((error) => {
            if(!cancelled)setPortraitFailed(true);
            console.error("Error rendering character preview:", error);
        });

        return () => {
            cancelled = true;
            stage
                .removeChildren()
                .forEach((child) => child.destroy({ children: true }));
            disposableTextures.forEach((texture) => texture.destroy());
        };
    }, [
        bodyId,
        bodiesDB,
        graphicsDB,
        headId,
        headsDB,
        helmetId,
        helmetsDB,
        isAppReady,
        isDataReady,
        mode,
        previewHeight,
        previewWidth,
        scale,
        shieldId,
        shieldsDB,
        weaponId,
        weaponsDB,
    ]);

    return (
        <div
            className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),rgba(12,10,9,0.95)_58%),linear-gradient(180deg,rgba(120,53,15,0.16),rgba(12,10,9,0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${className ?? ""}`}
            style={{
                width: previewWidth,
                height: previewHeight,
            }}
        >
            {mode === "full" ? (
                <div
                    className="pointer-events-none absolute h-4 rounded-full bg-black/30 blur-md"
                    style={{
                        left: Math.round(
                            (previewWidth -
                                Math.round((VIEW_WIDTH - 44) * scale)) /
                                2,
                        ),
                        top: Math.round((VIEW_HEIGHT - 18) * scale),
                        width: Math.round((VIEW_WIDTH - 44) * scale),
                    }}
                />
            ) : null}

            <div ref={hostRef} className="absolute inset-0" />

            {!isDataReady || !isAppReady || !portraitReady ? (
                <div className="asset-portrait-loading absolute inset-0 flex items-center justify-center text-xs text-stone-400" role="status"><span aria-hidden="true" style={portraitFailed?{animation:'none'}:undefined}/><span className="sr-only">{portraitFailed?ui.portraitFailed:ui.portrait}</span></div>
            ) : null}
        </div>
    );
}
