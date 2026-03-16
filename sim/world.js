import { Agent } from "../agents/agent.js";
import { BUILDING_BLUEPRINTS } from "./blueprints.js";
import { addInventory, clamp, distance } from "./utils.js";

const NAMES = ["Aster", "Bram", "Cleo", "Dax", "Esme", "Finn", "Gael", "Hana"];
const COLORS = [0xf4f7fb, 0xf7d794, 0xf8a5c2, 0x63cdda, 0x778beb, 0xe77f67];
const HOUSE_VARIANTS = ["house-1", "house-2"];

export class WorldState {
    constructor(config = {}) {
        this.width = config.width ?? 640;
        this.height = config.height ?? 640;
        this.gridSize = config.gridSize ?? 32;
        this.time = 0;
        this.day = 1;
        this.paused = false;
        this.speed = 1;
        this.debug = true;
        this.nextId = 1;
        this.agents = [];
        this.resources = [];
        this.buildings = [];
        this.jobs = [];
        this.eventQueue = [];
        this.eventHistory = [];
        this.metrics = {
            totalFoodToday: 0,
            idleAgents: 0,
            unmetNeeds: 0,
            averageStability: 100,
        };
        this.selectedAgentId = null;
        this.randomIndex = 0;
    }

    seed() {
        this.spawnResourceCluster();
        // Spread starting agents across the map center area
        const cx = this.width / 2;
        const cy = this.height / 2;
        const offsets = [
            { x: -140, y: -80 },
            { x:  60,  y: -80 },
            { x: -140, y:  60 },
            { x:  60,  y:  60 },
        ];
        for (let index = 0; index < 4; index += 1) {
            this.spawnAgent({
                x: cx + offsets[index].x,
                y: cy + offsets[index].y,
            });
        }
        this.selectedAgentId = this.agents[0]?.id ?? null;
    }

    step(dt) {
        if (this.paused) {
            return;
        }

        this.time += dt;
        this.day = Math.floor(this.time / 180) + 1;
        this.regrowBerryBushes(dt);

        for (const agent of this.agents) {
            agent.update(this, dt);
        }

        this.metrics.idleAgents = this.agents.filter((agent) => !agent.currentAction).length;
        this.metrics.unmetNeeds = this.agents.filter((agent) => agent.needs.hunger > 70 || agent.needs.energy < 30).length;
        this.metrics.averageStability = Math.round(
            this.agents.reduce((sum, agent) => sum + ((100 - agent.needs.hunger) + agent.needs.energy) / 2, 0) /
            Math.max(1, this.agents.length)
        );
        this.metrics.totalFoodToday = this.buildings.reduce((sum, building) => sum + (building.storage?.berries ?? 0), 0) +
            this.agents.reduce((sum, agent) => sum + (agent.inventory.berries ?? 0), 0);
    }

    regrowBerryBushes(dt) {
        for (const resource of this.resources) {
            if (resource.type === "berries" && resource.amount < resource.maxAmount) {
                resource.amount = clamp(resource.amount + dt * 0.08, 0, resource.maxAmount);
            }
        }
    }

    spawnResourceCluster() {
        const W = this.width;
        const H = this.height;
        const m = 80; // margin from edge
        // Wood clusters around outer ring — corners and mid-edges
        const woodSpots = [
            [m,         m        ],  // top-left
            [W - m,     m        ],  // top-right
            [W - m,     H - m    ],  // bottom-right
            [m,         H - m    ],  // bottom-left
            [W / 2,     m + 20   ],  // top-mid
            [W / 2,     H - m - 20], // bottom-mid
        ];
        for (const [x, y] of woodSpots) {
            // Scatter 2-3 nodes per cluster
            for (let k = 0; k < 3; k++) {
                const ox = (k - 1) * 48;
                const oy = k % 2 === 0 ? -32 : 32;
                this.createResource("wood", x + ox, y + oy, 14);
            }
        }
        // Stone scattered mid-map, away from dead center
        const stoneSpots = [
            [m + 80,    H / 2    ],
            [W - m - 80, H / 2   ],
            [W / 3,     H / 3    ],
            [W * 2 / 3, H * 2 / 3],
        ];
        for (const [x, y] of stoneSpots) {
            this.createResource("stone", x, y, 14);
        }
        // Berry bushes near map edges (not center)
        const berrySpots = [
            [m + 60,    H / 3    ],
            [m + 60,    H * 2/3  ],
            [W - m - 60, H / 3   ],
            [W - m - 60, H * 2/3 ],
            [W / 3,     H - m - 40],
            [W * 2/3,   m + 40   ],
        ];
        for (const [x, y] of berrySpots) {
            this.createResource("berries", x, y, 8);
        }
    }

    createResource(type, x, y, amount = 10) {
        const id = `resource-${this.nextId++}`;
        this.resources.push({
            id,
            type,
            x,
            y,
            amount,
            maxAmount: amount,
            yieldAmount: 1,
            reservedBy: null,
        });
        return id;
    }

