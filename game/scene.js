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
        this.selectionMarker = null;
        this.hoverMarker = null;
        this.dragState = null;
    }

    preload() {
        this.load.image("grass-bg", "asset/grass_bg.jpg");
        this.load.image("house-1", "asset/house_1.png");
        this.load.image("house-2", "asset/house_2.png");
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
        this.selectionMarker = this.add.graphics().setDepth(30);
        this.hoverMarker = this.add.graphics().setDepth(29);

        this.cameras.main.setBounds(0, 0, runtime.world.width, runtime.world.height);
        this.cameras.main.setZoom(1);
        this.cameras.main.centerOn(midX, midY);

        this.dragState = {
            origin: null,
            cameraX: 0,
            cameraY: 0,
            dragging: false,
        };

        this.input.mouse?.disableContextMenu();

        this.input.on("pointerdown", (pointer) => {
            this.dragState.origin = { x: pointer.x, y: pointer.y };
            this.dragState.cameraX = this.cameras.main.scrollX;
            this.dragState.cameraY = this.cameras.main.scrollY;
            this.dragState.dragging = false;
        });

        this.input.on("pointermove", (pointer) => {
            this.updateHoverMarker(pointer);
            if (!pointer.isDown || !this.dragState.origin) {
                return;
            }
            const dx = pointer.x - this.dragState.origin.x;
            const dy = pointer.y - this.dragState.origin.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                this.dragState.dragging = true;
            }
            if (this.dragState.dragging) {
                const zoom = this.cameras.main.zoom;
                this.cameras.main.setScroll(
                    this.dragState.cameraX - dx / zoom,
                    this.dragState.cameraY - dy / zoom
                );
            }
        });

        this.input.on("pointerup", (pointer) => {
            if (!this.dragState.dragging) {
                this.handleWorldTap(pointer);
            }
            this.dragState.origin = null;
            this.dragState.dragging = false;
        });

        this.input.on("wheel", (pointer, _gameObjects, _dx, dy) => {
            const cam = this.cameras.main;
            const worldPoint = cam.getWorldPoint(pointer.x, pointer.y);
            const zoom = Phaser.Math.Clamp(cam.zoom + (dy > 0 ? -0.1 : 0.1), 0.35, 2.5);
            cam.zoomTo(zoom, 80);
            cam.centerOn(worldPoint.x, worldPoint.y);
        });

        runtime.ui.scene = this;
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

    handleWorldTap(pointer) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const tool = runtime.world.activeTool;

        if (tool === "settler") {
            runtime.world.spawnAgentAt(worldPoint.x, worldPoint.y);
        } else if (tool === "wood") {
            runtime.world.createResourceAt("wood", worldPoint.x, worldPoint.y, 10);
        } else if (tool === "berries") {
            runtime.world.createResourceAt("berries", worldPoint.x, worldPoint.y, 6);
        } else if (tool === "inspect") {
            const selected = runtime.world.getInspectableAt(worldPoint.x, worldPoint.y);
            runtime.world.selectEntity(selected?.type ?? null, selected?.entity?.id ?? null);
        }

        runtime.ui.render();
    }

    updateHoverMarker(pointer) {
        const tool = runtime.world.activeTool;
        this.hoverMarker.clear();
        if (!pointer) {
            return;
        }
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        if (tool === "inspect") {
            const selected = runtime.world.getInspectableAt(worldPoint.x, worldPoint.y);
            if (!selected) {
                return;
            }
            this.drawSelectionShape(this.hoverMarker, selected.type, selected.entity, 0x9fd2ff, 0.7);
            return;
        }

        const color = tool === "settler" ? 0xf3f6f8 : tool === "wood" ? 0xb57c42 : 0xd75d8f;
        this.hoverMarker.lineStyle(2, color, 0.8);
        this.hoverMarker.strokeCircle(worldPoint.x, worldPoint.y, tool === "settler" ? 18 : 16);
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
        this.syncSelectionMarker();
    }

    syncResources() {
        const liveIds = new Set();
        for (const resource of runtime.world.resources) {
            liveIds.add(resource.id);
            let view = this.resourceViews.get(resource.id);
            if (!view) {
                view = this.createResourceView(resource);
                this.resourceViews.set(resource.id, view);
            }
            this.updateResourceView(view, resource);
        }
        for (const [id, view] of this.resourceViews.entries()) {
            if (!liveIds.has(id)) {
                view.container.destroy();
                this.resourceViews.delete(id);
            }
        }
    }

    createResourceView(resource) {
        const g = this.add.graphics();
        if (resource.type === "wood") {
            g.fillStyle(0x6b3f1f, 1);
            g.fillEllipse(0, 8, 10, 14);
            g.fillStyle(0x1a2e12, 0.35);
            g.fillEllipse(2, -4, 28, 18);
            g.fillStyle(0x2d5a1b, 1);
            g.fillCircle(-6, -8, 12);
            g.fillCircle(6, -8, 12);
            g.fillStyle(0x3d7a26, 1);
            g.fillCircle(0, -12, 13);
            g.fillStyle(0x5aaa38, 0.5);
            g.fillCircle(-3, -15, 6);
        } else if (resource.type === "berries") {
            g.fillStyle(0x2a5e1e, 1);
            g.fillEllipse(0, 4, 30, 18);
            g.fillStyle(0x3d7a26, 1);
            g.fillCircle(-8, -2, 9);
            g.fillCircle(8, -2, 9);
            g.fillCircle(0, -6, 10);
            const berryColor = 0xe0437a;
            const spots = [[-6, -4], [6, -5], [0, -9], [-10, 2], [10, 2], [1, 3]];
            for (const [bx, by] of spots) {
                g.fillStyle(berryColor, 1);
                g.fillCircle(bx, by, 3.5);
                g.fillStyle(0xffa0c0, 0.6);
                g.fillCircle(bx - 1, by - 1, 1.5);
            }
        } else {
            g.fillStyle(0x5a6870, 1);
            g.fillEllipse(0, 4, 24, 14);
            g.fillStyle(0x7f8c96, 1);
            g.fillEllipse(-4, -2, 18, 14);
            g.fillStyle(0x9dadb8, 0.5);
            g.fillEllipse(-6, -4, 10, 8);
        }
        g.setDepth(1);
        return { container: g, gfx: g };
    }

    updateResourceView(view, resource) {
        const alpha = Math.max(0.25, resource.amount / resource.maxAmount);
        view.gfx.setPosition(resource.x, resource.y);
        view.gfx.setAlpha(alpha);
        view.gfx.setScale(resource.type === "berries" ? 0.9 : 1.0);
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
                    view.shadow?.destroy();
                    view.base?.destroy();
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
                view.shadow?.destroy();
                view.base?.destroy();
                this.buildingViews.delete(id);
            }
        }
    }

    createBuildingShape() {
        const g = this.add.graphics();
        return { kind: "shape", node: g };
    }

    createBuildingSprite(building) {
        const shadow = this.add.rectangle(
            building.x, building.y + 10,
            building.footprint.w * 56 + 8,
            building.footprint.h * 14,
            0x000000, 0.28
        );
        shadow.setDepth(1);
        const base = this.add.rectangle(
            building.x, building.y + 4,
            building.footprint.w * 56,
            building.footprint.h * 56,
            0x2a4020, 1
        );
        base.setDepth(2);
        const node = this.add.image(building.x, building.y, building.appearance);
        node.setDepth(3);
        return { kind: "sprite", node, shadow, base };
    }

    updateBuildingView(view, building) {
        const fw = building.footprint.w * 56;
        const fh = building.footprint.h * 56;
        if (view.kind === "sprite") {
            view.shadow.setPosition(building.x, building.y + fh * 0.28);
            view.shadow.setSize(fw + 8, fh * 0.2);
            view.base.setPosition(building.x, building.y);
            view.base.setSize(fw, fh);
            view.node.setPosition(building.x, building.y);
            view.node.setDisplaySize(fw, fh);
            view.node.setAlpha(0.97);
        } else {
            const g = view.node;
            g.clear();
            const hw = building.footprint.w * 34;
            const hh = building.footprint.h * 34;
            if (building.constructed) {
                if (building.type === "bed") {
                    g.fillStyle(0x8a7050, 0.9);
                    g.fillRoundedRect(-hw / 2, -hh / 2, hw, hh, 5);
                    g.lineStyle(1.5, 0xd4b896, 0.7);
                    g.strokeRoundedRect(-hw / 2, -hh / 2, hw, hh, 5);
                    g.fillStyle(0xe8dcc8, 0.7);
                    g.fillRoundedRect(-hw / 2 + 3, -hh / 2 + 4, hw - 6, hh * 0.55, 3);
                } else if (building.type === "farm") {
                    g.fillStyle(0x5c3d1e, 0.9);
                    g.fillRoundedRect(-hw / 2, -hh / 2, hw, hh, 4);
                    const rows = 4;
                    for (let r = 0; r < rows; r++) {
                        const ry = -hh / 2 + 6 + r * (hh / rows);
                        g.fillStyle(0x3d7a26, 0.7);
                        g.fillRoundedRect(-hw / 2 + 4, ry, hw - 8, hh / rows - 6, 2);
                    }
                    g.lineStyle(1, 0x8bc34a, 0.5);
                    g.strokeRoundedRect(-hw / 2, -hh / 2, hw, hh, 4);
                }
            } else {
                const prog = building.progress / (building.type === "shelter" ? 8 : building.type === "farm" ? 9 : 5);
                g.lineStyle(2, 0xffd700, 0.6);
                g.strokeRect(-hw / 2, -hh / 2, hw, hh);
                g.fillStyle(0xffd700, 0.12);
                g.fillRect(-hw / 2, -hh / 2, hw, hh * prog);
                const corners = [[-hw / 2, -hh / 2], [hw / 2, -hh / 2], [-hw / 2, hh / 2], [hw / 2, hh / 2]];
                for (const [cx, cy] of corners) {
                    g.fillStyle(0xffd700, 0.8);
                    g.fillRect(cx - 3, cy - 3, 6, 6);
                }
            }
            g.setPosition(building.x, building.y);
            g.setAlpha(1);
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

    syncSelectionMarker() {
        this.selectionMarker.clear();
        const selected = runtime.world.getSelectedEntity();
        if (!selected) {
            return;
        }
        this.drawSelectionShape(this.selectionMarker, selected.type, selected.entity, 0xfff1a6, 1);
    }

    drawSelectionShape(graphics, type, entity, color, alpha) {
        graphics.lineStyle(3, color, alpha);
        if (type === "agent") {
            graphics.strokeCircle(entity.x, entity.y, 20);
            return;
        }
        if (type === "building") {
            const width = entity.footprint.w * 40;
            const height = entity.footprint.h * 40;
            graphics.strokeRoundedRect(entity.x - width / 2, entity.y - height / 2, width, height, 10);
            return;
        }
        graphics.strokeCircle(entity.x, entity.y, 18);
    }
}
