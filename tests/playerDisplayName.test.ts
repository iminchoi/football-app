import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeIncomingPlayerNames,
  doesPlayerNameMatch,
  formatPlayerDisplayName,
  matchesPlayerSearchQuery,
  normalizePlayerNameKey,
  resolvePlayerDisplayName,
} from "../src/lib/playerDisplayName.ts";
import {
  doesIdentityMatchPlayer,
  findLineupEntryForPlayer,
} from "../src/lib/lineupStatus.ts";
import type { Match } from "../src/types/index.ts";

test("normalizePlayerNameKey folds diacritics and non-decomposing Latin characters cleanly", () => {
  assert.equal(normalizePlayerNameKey("Ødegaard"), "odegaard");
  assert.equal(normalizePlayerNameKey("Martin Ødegaard"), "martin odegaard");
  assert.equal(normalizePlayerNameKey("Dedić"), "dedic");
  assert.equal(normalizePlayerNameKey("Hornícek"), "hornicek");
  assert.equal(normalizePlayerNameKey("Fabian Schär"), "fabian schar");
  assert.equal(normalizePlayerNameKey("Bruno Guimarães"), "bruno guimaraes");
  assert.equal(normalizePlayerNameKey("Piero Hincapié"), "piero hincapie");
  assert.equal(normalizePlayerNameKey("Kenan Yıldız"), "kenan yildiz");
  assert.equal(normalizePlayerNameKey("İlkay Gündoğan"), "ilkay gundogan");
});

test("resolvePlayerDisplayName unifies mixed Korean/English players to canonical English across pitch, bench, and chart", () => {
  // Same player arriving as accented English surname (m-new-ars), English full name (API), or Korean store player
  const fromFixture = resolvePlayerDisplayName({
    id: "p-ars-odegaard",
    name: "Ødegaard",
    englishName: "Ødegaard",
  });
  const fromApi = resolvePlayerDisplayName({
    id: "api-p-3310",
    name: "Martin Odegaard",
    englishName: "Martin Odegaard",
  });
  const fromStore = resolvePlayerDisplayName({
    id: "p-odegaard",
    name: "마르틴 외데고르",
    englishName: "Martin Odegaard",
  });

  assert.equal(fromFixture.full, "Martin Ødegaard");
  assert.equal(fromApi.full, "Martin Ødegaard");
  assert.equal(fromStore.full, "Martin Ødegaard");

  assert.equal(fromFixture.pitch, "Ødegaard");
  assert.equal(fromApi.pitch, "Ødegaard");
  assert.equal(fromStore.pitch, "Ødegaard");

  assert.equal(fromFixture.hasDistinctEnglish, false);
  assert.equal(fromFixture.english, "Martin Ødegaard");

  // Legacy Korean dummy names unify cleanly to English display names
  assert.deepEqual(
    {
      full: formatPlayerDisplayName({ id: "p-ars-white", name: "벤 화이트" }, "full"),
      pitch: formatPlayerDisplayName({ id: "p-ars-white", name: "벤 화이트" }, "pitch"),
    },
    { full: "Ben White", pitch: "White" }
  );
  assert.deepEqual(
    {
      full: formatPlayerDisplayName({ id: "p-new-burn", name: "댄 번" }, "full"),
      pitch: formatPlayerDisplayName({ id: "p-new-burn", name: "댄 번" }, "pitch"),
    },
    { full: "Dan Burn", pitch: "Burn" }
  );
  assert.deepEqual(
    {
      full: formatPlayerDisplayName({ id: "p-ars-timber", name: "위리엔 팀버" }, "full"),
      pitch: formatPlayerDisplayName({ id: "p-ars-timber", name: "위리엔 팀버" }, "pitch"),
    },
    { full: "Jurriën Timber", pitch: "Timber" }
  );
  assert.equal(
    formatPlayerDisplayName({ id: "p-leao", name: "하파엘 레앙", englishName: "Rafael Leao" }, "full"),
    "Rafael Leão"
  );
  assert.equal(
    formatPlayerDisplayName({ id: "af-p-1", name: "알리송", englishName: "Alisson" }, "full"),
    "Alisson Becker"
  );
  // Unlisted dummy player with Korean name + English fallback renders in English
  assert.equal(
    formatPlayerDisplayName({ id: "p-custom-99", name: "테스트 선수", englishName: "Test Player" }, "full"),
    "Test Player"
  );
});

test("pitch labels use compact English surnames consistently for Asian and European players", () => {
  assert.equal(
    formatPlayerDisplayName({ id: "p-son", name: "손흥민", englishName: "Heung-Min Son" }, "full"),
    "Heung-Min Son"
  );
  assert.equal(
    formatPlayerDisplayName({ id: "p-son", name: "손흥민", englishName: "Heung-Min Son" }, "pitch"),
    "Son"
  );
  assert.equal(
    formatPlayerDisplayName({ id: "p-kim", name: "김민재", englishName: "Min-Jae Kim" }, "pitch"),
    "Kim"
  );
  assert.equal(
    formatPlayerDisplayName({ id: "p-mitoma", name: "미토마 카오루", englishName: "Kaoru Mitoma" }, "pitch"),
    "Mitoma"
  );
  assert.equal(
    formatPlayerDisplayName({ id: "p-ueda", name: "우에다 아야세", englishName: "Ayase Ueda" }, "pitch"),
    "Ueda"
  );
  assert.equal(
    formatPlayerDisplayName({ id: "p-endo", name: "엔도 와타루", englishName: "Wataru Endo" }, "pitch"),
    "Endo"
  );
});

