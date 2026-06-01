// ============================================================
// #  GLOBAL COUNTRY PREFIXES (ALL 240+ COUNTRIES & TERRITORIES)
// ============================================================

const countryPrefixes = {
    "1": "USA/CANADA", "7": "RUSSIA/KAZAKHSTAN",
    "20": "EGYPT", "27": "SOUTH AFRICA", "30": "GREECE", "31": "NETHERLANDS",
    "32": "BELGIUM", "33": "FRANCE", "34": "SPAIN", "36": "HUNGARY", "39": "ITALY",
    "40": "ROMANIA", "41": "SWITZERLAND", "43": "AUSTRIA", "44": "UK", "45": "DENMARK",
    "46": "SWEDEN", "47": "NORWAY", "48": "POLAND", "49": "GERMANY",
    "51": "PERU", "52": "MEXICO", "53": "CUBA", "54": "ARGENTINA", "55": "BRAZIL",
    "56": "CHILE", "57": "COLOMBIA", "58": "VENEZUELA",
    "60": "MALAYSIA", "61": "AUSTRALIA", "62": "INDONESIA", "63": "PHILIPPINES",
    "64": "NEW ZEALAND", "65": "SINGAPORE", "66": "THAILAND",
    "81": "JAPAN", "82": "SOUTH KOREA", "84": "VIETNAM", "86": "CHINA", "880": "BANGLADESH",
    "90": "TURKEY", "91": "INDIA", "92": "PAKISTAN", "93": "AFGHANISTAN", "94": "SRI LANKA",
    "95": "MYANMAR", "98": "IRAN",
    "211": "SOUTH SUDAN", "212": "MOROCCO", "213": "ALGERIA", "216": "TUNISIA",
    "218": "LIBYA", "220": "GAMBIA", "221": "SENEGAL", "222": "MAURITANIA",
    "223": "MALI", "224": "GUINEA", "225": "IVORY COAST", "226": "BURKINA FASO",
    "227": "NIGER", "228": "TOGO", "229": "BENIN", "230": "MAURITIUS", "231": "LIBERIA",
    "232": "SIERRA LEONE", "233": "GHANA", "234": "NIGERIA", "235": "CHAD",
    "236": "CENTRAL AFRICA", "237": "CAMEROON", "238": "CAPE VERDE", "239": "SAO TOME",
    "240": "EQUATORIAL GUINEA", "241": "GABON", "242": "CONGO", "243": "DR CONGO",
    "244": "ANGOLA", "245": "GUINEA BISSAU", "246": "DIEGO GARCIA", "248": "SEYCHELLES",
    "249": "SUDAN", "250": "RWANDA", "251": "ETHIOPIA", "252": "SOMALIA", "253": "DJIBOUTI",
    "254": "KENYA", "255": "TANZANIA", "256": "UGANDA", "257": "BURUNDI",
    "258": "MOZAMBIQUE", "260": "ZAMBIA", "261": "MADAGASCAR", "262": "REUNION",
    "263": "ZIMBABWE", "264": "NAMIBIA", "265": "MALAWI", "266": "LESOTHO",
    "267": "BOTSWANA", "268": "ESWATINI", "269": "COMOROS",
    "290": "SAINT HELENA", "291": "ERITREA", "297": "ARUBA", "298": "FAROE ISLANDS", "299": "GREENLAND",
    "350": "GIBRALTAR", "351": "PORTUGAL", "352": "LUXEMBOURG", "353": "IRELAND", "354": "ICELAND",
    "355": "ALBANIA", "356": "MALTA", "357": "CYPRUS", "358": "FINLAND", "359": "BULGARIA",
    "370": "LITHUANIA", "371": "LATVIA", "372": "ESTONIA", "373": "MOLDOVA", "374": "ARMENIA",
    "375": "BELARUS", "376": "ANDORRA", "377": "MONACO", "378": "SAN MARINO", "379": "VATICAN",
    "380": "UKRAINE", "381": "SERBIA", "382": "MONTENEGRO", "383": "KOSOVO", "385": "CROATIA",
    "386": "SLOVENIA", "387": "BOSNIA", "389": "MACEDONIA",
    "500": "FALKLAND ISLANDS", "501": "BELIZE", "502": "GUATEMALA", "503": "EL SALVADOR",
    "504": "HONDURAS", "505": "NICARAGUA", "506": "COSTA RICA", "507": "PANAMA",
    "508": "ST. PIERRE", "509": "HAITI",
    "590": "GUADELOUPE", "591": "BOLIVIA", "592": "GUYANA", "593": "ECUADOR", "594": "FRENCH GUIANA",
    "595": "PARAGUAY", "596": "MARTINIQUE", "597": "SURINAME", "598": "URUGUAY", "599": "CURACAO",
    "670": "EAST TIMOR", "672": "NORFOLK ISLAND", "673": "BRUNEI", "674": "NAURU", "675": "PAPUA NEW GUINEA",
    "676": "TONGA", "677": "SOLOMON ISLANDS", "678": "VANUATU", "679": "FIJI", "680": "PALAU",
    "681": "WALLIS & FUTUNA", "682": "COOK ISLANDS", "683": "NIUE", "685": "SAMOA", "687": "NEW CALEDONIA",
    "688": "TUVALU", "689": "FRENCH POLYNESIA", "690": "TOKELAU", "691": "MICRONESIA", "692": "MARSHALL ISLANDS",
    "850": "NORTH KOREA", "852": "HONG KONG", "853": "MACAU", "855": "CAMBODIA", "856": "LAOS",
    "886": "TAIWAN", "960": "MALDIVES", "961": "LEBANON", "962": "JORDAN", "963": "SYRIA",
    "964": "IRAQ", "965": "KUWAIT", "966": "SAUDI ARABIA", "967": "YEMEN", "968": "OMAN",
    "970": "PALESTINE", "971": "UAE", "972": "ISRAEL", "973": "BAHRAIN", "974": "QATAR",
    "975": "BHUTAN", "976": "MONGOLIA", "977": "NEPAL", "992": "TAJIKISTAN", "993": "TURKMENISTAN",
    "994": "AZERBAIJAN", "995": "GEORGIA", "996": "KYRGYZSTAN", "998": "UZBEKISTAN",
    
    // North American Numbering Plan (NANP) Split Prefixes (1-XXX)
    "1242": "BAHAMAS", "1246": "BARBADOS", "1264": "ANGUILLA", "1268": "ANTIGUA",
    "1284": "BRITISH VIRGIN ISLANDS", "1340": "US VIRGIN ISLANDS", "1345": "CAYMAN ISLANDS",
    "1441": "BERMUDA", "1473": "GRENADA", "1649": "TURKS & CAICOS", "1658": "JAMAICA",
    "1664": "MONTSERRAT", "1670": "NORTHERN MARIANA ISLANDS", "1671": "GUAM",
    "1684": "AMERICAN SAMOA", "1721": "SINT MAARTEN", "1758": "ST. LUCIA",
    "1767": "DOMINICA", "1784": "ST. VINCENT", "1787": "PUERTO RICO",
    "1809": "DOMINICAN REPUBLIC", "1829": "DOMINICAN REPUBLIC", "1849": "DOMINICAN REPUBLIC",
    "1868": "TRINIDAD & TOBAGO", "1869": "ST. KITTS & NEVIS", "1876": "JAMAICA", "1939": "PUERTO RICO"
};

