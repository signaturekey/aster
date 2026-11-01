export class DecisionGuard {
  private pending: symbol | null = null;
  private readonly confirmed = new Set<string>();

  begin(personId: string): symbol | null {
    if (this.pending || this.confirmed.has(personId)) return null;
    const token = Symbol(personId);
    this.pending = token;
    return token;
  }

  settle(token: symbol, personId: string, succeeded: boolean): boolean {
    if (this.pending !== token) return false;
    if (succeeded) this.confirmed.add(personId);
    this.pending = null;
    return true;
  }
}
