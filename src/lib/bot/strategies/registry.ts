import type { StrategyDefinition, StrategyFactory, Strategy } from "./types";

class StrategyRegistry {
  private strategies = new Map<string, StrategyDefinition>();

  register(definition: StrategyDefinition): void {
    if (this.strategies.has(definition.id)) {
      throw new Error(`Strategy "${definition.id}" is already registered`);
    }
    this.strategies.set(definition.id, definition);
  }

  get(id: string): StrategyDefinition | undefined {
    return this.strategies.get(id);
  }

  getFactory(id: string): StrategyFactory | undefined {
    return this.strategies.get(id)?.factory;
  }

  create(id: string, config: Record<string, unknown>): Strategy {
    const def = this.strategies.get(id);
    if (!def) {
      throw new Error(`Unknown strategy: "${id}"`);
    }
    return def.factory(config);
  }

  list(): StrategyDefinition[] {
    return [...this.strategies.values()];
  }

  has(id: string): boolean {
    return this.strategies.has(id);
  }
}

export const strategyRegistry = new StrategyRegistry();
