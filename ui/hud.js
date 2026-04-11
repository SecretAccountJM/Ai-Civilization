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

        // Sidebar panels
        this.summaryBandElement   = document.getElementById("summary-band");
        this.summaryElement       = document.getElementById("village-summary");
        this.selectedElement      = document.getElementById("selected-entity");
        this.worldStatusElement   = document.getElementById("world-status");

        // HUD overlays
        this.activeToolElement    = document.getElementById("active-tool-label");
        this.sandboxRuleCopyElement = document.getElementById("sandbox-rule-copy");
        this.phaseBadgeElement    = document.getElementById("phase-badge");
        this.hudDayElement        = document.getElementById("hud-day");
        this.hudTimeElement       = document.getElementById("hud-time");

        // Mini-stat elements
        this.msPop      = document.getElementById("ms-pop-val");
        this.msFood     = document.getElementById("ms-food-val");
        this.msWood     = document.getElementById("ms-wood-val");
        this.msStone    = document.getElementById("ms-stone-val");
        this.msStab     = document.getElementById("ms-stab-val");
        this.msNeeds    = document.getElementById("ms-needs-val");
        this.msNeedsEl  = document.getElementById("ms-needs");
        this.msStabEl   = document.getElementById("ms-stability");

        // Feed
        this.feed = new SocialFeed(document.getElementById("social-feed"));

        // Controls
        this.pauseButton      = document.getElementById("pause-btn");
        this.debugButton      = document.getElementById("debug-btn");
        this.speedButtons     = [...document.querySelectorAll(".speed-btn")];
        this.toolButtons      = [...document.querySelectorAll(".tool-btn")];
        this.spawnAgentButton = document.getElementById("spawn-agent-btn");
        this.spawnWoodButton  = document.getElementById("spawn-wood-btn");
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
            this.pauseButton.textContent = this.world.paused ? "▶ Resume" : "⏸ Pause";
        });

        this.debugButton.addEventListener("click", () => {
            this.world.debug = !this.world.debug;
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

        // Flash event log tab if not active
        const feedTab = document.querySelector('[data-tab="feed"]');
        if (feedTab && !feedTab.classList.contains('active') && events.length > 0) {
            feedTab.style.color = 'var(--accent-strong)';
            clearTimeout(this._feedFlash);
            this._feedFlash = setTimeout(() => {
                feedTab.style.color = '';
            }, 800);
        }
    }

    renderToolState() {
        for (const button of this.toolButtons) {
            button.classList.toggle("active", button.dataset.tool === this.world.activeTool);
        }

        const labels = {
            inspect: "Inspect",
            settler: "Place Settler",
            wood:    "Plant Wood",
            berries: "Plant Berries",
        };

        const rules = {
            inspect: "Click any settler, building, or resource node to inspect it.",
            settler: "Click on the map to place a new settler near that location.",
            wood:    "Click on the map to plant a wood resource node.",
            berries: "Click on the map to plant a berry resource node.",
        };

        if (this.activeToolElement) {
            this.activeToolElement.textContent = labels[this.world.activeTool] ?? "Inspect";
        }
        if (this.sandboxRuleCopyElement) {
            this.sandboxRuleCopyElement.textContent = rules[this.world.activeTool] ?? rules.inspect;
        }
    }

    renderSelected(selected) {
        if (!selected) {
            this.selectedElement.innerHTML = `<p class="empty-copy">Click a settler, building, or resource node on the map.</p>`;
            return;
        }

        // Auto-switch sidebar to inspector tab when something is selected
        if (typeof window._switchToInspector === 'function') {
            window._switchToInspector();
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
                .map(([k, v]) => `${k}:${Math.round(v)}`)
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

        // Resource node
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
        const isEstablished = snapshot.buildings.shelter > 0;

        // ── HUD Overlays ──
        if (this.phaseBadgeElement) {
            this.phaseBadgeElement.textContent = isEstablished ? "Established" : "Founding";
        }
        if (this.hudDayElement) {
            this.hudDayElement.textContent = `Day ${snapshot.day}`;
        }
        if (this.hudTimeElement) {
            this.hudTimeElement.textContent = snapshot.timeLabel ?? "";
        }

        // ── Mini-stats strip ──
        if (this.msPop)   this.msPop.textContent   = snapshot.population;
        if (this.msFood)  this.msFood.textContent  = snapshot.metrics.totalFoodToday;
        if (this.msWood)  this.msWood.textContent  = snapshot.resources.wood;
        if (this.msStone) this.msStone.textContent = snapshot.resources.stone;

        if (this.msStab) {
            const stab = snapshot.metrics.averageStability;
            this.msStab.textContent = `${stab}%`;
            this.msStabEl?.classList.toggle("warn", stab < 60 && stab >= 40);
            this.msStabEl?.classList.toggle("danger", stab < 40);
        }

        if (this.msNeeds) {
            const needs = snapshot.metrics.unmetNeeds;
            this.msNeeds.textContent = needs;
            this.msNeedsEl?.classList.toggle("danger", needs > 0);
        }

        // ── Summary Band ──
        if (this.summaryBandElement) {
            this.summaryBandElement.innerHTML = [
                `<div class="summary-card">
                    <strong>Phase</strong>
                    <span>${isEstablished ? "Established" : "Founding"}</span>
                    <small>${snapshot.population} settlers</small>
                </div>`,
                `<div class="summary-card">
                    <strong>Pressure</strong>
                    <span>${snapshot.metrics.unmetNeeds > 0 ? "Survival" : "Expansion"}</span>
                    <small>${snapshot.metrics.unmetNeeds > 0 ? `${snapshot.metrics.unmetNeeds} need help` : "Stable & growing"}</small>
                </div>`,
            ].join("");
        }

        // ── Stat Grid (3-column in sidebar) ──
        if (this.summaryElement) {
            this.summaryElement.innerHTML = [
                card("Day",      `${snapshot.day}`),
                card("Pop",      snapshot.population, "good"),
                card("Food",     snapshot.metrics.totalFoodToday),
                card("Stable",   `${snapshot.metrics.averageStability}%`, snapshot.metrics.averageStability < 60 ? "warn" : ""),
                card("Idle",     snapshot.metrics.idleAgents,  snapshot.metrics.idleAgents > 1 ? "warn" : ""),
                card("Needs",    snapshot.metrics.unmetNeeds,  snapshot.metrics.unmetNeeds > 0 ? "danger" : ""),
                card("Wood",     snapshot.resources.wood),
                card("Stone",    snapshot.resources.stone),
                card("Berries",  snapshot.resources.berries),
                card("Shelters", snapshot.buildings.shelter),
                card("Beds",     snapshot.buildings.bed),
                card("Farms",    snapshot.buildings.farm),
            ].join("");
        }

        // ── World Status ──
        if (this.worldStatusElement) {
            this.worldStatusElement.innerHTML = [
                detailRow("Simulation", this.world.paused ? "⏸ Paused" : `▶ Running x${this.world.speed}`),
                detailRow("Tool",       this.activeToolElement?.textContent || "Inspect"),
                detailRow("Speed",      `x${this.world.speed}`),
            ].join("");
        }

        this.renderSelected(snapshot.selected);
        this.renderToolState();
    }
}
