export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
    return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

export function moveToward(position, target, speed, dt) {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist <= speed * dt) {
        position.x = target.x;
        position.y = target.y;
        return true;
    }

    position.x += (dx / dist) * speed * dt;
    position.y += (dy / dist) * speed * dt;
    return false;
}

export function inventoryAmount(inventory, type) {
    return inventory[type] ?? 0;
}

export function addInventory(inventory, type, amount) {
    inventory[type] = (inventory[type] ?? 0) + amount;
}

export function removeInventory(inventory, type, amount) {
    const current = inventory[type] ?? 0;
    const next = Math.max(0, current - amount);
    inventory[type] = next;
    return current - next;
}

export function hasInventory(inventory, cost) {
    return Object.entries(cost).every(([type, amount]) => inventoryAmount(inventory, type) >= amount);
}

export function inventoryShortfall(inventory, cost) {
    const shortfall = {};
    for (const [type, amount] of Object.entries(cost)) {
        const missing = amount - inventoryAmount(inventory, type);
        if (missing > 0) {
            shortfall[type] = missing;
        }
    }
    return shortfall;
}
