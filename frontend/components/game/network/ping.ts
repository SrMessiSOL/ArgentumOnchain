export function getSmoothedPingDisplay(
    currentSamples: number[],
    sampleMs: number,
): { samples: number[]; text: string; value: number; jitter: number } {
    const samples = [...currentSamples, sampleMs].slice(-6);
    const sortedSamples = [...samples].sort((a, b) => a - b);
    const middleIndex = Math.floor(sortedSamples.length / 2);
    const stablePingMs =
        sortedSamples.length % 2 === 0
            ? Math.round(
                  (sortedSamples[middleIndex - 1] +
                      sortedSamples[middleIndex]) /
                      2,
              )
            : sortedSamples[middleIndex];

    const jitter = Math.round(samples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - samples[index]), 0) / Math.max(1, samples.length - 1));

    return {
        samples,
        text: `Ping: ${stablePingMs} ms | Jitter: ${jitter} ms`,
        jitter,
        value: stablePingMs,
    };
}
