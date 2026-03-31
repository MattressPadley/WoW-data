const args = process.argv.slice(2);

export function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

export function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

export function requireArg(flag: string, name: string): string {
  const val = getArg(flag);
  if (!val) {
    console.error(JSON.stringify({ error: `${name} is required (${flag})` }));
    process.exit(1);
  }
  return val;
}

export function output(data: unknown, pretty: boolean): void {
  if (pretty) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}

export function parseGold(copper: number): { gold: number; silver: number; copper: number } {
  return {
    gold: Math.floor(copper / 10000),
    silver: Math.floor((copper % 10000) / 100),
    copper: copper % 100,
  };
}