test("unknown external API players stay cleanly formatted without duplicate English subtitles", () => {
  const unknown = resolvePlayerDisplayName({
    id: "api-p-99999",
    name: "Jørgen Strand Larsen",
    englishName: "Jørgen Strand Larsen",
  });
  assert.equal(unknown.full, "Jørgen Strand Larsen");
  assert.equal(unknown.pitch, "Larsen");
  assert.equal(unknown.hasDistinctEnglish, false);

  const particlePlayer = resolvePlayerDisplayName({
    id: "api-p-99998",
    name: "Sepp van den Berg",
    englishName: "Sepp van den Berg",
  });
  assert.equal(particlePlayer.full, "Sepp van den Berg");
  assert.equal(particlePlayer.pitch, "den Berg");

  const juniorSuffixPlayer = resolvePlayerDisplayName({
    id: "api-p-99997",
    name: "Neymar Jr.",
    englishName: "Neymar Jr.",
  });
  assert.equal(juniorSuffixPlayer.full, "Neymar Jr.");
  assert.equal(juniorSuffixPlayer.pitch, "Neymar");
  assert.equal(juniorSuffixPlayer.hasDistinctEnglish, false);
});

test("canonicalization, identity matching, and search work across scripts without surname collisions", () => {
  const canonical = canonicalizeIncomingPlayerNames({
    id: "p-ars-havertz",
    name: "Havertz",
    englishName: "Havertz",
  });
  assert.equal(canonical.name, "Kai Havertz");
  assert.equal(canonical.englishName, "Kai Havertz");

  const odegaard = {
    id: "p-odegaard",
    name: "Martin Ødegaard",
    englishName: "Martin Ødegaard",
    teamName: "Arsenal",
    teamShort: "ARS",
    nationalTeam: "노르웨이",
  };
  assert.equal(doesPlayerNameMatch(odegaard, "Ødegaard"), true);
  assert.equal(doesPlayerNameMatch(odegaard, "Martin Ødegaard"), true);
  assert.equal(doesIdentityMatchPlayer(odegaard, "p-ars-odegaard", "Ødegaard"), true);
  assert.equal(matchesPlayerSearchQuery(odegaard, "odegaard"), true);
  assert.equal(matchesPlayerSearchQuery(odegaard, "Ødegaard"), true);
  // Korean auxiliary search still matches English-displayed players seamlessly
  assert.equal(matchesPlayerSearchQuery(odegaard, "외데고르"), true);

  // Distinct players sharing a surname must not collide
  const bernardo = {
    id: "p-bernardo",
    name: "베르나르두 실바",
    englishName: "Bernardo Silva",
  };
  const antonio = {
    id: "p-antonio-silva",
    name: "안토니우 실바",
    englishName: "Antonio Silva",
  };
  assert.equal(doesPlayerNameMatch(bernardo, "Antonio Silva"), false);
  assert.equal(doesPlayerNameMatch(antonio, "Bernardo Silva"), false);
  assert.equal(doesPlayerNameMatch(bernardo, "Silva"), false);

  // Unknown full name sharing surname with a curated player must not collide
  const harveyBarnes = {
    id: "p-new-barnes",
    name: "하비 반스",
    englishName: "Harvey Barnes",
  };
  assert.equal(doesPlayerNameMatch(harveyBarnes, "Ashley Barnes"), false);
});

test("findLineupEntryForPlayer resolves accented and cross-script lineup entries cleanly", () => {
  const match: Match = {
    id: "m-new-ars",
    leagueId: "epl",
    leagueName: "프리미어리그",
    leagueCountry: "잉글랜드",
    status: "LIVE",
    minute: 72,
    kickoffTime: "02:30",
    homeTeam: {
      id: "new",
      name: "Newcastle",
      shortName: "NEW",
      color: "#241F20",
      score: 1,
      formation: "4-2-3-1",
      lineup: [{ id: "p-new-dedic", name: "Dedić", position: "RB", shirtNumber: 37 }],
      bench: [{ id: "p-new-schar", name: "Fabian Schär", position: "CB", shirtNumber: 5 }],
    },
    awayTeam: {
      id: "ars",
      name: "Arsenal",
      shortName: "ARS",
      color: "#EF0107",
      score: 2,
      formation: "4-2-3-1",
      lineup: [{ id: "p-ars-odegaard", name: "Ødegaard", position: "CAM", shirtNumber: 8, isCaptain: true }],
      bench: [{ id: "p-ars-hincapie", name: "Piero Hincapié", position: "CB", shirtNumber: 5 }],
    },
  };

  const odeEntry = findLineupEntryForPlayer(
    { id: "p-odegaard", name: "마르틴 외데고르", englishName: "Martin Odegaard" },
    match
  );
  assert.equal(odeEntry?.id, "p-ars-odegaard");
  assert.equal(odeEntry?.isCaptain, true);

  const scharEntry = findLineupEntryForPlayer(
    { id: "api-p-991", name: "파비안 셰어", englishName: "Fabian Schar" },
    match
  );
  assert.equal(scharEntry?.id, "p-new-schar");

  const hincapieEntry = findLineupEntryForPlayer(
    { id: "api-p-992", name: "피에로 인카피에", englishName: "Piero Hincapie" },
    match
  );
  assert.equal(hincapieEntry?.id, "p-ars-hincapie");
});
