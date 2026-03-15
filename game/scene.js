import { BUILDING_COLORS, RESOURCE_COLORS } from "../sim/blueprints.js";

let runtime = null;

export function setRuntime(nextRuntime) {
    runtime = nextRuntime;
}

export class SocietyScene extends Phaser.Scene {
    constructor() {
        super("society");
        this.accumulator = 0;
        this.fixedDt = 1 / 5;
        this.agentViews = new Map();
        this.resourceViews = new Map();
        this.buildingViews = new Map();
        this.debugLabels = [];
        this.selectionRing = null;
    }

    preload() {
        this.load.image("grass-bg", "asset/grass_bg.jpg");
        this.load.image("house-1", "asset/house_1.avif");
        this.load.image("house-2", "asset/house_2.avif");
    }

    create() {
        const midX = runtime.world.width / 2;
        const midY = runtime.world.height / 2;

        this.add.tileSprite(midX, midY, runtime.world.width, runtime.world.height, "grass-bg").setAlpha(0.72);
        this.add.rectangle(midX, midY, runtime.world.width, runtime.world.height, 0x18301d, 0.26)
            .setStrokeStyle(1, 0x35523b, 0.35);
        this.add.rectangle(midX, midY, runtime.world.width - 12, runtime.world.height - 12, 0x000000, 0)
            .setStrokeStyle(1, 0x4d6f53, 0.2);
        this.add.circle(140, 130, 110, 0x315336, 0.1);
        this.add.circle(runtime.world.width - 150, runtime.world.height - 140, 130, 0x315336, 0.08);

        this.drawGrid();
        this.selectionRing = this.add.circle(0, 0, 20).setStrokeStyle(3, 0xfff1a6).setVisible(false);

        this.input.on("pointerdown", (pointer) => {
            const agent = runtime.world.getAgentAt(pointer.x, pointer.y);
            if (agent) {
                runtime.world.selectAgent(agent.id);
                runtime.ui.render();
            }
        });
    }

    drawGrid() {
        const graphics = this.add.graphics();
        graphics.lineStyle(1, 0x29402d, 0.16);
        for (let x = 0; x <= runtime.world.width; x += runtime.world.gridSize) {
            graphics.moveTo(x, 0);
            graphics.lineTo(x, runtime.world.height);
        }
        for (let y = 0; y <= runtime.world.height; y += runtime.world.gridSize) {
            graphics.moveTo(0, y);
            graphics.lineTo(runtime.world.width, y);
        }
        graphics.strokePath();
    }

    update(_, deltaMs) {
        const scaledDt = (deltaMs / 1000) * runtime.world.speed;
        this.accumulator += scaledDt;

        while (this.accumulator >= this.fixedDt) {
            runtime.world.step(this.fixedDt);
            this.accumulator -= this.fixedDt;
        }

        this.syncWorld();
        runtime.ui.consumeEvents(runtime.world.drainEvents());
        runtime.ui.render();
    }

    syncWorld() {
        this.syncResources();
        this.syncBuildings();
        this.syncAgents();
        this.syncDebugLabels();
    }

    syncResources() {
        const liveIds = new Set();
        for (const resource of runtime.world.resources) {
            liveIds.add(resource.id);
            let view = this.resourceViews.get(resource.id);
            if (!view) {
                const size = resource.type === "berries" ? 16 : 20;
                view = this.add.rectangle(resource.x, resource.y, size, size, RESOURCE_COLORS[resource.type]);
                view.setStrokeStyle(1, 0x0f181c, 0.35);
                this.resourceViews.set(resource.id, view);
            }
            view.setPosition(resource.x, resource.y);
            view.setFillStyle(RESOURCE_COLORS[resource.type], Math.max(0.3, resource.amount / resource.maxAmount));
        }

        for (const [id, view] of this.resourceViews.entries()) {
            if (!liveIds.has(id)) {
                view.destroy();
                this.resourceViews.delete(id);
            }
        }
    }

