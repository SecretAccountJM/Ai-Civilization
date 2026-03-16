import { SocialFeed } from "../social.js";

function card(label, value) {
    return `<div class="stat-card"><strong>${label}</strong><span>${value}</span></div>`;
}

export class SimulationUI {
    constructor(world) {
        this.world = world;
        this.scene = null; // set by scene after create()
        this.summaryElement = document.getElementById("village-summary");
        this.selectedElement = document.getElementById("selected-agent");
        this.feed = new SocialFeed(document.getElementById("social-feed"));
        this.pauseButton = document.getElementById("pause-btn");
        this.debugButton = document.getElementById("debug-btn");
        this.speedButtons = [...document.querySelectorAll(".speed-btn")];
        this.spawnAgentButton = document.getElementById("spawn-agent-btn");
        this.spawnWoodButton = document.getElementById("spawn-wood-btn");
        this.spawnBerriesButton = document.getElementById("spawn-berries-btn");
        this.bindControls();
        this.render();
    }

    // Returns the world-space center of wherever the camera is looking
    getCameraCenter() {
        const cam = this.scene?.cameras?.main;
        if (!cam) {
            return { x: this.world.width / 2, y: this.world.height / 2 };
        }
        return {
            x: cam.scrollX + cam.width  / (2 * cam.zoom),
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

        this.spawnAgentButton.addEventListener("click", () => {
            const agent = this.world.spawnAgent();
            this.world.selectAgent(agent.id);
        });

        this.spawnWoodButton.addEventListener("click", () => {
            const { x, y } = this.getCameraCenter();
            this.world.spawnResourceNear("wood", x, y);
        });

        this.spawnBerriesButton.addEventListener("click", () => {
            const { x, y } = this.getCameraCenter();
            this.world.spawnResourceNear("berries", x, y);
        });
    }

    consumeEvents(events) {
        this.feed.consume(events);
    }

    render() {
        const snapshot = this.world.getDebugSnapshot();
        this.summaryElement.innerHTML = [
            card("Day", `${snapshot.day} • ${snapshot.timeLabel}`),
            card("Agents", snapshot.agentCount),
            card("Food", snapshot.metrics.totalFoodToday),
            card("Idle", snapshot.metrics.idleAgents),
            card("Needs", snapshot.metrics.unmetNeeds),
            card("Stability", `${snapshot.metrics.averageStability}%`),
            card("Beds", snapshot.buildings.bed),
            card("Farms", snapshot.buildings.farm),
        ].join("");

        if (!snapshot.selectedAgent) {
            this.selectedElement.innerHTML = "<p>No agent selected.</p>";
            return;
        }

        const agent = snapshot.selectedAgent;
        this.selectedElement.innerHTML = `
            <div class="detail-list">
                <div><strong>Name</strong><span>${agent.name}</span></div>
                <div><strong>Tier</strong><span>${agent.priorityTier}</span></div>
                <div><strong>Goal</strong><span>${agent.goal}</span></div>
                <div><strong>Action</strong><span>${agent.action}</span></div>
                <div><strong>Energy</strong><span>${Math.round(agent.energy)}</span></div>
                <div><strong>Hunger</strong><span>${Math.round(agent.hunger)}</span></div>
                <div><strong>Money</strong><span>${agent.money}</span></div>
                <div><strong>Inventory</strong><span>W:${Math.round(agent.inventory.wood)} S:${Math.round(agent.inventory.stone)} B:${Math.round(agent.inventory.berries)}</span></div>
                <div><strong>Employer</strong><span>${agent.employer}</span></div>
                <div><strong>Home</strong><span>${agent.home}</span></div>
                <div><strong>Bed</strong><span>${agent.bed}</span></div>
                <div><strong>Farm</strong><span>${agent.farm}</span></div>
                <div><strong>Traits</strong><span>B:${agent.traits.builder} F:${agent.traits.farmer} H:${agent.traits.hoarder}</span></div>
            </div>
        `;
    }
}