    spawnAgent(position = {}) {
        const id = `agent-${this.nextId++}`;
        const name = NAMES[(this.agents.length + this.randomIndex) % NAMES.length];
        const agent = new Agent({
            id,
            name,
            x: position.x ?? 140 + this.agents.length * 40,
            y: position.y ?? 170 + this.agents.length * 35,
            color: COLORS[this.agents.length % COLORS.length],
            traits: this.rollTraits(),
        });
        this.agents.push(agent);
        return agent;
    }

    rollTraits() {
        const presets = [
            { builder: 1.3, farmer: 0.9, hoarder: 1.1 },
            { builder: 0.9, farmer: 1.4, hoarder: 1.0 },
            { builder: 1.0, farmer: 1.0, hoarder: 1.4 },
            { builder: 1.1, farmer: 1.2, hoarder: 0.9 },
        ];
        const traits = presets[this.randomIndex % presets.length];
        this.randomIndex += 1;
        return traits;
    }

    reserveNearestResource(agent, type) {
        const candidates = this.resources
            .filter((resource) => resource.type === type && resource.amount >= 1 && (!resource.reservedBy || resource.reservedBy === agent.id))
            .sort((a, b) => distance(agent, a) - distance(agent, b));
        const resource = candidates[0];
        if (!resource) {
            return null;
        }
        resource.reservedBy = agent.id;
        return resource;
    }

    releaseResource(resourceId, agentId) {
        const resource = this.getResource(resourceId);
        if (resource && resource.reservedBy === agentId) {
            resource.reservedBy = null;
        }
    }

    reserveFarmJob(agent, urgent) {
        const jobs = this.jobs
            .filter((job) => (!job.reservedBy || job.reservedBy === agent.id) && (urgent || job.ownerId !== agent.id))
            .sort((a, b) => {
                const aBuilding = this.getBuilding(a.buildingId);
                const bBuilding = this.getBuilding(b.buildingId);
                return distance(agent, aBuilding) - distance(agent, bBuilding);
            });
        const job = jobs[0];
        if (!job) {
            return null;
        }
        job.reservedBy = agent.id;
        return job;
    }

    releaseJob(jobId, agentId) {
        const job = this.getJob(jobId);
        if (job && job.reservedBy === agentId) {
            job.reservedBy = null;
        }
    }

    createPlannedBuilding(agent, type) {
        const blueprint = BUILDING_BLUEPRINTS[type];
        const position = this.findBuildSpot(agent, blueprint.footprint);
        if (!position) {
            return null;
        }
        const building = {
            id: `building-${this.nextId++}`,
            type,
            ownerId: agent.id,
            x: position.x,
            y: position.y,
            footprint: blueprint.footprint,
            progress: 0,
            constructed: false,
            private: blueprint.private,
            storage: type === "farm" ? { berries: 0 } : {},
            storageCap: blueprint.storageCap ?? 0,
            appearance: this.pickBuildingAppearance(type),
        };
        this.buildings.push(building);
        return building;
    }

    pickBuildingAppearance(type) {
        if (type === "shelter") {
            return HOUSE_VARIANTS[Math.floor(Math.random() * HOUSE_VARIANTS.length)];
        }
        return null;
    }

    getPendingOwnedBuilding(ownerId, type) {
        return this.buildings.find((building) => building.ownerId === ownerId && building.type === type && !building.constructed) ?? null;
    }

    completeBuilding(building, agent) {
        building.constructed = true;
        if (!agent.ownedBuildingIds.includes(building.id)) {
            agent.ownedBuildingIds.push(building.id);
        }
        if (building.type === "bed") {
            agent.bedId = building.id;
        } else if (building.type === "shelter") {
            agent.homeId = building.id;
            // Plant a small wood grove and berry bush beside the new shelter
            this.plantNear("wood",    building.x + 80,  building.y - 60, 10);
            this.plantNear("wood",    building.x - 80,  building.y - 60, 10);
            this.plantNear("berries", building.x,       building.y + 90, 6);
        } else if (building.type === "farm") {
            agent.farmId = building.id;
            this.jobs.push({
                id: `job-${this.nextId++}`,
                type: "farm",
                buildingId: building.id,
                ownerId: agent.id,
                wage: BUILDING_BLUEPRINTS.farm.wage,
                meal: BUILDING_BLUEPRINTS.farm.meal,
                reservedBy: null,
                public: true,
            });
            addInventory(building.storage, "berries", 2);
            // Plant extra berry bushes around the new farm
            this.plantNear("berries", building.x + 60,  building.y, 8);
            this.plantNear("berries", building.x - 60,  building.y, 8);
        }
    }

    plantNear(type, x, y, amount) {
        // Keep within world bounds with a margin
        const m = 32;
        const px = Math.max(m, Math.min(this.width  - m, x));
        const py = Math.max(m, Math.min(this.height - m, y));
        // Only plant if no existing resource of the same type is very close
        const tooClose = this.resources.some(
            (r) => r.type === type && Math.abs(r.x - px) < 40 && Math.abs(r.y - py) < 40
        );
        if (!tooClose) {
            this.createResource(type, px, py, amount);
        }
    }

