type RealtimePacketIds = {
    position: number;
    changeHeading: number;
    resyncPosition: number;
    ping: number;
};

/** These validated packets do not mutate the inventory snapshot being saved. */
export function isRealtimePacketDuringInventorySave(id: number, packets: RealtimePacketIds): boolean {
    return id === packets.position || id === packets.changeHeading ||
        id === packets.resyncPosition || id === packets.ping;
}
