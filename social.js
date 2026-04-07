const EVENT_STYLES = {
    agent_starving: "danger",
    agent_exhausted: "warning",
    agent_built: "accent",
    agent_started_job: "accent",
    agent_paid: "accent",
    agent_ate: "warning",
    agent_rested: "warning",
    sandbox_placed: "accent",
    sandbox_blocked: "danger",
};

const EVENT_TEXT = {
    agent_built: (event) => `${event.agentName} finished a ${event.buildingType}.`,
    agent_started_job: (event) => `${event.agentName} started work on ${event.ownerName}'s farm.`,
    agent_paid: (event) => `${event.agentName} earned ${event.amount} credits from farm work.`,
    agent_fed_from_job: (event) => `${event.agentName} took a berry stipend after a farm shift.`,
    agent_claimed_site: (event) => `${event.agentName} marked out a ${event.buildingType} build site.`,
    agent_ate: (event) => `${event.agentName} stopped to eat and recover.`,
    agent_rested: (event) => `${event.agentName} is resting ${event.restType === "bed" ? "in a bed" : "on the ground"}.`,
    agent_starving: (event) => `${event.agentName} is close to starving.`,
    agent_exhausted: (event) => `${event.agentName} is about to collapse from exhaustion.`,
    agent_reserved_job: (event) => `${event.agentName} reserved a public farm job.`,
    agent_gathered: (event) => `${event.agentName} gathered ${event.resourceType}.`,
    sandbox_placed: (event) => event.message,
    sandbox_blocked: (event) => event.message,
};

export class SocialFeed {
    constructor(container, options = {}) {
        this.container = container;
        this.limit = options.limit ?? 40;
    }

    consume(events) {
        for (const event of events) {
            this.addItem(event);
        }
    }

    addItem(event) {
        const card = document.createElement("div");
        card.className = "feed-item";
        card.dataset.tone = EVENT_STYLES[event.type] ?? "accent";

        const title = document.createElement("strong");
        title.textContent = event.agentName ? `@${event.agentName}` : "Village";

        const body = document.createElement("div");
        body.textContent = this.formatEvent(event);

        const time = document.createElement("span");
        time.textContent = `Day ${event.day} • ${event.timeLabel}`;

        card.append(title, body, time);
        this.container.prepend(card);

        while (this.container.children.length > this.limit) {
            this.container.lastElementChild.remove();
        }
    }

    formatEvent(event) {
        const formatter = EVENT_TEXT[event.type];
        if (formatter) {
            return formatter(event);
        }
        return event.message ?? "The village shifts slightly.";
    }
}