// ============================================================
// #  GLOBAL COUNTRY FLAGS MAP (ALL 240+ WORLD COUNTRIES & REGIONS)
// ============================================================

const countryData = {
    // A
    "AFGHANISTAN": { flag: "🇦🇫" }, "ALBANIA": { flag: "🇦🇱" }, "ALGERIA": { flag: "🇩🇿" }, "AMERICAN SAMOA": { flag: "🇦🇸" },
    "ANDORRA": { flag: "🇦🇩" }, "ANGOLA": { flag: "🇦🇴" }, "ANGUILLA": { flag: "🇦🇮" }, "ANTIGUA": { flag: "🇦🇬" },
    "ARGENTINA": { flag: "🇦🇷" }, "ARMENIA": { flag: "🇦🇲" }, "ARUBA": { flag: "🇦🇼" }, "AUSTRALIA": { flag: "🇦🇺" },
    "AUSTRIA": { flag: "🇦🇹" }, "AZERBAIJAN": { flag: "🇦🇿" },
    
    // B
    "BAHAMAS": { flag: "🇧🇸" }, "BAHRAIN": { flag: "🇧🇭" }, "BANGLADESH": { flag: "🇧🇩" }, "BARBADOS": { flag: "🇧🇧" },
    "BELARUS": { flag: "🇧🇾" }, "BELGIUM": { flag: "🇧🇪" }, "BELIZE": { flag: "🇧🇿" }, "BENIN": { flag: "🇧🇯" },
    "BERMUDA": { flag: "🇧🇲" }, "BHUTAN": { flag: "🇧🇹" }, "BOLIVIA": { flag: "🇧🇴" }, "BONAIRE": { flag: "🇧🇶" },
    "BOSNIA": { flag: "🇧🇦" }, "BOTSWANA": { flag: "🇧🇼" }, "BRAZIL": { flag: "🇧🇷" }, "BRITISH VIRGIN ISLANDS": { flag: "🇻🇬" },
    "BRUNEI": { flag: "🇧🇳" }, "BULGARIA": { flag: "🇧🇬" }, "BURKINA FASO": { flag: "🇧🇫" }, "BURUNDI": { flag: "🇧🇮" },
    
    // C
    "CAMBODIA": { flag: "🇰🇭" }, "CAMEROON": { flag: "🇨🇲" }, "CANADA": { flag: "🇨🇦" }, "CAPE VERDE": { flag: "🇨🇻" },
    "CAYMAN ISLANDS": { flag: "🇰🇾" }, "CENTRAL AFRICA": { flag: "🇨🇫" }, "CHAD": { flag: "🇹🇩" }, "CHILE": { flag: "🇨🇱" },
    "CHINA": { flag: "🇨🇳" }, "CHRISTMAS ISLAND": { flag: "🇨🇽" }, "COCOS ISLANDS": { flag: "🇨🇨" }, "COLOMBIA": { flag: "🇨🇴" },
    "COMOROS": { flag: "🇰🇲" }, "CONGO": { flag: "🇨🇬" }, "DR CONGO": { flag: "🇨🇩" }, "COOK ISLANDS": { flag: "🇨🇰" },
    "COSTA RICA": { flag: "🇨🇷" }, "CROATIA": { flag: "🇭🇷" }, "CUBA": { flag: "🇨🇺" }, "CURACAO": { flag: "🇨🇼" },
    "CYPRUS": { flag: "🇨🇾" }, "CZECHIA": { flag: "🇨🇿" },
    
    // D
    "DENMARK": { flag: "🇩🇰" }, "DJIBOUTI": { flag: "🇩🇯" }, "DOMINICA": { flag: "🇩🇲" }, "DOMINICAN REPUBLIC": { flag: "🇩🇴" },
    
    // E
    "EAST TIMOR": { flag: "🇹🇱" }, "ECUADOR": { flag: "🇪🇨" }, "EGYPT": { flag: "🇪🇬" }, "EL SALVADOR": { flag: "🇸🇻" },
    "EQUATORIAL GUINEA": { flag: "🇬🇶" }, "ERITREA": { flag: "🇪🇷" }, "ESTONIA": { flag: "🇪🇪" }, "ESWATINI": { flag: "🇸🇿" },
    "ETHIOPIA": { flag: "🇪🇹" },
    
    // F
    "FALKLAND ISLANDS": { flag: "🇫🇰" }, "FAROE ISLANDS": { flag: "🇫🇴" }, "FIJI": { flag: "🇫🇯" }, "FINLAND": { flag: "🇫🇮" },
    "FRANCE": { flag: "🇫🇷" }, "FRENCH GUIANA": { flag: "🇬🇫" }, "FRENCH POLYNESIA": { flag: "🇵🇫" },
    
    // G
    "GABON": { flag: "🇬🇦" }, "GAMBIA": { flag: "🇬🇲" }, "GEORGIA": { flag: "🇬🇪" }, "GERMANY": { flag: "🇩🇪" },
    "GHANA": { flag: "🇬🇭" }, "GIBRALTAR": { flag: "🇬🇮" }, "GREECE": { flag: "🇬🇷" }, "GREENLAND": { flag: "🇬🇱" },
    "GRENADA": { flag: "🇬🇩" }, "GUADELOUPE": { flag: "🇬🇵" }, "GUAM": { flag: "🇬🇺" }, "GUATEMALA": { flag: "🇬🇹" },
    "GUERNSEY": { flag: "🇬🇬" }, "GUINEA": { flag: "🇬🇳" }, "GUINEA BISSAU": { flag: "🇬🇼" }, "GUYANA": { flag: "🇬🇾" },
    
    // H
    "HAITI": { flag: "🇭🇹" }, "HONDURAS": { flag: "🇭🇳" }, "HONG KONG": { flag: "🇭🇰" }, "HUNGARY": { flag: "🇭🇺" },
    
    // I
    "ICELAND": { flag: "🇮🇸" }, "INDIA": { flag: "🇮🇳" }, "INDONESIA": { flag: "🇮🇩" }, "IRAN": { flag: "🇮🇷" },
    "IRAQ": { flag: "🇮🇶" }, "IRELAND": { flag: "🇮🇪" }, "ISLE OF MAN": { flag: "🇮🇲" }, "ISRAEL": { flag: "🇮🇱" },
    "ITALY": { flag: "🇮🇹" }, "IVORY COAST": { flag: "🇨🇮" },
    
    // J
    "JAMAICA": { flag: "🇯🇲" }, "JAPAN": { flag: "🇯🇵" }, "JERSEY": { flag: "🇯🇪" }, "JORDAN": { flag: "🇯🇴" },
    
    // K
    "KAZAKHSTAN": { flag: "🇰🇿" }, "KENYA": { flag: "🇰🇪" }, "KIRIBATI": { flag: "🇰🇮" }, "NORTH KOREA": { flag: "🇰🇵" },
    "SOUTH KOREA": { flag: "🇰🇷" }, "KOSOVO": { flag: "🇽🇰" }, "KUWAIT": { flag: "🇰🇼" }, "KYRGYZSTAN": { flag: "🇰🇬" },
    
    // L
    "LAOS": { flag: "🇱🇦" }, "LATVIA": { flag: "🇱🇻" }, "LEBANON": { flag: "🇱🇧" }, "LESOTHO": { flag: "🇱🇸" },
    "LIBERIA": { flag: "🇱🇷" }, "LIBYA": { flag: "🇱🇾" }, "LIECHTENSTEIN": { flag: "🇱🇮" }, "LITHUANIA": { flag: "🇱🇹" },
    "LUXEMBOURG": { flag: "🇱🇺" },
    
    // M
    "MACAU": { flag: "🇲🇴" }, "MACEDONIA": { flag: "🇲🇰" }, "MADAGASCAR": { flag: "🇲🇬" }, "MALAWI": { flag: "🇲🇼" },
    "MALAYSIA": { flag: "🇲🇾" }, "MALDIVES": { flag: "🇲🇻" }, "MALI": { flag: "🇲🇱" }, "MALTA": { flag: "🇲🇹" },
    "MARSHALL ISLANDS": { flag: "🇲🇭" }, "MARTINIQUE": { flag: "🇲🇶" }, "MAURITANIA": { flag: "🇲🇷" },
    "MAURITIUS": { flag: "🇲🇺" }, "MAYOTTE": { flag: "🇾🇹" }, "MEXICO": { flag: "🇲🇽" }, "MICRONESIA": { flag: "🇫🇲" },
    "MOLDOVA": { flag: "🇲🇩" }, "MONACO": { flag: "🇲🇨" }, "MONGOLIA": { flag: "🇲🇳" }, "MONTENEGRO": { flag: "🇲🇪" },
    "MONTSERRAT": { flag: "🇲🇸" }, "MOROCCO": { flag: "🇲🇦" }, "MOZAMBIQUE": { flag: "🇲🇿" }, "MYANMAR": { flag: "🇲🇲" },
    
    // N
    "NAMIBIA": { flag: "🇳🇦" }, "NAURU": { flag: "🇳🇷" }, "NEPAL": { flag: "🇳🇵" }, "NETHERLANDS": { flag: "🇳🇱" },
    "NEW CALEDONIA": { flag: "🇳🇨" }, "NEW ZEALAND": { flag: "🇳🇿" }, "NICARAGUA": { flag: "🇳🇮" }, "NIGER": { flag: "🇳🇪" },
    "NIGERIA": { flag: "🇳🇬" }, "NIUE": { flag: "🇳🇺" }, "NORFOLK ISLAND": { flag: "🇳🇫" }, "NORTHERN MARIANA ISLANDS": { flag: "🇲🇵" },
    "NORWAY": { flag: "🇳🇴" },
    
    // O
    "OMAN": { flag: "🇴🇲" },
    
    // P
    "PAKISTAN": { flag: "🇵🇰" }, "PALAU": { flag: "🇵🇼" }, "PALESTINE": { flag: "🇵🇸" }, "PANAMA": { flag: "🇵🇦" },
    "PAPUA NEW GUINEA": { flag: "🇵🇬" }, "PARAGUAY": { flag: "🇵🇾" }, "PERU": { flag: "🇵🇪" }, "PHILIPPINES": { flag: "🇵🇭" },
    "POLAND": { flag: "🇵🇱" }, "PORTUGAL": { flag: "🇵🇹" }, "PUERTO RICO": { flag: "🇵🇷" },
    
    // Q
    "QATAR": { flag: "🇶🇦" },
    
    // R
    "REUNION": { flag: "🇷🇪" }, "ROMANIA": { flag: "🇷🇴" }, "RUSSIA": { flag: "🇷🇺" }, "RWANDA": { flag: "🇷🇼" },
    
    // S
    "SAINT HELENA": { flag: "🇸🇭" }, "ST. KITTS & NEVIS": { flag: "🇰🇳" }, "ST. LUCIA": { flag: "🇱🇨" },
    "ST. PIERRE": { flag: "🇵🇲" }, "ST. VINCENT": { flag: "🇻🇨" }, "SAMOA": { flag: "🇼🇸" },
    "SAN MARINO": { flag: "🇸🇲" }, "SAO TOME": { flag: "🇸🇹" }, "SAUDI ARABIA": { flag: "🇸🇦" },
    "SENEGAL": { flag: "🇸🇳" }, "SERBIA": { flag: "🇷🇸" }, "SEYCHELLES": { flag: "🇸🇨" },
    "SIERRA LEONE": { flag: "🇸🇱" }, "SINGAPORE": { flag: "🇸🇬" }, "SINT MAARTEN": { flag: "🇸🇽" },
    "SLOVAKIA": { flag: "🇸🇰" }, "SLOVENIA": { flag: "🇸🇮" }, "SOLOMON ISLANDS": { flag: "🇸🇧" },
    "SOMALIA": { flag: "🇸🇴" }, "SOUTH AFRICA": { flag: "🇿🇦" }, "SOUTH SUDAN": { flag: "🇸🇸" },
    "SPAIN": { flag: "🇪🇸" }, "SRI LANKA": { flag: "🇱🇰" }, "SUDAN": { flag: "🇸🇩" },
    "SURINAME": { flag: "🇸🇷" }, "SWEDEN": { flag: "🇸🇪" }, "SWITZERLAND": { flag: "🇨🇭" }, "SYRIA": { flag: "🇸🇾" },
    
    // T
    "TAIWAN": { flag: "🇹🇼" }, "TAJIKISTAN": { flag: "🇹🇯" }, "TANZANIA": { flag: "🇹🇿" }, "THAILAND": { flag: "🇹🇭" },
    "TOGO": { flag: "🇹🇬" }, "TOKELAU": { flag: "🇹🇰" }, "TONGA": { flag: "🇹🇴" }, "TRINIDAD & TOBAGO": { flag: "🇹🇹" },
    "TUNISIA": { flag: "🇹🇳" }, "TURKEY": { flag: "🇹🇷" }, "TURKMENISTAN": { flag: "🇹🇲" }, "TURKS & CAICOS": { flag: "🇹🇨" },
    "TUVALU": { flag: "🇹🇻" },
    
    // U
    "UGANDA": { flag: "🇺🇬" }, "UKRAINE": { flag: "🇺🇦" }, "UAE": { flag: "🇦🇪" }, "UK": { flag: "🇬🇧" },
    "USA": { flag: "🇺🇸" }, "URUGUAY": { flag: "🇺🇾" }, "UZBEKISTAN": { flag: "🇺🇿" }, "US VIRGIN ISLANDS": { flag: "🇻🇮" },
    
    // V
    "VANUATU": { flag: "🇻🇺" }, "VATICAN": { flag: "🇻🇦" }, "VENEZUELA": { flag: "🇻🇪" }, "VIETNAM": { flag: "🇻🇳" },
    
    // W
    "WALLIS & FUTUNA": { flag: "🇼🇫" }, "WESTERN SAHARA": { flag: "🇪🇭" },
    
    // Y
    "YEMEN": { flag: "🇾🇪" },
    
    // Z
    "ZAMBIA": { flag: "🇿🇲" }, "ZIMBABWE": { flag: "🇿🇼" }
};

// ============================================================
// #  HELPER FUNCTIONS
// ============================================================

function detectCountryFromRange(range) {
    let cleanRange = String(range || "").replace(/\D/g, "");
    for (let i = 4; i >= 1; i--) {
        let prefix = cleanRange.substring(0, i);
        if (countryPrefixes[prefix]) return countryPrefixes[prefix];
    }
    return "UNKNOWN";
}

function getCountryInfo(data) {
    if (!data) return { flag: "🌍", cleanName: "Unknown" };
    let countryName = typeof data === "object" ? (data.country || "Unknown") : data;
    let strName = String(countryName);
    let flag = "🌍";
    let cleanName = strName.replace(/\s*[vV]?\d+.*$/, "").trim();

    for (const key in countryData) {
        if (strName.toUpperCase().includes(key)) {
            flag = countryData[key].flag;
            cleanName = key.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
            break;
        }
    }

    if (flag === "🌍") {
        cleanName = cleanName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
    return { flag, cleanName };
}

module.exports = {
    detectCountryFromRange,
    getCountryInfo
};