    findRestBuildingFor(agent) {
        if (agent.bedId) {
            return this.getBuilding(agent.bedId);
        }
        return this.buildings.find((building) => building.type === "bed" && building.constructed && (!building.private || building.ownerId === agent.id)) ?? null;
    }

    findAccessibleFoodSource(agent) {
        const ownFarm = agent.farmId ? this.getBuilding(agent.farmId) : null;
        if (ownFarm && (ownFarm.storage?.berries ?? 0) > 0) {
            return ownFarm;
        }
        return this.buildings.find((building) =>
            building.type === "farm" &&
            building.constructed &&
            (building.storage?.berries ?? 0) > 0 &&
            building.ownerId === agent.id
        ) ?? null;
    }

    pickScarceResourceType(agent) {
        const options = ["wood", "stone", "berries"];
        const weighted = options.map((type) => {
            const traitBias = type === "wood" ? agent.traits.builder :
                type === "berries" ? agent.traits.farmer :
                agent.traits.hoarder;
            return { type, score: (this.countAvailableResource(type) / 10) - traitBias };
        });
        weighted.sort((a, b) => a.score - b.score);
        return weighted[0].type;
    }

    countAvailableResource(type) {
        return this.resources
            .filter((resource) => resource.type === type)
            .reduce((sum, resource) => sum + resource.amount, 0);
    }

    findBuildSpot(agent, footprint) {
        // Build near the agent's current position instead of fixed grid
        const bx = Math.round(agent.x / this.gridSize) * this.gridSize;
        const by = Math.round(agent.y / this.gridSize) * this.gridSize;
        const step = this.gridSize * 3; // ~96px spacing
        const m = 80;
        const candidates = [
            { x: bx,        y: by + step },
            { x: bx - step, y: by        },
            { x: bx + step, y: by        },
            { x: bx,        y: by - step },
            { x: bx - step, y: by + step },
            { x: bx + step, y: by + step },
            { x: bx - step, y: by - step },
            { x: bx + step, y: by - step },
        ].map((p) => ({
            x: Math.max(m, Math.min(this.width  - m, p.x)),
            y: Math.max(m, Math.min(this.height - m, p.y)),
        }));
        return candidates.find((point) => this.isAreaFree(point.x, point.y, footprint)) ?? null;
    }

    isAreaFree(x, y, footprint) {
        const minGap = 120; // minimum pixel gap between buildings
        return !this.buildings.some((building) =>
            Math.abs(building.x - x) < (building.footprint.w + footprint.w) * this.gridSize * 0.5 + minGap &&
            Math.abs(building.y - y) < (building.footprint.h + footprint.h) * this.gridSize * 0.5 + minGap
        );
    }

    getRandomPointNear(x, y) {
        const angle = (this.time * 0.7 + this.randomIndex) % (Math.PI * 2);
        const radius = 30 + (this.randomIndex % 3) * 16;
        this.randomIndex += 1;
        return {
            x: clamp(x + Math.cos(angle) * radius, 28, this.width - 28),
            y: clamp(y + Math.sin(angle) * radius, 28, this.height - 28),
        };
    }

    spawnResourceNear(type, x, y) {
        const point = this.getRandomPointNear(x, y);
        this.createResource(type, point.x, point.y, type === "berries" ? 6 : 10);
    }

    getAgentAt(x, y) {
        return this.agents.find((agent) => distance(agent, { x, y }) < 16) ?? null;
    }

    selectAgent(agentId) {
        this.selectedAgentId = agentId;
    }

    getSelectedAgent() {
        return this.getAgent(this.selectedAgentId);
    }

    drainEvents() {
        const events = [...this.eventQueue];
        this.eventQueue.length = 0;
        return events;
    }

    emit(type, payload = {}) {
        const event = { type, ...payload, day: this.day, timeLabel: this.getTimeLabel() };
        this.eventQueue.push(event);
        this.eventHistory.push(event);
        if (this.eventHistory.length > 200) {
            this.eventHistory.shift();
        }
    }

    getTimeLabel() {
        const minuteOfDay = Math.floor((this.time % 180) / 180 * 24 * 60);
        const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
        const minutes = String(minuteOfDay % 60).padStart(2, "0");
        return `${hours}:${minutes}`;
    }

    getDebugSnapshot() {
        return {
            day: this.day,
            timeLabel: this.getTimeLabel(),
            agentCount: this.agents.length,
            buildings: {
                bed: this.buildings.filter((building) => building.type === "bed" && building.constructed).length,
                shelter: this.buildings.filter((building) => building.type === "shelter" && building.constructed).length,
                farm: this.buildings.filter((building) => building.type === "farm" && building.constructed).length,
            },
            metrics: { ...this.metrics },
            selectedAgent: this.getSelectedAgent()?.snapshot(this) ?? null,
        };
    }

    getAgent(agentId) {
        return this.agents.find((agent) => agent.id === agentId) ?? null;
    }

    getBuilding(buildingId) {
        return this.buildings.find((building) => building.id === buildingId) ?? null;
    }

    getResource(resourceId) {
        return this.resources.find((resource) => resource.id === resourceId) ?? null;
    }

    getJob(jobId) {
        return this.jobs.find((job) => job.id === jobId) ?? null;
    }
}