    syncBuildings() {
        const liveIds = new Set();
        for (const building of runtime.world.buildings) {
            liveIds.add(building.id);
            let view = this.buildingViews.get(building.id);
            const shouldUseSprite = building.type === "shelter" && building.constructed && building.appearance;

            if (!view || view.kind !== (shouldUseSprite ? "sprite" : "shape")) {
                if (view) {
                    view.node.destroy();
                }
                view = shouldUseSprite
                    ? this.createBuildingSprite(building)
                    : this.createBuildingShape(building);
                this.buildingViews.set(building.id, view);
            }

            this.updateBuildingView(view, building);
        }

        for (const [id, view] of this.buildingViews.entries()) {
            if (!liveIds.has(id)) {
                view.node.destroy();
                this.buildingViews.delete(id);
            }
        }
    }

    createBuildingShape(building) {
        const node = this.add.rectangle(
            building.x,
            building.y,
            building.footprint.w * 34,
            building.footprint.h * 34,
            BUILDING_COLORS[building.type]
        );
        return { kind: "shape", node };
    }

    createBuildingSprite(building) {
        const node = this.add.image(building.x, building.y, building.appearance);
        return { kind: "sprite", node };
    }

    updateBuildingView(view, building) {
        if (view.kind === "sprite") {
            view.node.setPosition(building.x, building.y);
            view.node.setDisplaySize(building.footprint.w * 56, building.footprint.h * 56);
            view.node.setAlpha(0.96);
        } else {
            view.node.setPosition(building.x, building.y);
            view.node.setSize(building.footprint.w * 34, building.footprint.h * 34);
            view.node.setFillStyle(BUILDING_COLORS[building.type], building.constructed ? 0.88 : 0.28);
            view.node.setStrokeStyle(1, 0xeff6f8, building.ownerId === runtime.world.selectedAgentId ? 0.45 : 0.12);
        }
    }

    syncAgents() {
        const liveIds = new Set();
        for (const agent of runtime.world.agents) {
            liveIds.add(agent.id);
            let view = this.agentViews.get(agent.id);
            if (!view) {
                const body = this.add.circle(agent.x, agent.y, 13, agent.color).setStrokeStyle(2, 0x102028);
                const label = this.add.text(agent.x - 4, agent.y - 10, agent.name[0], {
                    fontSize: "12px",
                    color: "#0d171b",
                    fontStyle: "bold",
                });
                view = { body, label };
                this.agentViews.set(agent.id, view);
            }
            view.body.setPosition(agent.x, agent.y);
            view.label.setPosition(agent.x - 4, agent.y - 10);
        }

        for (const [id, view] of this.agentViews.entries()) {
            if (!liveIds.has(id)) {
                view.body.destroy();
                view.label.destroy();
                this.agentViews.delete(id);
            }
        }

        const selected = runtime.world.getSelectedAgent();
        if (selected) {
            this.selectionRing.setVisible(true);
            this.selectionRing.setPosition(selected.x, selected.y);
        } else {
            this.selectionRing.setVisible(false);
        }
    }

    syncDebugLabels() {
        for (const label of this.debugLabels) {
            label.destroy();
        }
        this.debugLabels.length = 0;

        if (!runtime.world.debug) {
            return;
        }

        for (const agent of runtime.world.agents) {
            const text = this.add.text(
                agent.x + 16,
                agent.y + 12,
                `${agent.currentAction?.type ?? "idle"}\nE:${Math.round(agent.needs.energy)} H:${Math.round(agent.needs.hunger)}`,
                {
                    fontSize: "10px",
                    color: "#f0f7f9",
                    backgroundColor: "rgba(10,18,22,0.45)",
                    padding: { x: 4, y: 2 },
                }
            );
            text.setDepth(10);
            this.debugLabels.push(text);
        }
    }
}
