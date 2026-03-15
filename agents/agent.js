import { BUILDING_BLUEPRINTS } from "../sim/blueprints.js";
import {
    addInventory,
    clamp,
    distance,
    hasInventory,
    inventoryAmount,
    inventoryShortfall,
    moveToward,
    removeInventory,
} from "../sim/utils.js";

const CARRY_CAPACITY = 14;

export class Agent {
    constructor({ id, name, x, y, color, traits }) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.color = color;
        this.speed = 42;
        this.money = 4;
        this.inventory = { wood: 0, stone: 0, berries: 1 };
        this.needs = { energy: 100, hunger: 10 };
        this.currentGoal = "Explore the map";
        this.currentAction = null;
        this.priorityTier = 3;
        this.homeId = null;
        this.bedId = null;
        this.farmId = null;
        this.employerId = null;
        this.currentJobId = null;
        this.ownedBuildingIds = [];
        this.traits = traits;
        this.memory = { resources: new Map(), buildings: new Map(), jobs: new Map() };
        this.decisionCooldown = 0;
        this.actionProgress = 0;
        this.statusFlags = { starving: false, exhausted: false };
    }

    update(world, dt) {
        this.observe(world);
        this.tickNeeds(world, dt);

        this.decisionCooldown -= dt;
        if (this.shouldInterruptForSurvival() && this.currentAction && this.currentAction.category !== "survival") {
            this.releaseReservations(world);
            this.currentAction = null;
            this.actionProgress = 0;
        }

        if (!this.currentAction || this.isActionInvalid(world, this.currentAction) || this.decisionCooldown <= 0) {
            if (!this.currentAction || this.currentAction.category !== "improvement" || this.shouldInterruptForSurvival()) {
                const plan = this.planNextAction(world);
                if (!this.isSameAction(plan, this.currentAction)) {
                    this.releaseReservations(world);
                    this.currentAction = plan;
                    this.actionProgress = 0;
                }
            }
            this.decisionCooldown = this.currentAction?.category === "survival" ? 0.2 : 0.8;
        }

        if (!this.currentAction) {
            return;
        }

        const complete = this.runAction(world, dt, this.currentAction);
        if (complete) {
            this.releaseReservations(world);
            this.currentAction = null;
            this.actionProgress = 0;
        }
    }

    observe(world) {
        for (const resource of world.resources) {
            if (distance(this, resource) < 170) {
                this.memory.resources.set(resource.id, { type: resource.type, x: resource.x, y: resource.y });
            }
        }
        for (const building of world.buildings) {
            if (distance(this, building) < 180) {
                this.memory.buildings.set(building.id, { type: building.type, ownerId: building.ownerId, x: building.x, y: building.y });
            }
        }
        for (const job of world.jobs) {
            const building = world.getBuilding(job.buildingId);
            if (building && distance(this, building) < 200) {
                this.memory.jobs.set(job.id, { type: job.type, buildingId: job.buildingId });
            }
        }
    }

    tickNeeds(world, dt) {
        const shelter = this.homeId ? world.getBuilding(this.homeId) : null;
        const shelterBonus = shelter?.constructed ? 1 - BUILDING_BLUEPRINTS.shelter.comfort : 1;
        this.needs.hunger = clamp(this.needs.hunger + 1.7 * dt, 0, 100);
        this.needs.energy = clamp(this.needs.energy - 1.3 * dt * shelterBonus, 0, 100);

        const starving = this.needs.hunger > 88;
        const exhausted = this.needs.energy < 14;
        if (starving && !this.statusFlags.starving) {
            world.emit("agent_starving", { agentId: this.id, agentName: this.name });
        }
        if (exhausted && !this.statusFlags.exhausted) {
            world.emit("agent_exhausted", { agentId: this.id, agentName: this.name });
        }
        this.statusFlags.starving = starving;
        this.statusFlags.exhausted = exhausted;
    }

    shouldInterruptForSurvival() {
        return this.needs.hunger > 90 || this.needs.energy < 12;
    }

    planNextAction(world) {
        if (this.needs.hunger > 75) {
            this.priorityTier = 1;
            this.currentGoal = "Relieve hunger";
            if (inventoryAmount(this.inventory, "berries") > 0) {
                return { type: "eat_inventory", category: "survival" };
            }
            const storedFood = world.findAccessibleFoodSource(this);
            if (storedFood) {
                return { type: "eat_from_building", category: "survival", buildingId: storedFood.id };
            }
            const farmJob = world.reserveFarmJob(this, true);
            if (farmJob) {
                const owner = world.getAgent(farmJob.ownerId);
                this.employerId = owner?.id ?? null;
                this.currentJobId = farmJob.id;
                world.emit("agent_reserved_job", {
                    agentId: this.id,
                    agentName: this.name,
                    ownerName: owner?.name ?? "another settler",
                });
                return { type: "work_job", category: "survival", jobId: farmJob.id };
            }
            const berries = world.reserveNearestResource(this, "berries");
            if (berries) {
                return { type: "gather", category: "survival", resourceId: berries.id };
            }
        }

        if (this.needs.energy < 28) {
            this.priorityTier = 1;
            this.currentGoal = "Recover energy";
            const bed = world.findRestBuildingFor(this);
            if (bed) {
                return { type: "rest", category: "survival", buildingId: bed.id };
            }
            return { type: "rest", category: "survival", buildingId: null };
        }

        const bedProject = this.planOwnedBuilding(world, "bed");
        if (bedProject) {
            this.priorityTier = 2;
            this.currentGoal = "Improve sleep efficiency";
            return bedProject;
        }

        const shelterProject = this.planOwnedBuilding(world, "shelter");
        if (shelterProject) {
            this.priorityTier = 2;
            this.currentGoal = "Build a shelter";
            return shelterProject;
        }

        if (this.needs.hunger > 35 || !this.hasOwnedBuilding(world, "farm")) {
            const farmProject = this.planOwnedBuilding(world, "farm");
            if (farmProject) {
                this.priorityTier = 2;
                this.currentGoal = "Secure a food source";
                return farmProject;
            }
        }

        const farmJob = world.reserveFarmJob(this, false);
        if (farmJob) {
            this.priorityTier = 3;
            this.currentGoal = "Earn wages and help the village";
            const owner = world.getAgent(farmJob.ownerId);
            this.employerId = owner?.id ?? null;
            this.currentJobId = farmJob.id;
            world.emit("agent_started_job", {
                agentId: this.id,
                agentName: this.name,
                ownerName: owner?.name ?? "another settler",
            });
            return { type: "work_job", category: "aspiration", jobId: farmJob.id };
        }

        const gatherType = world.pickScarceResourceType(this);
        const resource = world.reserveNearestResource(this, gatherType);
        if (resource) {
            this.priorityTier = 3;
            this.currentGoal = `Stockpile ${gatherType}`;
            return { type: "gather", category: "aspiration", resourceId: resource.id };
        }

        this.priorityTier = 3;
        this.currentGoal = "Explore the village";
        return { type: "wander", category: "aspiration", target: world.getRandomPointNear(this.x, this.y) };
    }

    planOwnedBuilding(world, type) {
        if (this.hasOwnedBuilding(world, type)) {
            return null;
        }
        let site = world.getPendingOwnedBuilding(this.id, type);
        if (!site) {
            site = world.createPlannedBuilding(this, type);
            if (!site) {
                return null;
            }
            world.emit("agent_claimed_site", {
                agentId: this.id,
                agentName: this.name,
                buildingType: type,
            });
        }
        const shortfall = inventoryShortfall(this.inventory, BUILDING_BLUEPRINTS[type].cost);
        const neededType = Object.keys(shortfall)[0];
        if (neededType && this.carryWeight() < CARRY_CAPACITY) {
            const resource = world.reserveNearestResource(this, neededType);
            if (resource) {
                return { type: "gather", category: "improvement", resourceId: resource.id };
            }
        }
        if (hasInventory(this.inventory, BUILDING_BLUEPRINTS[type].cost)) {
            return { type: "build", category: "improvement", buildingId: site.id };
        }
        const berryNode = world.reserveNearestResource(this, "berries");
        if (berryNode && this.needs.hunger < 45) {
            return { type: "gather", category: "improvement", resourceId: berryNode.id };
        }
        return { type: "wander", category: "aspiration", target: world.getRandomPointNear(site.x, site.y) };
    }

    hasOwnedBuilding(world, type) {
        return world.buildings.some((building) => building.ownerId === this.id && building.type === type && building.constructed);
    }

    carryWeight() {
        return Object.values(this.inventory).reduce((sum, amount) => sum + amount, 0);
    }

    isActionInvalid(world, action) {
        if (!action) {
            return true;
        }
        if (action.type === "gather") {
            const resource = world.getResource(action.resourceId);
            return !resource || resource.amount <= 0 || (resource.reservedBy && resource.reservedBy !== this.id);
        }
        if (action.type === "build") {
            const building = world.getBuilding(action.buildingId);
            return !building || building.constructed;
        }
        if (action.type === "rest" && action.buildingId) {
            return !world.getBuilding(action.buildingId);
        }
        if (action.type === "work_job") {
            const job = world.getJob(action.jobId);
            return !job || (job.reservedBy && job.reservedBy !== this.id);
        }
        return false;
    }

    runAction(world, dt, action) {
        switch (action.type) {
            case "gather":
                return this.runGather(world, dt, action.resourceId);
            case "eat_inventory":
                return this.runEatInventory(world, dt);
            case "eat_from_building":
                return this.runEatFromBuilding(world, dt, action.buildingId);
            case "rest":
                return this.runRest(world, dt, action.buildingId);
            case "build":
                return this.runBuild(world, dt, action.buildingId);
            case "work_job":
                return this.runJob(world, dt, action.jobId);
            case "wander":
                return this.runWander(dt, action.target);
            default:
                return true;
        }
    }

    runGather(world, dt, resourceId) {
        const resource = world.getResource(resourceId);
        if (!resource) {
            return true;
        }
        const arrived = moveToward(this, resource, this.speed, dt);
        if (!arrived) {
            return false;
        }
        this.actionProgress += dt;
        this.needs.energy = clamp(this.needs.energy - 1.5 * dt, 0, 100);
        this.needs.hunger = clamp(this.needs.hunger + 0.9 * dt, 0, 100);
        if (this.actionProgress >= 1) {
            this.actionProgress = 0;
            const amount = Math.min(resource.yieldAmount ?? 1, resource.amount);
            resource.amount -= amount;
            addInventory(this.inventory, resource.type, amount);
            world.emit("agent_gathered", {
                agentId: this.id,
                agentName: this.name,
                resourceType: resource.type,
            });
            if (resource.amount <= 0 || this.carryWeight() >= CARRY_CAPACITY) {
                return true;
            }
        }
        return false;
    }

    runEatInventory(world, dt) {
        this.actionProgress += dt;
        if (this.actionProgress < 0.7) {
            return false;
        }
        removeInventory(this.inventory, "berries", 1);
        this.needs.hunger = clamp(this.needs.hunger - 34, 0, 100);
        world.emit("agent_ate", { agentId: this.id, agentName: this.name });
        return true;
    }

    runEatFromBuilding(world, dt, buildingId) {
        const building = world.getBuilding(buildingId);
        if (!building || (building.storage?.berries ?? 0) <= 0) {
            return true;
        }
        const arrived = moveToward(this, building, this.speed, dt);
        if (!arrived) {
            return false;
        }
        this.actionProgress += dt;
        if (this.actionProgress < 0.9) {
            return false;
        }
        removeInventory(building.storage, "berries", 1);
        this.needs.hunger = clamp(this.needs.hunger - 32, 0, 100);
        world.emit("agent_ate", { agentId: this.id, agentName: this.name });
        return true;
    }

    runRest(world, dt, buildingId) {
        let restBonus = 7;
        let restType = "ground";
        if (buildingId) {
            const building = world.getBuilding(buildingId);
            if (!building) {
                return true;
            }
            const arrived = moveToward(this, building, this.speed, dt);
            if (!arrived) {
                return false;
            }
            if (building.type === "bed") {
                restBonus = BUILDING_BLUEPRINTS.bed.restBonus;
                restType = "bed";
            } else if (building.type === "shelter") {
                restBonus = 10;
                restType = "shelter";
            }
        }
        this.needs.energy = clamp(this.needs.energy + restBonus * dt, 0, 100);
        this.needs.hunger = clamp(this.needs.hunger + 0.5 * dt, 0, 100);
        if (this.actionProgress === 0) {
            world.emit("agent_rested", { agentId: this.id, agentName: this.name, restType });
        }
        this.actionProgress += dt;
        return this.needs.energy >= 96;
    }

    runBuild(world, dt, buildingId) {
        const building = world.getBuilding(buildingId);
        if (!building) {
            return true;
        }
        if (!hasInventory(this.inventory, BUILDING_BLUEPRINTS[building.type].cost)) {
            return true;
        }
        const arrived = moveToward(this, building, this.speed, dt);
        if (!arrived) {
            return false;
        }
        building.progress += dt;
        this.needs.energy = clamp(this.needs.energy - 1.1 * dt, 0, 100);
        this.needs.hunger = clamp(this.needs.hunger + 0.8 * dt, 0, 100);
        if (building.progress >= BUILDING_BLUEPRINTS[building.type].buildTime) {
            for (const [type, amount] of Object.entries(BUILDING_BLUEPRINTS[building.type].cost)) {
                removeInventory(this.inventory, type, amount);
            }
            world.completeBuilding(building, this);
            world.emit("agent_built", {
                agentId: this.id,
                agentName: this.name,
                buildingType: building.type,
            });
            return true;
        }
        return false;
    }

    runJob(world, dt, jobId) {
        const job = world.getJob(jobId);
        if (!job) {
            return true;
        }
        const building = world.getBuilding(job.buildingId);
        if (!building) {
            return true;
        }
        const arrived = moveToward(this, building, this.speed, dt);
        if (!arrived) {
            return false;
        }
        this.actionProgress += dt;
        this.needs.energy = clamp(this.needs.energy - 0.8 * dt, 0, 100);
        this.needs.hunger = clamp(this.needs.hunger + 0.9 * dt, 0, 100);
        if (this.actionProgress >= 4.5) {
            this.actionProgress = 0;
            building.storage.berries = Math.min(building.storageCap, (building.storage.berries ?? 0) + 3);
            this.money += job.wage;
            world.emit("agent_paid", { agentId: this.id, agentName: this.name, amount: job.wage });
            if (job.meal > 0 && this.needs.hunger > 50) {
                this.needs.hunger = clamp(this.needs.hunger - 18, 0, 100);
                world.emit("agent_fed_from_job", { agentId: this.id, agentName: this.name });
            }
            return true;
        }
        return false;
    }

    runWander(dt, target) {
        if (!target) {
            return true;
        }
        return moveToward(this, target, this.speed * 0.75, dt);
    }

    releaseReservations(world) {
        if (this.currentAction?.type === "gather") {
            world.releaseResource(this.currentAction.resourceId, this.id);
        }
        if (this.currentAction?.type === "work_job") {
            world.releaseJob(this.currentAction.jobId, this.id);
            this.currentJobId = null;
            this.employerId = null;
        }
    }

    isSameAction(next, current) {
        if (!next && !current) {
            return true;
        }
        if (!next || !current) {
            return false;
        }
        return next.type === current.type &&
            next.resourceId === current.resourceId &&
            next.buildingId === current.buildingId &&
            next.jobId === current.jobId;
    }

    snapshot(world) {
        const employer = this.employerId ? world.getAgent(this.employerId) : null;
        return {
            id: this.id,
            name: this.name,
            energy: this.needs.energy,
            hunger: this.needs.hunger,
            money: this.money,
            inventory: { ...this.inventory },
            priorityTier: this.priorityTier,
            goal: this.currentGoal,
            action: this.currentAction?.type ?? "idle",
            employer: employer?.name ?? "None",
            home: this.homeId ? world.getBuilding(this.homeId)?.type ?? "Unknown" : "None",
            bed: this.bedId ? "Owned" : "None",
            farm: this.farmId ? "Owned" : "None",
            traits: this.traits,
        };
    }
}

