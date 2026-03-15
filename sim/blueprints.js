export const BUILDING_BLUEPRINTS = {
    bed: {
        type: "bed",
        label: "Simple Bed",
        footprint: { w: 1, h: 1 },
        cost: { wood: 5 },
        buildTime: 5,
        private: true,
        restBonus: 18,
    },
    shelter: {
        type: "shelter",
        label: "Shelter",
        footprint: { w: 2, h: 2 },
        cost: { wood: 8, stone: 4 },
        buildTime: 8,
        private: true,
        comfort: 0.25,
    },
    farm: {
        type: "farm",
        label: "Small Farm",
        footprint: { w: 2, h: 2 },
        cost: { wood: 6, stone: 2 },
        buildTime: 9,
        private: false,
        storageCap: 18,
        jobSlots: 1,
        wage: 2,
        meal: 1,
    },
};

export const RESOURCE_COLORS = {
    wood: 0x9c6b3e,
    stone: 0x7f8c96,
    berries: 0xcf5d8f,
};

export const BUILDING_COLORS = {
    bed: 0xb1a47f,
    shelter: 0x5c78b5,
    farm: 0x4cb06b,
};
