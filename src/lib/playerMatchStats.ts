import { getPositionLine, type Player } from "../types/index.ts";

export type RealMatchStatTier = "HIGH" | "MID" | "LOW";

export interface RealMatchStatRow {
  label: string;
  valueText: string;
  percent: number;
  tier: RealMatchStatTier;
}

/**
 * Return true when the player carries real match performance stats from API-Football
 * (`players[].players[].statistics[0]`) such as passes, pass accuracy, shots, tackles, duels, or saves.
 */
export function hasRealPlayerMatchStats(
  player?: Pick<Player, "stats"> | null
): boolean {
  const s = player?.stats;
  if (!s) return false;
  return (
    s.passesTotal !== undefined ||
    s.passAccuracy !== undefined ||
    s.shotsTotal !== undefined ||
    s.tackles !== undefined ||
    s.interceptions !== undefined ||
    s.blocks !== undefined ||
    s.dribblesAttempted !== undefined ||
    s.duelsTotal !== undefined ||
    s.saves !== undefined ||
    s.minutesPlayed !== undefined
  );
}

/**
 * Build real API-backed performance gauge rows without any seeded/fabricated noise.
 * Only metrics actually delivered by API-Football (`passes`, `shots`, `goals`, `tackles`,
 * `dribbles`, `duels`, `saves`, `minutes`) are included.
 */
export function buildRealMatchStatRows(
  player: Pick<Player, "position" | "stats">
): RealMatchStatRow[] {
  const s = player.stats;
  if (!s || !hasRealPlayerMatchStats(player)) return [];

  const pos = getPositionLine(player.position);
  const rows: RealMatchStatRow[] = [];

  const pushPassRow = () => {
    if (s.passesTotal === undefined && s.passAccuracy === undefined) return;
    const total = s.passesTotal;
    const acc = s.passAccuracy;
    const completed =
      total !== undefined && acc !== undefined
        ? Math.round((total * acc) / 100)
        : undefined;
    const valueText =
      completed !== undefined && total !== undefined && acc !== undefined
        ? `${completed}/${total} (${acc}%)`
        : total !== undefined
        ? `${total}회`
        : `${acc}%`;
    const pct = acc ?? Math.min(100, (total ?? 0) * 2);
    rows.push({
      label: "패스 (성공/시도 · 정확도)",
      valueText,
      percent: pct,
      tier: pct >= 80 ? "HIGH" : pct >= 60 ? "MID" : "LOW",
    });
  };

  const pushKeyPassRow = () => {
    if (s.keyPasses === undefined && s.passesTotal === undefined) return;
    const kp = s.keyPasses ?? 0;
    rows.push({
      label: "키패스",
      valueText: `${kp}회`,
      percent: kp > 0 ? Math.min(96, 35 + kp * 18) : 8,
      tier: kp >= 2 ? "HIGH" : kp >= 1 ? "MID" : "LOW",
    });
  };

  const pushShotsRow = () => {
    if (s.shotsTotal === undefined && s.shotsOnTarget === undefined) return;
    const total = s.shotsTotal ?? s.shotsOnTarget ?? 0;
    const on = Math.min(total, s.shotsOnTarget ?? 0);
    const pct = total > 0 ? Math.round((on / total) * 100) : 0;
    rows.push({
      label: "유효 슈팅 / 전체 슈팅",
      valueText: `${on}/${total}`,
      percent: total > 0 ? Math.max(12, pct) : 8,
      tier: on >= 2 ? "HIGH" : on >= 1 ? "MID" : "LOW",
    });
  };

  const pushGoalsAssistsRow = () => {
    const g = s.goals ?? 0;
    const a = s.assists ?? 0;
    rows.push({
      label: "득점 / 도움",
      valueText: `${g}골 · ${a}도움`,
      percent: g + a > 0 ? Math.min(98, 60 + (g + a) * 18) : 10,
      tier: g + a > 0 ? "HIGH" : "LOW",
    });
  };

  const pushDribblesRow = () => {
    if (s.dribblesAttempted === undefined && s.dribblesSuccess === undefined) return;
    const att = s.dribblesAttempted ?? s.dribblesSuccess ?? 0;
    const suc = Math.min(att, s.dribblesSuccess ?? 0);
    const pct = att > 0 ? Math.round((suc / att) * 100) : 0;
    rows.push({
      label: "드리블 성공",
      valueText: att > 0 ? `${suc}/${att} (${pct}%)` : "0/0",
      percent: att > 0 ? Math.max(12, pct) : 8,
      tier: pct >= 60 && suc > 0 ? "HIGH" : suc > 0 ? "MID" : "LOW",
    });
  };

  const pushDuelsRow = () => {
    if (s.duelsTotal === undefined && s.duelsWon === undefined) return;
    const total = s.duelsTotal ?? s.duelsWon ?? 0;
    const won = Math.min(total, s.duelsWon ?? 0);
    const pct = total > 0 ? Math.round((won / total) * 100) : 0;
    rows.push({
      label: "볼 경합 성공",
      valueText: total > 0 ? `${won}/${total} (${pct}%)` : "0/0",
      percent: total > 0 ? Math.max(12, pct) : 8,
      tier: pct >= 60 && won > 0 ? "HIGH" : pct >= 40 ? "MID" : "LOW",
    });
  };

  const pushDefensiveRow = () => {
    if (
      s.tackles === undefined &&
      s.interceptions === undefined &&
      s.blocks === undefined
    ) {
      return;
    }
    const tackles = s.tackles ?? 0;
    const interceptions = s.interceptions ?? 0;
    const blocks = s.blocks ?? 0;
    const sum = tackles + interceptions + blocks;
    rows.push({
      label: "태클 / 가로채기 / 블로킹",
      valueText: `${tackles} / ${interceptions} / ${blocks}`,
      percent: sum > 0 ? Math.min(95, 30 + sum * 12) : 8,
      tier: sum >= 4 ? "HIGH" : sum >= 2 ? "MID" : "LOW",
    });
  };

  const pushSavesRow = () => {
    if (s.saves === undefined) return;
    const saves = s.saves;
    rows.push({
      label: "선방 (세이브)",
      valueText: `${saves}회`,
      percent: saves > 0 ? Math.min(96, 40 + saves * 14) : 12,
      tier: saves >= 3 ? "HIGH" : saves >= 1 ? "MID" : "LOW",
    });
  };

  const pushMinutesRow = () => {
    if (s.minutesPlayed === undefined) return;
    const mins = s.minutesPlayed;
    rows.push({
      label: "출전 시간",
      valueText: `${mins}분`,
      percent: Math.min(100, Math.round((mins / 90) * 100)),
      tier: mins >= 70 ? "HIGH" : mins >= 30 ? "MID" : "LOW",
    });
  };

  if (pos === "GK") {
    pushSavesRow();
    pushPassRow();
    pushDuelsRow();
    pushMinutesRow();
  } else if (pos === "DF") {
    pushPassRow();
    pushDefensiveRow();
    pushDuelsRow();
    pushKeyPassRow();
    pushGoalsAssistsRow();
    pushMinutesRow();
  } else if (pos === "MF") {
    pushPassRow();
    pushKeyPassRow();
    pushGoalsAssistsRow();
    pushShotsRow();
    pushDribblesRow();
    pushDefensiveRow();
    pushDuelsRow();
  } else {
    pushGoalsAssistsRow();
    pushShotsRow();
    pushPassRow();
    pushKeyPassRow();
    pushDribblesRow();
    pushDuelsRow();
    pushMinutesRow();
  }

  return rows;
}
