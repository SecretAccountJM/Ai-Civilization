import { SocialFeed } from "../social.js";

function card(label, value, tone = "") {
    return `<div class="stat-card ${tone}"><strong>${label}</strong><span>${value}</span></div>`;
}

function detailRow(label, value) {
    return `<div><strong>${label}</strong><span>${value}</span></div>`;
}

export class SimulationUI {
    constructor(world) {
        this.world = world;
        this.scene = null;
        this.summaryElement = document.getElementById("village-summary");
        this.selectedElement = document.getElementById("selected-entity");
        this.worldStatusElement = document.getElementById("world-status");
        this.activeToolElement = document.getElementById("active-tool-label");
        this.feed = new SocialFeed(document.getElementById("social-feed"));
        this.pauseButton = document.getElementById("pause-btn");
        this.debugButton = document.getElementById("debug-btn");
        this.speedButtons = [...document.querySelectorAll(".speed-btn")];
        this.toolButtons = [...document.querySelectorAll(".tool-btn")];
        this.spawnAgentButton = document.getElementById("spawn-agent-btn");
        this.spawnWoodButton = document.getElementById("spawn-wood-btn");
        this.spawnBerriesButton = document.getElementById("spawn-berries-btn");
        this.bindControls();
        this.render();
    }

    getCameraCenter() {
        const cam = this.scene?.cameras?.main;
        if (!cam) {
            return { x: this.world.width / 2, y: this.world.height / 2 };
        }
        return {
            x: cam.scrollX + cam.width / (2 * cam.zoom),
            y: cam.scrollY + cam.height / (2 * cam.zoom),
        };
    }

    bindControls() {
        this.pauseButton.addEventListener("click", () => {
            this.world.paused = !this.world.paused;
            this.pauseButton.textContent = this.world.paused ? "Resume" : "Pause";
        });

        this.debugButton.addEventListener("click", () => {
            this.world.debug = !this.world.debug;
            this.debugButton.textContent = this.world.debug ? "Hide Debug" : "Show Debug";
            this.debugButton.classList.toggle("active", this.world.debug);
        });

        for (const button of this.speedButtons) {
            button.addEventListener("click", () => {
                this.world.speed = Number(button.dataset.speed);
                for (const candidate of this.speedButtons) {
                    candidate.classList.toggle("active", candidate === button);
                }
            });
        }

        for (const button of this.toolButtons) {
            button.addEventListener("click", () => {
                this.world.setActiveTool(button.dataset.tool);
                this.renderToolState();
            });
        }

        this.spawnAgentButton.addEventListener("click", () => {
            const { x, y } = this.getCameraCenter();
            this.world.spawnAgentAt(x, y);
            this.render();
        });

        this.spawnWoodButton.addEventListener("click", () => {
            const { x, y } = this.getCameraCenter();
            this.world.createResourceAt("wood", x, y, 10);
            this.render();
        });

        this.spawnBerriesButton.addEventListener("click", () => {
            const { x, y } = this.getCameraCenter();
            this.world.createResourceAt("berries", x, y, 6);
            this.render();
        });
    }

    consumeEvents(events) {
        this.feed.consume(events);
    }

    renderToolState() {
        for (const button of this.toolButtons) {
            button.classList.toggle("active", button.dataset.tool === this.world.activeTool);
        }
        const labels = {
            inspect: "Inspect",
            settler: "Place Settler",
            wood: "Plant Wood",
            berries: "Plant Berries",
        };
        this.activeToolElement.textContent = labels[this.world.activeTool] ?? "Inspect";
    }

    renderSelected(selected) {
        if (!selected) {
            this.selectedElement.innerHTML = "<p class=\"empty-copy\">Select a settler, building, or resource node.</p>";
            return;
        }

        if (selected.type === "agent") {
            this.selectedElement.innerHTML = `
                <div class="inspector-header">
                    <h3>${selected.name}</h3>
                    <span class="badge">Settler</span>
                </div>
                <div class="detail-list">
                    ${detailRow("Priority", selected.priorityTier)}
                    ${detailRow("Goal", selected.goal)}
                    ${detailRow("Action", selected.action)}
                    ${detailRow("Energy", Math.round(selected.energy))}
                    ${detailRow("Hunger", Math.round(selected.hunger))}
                    ${detailRow("Money", selected.money)}
                    ${detailRow("Inventory", `W:${Math.round(selected.inventory.wood)} S:${Math.round(selected.inventory.stone)} B:${Math.round(selected.inventory.berries)}`)}
                    ${detailRow("Employer", selected.employer)}
                    ${detailRow("Home", selected.home)}
                    ${detailRow("Bed", selected.bed)}
                    ${detailRow("Farm", selected.farm)}
                    ${detailRow("Traits", `B:${selected.traits.builder} F:${selected.traits.farmer} H:${selected.traits.hoarder}`)}
                </div>
            `;
            return;
        }

        if (selected.type === "building") {
            const storage = Object.entries(selected.storage ?? {})
                .map(([key, value]) => `${key}:${Math.round(value)}`)
                .join(" ") || "None";
            this.selectedElement.innerHTML = `
                <div class="inspector-header">
                    <h3>${selected.label}</h3>
                    <span class="badge">Building</span>
                </div>
                <div class="detail-list">
                    ${detailRow("Owner", selected.owner)}
                    ${detailRow("Status", selected.status)}
                    ${detailRow("Progress", `${selected.progress}%`)}
                    ${detailRow("Storage", storage)}
                </div>
            `;
            return;
        }

        this.selectedElement.innerHTML = `
            <div class="inspector-header">
                <h3>${selected.label}</h3>
                <span class="badge">Resource</span>
            </div>
            <div class="detail-list">
                ${detailRow("Amount", `${selected.amount} / ${selected.maxAmount}`)}
                ${detailRow("Reserved", selected.reservedBy)}
            </div>
        `;
    }

    render() {
        const snapshot = this.world.getVillageSnapshot();
        this.summaryElement.innerHTML = [
            card("Day", `${snapshot.day} • ${snapshot.timeLabel}`),
            card("Population", snapshot.population),
            card("Food", snapshot.metrics.totalFoodToday),
            card("Stability", `${snapshot.metrics.averageStability}%`, snapshot.metrics.averageStability < 60 ? "warn" : ""),
            card("Idle", snapshot.metrics.idleAgents, snapshot.metrics.idleAgents > 1 ? "soft" : ""),
            card("Needs", snapshot.metrics.unmetNeeds, snapshot.metrics.unmetNeeds > 0 ? "warn" : ""),
            card("Wood", snapshot.resources.wood),
            card("Stone", snapshot.resources.stone),
            card("Berries", snapshot.resources.berries),
            card("Shelters", snapshot.buildings.shelter),
            card("Beds", snapshot.buildings.bed),
            card("Farms", snapshot.buildings.farm),
        ].join("");

        this.worldStatusElement.innerHTML = `
            <div class="detail-list compact">
                ${detailRow("Simulation", this.world.paused ? "Paused" : `Running at x${this.world.speed}`)}
                ${detailRow("Sandbox Tool", this.activeToolElement.textContent || "Inspect")}
                ${detailRow("Interaction", "Tap to inspect or place. Drag to pan. Scroll to zoom.")}
            </div>
        `;

        this.renderSelected(snapshot.selected);
        this.renderToolState();
    }
}
