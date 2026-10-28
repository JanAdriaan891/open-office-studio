/** Contrastverhouding volgens WCAG 2.x, met alfa gemengd op de achtergrond. */
type Rgba = [number, number, number, number];

export function leesKleur(kleur: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(kleur.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(kleur.trim());
  if (!rgba) throw new Error(`Onbekende kleur: ${kleur}`);
  const [r, g, b, a = 1] = rgba[1].split(",").map((deel) => Number(deel.trim()));
  return [r, g, b, a];
}

function meng(voor: Rgba, achter: Rgba): Rgba {
  const a = voor[3];
  return [0, 1, 2].map((i) => voor[i] * a + achter[i] * (1 - a)).concat(1) as Rgba;
}

function luminantie([r, g, b]: Rgba) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(voorgrond: string, achtergrond: string) {
  const achter = leesKleur(achtergrond);
  const voor = meng(leesKleur(voorgrond), achter);
  const [l1, l2] = [luminantie(voor), luminantie(achter)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
