import type { Player } from "../types/index.ts";

export interface KnownPlayerNameEntry {
  ids?: readonly string[];
  koFull: string;
  koPitch: string;
  enFull: string;
  aliases?: readonly string[];
}

export interface ResolvedPlayerDisplayName {
  full: string;
  pitch: string;
  english: string;
  hasDistinctEnglish: boolean;
}

const NON_DECOMPOSING_LATIN_MAP: Record<string, string> = {
  ø: "o",
  Ø: "o",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  þ: "th",
  Þ: "th",
  ß: "ss",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
};

const HANGUL_REGEX = /[\uAC00-\uD7A3]/;
const LATIN_REGEX = /[A-Za-z]/;

/**
 * Normalize a player name for accent-insensitive, case-insensitive identity matching.
 * Handles both Unicode combining diacritics (e.g. Dedić, Guimarães, Schär, Hincapié)
 * and non-decomposing Latin characters (e.g. Ødegaard -> odegaard).
 */
export function normalizePlayerNameKey(raw?: string): string {
  if (!raw) return "";
  let replaced = "";
  for (const ch of raw) {
    replaced += NON_DECOMPOSING_LATIN_MAP[ch] ?? ch;
  }
  return replaced
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`.]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Curated canonical player name registry uniting Korean full names, compact pitch labels,
 * canonical English names, and unambiguous fixture/API aliases.
 */
export const KNOWN_PLAYER_NAME_ENTRIES: readonly KnownPlayerNameEntry[] = [
  // --- Premier League: Newcastle vs Arsenal (m-new-ars) & Arsenal/Newcastle Squad ---
  {
    ids: ["p-new-osula"],
    koFull: "윌리엄 오술라",
    koPitch: "오술라",
    enFull: "William Osula",
    aliases: ["Osula", "오술라"],
  },
  {
    ids: ["p-new-barnes"],
    koFull: "하비 반스",
    koPitch: "반스",
    enFull: "Harvey Barnes",
    aliases: ["Barnes", "반스"],
  },
  {
    ids: ["p-new-willock"],
    koFull: "조 윌록",
    koPitch: "윌록",
    enFull: "Joe Willock",
    aliases: ["Willock", "윌록"],
  },
  {
    ids: ["p-new-murphy"],
    koFull: "제이콥 머피",
    koPitch: "머피",
    enFull: "Jacob Murphy",
    aliases: ["Murphy", "머피"],
  },
  {
    ids: ["p-new-miley"],
    koFull: "루이스 마일리",
    koPitch: "마일리",
    enFull: "Lewis Miley",
    aliases: ["Miley", "마일리"],
  },
  {
    ids: ["p-new-steur"],
    koFull: "스테우르",
    koPitch: "스테우르",
    enFull: "Steur",
    aliases: ["Steur"],
  },
  {
    ids: ["p-new-hall"],
    koFull: "루이스 홀",
    koPitch: "홀",
    enFull: "Lewis Hall",
    aliases: ["Hall", "홀"],
  },
  {
    ids: ["p-new-burn"],
    koFull: "댄 번",
    koPitch: "번",
    enFull: "Dan Burn",
    aliases: ["Burn", "번"],
  },
  {
    ids: ["p-new-thiaw"],
    koFull: "말릭 티아우",
    koPitch: "티아우",
    enFull: "Malick Thiaw",
    aliases: ["Thiaw", "티아우"],
  },
  {
    ids: ["p-new-dedic"],
    koFull: "아마르 데디치",
    koPitch: "데디치",
    enFull: "Amar Dedić",
    aliases: ["Dedić", "Dedic", "Amar Dedic", "데디치"],
  },
  {
    ids: ["p-new-hornicek"],
    koFull: "루카시 호르니체크",
    koPitch: "호르니체크",
    enFull: "Lukáš Horníček",
    aliases: ["Hornícek", "Hornicek", "Lukas Hornicek", "호르니체크"],
  },
  {
    ids: ["p-new-pope"],
    koFull: "닉 포프",
    koPitch: "포프",
    enFull: "Nick Pope",
    aliases: ["Pope", "포프"],
  },
  {
    ids: ["p-new-schar"],
    koFull: "파비안 셰어",
    koPitch: "셰어",
    enFull: "Fabian Schär",
    aliases: ["Fabian Schar", "Schär", "Schar", "셰어"],
  },
  {
    ids: ["p-new-botman"],
    koFull: "스벤 보트만",
    koPitch: "보트만",
    enFull: "Sven Botman",
    aliases: ["Botman", "보트만"],
  },
  {
    ids: ["p-new-livramento"],
    koFull: "발렌티노 리브라멘토",
    koPitch: "리브라멘토",
    enFull: "Valentino Livramento",
    aliases: ["Tino Livramento", "Livramento", "리브라멘토"],
  },
  {
    ids: ["p-new-ramsey"],
    koFull: "제이콥 램지",
    koPitch: "램지",
    enFull: "Jacob Ramsey",
    aliases: ["Ramsey", "램지"],
  },
  {
    ids: ["p-ars-havertz"],
    koFull: "카이 하베르츠",
    koPitch: "하베르츠",
    enFull: "Kai Havertz",
    aliases: ["Havertz", "하베르츠"],
  },
  {
    ids: ["p-ars-eze"],
    koFull: "에베레치 에제",
    koPitch: "에제",
    enFull: "Eberechi Eze",
    aliases: ["Eze", "에제"],
  },
  {
    ids: ["p-odegaard", "p-ars-odegaard"],
    koFull: "마르틴 외데고르",
    koPitch: "외데고르",
    enFull: "Martin Ødegaard",
    aliases: ["Martin Odegaard", "Ødegaard", "Odegaard", "외데고르"],
  },
  {
    ids: ["p-ars-madueke"],
    koFull: "노니 마두에케",
    koPitch: "마두에케",
    enFull: "Noni Madueke",
    aliases: ["Madueke", "마두에케"],
  },
  {
    ids: ["p-rice", "p-ars-rice"],
    koFull: "데클란 라이스",
    koPitch: "라이스",
    enFull: "Declan Rice",
    aliases: ["Rice", "라이스"],
  },
  {
    ids: ["p-ars-guimaraes"],
    koFull: "브루누 기마랑이스",
    koPitch: "기마랑이스",
    enFull: "Bruno Guimarães",
    aliases: ["Bruno Guimaraes", "Guimarães", "Guimaraes", "기마랑이스"],
  },
  {
    ids: ["p-ars-calafiori"],
    koFull: "리카르도 칼라피오리",
    koPitch: "칼라피오리",
    enFull: "Riccardo Calafiori",
    aliases: ["Calafiori", "칼라피오리"],
  },
  {
    ids: ["p-ars-gabriel"],
    koFull: "가브리에우 마갈량이스",
    koPitch: "가브리에우",
    enFull: "Gabriel Magalhães",
    aliases: ["Gabriel", "Gabriel Magalhaes", "가브리에우"],
  },
  {
    ids: ["p-ars-konsa"],
    koFull: "에즈리 콘사",
    koPitch: "콘사",
    enFull: "Ezri Konsa",
    aliases: ["Konsa", "콘사"],
  },
  {
    ids: ["p-ars-timber"],
    koFull: "위리엔 팀버",
    koPitch: "팀버",
    enFull: "Jurriën Timber",
    aliases: ["Jurrien Timber", "Timber", "팀버"],
  },
  {
    ids: ["p-raya", "p-ars-raya"],
    koFull: "다비드 라야",
    koPitch: "라야",
    enFull: "David Raya",
    aliases: ["Raya", "라야"],
  },
  {
    ids: ["p-ars-kepa"],
    koFull: "케파 아리사발라가",
    koPitch: "케파",
    enFull: "Kepa Arrizabalaga",
    aliases: ["Kepa", "케파"],
  },
  {
    ids: ["p-ars-white"],
    koFull: "벤 화이트",
    koPitch: "화이트",
    enFull: "Ben White",
    aliases: ["White", "화이트"],
  },
  {
    ids: ["p-ars-mosquera"],
    koFull: "크리스티안 모스케라",
    koPitch: "모스케라",
    enFull: "Cristhian Mosquera",
    aliases: ["Mosquera", "모스케라"],
  },
  {
    ids: ["p-ars-hincapie"],
    koFull: "피에로 인카피에",
    koPitch: "인카피에",
    enFull: "Piero Hincapié",
    aliases: ["Piero Hincapie", "Hincapié", "Hincapie", "인카피에"],
  },
  {
    ids: ["p-ars-saliba"],
    koFull: "윌리엄 살리바",
    koPitch: "살리바",
    enFull: "William Saliba",
    aliases: ["Saliba", "살리바"],
  },

  // --- Core Club & National Team Stars (INITIAL_PLAYERS) ---
  {
    ids: ["p-son"],
    koFull: "손흥민",
    koPitch: "손흥민",
    enFull: "Heung-Min Son",
    aliases: ["Son Heung-Min", "Son"],
  },
  {
    ids: ["p-maddison"],
    koFull: "제임스 매디슨",
    koPitch: "매디슨",
    enFull: "James Maddison",
    aliases: ["Maddison", "매디슨"],
  },
  {
    ids: ["p-romero"],
    koFull: "크리스티안 로메로",
    koPitch: "로메로",
    enFull: "Cristian Romero",
    aliases: ["Romero", "로메로"],
  },
  {
    ids: ["p-saka"],
    koFull: "부카요 사카",
    koPitch: "사카",
    enFull: "Bukayo Saka",
    aliases: ["Saka", "사카"],
  },
  {
    ids: ["p-haaland"],
    koFull: "엘링 홀란드",
    koPitch: "홀란드",
    enFull: "Erling Haaland",
    aliases: ["Haaland", "홀란드"],
  },
  {
    ids: ["p-foden"],
    koFull: "필 포든",
    koPitch: "포든",
    enFull: "Phil Foden",
    aliases: ["Foden", "포든"],
  },
  {
    ids: ["p-debruyne"],
    koFull: "케빈 더 브라위너",
    koPitch: "더 브라위너",
    enFull: "Kevin De Bruyne",
    aliases: ["De Bruyne", "더브라위너"],
  },
  {
    ids: ["p-salah"],
    koFull: "모하메드 살라",
    koPitch: "살라",
    enFull: "Mohamed Salah",
    aliases: ["Salah", "살라"],
  },
  {
    ids: ["p-vandijk"],
    koFull: "버질 판 다이크",
    koPitch: "판 다이크",
    enFull: "Virgil van Dijk",
    aliases: ["Van Dijk", "반다이크", "판다이크"],
  },
  {
    ids: ["p-bellingham"],
    koFull: "주드 벨링엄",
    koPitch: "벨링엄",
    enFull: "Jude Bellingham",
    aliases: ["Bellingham", "벨링엄"],
  },
  {
    ids: ["p-mbappe"],
    koFull: "킬리안 음바페",
    koPitch: "음바페",
    enFull: "Kylian Mbappé",
    aliases: ["Kylian Mbappe", "Mbappe", "음바페"],
  },
  {
    ids: ["p-kim"],
    koFull: "김민재",
    koPitch: "김민재",
    enFull: "Min-Jae Kim",
    aliases: ["Kim Min-Jae"],
  },
  {
    ids: ["p-kane"],
    koFull: "해리 케인",
    koPitch: "케인",
    enFull: "Harry Kane",
    aliases: ["Kane", "케인"],
  },
  {
    ids: ["p-palmer"],
    koFull: "콜 파머",
    koPitch: "파머",
    enFull: "Cole Palmer",
    aliases: ["Palmer", "파머"],
  },
  {
    ids: ["p-bruno"],
    koFull: "브루노 페르난데스",
    koPitch: "페르난데스",
    enFull: "Bruno Fernandes",
    aliases: ["브루노"],
  },
  {
    ids: ["p-mainoo"],
    koFull: "코비 마이누",
    koPitch: "마이누",
    enFull: "Kobbie Mainoo",
    aliases: ["Mainoo", "마이누", "메이누"],
  },
  {
    ids: ["p-lee"],
    koFull: "이강인",
    koPitch: "이강인",
    enFull: "Kang-In Lee",
    aliases: ["Lee Kang-In"],
  },
  {
    ids: ["p-yamal"],
    koFull: "라민 야말",
    koPitch: "야말",
    enFull: "Lamine Yamal",
    aliases: ["Yamal", "야말"],
  },
  {
    ids: ["p-valverde"],
    koFull: "페데리코 발베르데",
    koPitch: "발베르데",
    enFull: "Federico Valverde",
    aliases: ["Valverde", "발베르데"],
  },
  {
    ids: ["p-hwang"],
    koFull: "황희찬",
    koPitch: "황희찬",
    enFull: "Hee-Chan Hwang",
    aliases: ["Hwang Hee-Chan"],
  },
  {
    ids: ["p-kubo"],
    koFull: "쿠보 다케후사",
    koPitch: "쿠보",
    enFull: "Takefusa Kubo",
    aliases: ["Kubo", "쿠보"],
  },
  {
    ids: ["p-mitoma"],
    koFull: "미토마 카오루",
    koPitch: "미토마",
    enFull: "Kaoru Mitoma",
    aliases: ["Mitoma", "미토마"],
  },
  {
    ids: ["p-rodri"],
    koFull: "로드리",
    koPitch: "로드리",
    enFull: "Rodri",
    aliases: ["Rodrigo Hernandez"],
  },

  // --- South Korea National Team ---
  {
    ids: ["p-jo-hyeonwoo"],
    koFull: "조현우",
    koPitch: "조현우",
    enFull: "Hyeon-Woo Jo",
    aliases: ["Jo Hyeon-Woo"],
  },
  {
    ids: ["p-seol"],
    koFull: "설영우",
    koPitch: "설영우",
    enFull: "Young-Woo Seol",
    aliases: ["Seol Young-Woo"],
  },
  {
    ids: ["p-cho-yumin"],
    koFull: "조유민",
    koPitch: "조유민",
    enFull: "Yu-Min Cho",
    aliases: ["Cho Yu-Min"],
  },
  {
    ids: ["p-lee-myungjae"],
    koFull: "이명재",
    koPitch: "이명재",
    enFull: "Myung-Jae Lee",
    aliases: ["Lee Myung-Jae"],
  },
  {
    ids: ["p-hwang-inbeom"],
    koFull: "황인범",
    koPitch: "황인범",
    enFull: "In-Beom Hwang",
    aliases: ["Hwang In-Beom"],
  },
  {
    ids: ["p-lee-jaesung"],
    koFull: "이재성",
    koPitch: "이재성",
    enFull: "Jae-Sung Lee",
    aliases: ["Lee Jae-Sung"],
  },
  {
    ids: ["p-park-yongwoo"],
    koFull: "박용우",
    koPitch: "박용우",
    enFull: "Yong-Woo Park",
    aliases: ["Park Yong-Woo"],
  },
  {
    ids: ["p-bae-junho"],
    koFull: "배준호",
    koPitch: "배준호",
    enFull: "Jun-Ho Bae",
    aliases: ["Bae Jun-Ho"],
  },
  {
    ids: ["p-oh-sehun"],
    koFull: "오세훈",
    koPitch: "오세훈",
    enFull: "Se-Hun Oh",
    aliases: ["Oh Se-Hun"],
  },

  // --- Japan National Team (family-name-first pitch labels!) ---
  {
    ids: ["p-suzuki-zion"],
    koFull: "스즈키 자이온",
    koPitch: "스즈키",
    enFull: "Zion Suzuki",
    aliases: ["Suzuki"],
  },
  {
    ids: ["p-itakura"],
    koFull: "이타쿠라 코",
    koPitch: "이타쿠라",
    enFull: "Ko Itakura",
    aliases: ["Itakura"],
  },
  {
    ids: ["p-tomiyasu"],
    koFull: "도미야스 다케히로",
    koPitch: "도미야스",
    enFull: "Takehiro Tomiyasu",
    aliases: ["Tomiyasu"],
  },
  {
    ids: ["p-sugawara"],
    koFull: "스가와라 유키나리",
    koPitch: "스가와라",
    enFull: "Yukinari Sugawara",
    aliases: ["Sugawara"],
  },
  {
    ids: ["p-machida"],
    koFull: "마치다 코키",
    koPitch: "마치다",
    enFull: "Koki Machida",
    aliases: ["Machida"],
  },
  {
    ids: ["p-endo"],
    koFull: "엔도 와타루",
    koPitch: "엔도",
    enFull: "Wataru Endo",
    aliases: ["Endo"],
  },
  {
    ids: ["p-morita"],
    koFull: "모리타 히데마사",
    koPitch: "모리타",
    enFull: "Hidemasa Morita",
    aliases: ["Morita"],
  },
  {
    ids: ["p-doan"],
    koFull: "도안 리츠",
    koPitch: "도안",
    enFull: "Ritsu Doan",
    aliases: ["Doan"],
  },
  {
    ids: ["p-kamada"],
    koFull: "카마다 다이치",
    koPitch: "카마다",
    enFull: "Daichi Kamada",
    aliases: ["Kamada"],
  },
  {
    ids: ["p-ueda"],
    koFull: "우에다 아야세",
    koPitch: "우에다",
    enFull: "Ayase Ueda",
    aliases: ["Ueda"],
  },
  {
    ids: ["p-maeda"],
    koFull: "마에다 다이젠",
    koPitch: "마에다",
    enFull: "Daizen Maeda",
    aliases: ["Maeda"],
  },

  // --- England / Spain / Norway / Portugal National Teams ---
  {
    ids: ["p-pickford"],
    koFull: "조던 픽포드",
    koPitch: "픽포드",
    enFull: "Jordan Pickford",
    aliases: ["Pickford", "픽포드"],
  },
  {
    ids: ["p-trent"],
    koFull: "트렌트 알렉산더-아놀드",
    koPitch: "아놀드",
    enFull: "Trent Alexander-Arnold",
    aliases: ["Alexander-Arnold", "알렉산더-아놀드"],
  },
  {
    ids: ["p-stones"],
    koFull: "존 스톤스",
    koPitch: "스톤스",
    enFull: "John Stones",
    aliases: ["Stones", "스톤스"],
  },
  {
    ids: ["p-guehi"],
    koFull: "마크 게히",
    koPitch: "게히",
    enFull: "Marc Guéhi",
    aliases: ["Marc Guehi", "Guehi", "게히"],
  },
  {
    ids: ["p-colwill"],
    koFull: "리바이 콜윌",
    koPitch: "콜윌",
    enFull: "Levi Colwill",
    aliases: ["Colwill", "콜윌"],
  },
  {
    ids: ["p-gordon"],
    koFull: "앤서니 고든",
    koPitch: "고든",
    enFull: "Anthony Gordon",
    aliases: ["Gordon", "고든"],
  },
  {
    ids: ["p-unai-simon"],
    koFull: "우나이 시몬",
    koPitch: "시몬",
    enFull: "Unai Simón",
    aliases: ["Unai Simon"],
  },
  {
    ids: ["p-carvajal"],
    koFull: "다니 카르바할",
    koPitch: "카르바할",
    enFull: "Dani Carvajal",
    aliases: ["Carvajal", "카르바할"],
  },
  {
    ids: ["p-cubarsi"],
    koFull: "파우 쿠바르시",
    koPitch: "쿠바르시",
    enFull: "Pau Cubarsí",
    aliases: ["Pau Cubarsi", "Cubarsi", "쿠바르시"],
  },
  {
    ids: ["p-laporte"],
    koFull: "아이메릭 라포르트",
    koPitch: "라포르트",
    enFull: "Aymeric Laporte",
    aliases: ["Laporte", "라포르트"],
  },
  {
    ids: ["p-cucurella"],
    koFull: "마르크 쿠쿠렐라",
    koPitch: "쿠쿠렐라",
    enFull: "Marc Cucurella",
    aliases: ["Cucurella", "쿠쿠렐라"],
  },
  {
    ids: ["p-pedri"],
    koFull: "페드리",
    koPitch: "페드리",
    enFull: "Pedri",
  },
  {
    ids: ["p-fabian"],
    koFull: "파비안 루이스",
    koPitch: "파비안",
    enFull: "Fabián Ruiz",
    aliases: ["Fabian Ruiz"],
  },
  {
    ids: ["p-olmo"],
    koFull: "다니 올모",
    koPitch: "올모",
    enFull: "Dani Olmo",
    aliases: ["Olmo"],
  },
  {
    ids: ["p-nico-williams"],
    koFull: "니코 윌리엄스",
    koPitch: "니코",
    enFull: "Nico Williams",
  },
  {
    ids: ["p-morata"],
    koFull: "알바로 모라타",
    koPitch: "모라타",
    enFull: "Álvaro Morata",
    aliases: ["Alvaro Morata", "Morata", "모라타"],
  },
  {
    ids: ["p-nyland"],
    koFull: "외르얀 뉠란",
    koPitch: "뉠란",
    enFull: "Ørjan Nyland",
    aliases: ["Orjan Nyland", "Nyland"],
  },
  {
    ids: ["p-ryerson"],
    koFull: "율리안 뤼에르손",
    koPitch: "뤼에르손",
    enFull: "Julian Ryerson",
    aliases: ["Ryerson"],
  },
  {
    ids: ["p-ajer"],
    koFull: "크리스토페르 아예르",
    koPitch: "아예르",
    enFull: "Kristoffer Ajer",
    aliases: ["Ajer"],
  },
  {
    ids: ["p-ostigard"],
    koFull: "레오 외스티고르",
    koPitch: "외스티고르",
    enFull: "Leo Østigård",
    aliases: ["Leo Ostigard", "Ostigard"],
  },
  {
    ids: ["p-wolfe"],
    koFull: "다비드 묄레르 볼페",
    koPitch: "볼페",
    enFull: "David Møller Wolfe",
    aliases: ["David Moller Wolfe"],
  },
  {
    ids: ["p-berge"],
    koFull: "산데르 베르게",
    koPitch: "베르게",
    enFull: "Sander Berge",
    aliases: ["Berge"],
  },
  {
    ids: ["p-nusa"],
    koFull: "안토니오 누사",
    koPitch: "누사",
    enFull: "Antonio Nusa",
    aliases: ["Nusa"],
  },
  {
    ids: ["p-bobb"],
    koFull: "오스카르 보브",
    koPitch: "보브",
    enFull: "Oscar Bobb",
    aliases: ["Bobb"],
  },
  {
    ids: ["p-sorloth"],
    koFull: "알렉산데르 쇠를로트",
    koPitch: "쇠를로트",
    enFull: "Alexander Sørloth",
    aliases: ["Alexander Sorloth", "Sorloth"],
  },
  {
    ids: ["p-diogo-costa"],
    koFull: "디오구 코스타",
    koPitch: "코스타",
    enFull: "Diogo Costa",
  },
  {
    ids: ["p-ruben-dias"],
    koFull: "후벵 디아스",
    koPitch: "디아스",
    enFull: "Rúben Dias",
    aliases: ["Ruben Dias"],
  },
  {
    ids: ["p-nuno-mendes"],
    koFull: "누누 멘데스",
    koPitch: "멘데스",
    enFull: "Nuno Mendes",
  },
  {
    ids: ["p-dalot"],
    koFull: "디오구 달롯",
    koPitch: "달롯",
    enFull: "Diogo Dalot",
    aliases: ["Dalot", "달롯"],
  },
  {
    ids: ["p-antonio-silva"],
    koFull: "안토니우 실바",
    koPitch: "안토니우",
    enFull: "António Silva",
    aliases: ["Antonio Silva"],
  },
  {
    ids: ["p-vitinha"],
    koFull: "비티냐",
    koPitch: "비티냐",
    enFull: "Vitinha",
  },
  {
    ids: ["p-bernardo"],
    koFull: "베르나르두 실바",
    koPitch: "베르나르두",
    enFull: "Bernardo Silva",
    aliases: ["Bernardo", "베르나르두"],
  },
  {
    ids: ["p-joao-neves"],
    koFull: "주앙 네베스",
    koPitch: "네베스",
    enFull: "João Neves",
    aliases: ["Joao Neves"],
  },
  {
    ids: ["p-ronaldo"],
    koFull: "크리스티아누 호날두",
    koPitch: "호날두",
    enFull: "Cristiano Ronaldo",
    aliases: ["Ronaldo", "호날두"],
  },
  {
    ids: ["p-leao"],
    koFull: "하파엘 레앙",
    koPitch: "레앙",
    enFull: "Rafael Leão",
    aliases: ["Rafael Leao", "Leao", "레앙"],
  },
  {
    ids: ["p-neto"],
    koFull: "페드로 네투",
    koPitch: "네투",
    enFull: "Pedro Neto",
  },

  // --- Common European Club / Fallback Pool Stars ---
  {
    koFull: "가브리엘 마르티넬리",
    koPitch: "마르티넬리",
    enFull: "Gabriel Martinelli",
    aliases: ["Martinelli", "마르티넬리"],
  },
  {
    koFull: "비니시우스 주니오르",
    koPitch: "비니시우스",
    enFull: "Vinícius Júnior",
    aliases: ["Vinicius", "Vinicius Junior", "비니시우스"],
  },
  {
    koFull: "마커스 래시포드",
    koPitch: "래시포드",
    enFull: "Marcus Rashford",
    aliases: ["Rashford", "래시포드"],
  },
  {
    koFull: "브래들리 바르콜라",
    koPitch: "바르콜라",
    enFull: "Bradley Barcola",
    aliases: ["Barcola", "바르콜라"],
  },
  {
    koFull: "제레미 도쿠",
    koPitch: "도쿠",
    enFull: "Jérémy Doku",
    aliases: ["Jeremy Doku", "Doku", "도쿠"],
  },
  {
    koFull: "흐비차 크바라츠헬리아",
    koPitch: "크바라츠헬리아",
    enFull: "Khvicha Kvaratskhelia",
    aliases: ["Kvaratskhelia", "크바라츠헬리아"],
  },
  {
    koFull: "라우타로 마르티네스",
    koPitch: "라우타로",
    enFull: "Lautaro Martínez",
    aliases: ["Lautaro Martinez", "Lautaro", "라우타로"],
  },
  {
    koFull: "도미닉 솔란케",
    koPitch: "솔란케",
    enFull: "Dominic Solanke",
    aliases: ["Solanke", "솔란케"],
  },
  {
    koFull: "로베르트 레반도프스키",
    koPitch: "레반도프스키",
    enFull: "Robert Lewandowski",
    aliases: ["Lewandowski", "레반도프스키"],
  },
  {
    koFull: "알렉산데르 이삭",
    koPitch: "이삭",
    enFull: "Alexander Isak",
    aliases: ["Isak", "이삭"],
  },
  {
    koFull: "두산 블라호비치",
    koPitch: "블라호비치",
    enFull: "Dušan Vlahović",
    aliases: ["Dusan Vlahovic", "Vlahovic", "블라호비치"],
  },
  {
    koFull: "우스만 뎀벨레",
    koPitch: "뎀벨레",
    enFull: "Ousmane Dembélé",
    aliases: ["Ousmane Dembele", "Dembele", "뎀벨레"],
  },
  {
    koFull: "모하메드 쿠두스",
    koPitch: "쿠두스",
    enFull: "Mohammed Kudus",
    aliases: ["Kudus", "쿠두스"],
  },
  {
    koFull: "크리스천 풀리식",
    koPitch: "풀리식",
    enFull: "Christian Pulisic",
    aliases: ["Pulisic", "풀리식"],
  },
  {
    koFull: "호드리구",
    koPitch: "호드리구",
    enFull: "Rodrygo",
  },
  {
    koFull: "마이클 올리세",
    koPitch: "올리세",
    enFull: "Michael Olise",
    aliases: ["Olise", "올리세"],
  },
  {
    koFull: "브라이언 음뵈모",
    koPitch: "음뵈모",
    enFull: "Bryan Mbeumo",
    aliases: ["Mbeumo", "음뵈모"],
  },
  {
    koFull: "자말 무시알라",
    koPitch: "무시알라",
    enFull: "Jamal Musiala",
    aliases: ["Musiala", "무시알라"],
  },
  {
    koFull: "잭 그릴리쉬",
    koPitch: "그릴리쉬",
    enFull: "Jack Grealish",
    aliases: ["Grealish", "그릴리쉬"],
  },
  {
    koFull: "차비 시몬스",
    koPitch: "시몬스",
    enFull: "Xavi Simons",
  },
  {
    koFull: "제이든 산초",
    koPitch: "산초",
    enFull: "Jadon Sancho",
    aliases: ["Sancho", "산초"],
  },
  {
    koFull: "주앙 펠릭스",
    koPitch: "펠릭스",
    enFull: "João Félix",
    aliases: ["Joao Felix", "펠릭스"],
  },
  {
    koFull: "케난 일디즈",
    koPitch: "일디즈",
    enFull: "Kenan Yıldız",
    aliases: ["Kenan Yildiz", "Yildiz", "일디즈"],
  },
  {
    koFull: "크리스토퍼 은쿤쿠",
    koPitch: "은쿤쿠",
    enFull: "Christopher Nkunku",
    aliases: ["Nkunku", "은쿤쿠"],
  },
  {
    koFull: "알레한드로 가르나초",
    koPitch: "가르나초",
    enFull: "Alejandro Garnacho",
    aliases: ["Garnacho", "가르나초"],
  },
  {
    koFull: "플로리안 비르츠",
    koPitch: "비르츠",
    enFull: "Florian Wirtz",
    aliases: ["Wirtz", "비르츠"],
  },
  {
    koFull: "데얀 클루셉스키",
    koPitch: "클루셉스키",
    enFull: "Dejan Kulusevski",
    aliases: ["Kulusevski", "클루셉스키"],
  },
  {
    koFull: "재러드 보웬",
    koPitch: "보웬",
    enFull: "Jarrod Bowen",
    aliases: ["Bowen", "보웬"],
  },
  {
    koFull: "메이슨 마운트",
    koPitch: "마운트",
    enFull: "Mason Mount",
    aliases: ["Mount", "마운트"],
  },
  {
    koFull: "니콜로 바렐라",
    koPitch: "바렐라",
    enFull: "Nicolò Barella",
    aliases: ["Nicolo Barella", "Barella", "바렐라"],
  },
  {
    koFull: "알렉시스 맥알리스터",
    koPitch: "맥알리스터",
    enFull: "Alexis Mac Allister",
    aliases: ["Mac Allister", "맥알리스터"],
  },
  {
    koFull: "프렌키 데용",
    koPitch: "데용",
    enFull: "Frenkie de Jong",
    aliases: ["De Jong"],
  },
  {
    koFull: "에두아르도 카마빙가",
    koPitch: "카마빙가",
    enFull: "Eduardo Camavinga",
    aliases: ["Camavinga", "카마빙가"],
  },
  {
    koFull: "워렌 자이르에메리",
    koPitch: "자이르에메리",
    enFull: "Warren Zaïre-Emery",
    aliases: ["Warren Zaire-Emery", "Zaire-Emery", "자이르에메리"],
  },
  {
    koFull: "요주아 키미히",
    koPitch: "키미히",
    enFull: "Joshua Kimmich",
    aliases: ["Kimmich", "키미히"],
  },
  {
    koFull: "모이세스 카이세도",
    koPitch: "카이세도",
    enFull: "Moisés Caicedo",
    aliases: ["Moises Caicedo", "Caicedo", "카이세도"],
  },
  {
    koFull: "오렐리앙 츄아메니",
    koPitch: "츄아메니",
    enFull: "Aurélien Tchouaméni",
    aliases: ["Aurelien Tchouameni", "Tchouameni", "츄아메니"],
  },
  {
    koFull: "데스티니 우도기",
    koPitch: "우도기",
    enFull: "Destiny Udogie",
    aliases: ["Udogie", "우도기"],
  },
  {
    koFull: "요슈코 그바르디올",
    koPitch: "그바르디올",
    enFull: "Joško Gvardiol",
    aliases: ["Josko Gvardiol", "Gvardiol", "그바르디올"],
  },
  {
    koFull: "테오 에르난데스",
    koPitch: "테오",
    enFull: "Theo Hernández",
    aliases: ["Theo Hernandez", "Theo", "테오"],
  },
  {
    koFull: "앤디 로버트슨",
    koPitch: "로버트슨",
    enFull: "Andy Robertson",
    aliases: ["Robertson", "로버트슨"],
  },
  {
    koFull: "알폰소 데이비스",
    koPitch: "데이비스",
    enFull: "Alphonso Davies",
    aliases: ["Davies", "데이비스"],
  },
  {
    koFull: "페데리코 디마르코",
    koPitch: "디마르코",
    enFull: "Federico Dimarco",
    aliases: ["Dimarco", "디마르코"],
  },
  {
    koFull: "알레한드로 발데",
    koPitch: "발데",
    enFull: "Alejandro Balde",
    aliases: ["Balde", "발데"],
  },
  {
    koFull: "안토니오 뤼디거",
    koPitch: "뤼디거",
    enFull: "Antonio Rüdiger",
    aliases: ["Antonio Rudiger", "Rudiger", "뤼디거"],
  },
  {
    koFull: "미키 판더펜",
    koPitch: "판더펜",
    enFull: "Micky van de Ven",
    aliases: ["Van de Ven", "판더펜"],
  },
  {
    koFull: "로날드 아라우호",
    koPitch: "아라우호",
    enFull: "Ronald Araújo",
    aliases: ["Ronald Araujo", "Araujo", "아라우호"],
  },
  {
    koFull: "알레산드로 바스토니",
    koPitch: "바스토니",
    enFull: "Alessandro Bastoni",
    aliases: ["Bastoni", "바스토니"],
  },
  {
    koFull: "페드로 포로",
    koPitch: "포로",
    enFull: "Pedro Porro",
    aliases: ["Porro", "포로"],
  },
  {
    koFull: "카일 워커",
    koPitch: "워커",
    enFull: "Kyle Walker",
    aliases: ["Walker", "워커"],
  },
  {
    koFull: "아슈라프 하키미",
    koPitch: "하키미",
    enFull: "Achraf Hakimi",
    aliases: ["Hakimi", "하키미"],
  },
  {
    koFull: "쥘 쿤데",
    koPitch: "쿤데",
    enFull: "Jules Koundé",
    aliases: ["Jules Kounde", "Kounde", "쿤데"],
  },
  {
    koFull: "제레미 프림퐁",
    koPitch: "프림퐁",
    enFull: "Jeremie Frimpong",
    aliases: ["Frimpong", "프림퐁"],
  },
  {
    koFull: "굴리엘모 비카리오",
    koPitch: "비카리오",
    enFull: "Guglielmo Vicario",
    aliases: ["Vicario", "비카리오"],
  },
  {
    koFull: "알리송 베케르",
    koPitch: "알리송",
    enFull: "Alisson Becker",
    aliases: ["Alisson", "알리송"],
  },
  {
    koFull: "에데르송",
    koPitch: "에데르송",
    enFull: "Ederson",
  },
  {
    koFull: "티보 쿠르투아",
    koPitch: "쿠르투아",
    enFull: "Thibaut Courtois",
    aliases: ["Courtois", "쿠르투아"],
  },
  {
    koFull: "마누엘 노이어",
    koPitch: "노이어",
    enFull: "Manuel Neuer",
    aliases: ["Neuer", "노이어"],
  },
  {
    koFull: "잔루이지 돈나룸마",
    koPitch: "돈나룸마",
    enFull: "Gianluigi Donnarumma",
    aliases: ["Donnarumma", "돈나룸마"],
  },
  {
    koFull: "레안드로 트로사르",
    koPitch: "트로사르",
    enFull: "Leandro Trossard",
    aliases: ["Trossard", "트로사르"],
  },
  {
    koFull: "훌리안 알바레즈",
    koPitch: "알바레즈",
    enFull: "Julián Álvarez",
    aliases: ["Julian Alvarez", "Alvarez", "알바레즈"],
  },
  {
    koFull: "디오구 조타",
    koPitch: "조타",
    enFull: "Diogo Jota",
    aliases: ["Jota", "조타"],
  },
  {
    koFull: "페란 토레스",
    koPitch: "페란",
    enFull: "Ferran Torres",
    aliases: ["Ferran"],
  },
  {
    koFull: "곤살루 하무스",
    koPitch: "하무스",
    enFull: "Gonçalo Ramos",
    aliases: ["Goncalo Ramos", "G. Ramos"],
  },
  {
    koFull: "위고 에키티케",
    koPitch: "에키티케",
    enFull: "Hugo Ekitike",
    aliases: ["Ekitike", "에키티케"],
  },
  {
    koFull: "라이언 흐라벤베르흐",
    koPitch: "흐라벤베르흐",
    enFull: "Ryan Gravenberch",
    aliases: ["Gravenberch", "흐라벤베르흐"],
  },
  {
    koFull: "마테오 코바치치",
    koPitch: "코바치치",
    enFull: "Mateo Kovačić",
    aliases: ["Mateo Kovacic", "Kovacic", "코바치치"],
  },
  {
    koFull: "가비",
    koPitch: "가비",
    enFull: "Gavi",
  },
  {
    koFull: "파페 마타르 사르",
    koPitch: "사르",
    enFull: "Pape Matar Sarr",
    aliases: ["Sarr", "사르"],
  },
  {
    koFull: "조르지뉴",
    koPitch: "조르지뉴",
    enFull: "Jorginho",
  },
  {
    koFull: "루카 모드리치",
    koPitch: "모드리치",
    enFull: "Luka Modrić",
    aliases: ["Luka Modric", "Modric", "모드리치"],
  },
  {
    koFull: "일카이 귄도안",
    koPitch: "귄도안",
    enFull: "İlkay Gündoğan",
    aliases: ["Ilkay Gundogan", "Gundogan", "귄도안"],
  },
  {
    koFull: "마누엘 우가르테",
    koPitch: "우가르테",
    enFull: "Manuel Ugarte",
    aliases: ["Ugarte", "우가르테"],
  },
  {
    koFull: "라두 드라구신",
    koPitch: "드라구신",
    enFull: "Radu Drăgușin",
    aliases: ["Radu Dragusin", "Dragusin", "드라구신"],
  },
  {
    koFull: "뱅자맹 파바르",
    koPitch: "파바르",
    enFull: "Benjamin Pavard",
    aliases: ["Pavard", "파바르"],
  },
  {
    koFull: "에데르 밀리탕",
    koPitch: "밀리탕",
    enFull: "Éder Militão",
    aliases: ["Eder Militao", "Militao", "밀리탕"],
  },
  {
    koFull: "마누엘 아칸지",
    koPitch: "아칸지",
    enFull: "Manuel Akanji",
    aliases: ["Akanji", "아칸지"],
  },
  {
    koFull: "슈테판 오르테가",
    koPitch: "오르테가",
    enFull: "Stefan Ortega",
    aliases: ["Ortega", "오르테가"],
  },
  {
    koFull: "안드리 루닌",
    koPitch: "루닌",
    enFull: "Andriy Lunin",
    aliases: ["Lunin", "루닌"],
  },
  {
    koFull: "보이치에흐 슈체스니",
    koPitch: "슈체스니",
    enFull: "Wojciech Szczęsny",
    aliases: ["Wojciech Szczesny", "Szczesny", "슈체스니"],
  },
];

const ENTRY_BY_ID = new Map<string, KnownPlayerNameEntry>();
const ENTRY_BY_KEY = new Map<string, KnownPlayerNameEntry>();

for (const entry of KNOWN_PLAYER_NAME_ENTRIES) {
  if (entry.ids) {
    for (const id of entry.ids) {
      ENTRY_BY_ID.set(id, entry);
      if (!id.startsWith("api-p-")) {
        ENTRY_BY_ID.set(`api-p-${id}`, entry);
      }
    }
  }
  const keys = [entry.koFull, entry.enFull, ...(entry.aliases ?? [])];
  for (const rawKey of keys) {
    const k = normalizePlayerNameKey(rawKey);
    if (k && !ENTRY_BY_KEY.has(k)) {
      ENTRY_BY_KEY.set(k, entry);
    }
  }
}

export function findKnownPlayerNameEntry(params: {
  id?: string | number;
  name?: string;
  englishName?: string;
}): KnownPlayerNameEntry | undefined {
  if (params.id !== undefined) {
    const idStr = String(params.id).trim();
    const byId = ENTRY_BY_ID.get(idStr);
    if (byId) return byId;
  }
  const nameKey = normalizePlayerNameKey(params.name);
  if (nameKey) {
    const byName = ENTRY_BY_KEY.get(nameKey);
    if (byName) return byName;
  }
  const enKey = normalizePlayerNameKey(params.englishName);
  if (enKey) {
    const byEn = ENTRY_BY_KEY.get(enKey);
    if (byEn) return byEn;
  }
  return undefined;
}

const SURNAME_PARTICLES = new Set([
  "van",
  "de",
  "da",
  "del",
  "di",
  "la",
  "le",
  "el",
  "al",
  "dos",
  "das",
  "den",
  "der",
  "ten",
  "ter",
  "st",
]);

function deriveFallbackPitchLabel(fullName: string): string {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  if (HANGUL_REGEX.test(trimmed)) {
    if (!trimmed.includes(" ")) return trimmed;
    const parts = trimmed.split(" ");
    return parts[parts.length - 1];
  }

  const parts = trimmed.split(" ");
  if (parts.length <= 1) return trimmed;
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (prev && SURNAME_PARTICLES.has(prev.toLowerCase())) {
    const combined = `${prev} ${last}`;
    if (combined.length <= 12) return combined;
  }
  return last;
}

/**
 * Resolve a player's unified display names across pitch nodes, bench/accordion rows,
 * market lists, search results, charts, and detail modals.
 *
 * Convention:
 * - `full`: Canonical Korean full name whenever known (e.g. "마르틴 외데고르", "카이 하베르츠"),
 *   or cleaned original name for unknown external API players.
 * - `pitch`: Compact label for narrow formation pitch nodes (e.g. "외데고르", "하베르츠", "손흥민", "미토마").
 * - `english`: Canonical English name for secondary subtitle / search matching.
 */
export function resolvePlayerDisplayName(
  player: Pick<Player, "name"> & {
    id?: string | number;
    englishName?: string;
  }
): ResolvedPlayerDisplayName {
  const rawName = (player.name || "").trim();
  const rawEnglish = (player.englishName || "").trim();
  const entry = findKnownPlayerNameEntry({
    id: player.id,
    name: rawName,
    englishName: rawEnglish,
  });

  if (entry) {
    const english = entry.enFull || rawEnglish || rawName;
    return {
      full: entry.koFull,
      pitch: entry.koPitch,
      english,
      hasDistinctEnglish:
        Boolean(english) &&
        normalizePlayerNameKey(english) !== normalizePlayerNameKey(entry.koFull),
    };
  }

  // Fallback when player is not in the curated dictionary
  const full = rawName || rawEnglish || "선수";
  const english =
    rawEnglish || (LATIN_REGEX.test(rawName) && !HANGUL_REGEX.test(rawName) ? rawName : "");
  const pitch = deriveFallbackPitchLabel(full);

  return {
    full,
    pitch,
    english,
    hasDistinctEnglish:
      Boolean(english) &&
      normalizePlayerNameKey(english) !== normalizePlayerNameKey(full),
  };
}

export function formatPlayerDisplayName(
  player: Pick<Player, "name"> & {
    id?: string | number;
    englishName?: string;
  },
  variant: "full" | "pitch" = "full"
): string {
  const resolved = resolvePlayerDisplayName(player);
  return variant === "pitch" ? resolved.pitch : resolved.full;
}

/**
 * Normalize incoming API/fixture player names so newly listed or lineup-built players
 * carry unified Korean `name` (when known) while preserving canonical `englishName`.
 */
export function canonicalizeIncomingPlayerNames(params: {
  id?: string | number;
  name: string;
  englishName?: string;
}): { name: string; englishName: string } {
  const resolved = resolvePlayerDisplayName(params);
  return {
    name: resolved.full,
    englishName: resolved.english || params.englishName?.trim() || params.name.trim(),
  };
}

/**
 * Collect normalized identity keys for a player across raw Korean/English names
 * and curated dictionary entries (for cross-script event & lineup matching).
 */
export function collectPlayerIdentityKeys(
  player: Pick<Player, "name"> & {
    id?: string | number;
    englishName?: string;
  }
): Set<string> {
  const keys = new Set<string>();
  const add = (val?: string) => {
    const k = normalizePlayerNameKey(val);
    if (k) keys.add(k);
  };

  add(player.name);
  add(player.englishName);

  const entry = findKnownPlayerNameEntry({
    id: player.id,
    name: player.name,
    englishName: player.englishName,
  });
  if (entry) {
    add(entry.koFull);
    add(entry.enFull);
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        add(alias);
      }
    }
  }

  return keys;
}

/**
 * Check whether a candidate name string (Korean, accented English, or known alias)
 * identifies the exact same player.
 */
export function doesPlayerNameMatch(
  player: Pick<Player, "name"> & {
    id?: string | number;
    englishName?: string;
  },
  candidateName?: string
): boolean {
  const candidateKey = normalizePlayerNameKey(candidateName);
  if (!candidateKey) return false;

  const playerKeys = collectPlayerIdentityKeys(player);
  if (playerKeys.has(candidateKey)) return true;

  const candidateEntry = findKnownPlayerNameEntry({ name: candidateName });
  if (candidateEntry) {
    const entryKo = normalizePlayerNameKey(candidateEntry.koFull);
    const entryEn = normalizePlayerNameKey(candidateEntry.enFull);
    if (playerKeys.has(entryKo) || playerKeys.has(entryEn)) {
      return true;
    }
  }

  return false;
}

/**
 * Match a user search query against a player's unified Korean display name,
 * pitch label, English name (accent-folded), team, and national team.
 */
export function matchesPlayerSearchQuery(
  player: Pick<Player, "id" | "name" | "englishName" | "teamName" | "teamShort" | "nationalTeam">,
  rawQuery: string
): boolean {
  const qRaw = rawQuery.trim().toLowerCase();
  const qNorm = normalizePlayerNameKey(rawQuery);
  if (!qRaw && !qNorm) return true;

  const resolved = resolvePlayerDisplayName(player);
  const fields = [
    player.name,
    player.englishName,
    resolved.full,
    resolved.pitch,
    resolved.english,
    player.teamName,
    player.teamShort,
    player.nationalTeam,
  ];

  for (const field of fields) {
    if (!field) continue;
    if (qRaw && field.toLowerCase().includes(qRaw)) return true;
    if (qNorm && normalizePlayerNameKey(field).includes(qNorm)) return true;
  }

  return false;
}
